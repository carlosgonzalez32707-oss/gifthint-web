-- ─────────────────────────────────────────────────────────────────────────────
-- 008_page_views.sql — GiftHint
--
-- Anonymised page-view tracking for wisher-facing analytics.
--
-- PRIVACY DESIGN:
--   No gifter PII is stored. There is no IP address, user agent, cookie, or
--   session identifier in this table. The only identifiers are:
--     • wishlist_id  — a pseudonymous UUID owned by the wisher
--     • referrer     — sanitised to origin-only (e.g. "https://twitter.com")
--                      before insertion; NULL for direct traffic
--
--   Because no gifter PII is present, rows are safe to retain indefinitely
--   without triggering GDPR/CCPA deletion obligations for gifters.
--
-- RATE-LIMIT NOTE:
--   Deduplication is handled at the API layer (max 1 insert per IP+wishlist
--   per hour). The DB does NOT enforce uniqueness on (wishlist_id, viewed_at)
--   because legitimate concurrent gifters cause genuine duplicate timestamps.
--
-- Run in Supabase SQL Editor (staging first, then production).
-- Safe to re-run: all DDL uses IF NOT EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Table ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS page_views (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  wishlist_id uuid        NOT NULL
                            REFERENCES wishlists(id) ON DELETE CASCADE,
  viewed_at   timestamptz NOT NULL DEFAULT now(),
  referrer    text        CHECK (char_length(referrer) <= 200)
                          -- sanitised HTTP Referer origin; NULL = direct traffic
);

COMMENT ON TABLE  page_views IS
  'Anonymised page-view events. One row per gifter page load that passes '
  'the API rate limit. No gifter PII — safe to retain indefinitely.';

COMMENT ON COLUMN page_views.referrer IS
  'HTTP Referer header, reduced to scheme+host only before storage '
  '(e.g. "https://twitter.com"). NULL for direct or unknown traffic.';

-- ── 2. Indexes ────────────────────────────────────────────────────────────────

-- Compound index supports both the 14-day sparkline query (wishlist_id + viewed_at range)
-- and the wisher_analytics view group-by (wishlist_id aggregate).
CREATE INDEX IF NOT EXISTS page_views_wishlist_viewed_idx
  ON page_views (wishlist_id, viewed_at DESC);

-- Partial index for recent views — analytics queries almost always filter
-- to the last 30–90 days, so this keeps those scans fast on large tables.
CREATE INDEX IF NOT EXISTS page_views_recent_idx
  ON page_views (viewed_at DESC)
  WHERE viewed_at > (now() - interval '90 days');

-- ── 3. Row Level Security ─────────────────────────────────────────────────────

ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;

-- Wishers may SELECT views for their own lists (used if the dashboard ever
-- queries Supabase directly with an anon key + user JWT).
-- The track-view API route uses the service-role key, so inserts bypass RLS.
CREATE POLICY "wishers can read own page views"
  ON page_views
  FOR SELECT
  USING (
    wishlist_id IN (
      SELECT id
      FROM   wishlists
      WHERE  user_id = auth.uid()
    )
  );

-- No INSERT policy — only the service-role API key may write rows.
-- This prevents gifters from inflating analytics via the anon key.
