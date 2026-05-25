-- ─────────────────────────────────────────────────────────────────────────────
-- supabase/migrations/20260518_extension_errors.sql — GiftHint
--
-- Creates the extension_errors table that stores error reports from the
-- Chrome / Firefox extension's background.js service worker.
--
-- Why a dedicated table (vs. suspicious_events)?
--   extension_errors are product bugs, not abuse signals. They need different
--   retention, indexing, and alerting patterns (e.g. "spike in v1.1.0 errors
--   on amazon.com"). Keeping them separate keeps suspicious_events focused.
--
-- Retention:
--   Errors older than 90 days are automatically deleted by the pg_cron job
--   added at the bottom. This matches Sentry's default retention period and
--   keeps the table from growing unbounded.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── extension_errors table ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS extension_errors (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  message     TEXT        NOT NULL,
  stack       TEXT,
  version     TEXT        NOT NULL,               -- extension semver, e.g. "1.1.0"
  retailer    TEXT,                               -- active retailer domain, e.g. "amazon.com"
  source      TEXT        NOT NULL
              CHECK (source IN (
                'uncaught_error',
                'unhandled_rejection',
                'content_script'
              )),
  ip_address  TEXT,                              -- hashed / anonymised at query time
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE extension_errors IS
  'Error reports from the GiftHint browser extension service worker. '
  'Forwarded to Sentry and stored here for trend analysis.';

-- ── Indices ───────────────────────────────────────────────────────────────────

-- Time-range queries: "show errors in the last 24 h" — used by admin panel
CREATE INDEX IF NOT EXISTS idx_ext_errors_created_at
  ON extension_errors (created_at DESC);

-- Group by extension version to spot regressions after a release
CREATE INDEX IF NOT EXISTS idx_ext_errors_version
  ON extension_errors (version, created_at DESC);

-- Group by retailer domain to identify site-specific scraping failures
CREATE INDEX IF NOT EXISTS idx_ext_errors_retailer
  ON extension_errors (retailer, created_at DESC)
  WHERE retailer IS NOT NULL;

-- ── Row Level Security ────────────────────────────────────────────────────────
-- The /api/extension-error route uses the SERVICE ROLE key (bypasses RLS).
-- No client-side access is needed — data is read only through the admin panel.

ALTER TABLE extension_errors ENABLE ROW LEVEL SECURITY;

-- Deny all direct client access; the server route writes via service role.
CREATE POLICY extension_errors_no_access
  ON extension_errors
  FOR ALL
  USING (false);

-- ── Automatic 90-day cleanup ──────────────────────────────────────────────────
-- Requires the pg_cron extension (enabled by default on Supabase projects).
-- Run at 04:00 UTC daily — low-traffic time for GiftHint (UK-centric audience).
--
-- To enable in the Supabase dashboard:
--   1. Go to Database → Extensions → enable pg_cron
--   2. OR execute: CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'delete-old-extension-errors',         -- job name (idempotent via schedule name)
  '0 4 * * *',                           -- daily at 04:00 UTC
  $$
    DELETE FROM extension_errors
    WHERE created_at < now() - INTERVAL '90 days';
  $$
);
