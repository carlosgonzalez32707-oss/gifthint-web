/**
 * packages/shared/src/types/index.ts — @gifthint/shared
 *
 * Canonical TypeScript interfaces mirroring the Supabase schema.
 * Pure types only — no runtime imports, safe in web, mobile, and edge.
 */

// ── User ──────────────────────────────────────────────────────────────────────

export interface User {
  /** Supabase-generated UUID */
  id:              string
  email?:          string | null
  /** Full name from Google profile */
  display_name:    string | null
  /** Google profile photo URL */
  avatar_url:      string | null
  /** URL slug for the public gifter page, e.g. "sarahchen42" */
  public_username: string | null
  created_at:      string   // ISO 8601 timestamptz
}

// ── Wishlist ──────────────────────────────────────────────────────────────────

export type OccasionKey =
  | 'birthday'
  | 'christmas'
  | 'wedding'
  | 'baby_shower'
  | 'graduation'
  | 'housewarming'
  | 'anniversary'
  | 'other'

export interface OccasionType {
  key:          OccasionKey
  label:        string
  emoji:        string
  /** Placeholder shown next to the date picker. */
  dateGuidance: string
}

export interface Wishlist {
  id:            string
  user_id:       string
  title:         string
  occasion:      OccasionKey
  /** ISO date "YYYY-MM-DD" or null */
  occasion_date: string | null
  slug:          string
  is_default:    boolean
  is_public:     boolean
  /** Premium theme key — 'default' means no theme override */
  theme:         string
  created_at:    string
}

// ── Wishlist item ─────────────────────────────────────────────────────────────

export interface WishlistItem {
  id:          string
  user_id:     string
  wishlist_id: string | null

  // ── Product data ─────────────────────────────────────────────────────────────
  title:         string
  price:         number | null
  currency:      string
  image_url:     string | null
  source_url:    string
  original_url:  string | null
  affiliate_url: string | null
  retailer:      string | null

  // ── Owner annotations ─────────────────────────────────────────────────────────
  hint:     string | null
  dna_tags: string[]

  // ── Group gift ────────────────────────────────────────────────────────────────
  is_group_gift?:     boolean
  group_gift_target?: number | null

  // ── Claim state ───────────────────────────────────────────────────────────────
  is_claimed:        boolean
  claimed_by:        string | null
  claimed_at:        string | null
  claimed_anonymous: boolean

  // ── Price tracking ────────────────────────────────────────────────────────────
  price_alert_enabled?:   boolean
  price_alert_threshold?: number | null
  last_checked_at?:       string | null
  lowest_price?:          number | null

  sort_order: number
  created_at: string
}

/** A claimed item always has a claimed_at timestamp */
export type ClaimedItem = WishlistItem & {
  is_claimed: true
  claimed_at: string
}

// ── Group gift pool ───────────────────────────────────────────────────────────

export interface GiftPool {
  id:                  string
  item_id:             string
  target_amount:       number
  collected_amount:    number
  status:              'open' | 'funded' | 'purchased' | 'cancelled'
  organiser_name:      string
  organiser_email:     string
  payout_instructions: string | null
  created_at:          string
  funded_at:           string | null
}

export interface GiftContribution {
  id:                    string
  pool_id:               string
  contributor_name:      string | null
  contributor_email:     string | null
  amount:                number
  stripe_payment_status: 'pending' | 'succeeded' | 'failed'
  contributed_at:        string
  anonymous:             boolean
}

// ── Theme ─────────────────────────────────────────────────────────────────────

export type ThemeKey = 'default' | 'midnight' | 'cloud' | 'forest' | 'rose' | 'slate'
