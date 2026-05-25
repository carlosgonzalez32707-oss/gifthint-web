-- ─────────────────────────────────────────────────────────────────────────────
-- GiftHint — Partner System
-- Migration: 20260518_partner_system.sql
--
-- Adds:
--   1. partners table — one row per partner organisation
--   2. partner_payouts table — monthly affiliate commission statements
--   3. estimated_commission_pence column on click_events
--   4. partner_commission_summary view — aggregated payout preview
--   5. Indexes and RLS policies
--
-- Relationship model:
--   Each partner has a corresponding system user account in the users table.
--   partners.user_id → users.id
--   partners.referral_code mirrors users.referral_code for that account.
--
--   Because referral attribution uses users.referred_by = <referrer user id>,
--   the existing /api/auth/signup pipeline works without any changes:
--   it reads the gifthint_ref cookie, looks up users.referral_code, and sets
--   referred_by — whether the referrer is a human user or a partner account
--   makes no difference to the attribution logic.
--
-- RLS:
--   Both tables use service_role-only policies. Partner pages are server-
--   rendered using the service role key, so there is no RLS bypass needed.
--   Authenticated users do not need to read partner or payout rows.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. partners table ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS partners (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The system user account created for this partner when onboarded.
  -- This user's referral_code is what gets stored in the gifthint_ref cookie.
  -- Restrict delete: removing a user account that has attributed signups is
  -- a data integrity issue that should be handled manually.
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  -- URL-safe identifier used in /partners/[slug].
  -- Convention: lowercase, hyphens only. e.g. 'knighton-weddings', 'nct-islington'
  slug            TEXT        NOT NULL,

  -- Display name shown in the co-branded nav and badge.
  name            TEXT        NOT NULL,

  -- Drives the copy block (headline / subline / steps) in the landing page.
  category        TEXT        NOT NULL
    CHECK (category IN (
      'wedding', 'baby_shower', 'corporate',
      'sports_club', 'education', 'other'
    )),

  -- Denormalised from users.referral_code for the partner's system user.
  -- Stored here to avoid a JOIN on every page load. Must be kept in sync if
  -- the referral_code on the user row is ever regenerated (rare).
  referral_code   TEXT        NOT NULL,

  -- Optional custom tagline appended below the headline.
  tagline         TEXT,

  -- Optional partner logo (stored in Supabase Storage: partners/logos/<id>.png).
  -- Shown in the nav alongside the GiftHint wordmark when set.
  logo_url        TEXT,

  -- Hex accent colour for the CTA button and step numbers, e.g. '#C084FC'.
  -- Falls back to GiftHint purple (#7C3AED) in the component when null.
  accent_colour   TEXT,

  -- Contact details used for payout emails and onboarding communications.
  contact_email   TEXT,
  contact_name    TEXT,

  -- Whether this partner's landing page is live and the referral code is active.
  -- Set to false rather than deleting to preserve attribution history.
  active          BOOLEAN     NOT NULL DEFAULT true,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Uniqueness constraints ────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS partners_slug_idx
  ON partners (slug);

CREATE UNIQUE INDEX IF NOT EXISTS partners_user_id_idx
  ON partners (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS partners_referral_code_idx
  ON partners (referral_code);

-- Fast active-partner lookup (used by /api/partners/track and generateStaticParams)
CREATE INDEX IF NOT EXISTS partners_active_idx
  ON partners (active)
  WHERE active = true;

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE partners ENABLE ROW LEVEL SECURITY;

-- Only the service role (server-side Next.js) may read or write partner rows.
CREATE POLICY "partners: service role only"
  ON partners
  USING      (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── updated_at trigger ────────────────────────────────────────────────────────

-- Reuse the update_updated_at_column() function if it already exists in the
-- schema (created by an earlier migration). If not, create it here.
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER partners_updated_at
  BEFORE UPDATE ON partners
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── 2. partner_payouts table ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS partner_payouts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The partner this statement belongs to.
  partner_id      UUID        NOT NULL REFERENCES partners(id) ON DELETE CASCADE,

  -- Billing period. Always the 1st and last instant of a calendar month:
  --   period_start = date_trunc('month', now())
  --   period_end   = date_trunc('month', now()) + interval '1 month' - interval '1 microsecond'
  period_start    TIMESTAMPTZ NOT NULL,
  period_end      TIMESTAMPTZ NOT NULL,

  -- Cohort snapshot at time of calculation.
  -- referred_active_users: users referred by this partner with ≥1 saved item.
  referred_active_users         INTEGER     NOT NULL DEFAULT 0,

  -- Total buy-button clicks by the referred cohort during this period.
  total_affiliate_clicks        INTEGER     NOT NULL DEFAULT 0,

  -- Monetary values stored in pence (integer) to avoid floating-point errors.
  -- gross_affiliate_revenue_pence: GiftHint's estimated affiliate earnings from
  --   the referred cohort's buy clicks (sourced from click_events.estimated_commission_pence).
  -- commission_pence: 20% of gross, owed to the partner.
  gross_affiliate_revenue_pence INTEGER     NOT NULL DEFAULT 0,
  commission_pence              INTEGER     NOT NULL DEFAULT 0,

  -- ISO 4217 currency code for the commission.
  commission_currency           TEXT        NOT NULL DEFAULT 'gbp',

  -- Lifecycle:
  --   pending  → calculated, awaiting admin review
  --   approved → reviewed and approved for payment
  --   paid     → payment sent
  --   void     → cancelled (partner deactivated, dispute, etc.)
  status          TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'paid', 'void')),

  -- Payment confirmation (populated when status transitions to 'paid').
  paid_at         TIMESTAMPTZ,
  payment_ref     TEXT,   -- bank transfer reference or PayPal transaction ID
  payment_notes   TEXT,

  -- Email address of the admin who approved/processed the payout (audit trail).
  processed_by    TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prevent duplicate statements for the same partner + period.
CREATE UNIQUE INDEX IF NOT EXISTS partner_payouts_period_idx
  ON partner_payouts (partner_id, period_start, period_end);

-- Fast lookup: all payouts for a partner ordered newest-first.
CREATE INDEX IF NOT EXISTS partner_payouts_partner_idx
  ON partner_payouts (partner_id, period_start DESC);

-- Fast lookup: all payouts awaiting action (admin review queue).
CREATE INDEX IF NOT EXISTS partner_payouts_status_idx
  ON partner_payouts (status)
  WHERE status IN ('pending', 'approved');

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE partner_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "partner_payouts: service role only"
  ON partner_payouts
  USING      (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── updated_at trigger ────────────────────────────────────────────────────────

CREATE TRIGGER partner_payouts_updated_at
  BEFORE UPDATE ON partner_payouts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── 3. Extend click_events with estimated_commission_pence ───────────────────
--
-- Populated asynchronously by a background sync job that reads Skimlinks
-- Publisher API / Amazon PA API earnings data and back-fills per-click.
-- NULL means the value has not yet been synced, not that earnings were zero.
-- The partner payout calculation treats NULL as 0 (via COALESCE) when live
-- data is unavailable.

ALTER TABLE click_events
  ADD COLUMN IF NOT EXISTS estimated_commission_pence INTEGER;

COMMENT ON COLUMN click_events.estimated_commission_pence IS
  'Estimated affiliate commission earned from this buy-click, in pence. '
  'Populated by background sync with Skimlinks Publisher API or Amazon PA API. '
  'NULL = not yet synced; treat as 0 in aggregations (COALESCE to 0).';


-- ── 4. partner_commission_summary view ───────────────────────────────────────
--
-- Aggregates lifetime commission data per partner for the admin review UI and
-- payout calculation script. Run:
--   SELECT * FROM partner_commission_summary WHERE active_referred_users >= 10;
-- to identify partners eligible for commission in the current period.

CREATE OR REPLACE VIEW partner_commission_summary AS
SELECT
  p.id                                                          AS partner_id,
  p.name                                                        AS partner_name,
  p.slug                                                        AS partner_slug,
  p.category,
  p.contact_email,
  p.active,

  -- Total users ever referred by this partner
  COUNT(DISTINCT u.id)                                          AS total_referred_users,

  -- Active = referred user has at least one saved wishlist item
  COUNT(DISTINCT u.id) FILTER (
    WHERE u.id IN (SELECT DISTINCT user_id FROM wishlist_items)
  )                                                             AS active_referred_users,

  -- Lifetime buy-clicks from the referred cohort
  COUNT(ce.id)                                                  AS lifetime_affiliate_clicks,

  -- Lifetime gross affiliate revenue attributed to the referred cohort (pence)
  COALESCE(SUM(ce.estimated_commission_pence), 0)               AS lifetime_gross_revenue_pence,

  -- 20% commission owed to the partner (lifetime, pre-payout)
  COALESCE(ROUND(SUM(ce.estimated_commission_pence) * 0.20), 0) AS lifetime_commission_pence,

  -- Already-paid commissions (sum of paid payouts)
  COALESCE((
    SELECT SUM(pp.commission_pence)
    FROM   partner_payouts pp
    WHERE  pp.partner_id = p.id
    AND    pp.status = 'paid'
  ), 0)                                                         AS total_paid_pence,

  -- Net outstanding (owed but not yet paid)
  COALESCE(ROUND(SUM(ce.estimated_commission_pence) * 0.20), 0)
  - COALESCE((
    SELECT SUM(pp.commission_pence)
    FROM   partner_payouts pp
    WHERE  pp.partner_id = p.id
    AND    pp.status = 'paid'
  ), 0)                                                         AS outstanding_commission_pence

FROM  partners p
LEFT  JOIN users u          ON u.referred_by = p.user_id
LEFT  JOIN click_events ce  ON ce.wisher_user_id = u.id
GROUP BY p.id, p.name, p.slug, p.category, p.contact_email, p.active;

COMMENT ON VIEW partner_commission_summary IS
  'Aggregated lifetime partner attribution and commission data. '
  'Use outstanding_commission_pence to identify what is owed. '
  'Partners with active_referred_users < 10 are not eligible for commission.';
