-- ─────────────────────────────────────────────────────────────────────────────
-- GiftHint — Referral Rewards System
-- Migration: 20260518_referral_rewards.sql
--
-- Adds premium tier + per-feature unlock flags to the users table.
-- Tier is computed and written by lib/rewards.ts after each referral signup.
-- Individual flags let the app gate specific features without re-checking the
-- tier logic on every render.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Premium tier ──────────────────────────────────────────────────────────────
-- 'free'  — 0 referrals, default
-- 'plus'  — 1–9 referrals  (custom username, premium themes, priority support)
-- 'pro'   — 10+ referrals  (all plus + Pro badge + verified checkmark)

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS premium_tier TEXT NOT NULL DEFAULT 'free'
    CHECK (premium_tier IN ('free', 'plus', 'pro'));

-- ── Per-feature unlock flags ──────────────────────────────────────────────────
-- Stored as explicit columns so UI components can gate features with a single
-- boolean read rather than recalculating tier thresholds each time.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS custom_username_enabled   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS premium_themes_enabled    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS priority_support_enabled  BOOLEAN NOT NULL DEFAULT false;

-- ── Index ─────────────────────────────────────────────────────────────────────
-- Used when the admin dashboard filters/counts users by tier.
CREATE INDEX IF NOT EXISTS idx_users_premium_tier ON users(premium_tier);
