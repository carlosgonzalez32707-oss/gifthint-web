-- ─────────────────────────────────────────────────────────────────────────────
-- 010_conversion_funnel_view.sql — GiftHint
--
-- conversion_funnel view: four scalar metrics that represent the purchase
-- funnel for the rolling 30-day window.
--
-- Used by GET /admin (server-side query) to populate RevenueFunnel.tsx.
-- The view returns exactly ONE row.
--
-- Funnel steps:
--   1. page_views    — gifter opened a wishlist
--   2. buy_clicks    — gifter clicked "Buy" on an item
--   3. claims        — gifter claimed an item (expressed buying intent)
--   4. est_revenue   — sum of estimated commission on claimed items
--
-- Drop-off rate between adjacent steps is computed in the TypeScript layer
-- so the SQL stays simple and the view is cheap to materialise.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW conversion_funnel AS
SELECT
  -- Step 1: page views in the last 30 days
  (
    SELECT COUNT(*)
    FROM   page_views
    WHERE  viewed_at > NOW() - INTERVAL '30 days'
  )                              AS views,

  -- Step 2: buy clicks in the last 30 days
  (
    SELECT COUNT(*)
    FROM   click_events
    WHERE  clicked_at > NOW() - INTERVAL '30 days'
  )                              AS buy_clicks,

  -- Step 3: items claimed in the last 30 days
  -- (proxy for "purchase intent confirmed by gifter")
  (
    SELECT COUNT(*)
    FROM   wishlist_items
    WHERE  claimed_at > NOW() - INTERVAL '30 days'
  )                              AS claims,

  -- Step 4: estimated affiliate commission from those claimed items
  -- NULL when no items have commission data; the app layer coalesces to 0
  (
    SELECT COALESCE(SUM(estimated_commission), 0)
    FROM   wishlist_items
    WHERE  claimed_at > NOW() - INTERVAL '30 days'
      AND  estimated_commission IS NOT NULL
  )                              AS est_revenue;

COMMENT ON VIEW conversion_funnel IS
  'Rolling 30-day conversion funnel: page views → buy clicks → claims → '
  'estimated revenue. Returns exactly one row. Refreshed on each query.';
