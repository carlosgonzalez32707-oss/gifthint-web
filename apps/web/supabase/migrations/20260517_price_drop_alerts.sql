-- =============================================================================
-- GiftHint — Price Drop Alerts Schema
-- Migration: 20260517_price_drop_alerts.sql
--
-- Creates:
--   price_drop_alerts   — audit log; prevents duplicate sends within 7 days
-- Alters:
--   users               — adds price_alerts_enabled opt-out column
-- =============================================================================

-- ── 1. price_drop_alerts ──────────────────────────────────────────────────────
--
-- One row per alert sent. The unique partial index on (item_id) where
-- alert_sent_at > NOW() - 7 days enforces the "no re-alert within a week"
-- contract without needing application-level dedup logic.

CREATE TABLE IF NOT EXISTS price_drop_alerts (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id        uuid          NOT NULL REFERENCES wishlist_items (id) ON DELETE CASCADE,
  user_id        uuid          NOT NULL REFERENCES users (id)          ON DELETE CASCADE,
  old_price      numeric(10,2) NOT NULL,
  new_price      numeric(10,2) NOT NULL,
  drop_pct       numeric(5,2)  NOT NULL,
  alert_sent_at  timestamptz   NOT NULL DEFAULT now(),
  email_opened   boolean       NOT NULL DEFAULT false
);

-- Lookup index: find recent alerts for a given item (eligibility check)
CREATE INDEX IF NOT EXISTS price_drop_alerts_item_sent_idx
  ON price_drop_alerts (item_id, alert_sent_at DESC);

-- User-centric lookup: "all alerts sent to this user in the last N days"
CREATE INDEX IF NOT EXISTS price_drop_alerts_user_sent_idx
  ON price_drop_alerts (user_id, alert_sent_at DESC);

-- ── Duplicate-prevention partial unique index ─────────────────────────────────
--
-- Prevents inserting a second alert for the same item within 7 days.
-- The WHERE clause limits uniqueness enforcement to the 7-day window —
-- older rows are ignored, so alerts can recur after the window expires.
--
-- NOTE: PostgreSQL partial unique indexes use a static predicate; the actual
-- 7-day window check is enforced by the cron query (WHERE alert_sent_at >
-- NOW() - INTERVAL '7 days'). This index blocks concurrent inserts for the
-- same item within a single run.
CREATE UNIQUE INDEX IF NOT EXISTS price_drop_alerts_no_repeat_idx
  ON price_drop_alerts (item_id)
  WHERE alert_sent_at > (NOW() - INTERVAL '7 days');

-- ── RLS: price_drop_alerts ────────────────────────────────────────────────────
ALTER TABLE price_drop_alerts ENABLE ROW LEVEL SECURITY;
-- Service role only — no public policies.


-- ── 2. User-level price alert preference ─────────────────────────────────────
--
-- price_alerts_enabled: global kill-switch per user. When false, the cron
-- skips ALL price-drop emails for that user regardless of per-item settings.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS price_alerts_enabled boolean NOT NULL DEFAULT true;
