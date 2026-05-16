-- ──────────────────────────────────────────────────────────────────────────────
-- docs/006_dashboard_rls.sql — GiftHint
--
-- Row Level Security policies that allow authenticated wishers to manage
-- their own wishlist_items from the dashboard.
--
-- Run this migration in the Supabase SQL editor (or via supabase db push).
--
-- Prerequisites: migration 005_wishlists.sql must have already been applied.
-- ──────────────────────────────────────────────────────────────────────────────

-- ── wishlist_items: owner CRUD policies ───────────────────────────────────────
--
-- The existing gifter-page query uses the service-role key (bypasses RLS).
-- These policies cover dashboard reads/writes using the anon key + user JWT.

-- Enable RLS if not already enabled
ALTER TABLE wishlist_items ENABLE ROW LEVEL SECURITY;

-- 1. Owners can SELECT their own items
CREATE POLICY "wishlist_items: owner select"
  ON wishlist_items
  FOR SELECT
  USING ( auth.uid() = user_id );

-- 2. Owners can INSERT new items
CREATE POLICY "wishlist_items: owner insert"
  ON wishlist_items
  FOR INSERT
  WITH CHECK ( auth.uid() = user_id );

-- 3. Owners can UPDATE their own items (hint, tags, sort_order, etc.)
CREATE POLICY "wishlist_items: owner update"
  ON wishlist_items
  FOR UPDATE
  USING ( auth.uid() = user_id )
  WITH CHECK ( auth.uid() = user_id );

-- 4. Owners can DELETE their own items
CREATE POLICY "wishlist_items: owner delete"
  ON wishlist_items
  FOR DELETE
  USING ( auth.uid() = user_id );


-- ── wishlists: owner CRUD policies ────────────────────────────────────────────
--
-- The public-SELECT policy was added in migration 005.
-- These cover mutations from the dashboard.

-- 1. Owners can UPDATE their own wishlists (title, occasion_date, is_public, etc.)
CREATE POLICY "wishlists: owner update"
  ON wishlists
  FOR UPDATE
  USING ( auth.uid() = user_id )
  WITH CHECK ( auth.uid() = user_id );

-- 2. Owners can DELETE their own wishlists (hard delete — items cascade to NULL)
CREATE POLICY "wishlists: owner delete"
  ON wishlists
  FOR DELETE
  USING ( auth.uid() = user_id );

-- 3. Owners can INSERT wishlists for themselves
CREATE POLICY "wishlists: owner insert"
  ON wishlists
  FOR INSERT
  WITH CHECK ( auth.uid() = user_id );


-- ── Verification query ────────────────────────────────────────────────────────
--
-- Run as an authenticated user to check you can see your own items:
--
--   SELECT COUNT(*) FROM wishlist_items WHERE user_id = auth.uid();
--
-- Expected: row count ≥ 0 (not a permissions error).
