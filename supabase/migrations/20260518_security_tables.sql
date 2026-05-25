-- =============================================================================
-- GiftHint — Security Tables
-- Migration: 20260518_security_tables.sql
--
-- Creates:
--   suspicious_events — flagged activity logged by lib/abuse-detection.ts
--                       (click fraud, fake views, claim spam, email harvest)
--   blocked_ips       — IPs banned via the admin security panel;
--                       the live blocklist is Redis-backed (checked in
--                       middleware.ts); this table is the permanent audit record.
-- =============================================================================

-- ── 1. suspicious_events ──────────────────────────────────────────────────────
--
-- Written by lib/abuse-detection.ts when an activity pattern exceeds the
-- abuse detection threshold. Rows are never deleted automatically — they are
-- reviewed by the admin and marked reviewed=true.

CREATE TABLE IF NOT EXISTS suspicious_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Type of detected abuse pattern
  event_type  TEXT        NOT NULL
    CHECK (event_type IN ('click_fraud', 'fake_views', 'claim_spam', 'email_harvest')),

  -- Hashed or raw IP address (raw stored here — admin-only table)
  ip_address  TEXT        NOT NULL,

  -- Context: item_id, wishlist_id, etc.
  metadata    JSONB       NOT NULL DEFAULT '{}',

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Admin review lifecycle
  reviewed    BOOLEAN     NOT NULL DEFAULT false,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT
);

-- Fast admin panel query: recent events, unreviewed first
CREATE INDEX IF NOT EXISTS idx_suspicious_events_created
  ON suspicious_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_suspicious_events_ip
  ON suspicious_events (ip_address, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_suspicious_events_unreviewed
  ON suspicious_events (reviewed, created_at DESC)
  WHERE reviewed = false;

ALTER TABLE suspicious_events ENABLE ROW LEVEL SECURITY;

-- Service role only — admin panel uses service role key
CREATE POLICY "suspicious_events: service role only"
  ON suspicious_events
  USING      (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE suspicious_events IS
  'Flagged abuse events logged by lib/abuse-detection.ts. '
  'Review via /admin/security. Do not delete rows — mark reviewed=true instead.';


-- ── 2. blocked_ips ────────────────────────────────────────────────────────────
--
-- Permanent audit record of banned IPs. The live blocklist is stored in Redis
-- (SADD gifthint:blocked_ips) so middleware can check it in O(1) without a
-- DB round-trip. This table syncs on ban/unban so the block survives a Redis
-- flush or restart (the admin UI re-syncs Redis on startup via a cron job).

CREATE TABLE IF NOT EXISTS blocked_ips (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address  TEXT        NOT NULL UNIQUE,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  TEXT,            -- admin email for audit trail
  active      BOOLEAN     NOT NULL DEFAULT true,
  unbanned_at TIMESTAMPTZ,
  unbanned_by TEXT
);

-- Fast lookup by IP (used by the ban-ip route to check for duplicates)
CREATE INDEX IF NOT EXISTS idx_blocked_ips_address
  ON blocked_ips (ip_address)
  WHERE active = true;

ALTER TABLE blocked_ips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "blocked_ips: service role only"
  ON blocked_ips
  USING      (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE blocked_ips IS
  'Permanent record of banned IP addresses. '
  'The live blocklist is in Redis (gifthint:blocked_ips SET). '
  'Run SELECT sync_blocked_ips_to_redis() after a Redis flush.';


-- ── 3. Helper: top abusive IPs view ──────────────────────────────────────────
--
-- Used by the admin security panel to identify the worst offenders.

CREATE OR REPLACE VIEW top_abusive_ips AS
SELECT
  ip_address,
  COUNT(*)                                              AS total_events,
  COUNT(*) FILTER (WHERE event_type = 'click_fraud')   AS click_fraud,
  COUNT(*) FILTER (WHERE event_type = 'fake_views')    AS fake_views,
  COUNT(*) FILTER (WHERE event_type = 'claim_spam')    AS claim_spam,
  COUNT(*) FILTER (WHERE event_type = 'email_harvest') AS email_harvest,
  COUNT(*) FILTER (WHERE reviewed = false)             AS unreviewed,
  MIN(created_at)                                      AS first_seen,
  MAX(created_at)                                      AS last_seen,
  -- Is this IP already banned?
  EXISTS (
    SELECT 1 FROM blocked_ips b
    WHERE b.ip_address = suspicious_events.ip_address AND b.active = true
  )                                                     AS is_banned
FROM suspicious_events
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY ip_address
ORDER BY total_events DESC;

COMMENT ON VIEW top_abusive_ips IS
  'Top abusive IPs in the last 7 days, with event breakdown and ban status. '
  'Used by /admin/security panel.';
