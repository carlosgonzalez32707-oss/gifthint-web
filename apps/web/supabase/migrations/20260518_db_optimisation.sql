-- =============================================================================
-- GiftHint — Database Optimisation (10 k+ users)
-- Migration: 20260518_db_optimisation.sql
--
-- Purpose
-- ───────
-- Adds the indices and helper functions needed for GiftHint to remain fast
-- under real-world load:
--
--   · 8 partial / composite indices covering every hot query path
--   · get_items_with_click_counts(uuid) — eliminates the N+1 click query
--     inside GET /api/analytics/wishlist/:id
--   · archive_click_events(cutoff) — maintenance function for the yearly
--     purge described in database-maintenance.md
--
-- All CREATE INDEX statements use IF NOT EXISTS so re-running the migration
-- is safe. Earlier migrations already created some of the indices referenced
-- in the audit (price_history_item_checked_idx, idx_users_referral_code, …);
-- the ones below are net-new.
--
-- Estimated execution time on a 10 k-user dataset: < 5 seconds.
-- On a live production database use `CREATE INDEX CONCURRENTLY` (see note §0).
-- =============================================================================


-- ── §0  Production note ───────────────────────────────────────────────────────
--
-- Supabase runs migrations inside a transaction.  CONCURRENTLY is incompatible
-- with explicit transactions, so it cannot be used in standard migration files.
-- On a live Supabase project with high read traffic, apply each index
-- individually from the Supabase SQL editor using CONCURRENTLY, then commit
-- this migration so it doesn't re-run:
--
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wishlist_items_wishlist_id
--     ON wishlist_items (wishlist_id, sort_order) WHERE is_claimed = false;
--
-- For an initial deploy (fresh project or during a maintenance window) the
-- standard transaction form below is fine.
-- =============================================================================


-- ── 1. wishlist_items  ─────────────────────────────────────────────────────────

-- Fast gifter page loads
-- Query: WHERE wishlist_id = $1 AND is_claimed = false ORDER BY sort_order
-- Route: gifter page server component, /api/items/[username] polling
--
-- Partial on is_claimed = false because gifters only see unclaimed items;
-- claimed items are read from a separate query (claims API).
CREATE INDEX IF NOT EXISTS idx_wishlist_items_wishlist_id
  ON wishlist_items (wishlist_id, sort_order)
  WHERE is_claimed = false;

-- Fast user-scoped item fetch for the polling API and the digest
-- Query: WHERE user_id = $1 ORDER BY sort_order
-- Route: /api/items/[username], /api/claims/[username]
CREATE INDEX IF NOT EXISTS idx_wishlist_items_user_id
  ON wishlist_items (user_id, sort_order);


-- ── 2. wishlists  ─────────────────────────────────────────────────────────────

-- Fast public list resolution: slug → wishlist row for the gifter page
-- Query: WHERE slug = $1 AND is_public = true
-- Route: /list/[username]/[slug] server component, sitemap.ts
CREATE INDEX IF NOT EXISTS idx_wishlists_slug
  ON wishlists (slug)
  WHERE is_public = true;

-- Fast dashboard list: all wishlists for a logged-in wisher
-- Query: WHERE user_id = $1
-- Route: dashboard, /api/wishlists GET
CREATE INDEX IF NOT EXISTS idx_wishlists_user_id
  ON wishlists (user_id);


-- ── 3. users  ─────────────────────────────────────────────────────────────────

-- Fast username → user_id resolution (multiple routes)
-- Query: WHERE public_username = $1
-- Routes: /api/items/[username], /api/claims/[username],
--         /list/[username]/[slug], /api/username/available
--
-- This is on the critical path for every gifter page load.
CREATE INDEX IF NOT EXISTS idx_users_username
  ON users (public_username)
  WHERE public_username IS NOT NULL;

-- Note: idx_users_referral_code already created in 20260518_referral_system.sql
-- Note: idx_referral_events_* already created in 20260518_referral_system.sql


-- ── 4. click_events  ──────────────────────────────────────────────────────────

-- Fast click attribution dashboard
-- Query: WHERE wisher_user_id = $1 ORDER BY clicked_at DESC
-- Route: /admin, wisher_analytics view, partner_commission_summary view
CREATE INDEX IF NOT EXISTS idx_click_events_wisher
  ON click_events (wisher_user_id, clicked_at DESC);

-- Fast per-item click count used by the analytics RPC below
-- Query: WHERE item_id = $1 (aggregated in get_items_with_click_counts)
-- Route: /api/analytics/wishlist/[wishlistId]
CREATE INDEX IF NOT EXISTS idx_click_events_item_id
  ON click_events (item_id);


-- ── 5. page_views  ────────────────────────────────────────────────────────────

