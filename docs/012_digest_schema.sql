-- ─────────────────────────────────────────────────────────────────────────────
-- 012_digest_schema.sql — GiftHint
--
-- Schema additions for the weekly digest email system.
--
-- Run this migration in order after all prior docs/0*.sql migrations.
-- Safe to re-run: all statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Add digest preferences to users table ──────────────────────────────────

-- email_digest_enabled: opt-out flag. Default true so all existing users
-- receive the digest unless they explicitly unsubscribe.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_digest_enabled boolean NOT NULL DEFAULT true;

-- unsubscribe_token: unique per-user token for the one-click unsubscribe link.
-- Uses gen_random_uuid() so tokens are cryptographically unpredictable.
-- Stored as text (not uuid) for URL-friendliness without dashes requirement.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS unsubscribe_token text
    NOT NULL DEFAULT gen_random_uuid()::text;

-- Ensure existing rows without a token get one assigned immediately.
-- (The DEFAULT above covers new rows; this UPDATE covers pre-migration rows.)
UPDATE users
   SET unsubscribe_token = gen_random_uuid()::text
 WHERE unsubscribe_token IS NULL;

-- Unique index on unsubscribe_token — token lookups must be O(1) and
-- tokens must be globally unique across all users.
CREATE UNIQUE INDEX IF NOT EXISTS users_unsubscribe_token_idx
  ON users (unsubscribe_token);

COMMENT ON COLUMN users.email_digest_enabled IS
  'When false, the user has opted out of weekly digest emails via the '
  'unsubscribe link. Set to false by GET /unsubscribe?token=... endpoint.';

COMMENT ON COLUMN users.unsubscribe_token IS
  'Cryptographically random token embedded in weekly digest unsubscribe links. '
  'Rotated on successful unsubscribe to prevent replay. Never expose in API '
  'responses — only embed in server-side rendered email HTML.';

-- ── 2. digest_sends log table ─────────────────────────────────────────────────
--
-- Audit trail for every digest email attempted. Lets us:
--   - Verify the cron ran
--   - Diagnose delivery failures
--   - Ensure we never double-send to the same user in the same week
--   - Track open/click rates once Resend webhooks are wired up

CREATE TABLE IF NOT EXISTS digest_sends (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The wisher who received (or failed to receive) this digest
  user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Week start date (Monday) this digest covers — used for deduplication
  week_start  date        NOT NULL,

  -- Resend message ID returned on success; null on failure
  message_id  text,

  -- Terminal status of the send attempt
  status      text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'skipped', 'error')),

  -- 'skipped' reason (e.g. 'no_views', 'opt_out') or error message
  detail      text,

  -- Snapshot of key metrics at send time (for audit, not re-rendering)
  total_views     integer,
  claimed_count   integer,
  top_item_title  text,

  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Index for cron deduplication check: "did we already send this week?"
CREATE UNIQUE INDEX IF NOT EXISTS digest_sends_user_week_idx
  ON digest_sends (user_id, week_start);

-- Index for admin queries: "show all sends for a user"
CREATE INDEX IF NOT EXISTS digest_sends_user_idx
  ON digest_sends (user_id, created_at DESC);

-- RLS: users can see their own send history; service-role writes
ALTER TABLE digest_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own digest history"
  ON digest_sends
  FOR SELECT
  USING (user_id = auth.uid());

-- No INSERT/UPDATE policy for authenticated role — cron writes via service-role.

COMMENT ON TABLE digest_sends IS
  'Audit log of weekly digest email attempts. One row per user per week. '
  'The UNIQUE index on (user_id, week_start) prevents double-sends if the '
  'cron fires more than once in a week.';

COMMENT ON COLUMN digest_sends.week_start IS
  'The Monday that begins the week this digest covers (ISO date). '
  'Computed as: current_date - (EXTRACT(DOW FROM current_date) - 1)::int';

-- ── 3. rotate_unsubscribe_token RPC ──────────────────────────────────────────
--
-- Atomically disables digest and rotates the unsubscribe token in one
-- statement. Called by GET /unsubscribe after validating the token.
--
-- Using a function ensures the disable + rotate is always atomic, even if
-- the unsubscribe endpoint is hit concurrently (unlikely but possible if an
-- email client pre-fetches all links when the email is opened).

CREATE OR REPLACE FUNCTION rotate_unsubscribe_token(p_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER   -- runs with the function owner's privileges (service-role)
SET search_path = public
AS $$
  UPDATE users
     SET email_digest_enabled = false,
         unsubscribe_token    = gen_random_uuid()::text
   WHERE id = p_user_id;
$$;

-- Restrict execution to service_role only — never callable by anon/authenticated
REVOKE EXECUTE ON FUNCTION rotate_unsubscribe_token(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION rotate_unsubscribe_token(uuid) TO service_role;

COMMENT ON FUNCTION rotate_unsubscribe_token(uuid) IS
  'Atomically disables weekly digest and rotates the unsubscribe token '
  'for the given user. Called by GET /unsubscribe after token validation. '
  'SECURITY DEFINER — service_role only.';
