-- ─────────────────────────────────────────────────────────────────────────────
-- GiftHint — Growth Metrics View
-- Migration: 20260518_growth_metrics_view.sql
--
-- Creates the growth_metrics view used by the admin growth dashboard at
-- /admin/growth. Designed to be fetched server-side in a single query and
-- broken into the four KPI cards + chart + retention cohort table.
--
-- View sections:
--   1. Weekly signup counts split by acquisition channel (for GrowthChart)
--   2. Cohort retention rates at W1 / W2 / W4 / W8 (for RetentionCohort)
--   3. KPI scalars:
--        a. Viral K-factor — average referrals created per retained user
--        b. Weekly Active Wishers — users with wishlist_item activity last 7d
--        c. Revenue Per User — total estimated lifetime commission / total users
--        d. D30 Retention — % of users who activated in week 1 and are still
--           active 30+ days after signup
--
-- Query strategy:
--   All four KPIs are emitted as scalar columns on a single row so the server
--   component can read them with a single .maybeSingle() call.
--
-- Performance notes:
--   Indexes used:
--     users.created_at            (assumed btree from earlier migrations)
--     users.referred_by           (assumed from referral system)
--     wishlist_items.created_at   (assumed btree)
--     wishlist_items.user_id      (assumed btree from FK)
--     click_events.wisher_user_id (assumed btree from FK)
--   The view is read by one admin endpoint; no materialisation is needed yet.
--   Revisit with MATERIALIZED VIEW + REFRESH ON SCHEDULE if query > 3s at
--   10k+ users.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Weekly signup breakdown (last 12 weeks) ───────────────────────────────
--
-- Returns one row per calendar week with organic / referral / partner counts.
-- "partner" = user referred by a user_id that has a corresponding partners row.
-- "referral" = user referred by a non-partner user account.
-- "organic"  = no referred_by at all.

CREATE OR REPLACE VIEW weekly_signup_breakdown AS
SELECT
  -- Week label: "Jun 2" style, using the Monday as anchor
  to_char(date_trunc('week', u.created_at)::date, 'Mon DD')  AS week,
  date_trunc('week', u.created_at)::date::text               AS week_iso,

  COUNT(*) FILTER (
    WHERE u.referred_by IS NULL
  )                                                           AS organic,

  COUNT(*) FILTER (
    WHERE u.referred_by IS NOT NULL
    AND   u.referred_by NOT IN (SELECT user_id FROM partners WHERE active = true)
  )                                                           AS referral,

  COUNT(*) FILTER (
    WHERE u.referred_by IS NOT NULL
    AND   u.referred_by IN (SELECT user_id FROM partners WHERE active = true)
  )                                                           AS partner

FROM  users u
WHERE u.created_at >= now() - interval '12 weeks'
GROUP BY date_trunc('week', u.created_at)
ORDER BY week_iso DESC;

COMMENT ON VIEW weekly_signup_breakdown IS
  'Weekly new signups split by acquisition channel for the last 12 weeks. '
  'Used by GrowthChart in the admin growth dashboard.';


-- ── 2. Cohort retention (last 12 signup cohorts) ─────────────────────────────
--
-- For each signup week, calculates the % of that cohort that has a
-- wishlist_item row in each retention window (W1, W2, W4, W8).
--
-- "Active in Wn" = user has any wishlist_item.created_at in the window:
--   W1: [signup_date + 7d,  signup_date + 14d)
--   W2: [signup_date + 14d, signup_date + 21d)
--   W4: [signup_date + 28d, signup_date + 35d)
--   W8: [signup_date + 56d, signup_date + 63d)
--
-- NULL is returned when the window end hasn't elapsed yet (future cohort).

CREATE OR REPLACE VIEW cohort_retention AS
WITH cohorts AS (
  SELECT
    date_trunc('week', created_at)::date             AS signup_week,
    id                                               AS user_id,
    created_at                                       AS signed_up_at
  FROM  users
  WHERE created_at >= now() - interval '12 weeks'
),
activity AS (
  SELECT DISTINCT
    wi.user_id,
    date_trunc('day', wi.created_at)::date           AS active_on
  FROM wishlist_items wi
)
SELECT
  to_char(c.signup_week, 'Mon DD')                   AS week,
  c.signup_week::text                                AS week_iso,
  COUNT(DISTINCT c.user_id)                          AS cohort_size,

  -- W1 retention (window elapsed when signup_week + 14d < now)
  CASE
    WHEN max(c.signup_week) + 14 > now()::date THEN NULL
    ELSE ROUND(
      100.0 * COUNT(DISTINCT c.user_id) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM activity a
          WHERE a.user_id = c.user_id
          AND   a.active_on >= c.signup_week + 7
          AND   a.active_on <  c.signup_week + 14
        )
      ) / NULLIF(COUNT(DISTINCT c.user_id), 0)
    , 1)
  END                                                AS w1,

  -- W2 retention (window elapsed when signup_week + 21d < now)
  CASE
    WHEN max(c.signup_week) + 21 > now()::date THEN NULL
    ELSE ROUND(
      100.0 * COUNT(DISTINCT c.user_id) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM activity a
          WHERE a.user_id = c.user_id
          AND   a.active_on >= c.signup_week + 14
          AND   a.active_on <  c.signup_week + 21
        )
      ) / NULLIF(COUNT(DISTINCT c.user_id), 0)
    , 1)
  END                                                AS w2,

  -- W4 retention (window elapsed when signup_week + 35d < now)
  CASE
    WHEN max(c.signup_week) + 35 > now()::date THEN NULL
    ELSE ROUND(
      100.0 * COUNT(DISTINCT c.user_id) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM activity a
          WHERE a.user_id = c.user_id
          AND   a.active_on >= c.signup_week + 28
          AND   a.active_on <  c.signup_week + 35
        )
      ) / NULLIF(COUNT(DISTINCT c.user_id), 0)
    , 1)
  END                                                AS w4,

  -- W8 retention (window elapsed when signup_week + 63d < now)
  CASE
    WHEN max(c.signup_week) + 63 > now()::date THEN NULL
    ELSE ROUND(
      100.0 * COUNT(DISTINCT c.user_id) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM activity a
          WHERE a.user_id = c.user_id
          AND   a.active_on >= c.signup_week + 56
          AND   a.active_on <  c.signup_week + 63
        )
      ) / NULLIF(COUNT(DISTINCT c.user_id), 0)
    , 1)
  END                                                AS w8

