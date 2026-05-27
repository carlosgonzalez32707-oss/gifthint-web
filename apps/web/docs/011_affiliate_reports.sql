-- ─────────────────────────────────────────────────────────────────────────────
-- 011_affiliate_reports.sql — GiftHint
--
-- affiliate_reports table: one row per network per day of confirmed earnings
-- data synced from Amazon Associates and Skimlinks.
--
-- Written by: app/api/cron/sync-affiliate-data/route.ts (daily cron)
-- Read by:    components/admin/ReconciliationTable.tsx (via admin/page.tsx)
--
-- PURPOSE
-- ───────
-- Our click_events table stores estimated_commission computed at link-rewrite
-- time using fixed category rates (see lib/amazon-categories.ts). This table
-- stores the ACTUAL confirmed revenue from each affiliate network, allowing
-- the admin to see how accurate our estimates are and recalibrate rates.
--
-- UPSERT KEY
-- ──────────
-- (network, report_date) — one row per network per day.
-- The cron job uses ON CONFLICT DO UPDATE so re-running the sync for the
-- same day is idempotent.
--
-- STORAGE ESTIMATE
-- ────────────────
-- 2 networks × 365 days/year = 730 rows/year. Negligible — no partitioning
-- or archiving required.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS affiliate_reports (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which affiliate network this row covers
  network     text        NOT NULL
    CHECK (network IN ('amazon', 'skimlinks')),

  -- The calendar day this report covers (UTC)
  report_date date        NOT NULL,

  -- Aggregate click count reported by the network for this day
  -- (may differ from our internal click_events count due to bot filtering,
  --  different attribution windows, etc.)
  clicks      integer     NOT NULL DEFAULT 0
    CHECK (clicks >= 0),

  -- Confirmed revenue (commission earned, not gross sales value)
  -- For Amazon: Ad Fees Earned column from the Associates CSV
  -- For Skimlinks: sum of status='approved' commissions
  -- Stored in USD. See lib/skimlinks-api.ts for non-USD handling.
  revenue     numeric(12, 4) NOT NULL DEFAULT 0
    CHECK (revenue >= 0),

  -- Full JSON payload from the sync for audit / debugging
  -- Amazon: { clicks, orderedItems, revenue, fees, conversionPct }
  -- Skimlinks: { clicks, commissions, revenue, pendingRevenue, rejectedRevenue }
  raw_data    jsonb        NOT NULL DEFAULT '{}',

  -- When this row was last written by the sync job
  synced_at   timestamptz  NOT NULL DEFAULT now(),

  -- Composite unique key: one row per network per day
  CONSTRAINT affiliate_reports_network_date_unique UNIQUE (network, report_date)
);

-- ── Index ─────────────────────────────────────────────────────────────────────

-- Range queries for the reconciliation table (last 7/30/90 days)
CREATE INDEX IF NOT EXISTS affiliate_reports_date_idx
  ON affiliate_reports (report_date DESC);

-- Per-network range queries
CREATE INDEX IF NOT EXISTS affiliate_reports_network_date_idx
  ON affiliate_reports (network, report_date DESC);

-- ── RLS ───────────────────────────────────────────────────────────────────────

-- This table contains sensitive business revenue data.
-- It must NEVER be accessible via the anon key or authenticated users.
-- All reads and writes go through the service-role key (server-side only).

ALTER TABLE affiliate_reports ENABLE ROW LEVEL SECURITY;

-- No policies = no access for any role except service_role (which bypasses RLS).
-- This is intentional — the table is admin-only.

-- ── Comments ──────────────────────────────────────────────────────────────────

COMMENT ON TABLE affiliate_reports IS
  'Daily confirmed revenue from affiliate networks. Synced by cron at '
  '/api/cron/sync-affiliate-data. One row per network per day. Admin-only.';

COMMENT ON COLUMN affiliate_reports.network IS
  'Affiliate network identifier. "amazon" = Amazon Associates. '
  '"skimlinks" = Skimlinks publisher programme.';

COMMENT ON COLUMN affiliate_reports.report_date IS
  'Calendar date (UTC) this row covers. Not a timestamp — always midnight.';

COMMENT ON COLUMN affiliate_reports.clicks IS
  'Click count as reported by the affiliate network for this day. '
  'May differ from internal click_events COUNT due to deduplication, '
  'bot filtering, and attribution window differences.';

COMMENT ON COLUMN affiliate_reports.revenue IS
  'Confirmed commission earned (USD). Excludes pending/rejected amounts. '
  'For Amazon: "Ad Fees Earned" from Associates CSV. '
  'For Skimlinks: SUM of commissions WHERE status = ''approved''.';

COMMENT ON COLUMN affiliate_reports.raw_data IS
  'Full structured report payload stored for audit and calibration. '
  'Schema varies by network — see lib/*-api.ts for type definitions.';

-- ── Reconciliation view ───────────────────────────────────────────────────────
--
-- Joins affiliate_reports (actual revenue) with click_events (estimated
-- revenue) so the admin page can show both in one query.
--
-- The LEFT JOIN on click_events is grouped by date; dates with no clicks
-- return 0 for the estimates. Dates in affiliate_reports with no matching
-- click_events (possible if our click tracking had an outage) still appear.

CREATE OR REPLACE VIEW affiliate_reconciliation AS
SELECT
  ar.report_date,
  ar.network,
  ar.clicks                                        AS network_clicks,
  ar.revenue                                       AS actual_revenue,

  -- Estimated revenue from our internal click_events for the same date/network
  COALESCE(ce_agg.estimated_revenue, 0)            AS estimated_revenue,

  -- Internal click count for cross-check
  COALESCE(ce_agg.internal_clicks, 0)              AS internal_clicks,

  -- Variance: (actual - estimated) / estimated * 100
  -- NULL when estimated is 0 (avoid division by zero)
  CASE
    WHEN COALESCE(ce_agg.estimated_revenue, 0) = 0 THEN NULL
    ELSE ROUND(
      ((ar.revenue - COALESCE(ce_agg.estimated_revenue, 0))
        / ce_agg.estimated_revenue * 100)::numeric,
      1
    )
  END                                              AS variance_pct,

  ar.synced_at,
  ar.raw_data

FROM affiliate_reports ar
LEFT JOIN (
  SELECT
    DATE(clicked_at)               AS click_date,
    affiliate_network,
    COUNT(*)                       AS internal_clicks,
    COALESCE(SUM(estimated_commission), 0) AS estimated_revenue
  FROM   click_events
  WHERE  estimated_commission IS NOT NULL
  GROUP  BY DATE(clicked_at), affiliate_network
) ce_agg
  ON  ce_agg.click_date       = ar.report_date
  AND ce_agg.affiliate_network = CASE ar.network
        WHEN 'amazon'    THEN 'amazon_associates'
        WHEN 'skimlinks' THEN 'skimlinks'
        ELSE ar.network
      END

ORDER BY ar.report_date DESC, ar.network;

COMMENT ON VIEW affiliate_reconciliation IS
  'Joins confirmed affiliate revenue (affiliate_reports) with internal '
  'estimated revenue (click_events) for variance analysis. Used by the '
  'admin ReconciliationTable component.';
