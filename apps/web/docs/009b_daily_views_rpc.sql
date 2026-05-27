-- ─────────────────────────────────────────────────────────────────────────────
-- 009b_daily_views_rpc.sql — GiftHint
--
-- Adds the get_wishlist_daily_views() function used by
-- GET /api/analytics/wishlist/[wishlistId] to build the 14-day sparkline.
--
-- Returns one row per calendar day (UTC) for the last p_days days,
-- including days with zero views (so the sparkline has no gaps).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_wishlist_daily_views(
  p_wishlist_id uuid,
  p_days        int  DEFAULT 14
)
RETURNS TABLE (date text, views bigint)
LANGUAGE sql
STABLE
AS $$
  -- Generate a complete series of dates first so every day is represented,
  -- then left-join the actual page_views counts.
  SELECT
    to_char(gs.day, 'YYYY-MM-DD')                         AS date,
    COUNT(pv.id)                                           AS views
  FROM   generate_series(
           (current_date - (p_days - 1) * interval '1 day'),
           current_date,
           interval '1 day'
         ) AS gs(day)
  LEFT   JOIN page_views pv
         ON  pv.wishlist_id = p_wishlist_id
         AND date_trunc('day', pv.viewed_at AT TIME ZONE 'UTC') = gs.day
  GROUP  BY gs.day
  ORDER  BY gs.day ASC;
$$;

COMMENT ON FUNCTION get_wishlist_daily_views IS
  'Returns daily view counts for a wishlist over the last p_days days (UTC). '
  'All days are included even if view count is 0, ensuring sparkline charts '
  'have contiguous data.';

-- Grant the anon role execute rights so Supabase client queries work;
-- the service-role key used by the API route doesn't need this.
GRANT EXECUTE ON FUNCTION get_wishlist_daily_views TO anon, authenticated;