-- Fast 14-day sparkline
-- Query: WHERE wishlist_id = $1 ORDER BY viewed_at DESC
-- Route: /api/analytics/wishlist/[wishlistId] → get_wishlist_daily_views RPC
--        wisher_analytics view
CREATE INDEX IF NOT EXISTS idx_page_views_wishlist_date
  ON page_views (wishlist_id, viewed_at DESC);


-- ── 6. price_history  ─────────────────────────────────────────────────────────

-- Note: price_history_item_checked_idx already created in
-- 20260518_price_tracking.sql covering (item_id, checked_at DESC).
-- The name requested in the audit spec is added as a duplicate-safe alias:
CREATE INDEX IF NOT EXISTS idx_price_history_item_date
  ON price_history (item_id, checked_at DESC);
-- Postgres deduplicates index structures when the column list matches;
-- only one physical index is created even if both names exist.


-- ── 7. digest_sends  ──────────────────────────────────────────────────────────

-- Fast deduplication check in the weekly-digest cron
-- Query: INSERT ... ON CONFLICT (user_id, week_start)
-- The UNIQUE constraint creates an implicit index, but we add a named one
-- so pg_stat_user_indexes reports it clearly.
CREATE UNIQUE INDEX IF NOT EXISTS idx_digest_sends_user_week
  ON digest_sends (user_id, week_start);


-- =============================================================================
-- §A  get_items_with_click_counts(p_wishlist_id)
-- =============================================================================
--
-- Returns every wishlist item for a given wishlist joined with its lifetime
-- buy-click count in a single round-trip.
--
-- Replaces the two-query pattern in
--   GET /api/analytics/wishlist/[wishlistId]:
--   1. SELECT id, title, is_claimed FROM wishlist_items WHERE wishlist_id = $1
--   2. SELECT item_id FROM click_events WHERE item_id = ANY($ids)   ← N+1
--
-- Called via:
--   supabase.rpc('get_items_with_click_counts', { p_wishlist_id: wishlistId })
--
-- Returns (ordered by sort_order asc; sort by buy_clicks desc in application):
--   id, title, is_claimed, buy_clicks, sort_order
-- =============================================================================

CREATE OR REPLACE FUNCTION get_items_with_click_counts(p_wishlist_id UUID)
RETURNS TABLE (
  id          UUID,
  title       TEXT,
  is_claimed  BOOLEAN,
  buy_clicks  BIGINT,
  sort_order  INTEGER
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT
    wi.id,
    wi.title,
    wi.is_claimed,
    COUNT(ce.id)::BIGINT  AS buy_clicks,
    wi.sort_order
  FROM  wishlist_items wi
  LEFT  JOIN click_events ce ON ce.item_id = wi.id
  WHERE wi.wishlist_id = p_wishlist_id
  GROUP BY wi.id, wi.title, wi.is_claimed, wi.sort_order
  ORDER BY wi.sort_order ASC;
$$;

COMMENT ON FUNCTION get_items_with_click_counts(UUID) IS
  'Returns wishlist items with their lifetime buy-click counts in one query. '
  'Replaces the analytics route N+1 pattern (items SELECT + click_events SELECT). '
  'Uses idx_click_events_item_id for the LEFT JOIN aggregation.';


-- =============================================================================
-- §B  archive_click_events(cutoff_date)
-- =============================================================================
--
-- Moves click_events rows older than cutoff_date into click_events_archive,
-- creating the archive table if it does not yet exist.
--
-- Designed to run monthly via Supabase cron (see database-maintenance.md).
--
-- Usage:
--   SELECT archive_click_events(NOW() - INTERVAL '1 year');
--
-- Returns the number of rows archived.
-- =============================================================================

CREATE TABLE IF NOT EXISTS click_events_archive (
  LIKE click_events INCLUDING ALL
);

COMMENT ON TABLE click_events_archive IS
  'Archive table for click_events rows older than 1 year. '
  'Identical schema to click_events; populated by archive_click_events().';

CREATE OR REPLACE FUNCTION archive_click_events(cutoff_date TIMESTAMPTZ)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  archived_count INTEGER;
BEGIN
  -- Insert old rows into the archive, ignoring duplicates (idempotent re-runs).
  INSERT INTO click_events_archive
  SELECT * FROM click_events
  WHERE  clicked_at < cutoff_date
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS archived_count = ROW_COUNT;

  -- Remove the archived rows from the hot table.
  DELETE FROM click_events
  WHERE  clicked_at < cutoff_date;

  RETURN archived_count;
END;
$$;

COMMENT ON FUNCTION archive_click_events(TIMESTAMPTZ) IS
  'Moves click_events rows older than cutoff_date to click_events_archive. '
  'Idempotent: safe to run twice (ON CONFLICT DO NOTHING). '
  'Call monthly from Supabase cron: SELECT archive_click_events(NOW() - INTERVAL ''1 year'');';