FROM  cohorts c
GROUP BY c.signup_week
ORDER BY c.signup_week DESC;

COMMENT ON VIEW cohort_retention IS
  'Weekly signup cohort retention at W1 / W2 / W4 / W8. '
  'NULL = retention window has not yet elapsed for that cohort. '
  'Used by RetentionCohort in the admin growth dashboard.';


-- ── 3. KPI scalars ────────────────────────────────────────────────────────────
--
-- Single-row view. The admin page reads this with .maybeSingle().

CREATE OR REPLACE VIEW growth_kpis AS
WITH

-- Total user count
total AS (
  SELECT COUNT(*) AS total_users FROM users
),

-- Weekly Active Wishers: distinct users who saved an item in the last 7 days
waw AS (
  SELECT COUNT(DISTINCT user_id) AS weekly_active_wishers
  FROM   wishlist_items
  WHERE  created_at >= now() - interval '7 days'
),

-- Viral K-factor:
-- K = (total referral signups in last 30d) / (retained users who could refer)
-- "Retained users who could refer" = signed up >30d ago AND have ≥1 wishlist item.
-- This is a simplified K; a more precise variant would require knowing invite sends.
kfactor AS (
  SELECT
    ROUND(
      COALESCE(
        COUNT(DISTINCT u.id)::numeric
        FILTER (WHERE u.referred_by IS NOT NULL AND u.created_at >= now() - interval '30 days')
        /
        NULLIF(
          COUNT(DISTINCT u2.id) FILTER (
            WHERE u2.created_at < now() - interval '30 days'
            AND   u2.id IN (SELECT DISTINCT user_id FROM wishlist_items)
          ),
          0
        ),
        0
      ),
    2) AS viral_k
  FROM users u
  CROSS JOIN users u2
),

-- Revenue Per User:
-- Lifetime estimated commission (all clicks, all time) / total users.
-- Gives a sense of monetisation density regardless of traffic spike timing.
rpu AS (
  SELECT
    ROUND(
      COALESCE(SUM(ce.estimated_commission_pence)::numeric, 0)
      / NULLIF((SELECT total_users FROM total), 0),
    1) AS revenue_per_user_pence
  FROM click_events ce
),

-- D30 Retention:
-- % of users who (a) signed up ≥30d ago, (b) saved an item in their first 7
-- days (activated), AND (c) still have wishlist_item activity in the 7-day
-- window starting 30 days after their signup.
d30 AS (
  SELECT
    ROUND(
      100.0 *
      COUNT(DISTINCT u.id) FILTER (
        WHERE
          -- Activated in first week
          EXISTS (
            SELECT 1 FROM wishlist_items wi
            WHERE wi.user_id = u.id
            AND   wi.created_at BETWEEN u.created_at AND u.created_at + interval '7 days'
          )
          -- Still active at D30
          AND EXISTS (
            SELECT 1 FROM wishlist_items wi2
            WHERE wi2.user_id = u.id
            AND   wi2.created_at BETWEEN u.created_at + interval '30 days'
                                     AND u.created_at + interval '37 days'
          )
      )
      / NULLIF(
          COUNT(DISTINCT u.id) FILTER (
            WHERE u.created_at < now() - interval '37 days'
          ),
          0
        )
    , 1) AS d30_retention_pct
  FROM users u
  WHERE u.created_at < now() - interval '30 days'
)

SELECT
  t.total_users,
  w.weekly_active_wishers,
  k.viral_k,
  r.revenue_per_user_pence,
  d.d30_retention_pct

FROM  total   t
CROSS JOIN waw     w
CROSS JOIN kfactor k
CROSS JOIN rpu     r
CROSS JOIN d30     d;

COMMENT ON VIEW growth_kpis IS
  'Single-row KPI snapshot for the admin growth dashboard. '
  'Columns: total_users, weekly_active_wishers, viral_k, '
  'revenue_per_user_pence, d30_retention_pct.';
