-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 004 — gifter_reminders
-- GiftHint
--
-- Purpose:
--   Stores email addresses of gifters who want a reminder 7 days before a
--   wisher's occasion (birthday, Christmas, etc.). Gifters don't have accounts,
--   so no auth is required to insert a row.
--
-- RLS design:
--   INSERT  → allowed by anyone (anon key) — gifters sign up without an account
--   SELECT  → denied for anon/authenticated roles; service role bypasses RLS
--   UPDATE  → denied for anon/authenticated roles; service role bypasses RLS
--   DELETE  → denied for all (rows are permanent; set reminder_sent_at instead)
--
-- Uniqueness:
--   (wisher_user_id, gifter_email) is UNIQUE so duplicate signups from the
--   same gifter for the same list are idempotent — the API layer uses UPSERT.
--
-- Run in: Supabase → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Table ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gifter_reminders (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  wisher_user_id   uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gifter_email     text        NOT NULL CHECK (gifter_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  occasion_date    date,                      -- NULL = "just notify me when new items added"
  reminder_sent_at timestamptz,               -- NULL = not yet sent
  created_at       timestamptz NOT NULL DEFAULT now(),

  -- Prevent duplicate signups for the same list+email combo
  CONSTRAINT gifter_reminders_unique_signup UNIQUE (wisher_user_id, gifter_email)
);

COMMENT ON TABLE  gifter_reminders                    IS 'Email reminders requested by gifters on public wishlists';
COMMENT ON COLUMN gifter_reminders.wisher_user_id     IS 'The list owner whose occasion the gifter wants to remember';
COMMENT ON COLUMN gifter_reminders.gifter_email       IS 'Email address to send the reminder to';
COMMENT ON COLUMN gifter_reminders.occasion_date      IS 'The occasion date (birthday, anniversary, etc.). Reminder fires 7 days before.';
COMMENT ON COLUMN gifter_reminders.reminder_sent_at   IS 'Timestamp when the reminder email was dispatched. NULL = pending.';

-- ── 2. Index ──────────────────────────────────────────────────────────────────

-- Cron job queries by occasion_date + reminder_sent_at IS NULL daily
CREATE INDEX IF NOT EXISTS idx_gifter_reminders_occasion
  ON gifter_reminders (occasion_date, reminder_sent_at)
  WHERE reminder_sent_at IS NULL;

-- ── 3. Row Level Security ─────────────────────────────────────────────────────

ALTER TABLE gifter_reminders ENABLE ROW LEVEL SECURITY;

-- Allow any visitor (anon key) to insert their own reminder signup.
-- We validate email format in the API layer before hitting Supabase,
-- but the CHECK constraint above is the authoritative server-side guard.
CREATE POLICY "gifters_can_insert"
  ON gifter_reminders
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Deny anon/authenticated SELECT — only the service role can read reminder rows
-- (used by the cron job running server-side with SUPABASE_SERVICE_ROLE_KEY).
-- Service role bypasses RLS automatically; no policy needed for it.
CREATE POLICY "deny_anon_select"
  ON gifter_reminders
  FOR SELECT
  TO anon, authenticated
  USING (false);

-- Deny anon/authenticated UPDATE — reminder_sent_at is set by the cron job
-- server-side via the service role client.
CREATE POLICY "deny_anon_update"
  ON gifter_reminders
  FOR UPDATE
  TO anon, authenticated
  USING (false);

-- Deny all deletes through the API — rows are permanent audit records.
CREATE POLICY "deny_all_delete"
  ON gifter_reminders
  FOR DELETE
  TO anon, authenticated
  USING (false);
