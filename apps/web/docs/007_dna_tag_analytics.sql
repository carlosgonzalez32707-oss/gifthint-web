-- ─────────────────────────────────────────────────────────────────────────────
-- 007_dna_tag_analytics.sql — GiftHint
--
-- DNA tag analytics: tracks how often each tag is used across all items so
-- the UI can show a "popular tags" badge and surface trending preferences.
--
-- Run in Supabase SQL Editor (staging first, then production).
-- Safe to re-run: all DDL uses IF NOT EXISTS / OR REPLACE.
--
-- What this does:
--   1. Creates dna_tag_analytics table (one row per tag string)
--   2. Creates a trigger function that fires when wishlist_items.dna_tags changes
--   3. Attaches the trigger to wishlist_items (AFTER UPDATE)
--   4. Creates a convenience function for the API: get_popular_tags(limit)
--   5. Enables RLS: analytics rows are public-readable, write-only via trigger
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. dna_tag_analytics table ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dna_tag_analytics (
  tag_text     text        PRIMARY KEY
                           CHECK (tag_text ~ '^#[A-Za-z0-9]{1,19}$'),
  usage_count  integer     NOT NULL DEFAULT 0
                           CHECK (usage_count >= 0),
  last_used    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  dna_tag_analytics IS
  'Aggregate usage counters for each DNA preference tag. '
  'Rows are written only via trigger on wishlist_items — never directly.';

COMMENT ON COLUMN dna_tag_analytics.tag_text    IS 'Tag string including the leading #, e.g. #NoSynthetics.';
COMMENT ON COLUMN dna_tag_analytics.usage_count IS 'Number of items currently carrying this tag.';
COMMENT ON COLUMN dna_tag_analytics.last_used   IS 'Timestamp of the most recent add or remove involving this tag.';

-- Fast ordering by popularity
CREATE INDEX IF NOT EXISTS dna_tag_analytics_usage_count_idx
  ON dna_tag_analytics (usage_count DESC);

-- ── 2. Trigger function ────────────────────────────────────────────────────────
--
-- Called AFTER UPDATE on wishlist_items whenever the dna_tags column changes.
-- Also fires AFTER INSERT (for new items saved with tags already set) and
-- AFTER DELETE (to decrement counts when an item is removed).
--
-- Logic:
--   On INSERT: increment every tag in NEW.dna_tags
--   On DELETE: decrement every tag in OLD.dna_tags (floor at 0)
--   On UPDATE: decrement tags removed (in OLD but not NEW),
--              increment tags added   (in NEW but not OLD)
--
-- Uses UPSERT so a tag row is created on first use with usage_count = 1.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_update_dna_tag_analytics()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER   -- runs as the function owner (service role), bypasses RLS
AS $$
DECLARE
  added_tags   text[];
  removed_tags text[];
  t            text;
BEGIN
  -- ── Compute diffs ──────────────────────────────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    added_tags   := COALESCE(NEW.dna_tags, '{}');
    removed_tags := '{}';

  ELSIF TG_OP = 'DELETE' THEN
    added_tags   := '{}';
    removed_tags := COALESCE(OLD.dna_tags, '{}');

  ELSE
    -- UPDATE: only touch the diff to minimise write amplification
    IF COALESCE(NEW.dna_tags, '{}') = COALESCE(OLD.dna_tags, '{}') THEN
      RETURN NEW;   -- no change — skip entirely
    END IF;

    -- Tags present in NEW but not OLD → added
    SELECT ARRAY(
      SELECT unnest(COALESCE(NEW.dna_tags, '{}'))
      EXCEPT
      SELECT unnest(COALESCE(OLD.dna_tags, '{}'))
    ) INTO added_tags;

    -- Tags present in OLD but not NEW → removed
    SELECT ARRAY(
      SELECT unnest(COALESCE(OLD.dna_tags, '{}'))
      EXCEPT
      SELECT unnest(COALESCE(NEW.dna_tags, '{}'))
    ) INTO removed_tags;
  END IF;

  -- ── Increment added tags ───────────────────────────────────────────────────
  FOREACH t IN ARRAY added_tags LOOP
    -- Validate format before upserting (defence in depth)
    IF t ~ '^#[A-Za-z0-9]{1,19}$' THEN
      INSERT INTO dna_tag_analytics (tag_text, usage_count, last_used)
      VALUES (t, 1, now())
      ON CONFLICT (tag_text) DO UPDATE
        SET usage_count = dna_tag_analytics.usage_count + 1,
            last_used   = now();
    END IF;
  END LOOP;

  -- ── Decrement removed tags (floor at 0) ───────────────────────────────────
  FOREACH t IN ARRAY removed_tags LOOP
    UPDATE dna_tag_analytics
       SET usage_count = GREATEST(0, usage_count - 1),
           last_used   = now()
     WHERE tag_text = t;
    -- If the row doesn't exist, the UPDATE is a no-op — that's intentional.
  END LOOP;

  -- Return appropriate row for trigger type
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- ── 3. Attach trigger to wishlist_items ───────────────────────────────────────
--
-- Drop first so re-runs are idempotent (CREATE OR REPLACE is not available
-- for triggers in PostgreSQL < 14, and Supabase is on PG 15 but the
-- DROP IF EXISTS pattern is safer across environments).

DROP TRIGGER IF EXISTS trg_dna_tag_analytics ON wishlist_items;

CREATE TRIGGER trg_dna_tag_analytics
AFTER INSERT OR UPDATE OF dna_tags OR DELETE
ON wishlist_items
FOR EACH ROW
EXECUTE FUNCTION fn_update_dna_tag_analytics();

-- ── 4. Convenience query function ─────────────────────────────────────────────
--
-- Called by the API route GET /api/dna-tags/popular to populate the
-- "popular tags" badge in the item editor and extension hint sheet.

CREATE OR REPLACE FUNCTION get_popular_tags(p_limit integer DEFAULT 20)
RETURNS TABLE (tag_text text, usage_count integer, last_used timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT tag_text, usage_count, last_used
  FROM   dna_tag_analytics
  WHERE  usage_count > 0
  ORDER  BY usage_count DESC, last_used DESC
  LIMIT  p_limit;
$$;

-- ── 5. Row Level Security ──────────────────────────────────────────────────────

ALTER TABLE dna_tag_analytics ENABLE ROW LEVEL SECURITY;

-- Analytics counters are public — gifters can see what tags are trending
-- (used for the "popular" badge; no PII is exposed).
CREATE POLICY "analytics_public_read"
  ON dna_tag_analytics FOR SELECT
  TO anon, authenticated
  USING (true);

-- Only the trigger function (SECURITY DEFINER, runs as owner) can write.
-- No direct INSERT/UPDATE/DELETE from the anon or authenticated roles.
-- This policy intentionally has no matching rows so direct writes fail.
CREATE POLICY "analytics_no_direct_write"
  ON dna_tag_analytics FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);

-- ── 6. Back-fill: count tags already on existing items ───────────────────────
--
-- On first run the table is empty; populate it from current data so the
-- "popular tags" feature is immediately useful.
-- Wrapped in DO $$ to make it idempotent (skips if rows already exist).

DO $$
BEGIN
  -- Only back-fill if the table is empty (i.e. first run).
  IF (SELECT COUNT(*) FROM dna_tag_analytics) = 0 THEN
    INSERT INTO dna_tag_analytics (tag_text, usage_count, last_used)
    SELECT
      tag                              AS tag_text,
      COUNT(*)                         AS usage_count,
      MAX(created_at)                  AS last_used
    FROM wishlist_items,
         unnest(dna_tags) AS tag
    WHERE
      tag ~ '^#[A-Za-z0-9]{1,19}$'    -- validate format
    GROUP BY tag
    ON CONFLICT (tag_text) DO UPDATE
      SET usage_count = EXCLUDED.usage_count,
          last_used   = EXCLUDED.last_used;
  END IF;
END;
$$;
