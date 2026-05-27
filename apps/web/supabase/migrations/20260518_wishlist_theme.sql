-- =============================================================================
-- GiftHint — Wishlist premium themes
-- Migration: 20260518_wishlist_theme.sql
--
-- Adds a `theme` column to the wishlists table so each list can carry a
-- premium visual theme.  The default value 'default' keeps every existing
-- row working without any data backfill.
--
-- Allowed values mirror the ThemeKey union in lib/themes.ts.
-- ⚠️  Keep in sync: if you add a new theme key to lib/themes.ts, add it to the
--     CHECK constraint below and regenerate the Supabase TypeScript types.
--
-- Gating (enforced in app code, not DB):
--   'default'  — free, always available
--   all others — require subscription_status='pro' (or premium_themes_enabled)
--
-- Safe to re-run: ADD COLUMN IF NOT EXISTS.
-- =============================================================================

ALTER TABLE wishlists
  ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'default'
    CHECK (theme IN ('default', 'midnight', 'cloud', 'forest', 'rose', 'slate'));

COMMENT ON COLUMN wishlists.theme IS
  'Premium visual theme key. One of: default | midnight | cloud | forest | rose | slate. '
  'See lib/themes.ts for the full token set for each key.';

-- Index — only non-default themes need to be looked up (for analytics / admin).
CREATE INDEX IF NOT EXISTS idx_wishlists_theme
  ON wishlists (theme)
  WHERE theme <> 'default';
