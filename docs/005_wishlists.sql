-- ─────────────────────────────────────────────────────────────────────────────
-- 005_wishlists.sql — GiftHint occasion tagging / multi-list system
--
-- Run this in the Supabase SQL Editor (staging first, then production).
-- Safe to re-run: CREATE TABLE IF NOT EXISTS, ALTER TABLE ... ADD COLUMN IF NOT EXISTS,
-- and the migration block uses ON CONFLICT DO NOTHING.
--
-- What this does:
--   1. Creates the `wishlists` table — one row per named list per user
--   2. Adds `wishlist_id` FK column to `wishlist_items`
--   3. Migrates all existing users: creates a "My Wishlist" default list and
--      links every orphan item to it
--   4. Adds RLS policies (service role bypasses; anon/authed follow these)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. wishlists table ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wishlists (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         text        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
  occasion      text        NOT NULL DEFAULT 'other'
                CHECK (occasion IN (
                  'birthday',
                  'christmas',
                  'wedding',
                  'baby_shower',
                  'graduation',
                  'housewarming',
                  'anniversary',
                  'other'
                )),
  occasion_date date,
  slug          text        NOT NULL CHECK (slug ~ '^[a-z0-9-]{1,80}$'),
  is_default    boolean     NOT NULL DEFAULT false,
  is_public     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),

  -- slug is unique within a user's set of lists (not globally)
  CONSTRAINT wishlists_slug_per_user UNIQUE (user_id, slug)
);

-- Enforce exactly one default list per user
-- (a partial unique index is lighter than a trigger)
CREATE UNIQUE INDEX IF NOT EXISTS wishlists_one_default_per_user
  ON wishlists (user_id)
  WHERE is_default = true;

-- Fast lookup: "give me all public lists for user X"
CREATE INDEX IF NOT EXISTS wishlists_user_public
  ON wishlists (user_id, is_public);

-- ── 2. Add wishlist_id FK to wishlist_items ───────────────────────────────────

ALTER TABLE wishlist_items
  ADD COLUMN IF NOT EXISTS wishlist_id uuid
    REFERENCES wishlists(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS wishlist_items_wishlist_id
  ON wishlist_items (wishlist_id);

-- ── 3. Migration: create default wishlists and link existing items ─────────────
-- For every user that exists but has no wishlist yet, we:
--   a) Insert a default "My Wishlist" with occasion = 'other'
--   b) Update all their existing items to point at that list
--
-- ON CONFLICT (user_id, slug) DO NOTHING makes this idempotent.

DO $$
DECLARE
  rec   RECORD;
  wl_id uuid;
BEGIN
  FOR rec IN SELECT id FROM users LOOP
    -- Try to insert; skip if this user's default wishlist was already created
    INSERT INTO wishlists (user_id, title, occasion, slug, is_default, is_public)
    VALUES (rec.id, 'My Wishlist', 'other', 'my-wishlist', true, true)
    ON CONFLICT (user_id, slug) DO NOTHING
    RETURNING id INTO wl_id;

    -- If we just created it, link orphan items
    IF wl_id IS NOT NULL THEN
      UPDATE wishlist_items
         SET wishlist_id = wl_id
       WHERE user_id = rec.id
         AND wishlist_id IS NULL;
    END IF;
  END LOOP;
END;
$$;

-- ── 4. Row Level Security ─────────────────────────────────────────────────────

ALTER TABLE wishlists ENABLE ROW LEVEL SECURITY;

-- Public lists are readable by anyone (gifters browsing the page)
CREATE POLICY "public_lists_readable"
  ON wishlists FOR SELECT
  TO anon, authenticated
  USING (is_public = true);

-- Owners can read all their own lists (including private ones in future)
CREATE POLICY "owner_reads_own_lists"
  ON wishlists FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Owners can create new lists for themselves
CREATE POLICY "owner_inserts_own_lists"
  ON wishlists FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Owners can update their own lists
CREATE POLICY "owner_updates_own_lists"
  ON wishlists FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Owners can delete their own lists (items retain wishlist_id = NULL)
CREATE POLICY "owner_deletes_own_lists"
  ON wishlists FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
