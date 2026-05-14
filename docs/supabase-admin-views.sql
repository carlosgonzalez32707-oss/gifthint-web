-- ─────────────────────────────────────────────────────────────────────────────
-- GiftHint — Admin analytics views
-- Run in Supabase SQL editor or via a migration file.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── daily_clicks ──────────────────────────────────────────────────────────────
-- Aggregates click_events by calendar date, retailer, and affiliate programme.
-- Used by the admin chart (last 30 days) and revenue attribution reporting.

CREATE OR REPLACE VIEW daily_clicks AS
SELECT
  date(clicked_at AT TIME ZONE 'UTC')  AS click_date,
  retailer,
  affiliate_network,
  COUNT(*)                             AS clicks
FROM click_events
GROUP BY 1, 2, 3
ORDER BY click_date DESC, clicks DESC;

COMMENT ON VIEW daily_clicks IS
  'Daily click counts per retailer and affiliate network. '
  'Used by the admin revenue dashboard chart.';


-- ── daily_signups ─────────────────────────────────────────────────────────────
-- New user registrations per calendar day.
-- Use alongside daily_clicks to track signup-to-click conversion rate.

CREATE OR REPLACE VIEW daily_signups AS
SELECT
  date(created_at AT TIME ZONE 'UTC')  AS signup_date,
  COUNT(*)                             AS new_users
FROM users
GROUP BY 1
ORDER BY signup_date DESC;

COMMENT ON VIEW daily_signups IS
  'New user registrations by day. Join with daily_clicks to compute '
  'the signup-to-affiliate-click conversion funnel.';


-- ── top_wishers ───────────────────────────────────────────────────────────────
-- Power users: ranked by buy clicks generated (i.e. how many times gifters
-- clicked "Buy" on their items), then by items saved.
-- Capped at 20 rows for dashboard use.

CREATE OR REPLACE VIEW top_wishers AS
SELECT
  u.id                                             AS user_id,
  u.display_name,
  u.public_username,
  COUNT(DISTINCT i.id)                             AS items_saved,
  COUNT(DISTINCT ce.id)                            AS buy_clicks,
  ROUND(
    SUM(i.estimated_commission) FILTER (WHERE i.estimated_commission IS NOT NULL),
    2
  )                                                AS estimated_revenue,
  MAX(ce.clicked_at)                               AS last_click_at
FROM  users             u
LEFT  JOIN wishlist_items  i  ON i.user_id         = u.id
LEFT  JOIN click_events    ce ON ce.wisher_user_id = u.id
GROUP BY u.id, u.display_name, u.public_username
ORDER BY buy_clicks DESC, items_saved DESC
LIMIT 20;

COMMENT ON VIEW top_wishers IS
  'Top 20 users ranked by gifter buy-click volume. '
  'Key metric for identifying power users to feature or invite to beta programmes.';


-- ── category_revenue (already delivered in previous migration) ────────────────
-- Reproduced here for completeness. Run only if not already created.

CREATE OR REPLACE VIEW category_revenue AS
SELECT
  COALESCE(amazon_category, 'Uncategorised')       AS amazon_category,
  COUNT(*)                                         AS item_count,
  ROUND(SUM(price)::numeric, 2)                    AS total_gmv,
  ROUND(SUM(estimated_commission)::numeric, 4)     AS estimated_revenue,
  ROUND(
    AVG(
      CASE WHEN price > 0 THEN estimated_commission / price END
    ) * 100,
    2
  )                                                AS avg_rate_pct
FROM  wishlist_items
WHERE retailer = 'amazon'
  AND amazon_category IS NOT NULL
GROUP BY amazon_category
ORDER BY estimated_revenue DESC NULLS LAST;

COMMENT ON VIEW category_revenue IS
  'GMV and estimated Associates commission by Amazon product category. '
  'Refresh estimated_commission values after rate changes — see docs/commission-rates-guide.md.';


-- ── Useful spot-check queries ─────────────────────────────────────────────────

-- Last 7 days of click traffic by network:
-- SELECT click_date, affiliate_network, SUM(clicks) as total
-- FROM   daily_clicks
-- WHERE  click_date >= current_date - 7
-- GROUP  BY 1, 2
-- ORDER  BY 1 DESC, 2;

-- Weekly signups vs clicks (conversion funnel):
-- SELECT
--   date_trunc('week', signup_date) AS week,
--   SUM(new_users) AS signups,
--   (SELECT SUM(clicks) FROM daily_clicks
--    WHERE click_date >= date_trunc('week', signup_date)
--    AND   click_date <  date_trunc('week', signup_date) + interval '7 days'
--   ) AS buy_clicks
-- FROM daily_signups
-- GROUP BY 1
-- ORDER BY 1 DESC;
