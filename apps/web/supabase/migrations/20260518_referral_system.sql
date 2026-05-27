-- ─────────────────────────────────────────────────────────────────────────────
-- GiftHint — Referral System
-- Migration: 20260518_referral_system.sql
--
-- Adds:
--   1. referral_code, referred_by, referral_count columns to users
--   2. referral_events table — click + signup + first_save attribution
--   3. increment_referral_count() Postgres function — atomic counter bump
--   4. Indexes for fast code lookup and stats queries
--   5. RLS policies
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Extend users table ─────────────────────────────────────────────────────

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS referral_code   TEXT UNIQUE
    DEFAULT substr(md5(random()::text), 1, 8),
  ADD COLUMN IF NOT EXISTS referred_by     UUID
    REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referral_count  INT NOT NULL DEFAULT 0;

-- Backfill codes for existing rows that have none
UPDATE users
SET referral_code = substr(md5(id::text || random()::text), 1, 8)
WHERE referral_code IS NULL;

-- Enforce NOT NULL now that all rows are filled
ALTER TABLE users
  ALTER COLUMN referral_code SET NOT NULL;

-- ── 2. referral_events table ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS referral_events (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The user whose referral link was followed (may be null if code no longer
  -- exists when a deferred signup finally arrives)
  referrer_id  UUID        REFERENCES users(id) ON DELETE SET NULL,

  -- The user who signed up as a result (null for click events)
  referee_id   UUID        REFERENCES users(id) ON DELETE SET NULL,

  -- 'click'      — someone followed the /r/[code] link
  -- 'signup'     — referred user completed account creation
  -- 'first_save' — referred user saved their first wishlist item
  event_type   TEXT        NOT NULL
    CHECK (event_type IN ('click', 'signup', 'first_save')),

  -- The referral code that was present at the time of the event
  referral_code TEXT       NOT NULL,

  -- Optional metadata (IP hash for click dedup, device type, etc.)
  metadata     JSONB       NOT NULL DEFAULT '{}',

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 3. Indexes ────────────────────────────────────────────────────────────────

-- Fast lookup of a referrer by their code (used by /r/[code] redirect)
CREATE INDEX IF NOT EXISTS idx_users_referral_code
  ON users(referral_code);

-- Fast lookup of all events for a referrer (used by getReferralStats)
CREATE INDEX IF NOT EXISTS idx_referral_events_referrer_id
  ON referral_events(referrer_id);

-- Fast lookup of a referee's attribution record (idempotency check on signup)
CREATE INDEX IF NOT EXISTS idx_referral_events_referee_id
  ON referral_events(referee_id);

-- Composite index for the stats query (referrer + event_type count)
CREATE INDEX IF NOT EXISTS idx_referral_events_referrer_type
  ON referral_events(referrer_id, event_type);

-- ── 4. Atomic counter function ────────────────────────────────────────────────
-- Called via supabase.rpc('increment_referral_count', { user_id: '...' })
-- Uses a row-level UPDATE rather than SELECT + UPDATE to avoid race conditions.

CREATE OR REPLACE FUNCTION increment_referral_count(user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE users
  SET referral_count = referral_count + 1
  WHERE id = user_id;
END;
$$;

-- ── 5. Row Level Security ─────────────────────────────────────────────────────

ALTER TABLE referral_events ENABLE ROW LEVEL SECURITY;

-- Service-role key bypasses RLS entirely — the Next.js server uses that key.
-- Authenticated users may read their own referral events.
CREATE POLICY "Users can view their own referral events"
  ON referral_events
  FOR SELECT
  TO authenticated
  USING (referrer_id = auth.uid() OR referee_id = auth.uid());

-- Inserts are server-only (service role key); no INSERT policy for authenticated.
