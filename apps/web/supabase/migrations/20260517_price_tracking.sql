-- =============================================================================
-- GiftHint — Price Tracking Schema
-- Migration: 20260517_price_tracking.sql
--
-- Creates:
--   price_history       — one row per price check per item
-- Alters:
--   wishlist_items      — adds price alert + tracking columns
-- =============================================================================

-- ── 1. price_history ──────────────────────────────────────────────────────────
--
-- Immutable audit log. One row written every time the price checker runs for
-- an item. The route handler never deletes rows — retention policy (e.g. 90-day
-- cleanup cron) can be added later without touching the schema.

CREATE TABLE IF NOT EXISTS price_history (
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id      uuid          NOT NULL REFERENCES wishlist_items (id) ON DELETE CASCADE,
  price        numeric(10,2) NOT NULL,
  checked_at   timestamptz   NOT NULL DEFAULT now(),
  source       text          NOT NULL DEFAULT 'scrape'
                             CHECK (source IN ('scrape', 'api'))
);

-- Fast latest-price query: SELECT * FROM price_history WHERE item_id = $1
--                           ORDER BY checked_at DESC LIMIT 1
CREATE INDEX IF NOT EXISTS price_history_item_checked_idx
  ON price_history (item_id, checked_at DESC);

-- ── RLS: price_history ────────────────────────────────────────────────────────
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;

-- Price history is internal — only the service role (API routes) reads/writes.
-- No public policies means non-service-role clients are blocked entirely.


-- ── 2. Extend wishlist_items ──────────────────────────────────────────────────
--
-- price_alert_enabled:   opt-in flag; true by default so all saved items are tracked
-- price_alert_threshold: alert when price drops below (current_price * threshold / 100)
--                        e.g. 90 means "alert me if it drops more than 10%"
-- last_checked_at:       used by the cron to skip recently-checked items
-- lowest_price:          rolling minimum; updated whenever a new low is detected

ALTER TABLE wishlist_items
  ADD COLUMN IF NOT EXISTS price_alert_enabled    boolean       NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS price_alert_threshold  numeric(5,2)  DEFAULT 90,
  ADD COLUMN IF NOT EXISTS last_checked_at        timestamptz,
  ADD COLUMN IF NOT EXISTS lowest_price           numeric(10,2);

-- Index to make the cron's eligibility query fast:
-- WHERE price_alert_enabled = true AND (last_checked_at IS NULL OR last_checked_at < NOW() - INTERVAL '23 hours')
CREATE INDEX IF NOT EXISTS wishlist_items_price_check_eligible_idx
  ON wishlist_items (price_alert_enabled, last_checked_at)
  WHERE price_alert_enabled = true;
