-- =============================================================================
-- GiftHint — CTA Events Table
-- Migration: 20260518_cta_events.sql
--
-- Creates:
--   cta_events — one row per ViralCTABar interaction on gifter pages
--
-- Used by:
--   app/api/analytics/cta/route.ts   — POST /api/analytics/cta (fire-and-forget insert)
--   app/admin/page.tsx               — admin dashboard CTA click count
--   components/ViralCTABar.tsx       — fires on every "Create your own list" click
--   phase3-metrics-review.md Query 2 — top gifter pages by viral CTA clicks
--
-- NOTE: this table was used in application code from Phase 2 but the migration
-- was not written at the time.  Apply this before running the metrics queries.
--
-- Safe to re-run: CREATE TABLE IF NOT EXISTS.
-- =============================================================================

CREATE TABLE IF NOT EXISTS cta_events (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Type of interaction ('signup_cta_click', 'cta_impression', etc.)
  -- Truncated to 64 chars at the API layer.
  event_type           text        NOT NULL DEFAULT 'unknown',

  -- The wisher's public username whose gifter page was being viewed.
  -- NULL if the username could not be extracted from the URL.
  gifter_page_username text,

  -- Raw user-agent string, truncated to 512 chars.
  -- Used to distinguish mobile vs desktop in Signal 1 of the metrics review.
  user_agent           text,

  -- HTTP Referer header, truncated to 512 chars.
  -- Useful for understanding which external sites drive gifter page traffic.
  referrer             text,

  created_at           timestamptz NOT NULL DEFAULT now()
);

-- Most common query: recent events sorted by time (admin dashboard)
CREATE INDEX IF NOT EXISTS idx_cta_events_created
  ON cta_events (created_at DESC);

-- Per-gifter-page aggregation (Query 2: top pages by CTA clicks)
CREATE INDEX IF NOT EXISTS idx_cta_events_username
  ON cta_events (gifter_page_username, created_at DESC)
  WHERE gifter_page_username IS NOT NULL;

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- Analytics data is internal — service role only.
-- No public SELECT policies: gifters cannot read each other's CTA event data.
-- The insert route uses the service role key (createServerClient), so no
-- INSERT policy is needed either.
ALTER TABLE cta_events ENABLE ROW LEVEL SECURITY;
