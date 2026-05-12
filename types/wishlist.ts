/**
 * types/wishlist.ts — GiftHint
 *
 * Canonical TypeScript interfaces mirroring the Supabase schema.
 * Used by both the server-side page fetcher and all client components.
 *
 * DB schema reference:
 *   public.users
 *   public.wishlist_items  (FK: wishlist_items.user_id → users.id)
 */

// ── User ──────────────────────────────────────────────────────────────────────

export interface WishUser {
  /** Supabase-generated UUID (users.id) */
  id:              string
  /** Google OAuth subject identifier (not exposed on the gifter page) */
  google_id?:      string
  email?:          string | null
  /** Full name from Google profile, e.g. "Sarah Chen" */
  display_name:    string | null
  /** Google profile photo URL */
  avatar_url:      string | null
  /** URL slug used for the public page, e.g. "sarahchen42" */
  public_username: string | null
  created_at:      string          // ISO 8601 timestamptz
}

// ── Wishlist item ─────────────────────────────────────────────────────────────

export interface WishlistItem {
  /** Supabase-generated UUID */
  id:               string
  /** Owner's Supabase user UUID */
  user_id:          string

  // ── Product data ────────────────────────────────────────────────────────────
  title:            string
  /** Numeric price; null means price is unknown / not extracted */
  price:            number | null
  /** ISO 4217 currency code, defaults to "USD" */
  currency:         string
  /** Full-size product image URL (from OG meta or retailer extractor) */
  image_url:        string | null
  /** Canonical product URL used for duplicate detection */
  source_url:       string
  /** Pre-rewrite URL preserved for reference */
  original_url:     string | null
  /** Affiliate-rewritten URL used in Buy buttons (falls back to source_url) */
  affiliate_url:    string | null
  /** Human-readable retailer name, e.g. "amazon", "etsy", "target" */
  retailer:         string | null

  // ── Owner annotations ───────────────────────────────────────────────────────
  /** Free-text gift hint from the wish-list owner, e.g. "blue colorway, size M" */
  hint:             string | null
  /** Lifestyle / recipient tags added in the hint sheet, e.g. ["for-mom","cozy"] */
  dna_tags:         string[]

  // ── Claim state ─────────────────────────────────────────────────────────────
  /** True once a gifter confirms they are buying this item */
  is_claimed:       boolean
  /** Gifter's name if they chose to identify themselves; null if anonymous */
  claimed_by:       string | null
  /** ISO 8601 timestamp of when the claim was made */
  claimed_at:       string | null
  /** True if the gifter clicked "Stay anonymous" */
  claimed_anonymous: boolean

  // ── Display ordering ────────────────────────────────────────────────────────
  /** Manual sort position; items with equal sort_order fall back to created_at */
  sort_order:       number
  created_at:       string          // ISO 8601 timestamptz
}

// ── Derived / utility types ───────────────────────────────────────────────────

/** A claimed item always has a claimed_at timestamp */
export type ClaimedItem = WishlistItem & {
  is_claimed: true
  claimed_at: string
}

/** Filter keys used by GiftGrid */
export type FilterKey = 'all' | 'needed' | 'under50' | 'group'
