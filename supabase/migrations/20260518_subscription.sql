-- =============================================================================
-- GiftHint — Subscription tracking
-- Migration: 20260518_subscription.sql
--
-- Adds the three columns needed to track Stripe Billing subscriptions on the
-- users table.  Pairs with lib/permissions.ts (feature gating),
-- app/api/billing/create-checkout/route.ts (Checkout Session creation), and
-- app/api/billing/webhook/route.ts (lifecycle event handling).
--
-- Column semantics
-- ────────────────
--   stripe_customer_id
--     Stripe Customer object ID (cus_xxx).  NULL until the first checkout.
--     Stored here so subsequent checkouts reuse the same customer record and
--     payment history is unified on the Stripe dashboard.
--
--   subscription_status
--     'free'      — no active subscription (default)
--     'pro'       — active, paid Pro subscription
--     'cancelled' — subscription was cancelled; access ends at subscription_period_end
--
--   subscription_period_end
--     Unix-timestamp-derived ISO 8601 UTC value of Stripe's
--     current_period_end.  For cancelled subscriptions, access is allowed
--     until this date (the user has already paid for the period).
--     NULL for 'free' users.
--
-- Safe to re-run: all statements use IF NOT EXISTS / IF NOT EXISTS patterns.
-- =============================================================================

-- ── 1. Add columns ────────────────────────────────────────────────────────────

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS stripe_customer_id       TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status      TEXT NOT NULL DEFAULT 'free'
    CHECK (subscription_status IN ('free', 'pro', 'cancelled')),
  ADD COLUMN IF NOT EXISTS subscription_period_end  TIMESTAMPTZ;

COMMENT ON COLUMN users.stripe_customer_id IS
  'Stripe Customer ID (cus_xxx). NULL until the user starts a checkout.';

COMMENT ON COLUMN users.subscription_status IS
  'Billing state: free | pro | cancelled.  '
  'cancelled means the subscription was terminated; access persists until subscription_period_end.';

COMMENT ON COLUMN users.subscription_period_end IS
  'UTC timestamp when the current paid period ends. '
  'NULL for free users. For cancelled subs, access allowed until this date.';

-- ── 2. Index ──────────────────────────────────────────────────────────────────
-- Partial index — only active Pro subscribers matter for feature-gating lookups.

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_stripe_customer_id
  ON users (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_subscription_status
  ON users (subscription_status)
  WHERE subscription_status = 'pro';

-- ── 3. RLS ────────────────────────────────────────────────────────────────────
-- The existing RLS policy on `users` already restricts rows to the owning
-- user (SELECT WHERE id = auth.uid()).  The billing webhook uses the service
-- role key which bypasses RLS — no additional policies needed.
--
-- Service role (used by webhook): full access, bypasses RLS.
-- Anon / authenticated: read own row only (existing policy).
