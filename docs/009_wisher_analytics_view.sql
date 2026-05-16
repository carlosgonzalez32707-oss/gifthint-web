-- ─────────────────────────────────────────────────────────────────────────────
-- 009_wisher_analytics_view.sql — GiftHint
--
-- wisher_analytics view: one row per wishlist with pre-aggregated stats.
--
-- Consumed by GET /api/analytics/[wishlistId] to serve the dashboard cards.
-- Uses OR REPLACE so it is safe to re-run after schema changes.
--
-- Aggregated columns:
--   total_views             — all page_views rows for this list
--   unique_view_days        — distinct calendar days with ≥1 view
--   total_buy_clicks        — click_events rows whose item belongs to this list
--   claimed_items_count     — wishlist_items rows where is_claimed = true
--   most_clicked_item_title — title of the item with the most buy clicks
--
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW wisher_analytics AS
WITH

  -- ── Page-view aggregates ───────────────────────────────────────────────────
  view_agg AS (
    SELECT
      wishlist_id,
      COUNT(*)                                                         AS total_views,
      COUNT(DISTINCT date_trunc('day', viewed_at AT TIME ZONE 'UTC')) AS unique_view_days
    FROM  page_views
    GROUP BY wishlist_id
  ),

  -- ── Buy-click aggregates (click_events → wishlist_items → wishlist) ────────
  click_agg AS (
    SELECT
      wi.wishlist_id,
      COUNT(ce.id)  AS total_buy_clicks
    FROM  wishlist_items  wi
    JOIN  click_events    ce ON ce.item_id = wi.id
    WHERE wi.wishlist_id IS NOT NULL
    GROUP BY wi.wishlist_id
  ),

  -- ── Claimed item count ─────────────────────────────────────────────────────
  item_agg AS (
    SELECT
      wishlist_id,
      COUNT(*) FILTER (WHERE is_claimed = true)  AS claimed_items_count
    FROM  wishlist_items
    WHERE wishlist_id IS NOT NULL
    GROUP BY wishlist_id
  ),

  -- ── Most-clicked item per list ─────────────────────────────────────────────
  -- DISTINCT ON picks the top item after ORDER BY click count DESC.
  -- Items with 0 clicks tie; the DB may return any of them — that is acceptable.
  top_item AS (
    SELECT DISTINCT ON (wi.wishlist_id)
      wi.wishlist_id,
      wi.title  AS most_clicked_item_title
    FROM  wishlist_items  wi
    LEFT  JOIN click_events ce ON ce.item_id = wi.id
    WHERE wi.wishlist_id IS NOT NULL
    GROUP BY wi.wishlist_id, wi.id, wi.title
    ORDER BY wi.wishlist_id, COUNT(ce.id) DESC
  )

SELECT
  w.id           AS wishlist_id,
  w.user_id,
  w.title        AS wishlist_title,
  w.slug,
  COALESCE(va.total_views,          0)  AS total_views,
  COALESCE(va.unique_view_days,     0)  AS unique_view_days,
  COALESCE(ca.total_buy_clicks,     0)  AS total_buy_clicks,
  COALESCE(ia.claimed_items_count,  0)  AS claimed_items_count,
  ti.most_clicked_item_title               -- NULL when list has no items
FROM        wishlists   w
LEFT JOIN   view_agg    va ON va.wishlist_id = w.id
LEFT JOIN   click_agg   ca ON ca.wishlist_id = w.id
LEFT JOIN   item_agg    ia ON ia.wishlist_id = w.id
LEFT JOIN   top_item    ti ON ti.wishlist_id = w.id;

COMMENT ON VIEW wisher_analytics IS
  'Per-wishlist analytics summary for the wisher dashboard. '
  'Aggregates page views, buy clicks, claimed items, and top item. '
  'Refreshed on each query — no materialisation needed at current scale.';
