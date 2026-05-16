/**
 * lib/wishlists.ts — GiftHint
 *
 * Occasion-tagging / multi-list utilities.
 *
 * SERVER-SIDE ONLY — imports createServerClient (service-role key).
 * Do not import this file in 'use client' components.
 *
 * Exports:
 *   OCCASION_TYPES                — display metadata for every supported occasion
 *   generateSlug(title)           — URL-safe slug from a list title
 *   createWishlist(params)        → DbWishlist | null
 *   getWishlists(userId)          → DbWishlist[]
 *   getWishlistBySlug(userId, slug) → DbWishlist | null
 *   getDefaultWishlist(userId)    → DbWishlist | null
 */

import { createServerClient } from '@/lib/supabase-server'

// ── Types ──────────────────────────────────────────────────────────────────────

export type OccasionKey =
  | 'birthday'
  | 'christmas'
  | 'wedding'
  | 'baby_shower'
  | 'graduation'
  | 'housewarming'
  | 'anniversary'
  | 'other'

export interface OccasionMeta {
  key:          OccasionKey
  label:        string
  emoji:        string
  /** Placeholder text shown next to the date picker. */
  dateGuidance: string
}

export interface DbWishlist {
  id:            string
  user_id:       string
  title:         string
  occasion:      OccasionKey
  occasion_date: string | null   // "YYYY-MM-DD"
  slug:          string
  is_default:    boolean
  is_public:     boolean
  created_at:    string
}

export interface CreateWishlistParams {
  userId:        string
  title:         string
  occasion:      OccasionKey
  occasionDate?: string | null   // "YYYY-MM-DD" or omitted
  makeDefault?:  boolean
}

// ── Occasion catalogue ─────────────────────────────────────────────────────────

/**
 * Ordered list of all supported occasions.
 * The order controls how they appear in dropdowns and the extension popup.
 */
export const OCCASION_TYPES: OccasionMeta[] = [
  {
    key:          'birthday',
    label:        'Birthday',
    emoji:        '🎂',
    dateGuidance: 'Enter the birthday date so we can send reminders.',
  },
  {
    key:          'christmas',
    label:        'Christmas',
    emoji:        '🎄',
    dateGuidance: 'Usually December 25 — enter the year too.',
  },
  {
    key:          'wedding',
    label:        'Wedding',
    emoji:        '💍',
    dateGuidance: 'Enter the wedding date for your guests.',
  },
  {
    key:          'baby_shower',
    label:        'Baby Shower',
    emoji:        '🍼',
    dateGuidance: 'Enter the shower date or expected due date.',
  },
  {
    key:          'graduation',
    label:        'Graduation',
    emoji:        '🎓',
    dateGuidance: 'Enter the graduation ceremony date.',
  },
  {
    key:          'housewarming',
    label:        'Housewarming',
    emoji:        '🏠',
    dateGuidance: 'Enter the party date if you have one planned.',
  },
  {
    key:          'anniversary',
    label:        'Anniversary',
    emoji:        '🥂',
    dateGuidance: 'Enter the anniversary date for reminder emails.',
  },
  {
    key:          'other',
    label:        'Other',
    emoji:        '🎁',
    dateGuidance: 'Enter a date if you want reminder emails sent.',
  },
]

/** Look up occasion metadata by key. Falls back to 'other' if unknown. */
export function getOccasionMeta(key: string): OccasionMeta {
  return (
    OCCASION_TYPES.find((o) => o.key === key) ??
    OCCASION_TYPES.find((o) => o.key === 'other')!
  )
}

// ── Slug generation ───────────────────────────────────────────────────────────

/**
 * Converts a list title into a URL-safe slug (lowercase, hyphens, max 60 chars).
 *
 * Examples:
 *   "Birthday 2026"   → "birthday-2026"
 *   "Baby Shower 🍼"  → "baby-shower"
 *   "My Wishlist!"    → "my-wishlist"
 */
export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')                         // decompose accented chars
    .replace(/[̀-ͯ]/g, '')          // strip diacritics
    .replace(/[^a-z0-9\s-]/g, '')            // remove non-alphanumeric
    .trim()
    .replace(/\s+/g, '-')                     // spaces → hyphens
    .replace(/-{2,}/g, '-')                   // collapse multiple hyphens
    .slice(0, 60)
    .replace(/-$/, '')                         // trim trailing hyphen
    || 'my-list'                              // fallback if empty after sanitizing
}

/**
 * Ensures a slug is unique for the given user by appending a numeric suffix
 * (-2, -3, …) if the slug already exists.
 */
async function ensureUniqueSlug(userId: string, baseSlug: string): Promise<string> {
  const supabase = createServerClient()
  let slug       = baseSlug
  let attempt    = 1

  while (true) {
    const { data } = await supabase
      .from('wishlists')
      .select('id')
      .eq('user_id', userId)
      .eq('slug', slug)
      .maybeSingle()

    if (!data) return slug              // slug is available

    attempt++
    slug = `${baseSlug}-${attempt}`
  }
}

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Returns all public wishlists for a user, ordered with the default list first
 * then by creation date descending.
 */
export async function getWishlists(userId: string): Promise<DbWishlist[]> {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('wishlists')
    .select('id, user_id, title, occasion, occasion_date, slug, is_default, is_public, created_at')
    .eq('user_id', userId)
    .eq('is_public', true)
    .order('is_default', { ascending: false })
    .order('created_at',  { ascending: false })

  if (error) {
    console.error('[GiftHint/wishlists] getWishlists error:', error.message)
    return []
  }

  return (data ?? []) as DbWishlist[]
}

/**
 * Fetches a single wishlist by user + slug. Returns null if not found or private.
 */
export async function getWishlistBySlug(
  userId: string,
  slug:   string,
): Promise<DbWishlist | null> {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('wishlists')
    .select('id, user_id, title, occasion, occasion_date, slug, is_default, is_public, created_at')
    .eq('user_id', userId)
    .eq('slug', slug)
    .maybeSingle()

  if (error) {
    console.error('[GiftHint/wishlists] getWishlistBySlug error:', error.message)
    return null
  }

  return data as DbWishlist | null
}

/**
 * Returns the user's default wishlist, or null if none exists yet.
 */
export async function getDefaultWishlist(userId: string): Promise<DbWishlist | null> {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('wishlists')
    .select('id, user_id, title, occasion, occasion_date, slug, is_default, is_public, created_at')
    .eq('user_id', userId)
    .eq('is_default', true)
    .maybeSingle()

  if (error) {
    console.error('[GiftHint/wishlists] getDefaultWishlist error:', error.message)
    return null
  }

  return data as DbWishlist | null
}

// ── Mutations ─────────────────────────────────────────────────────────────────

/**
 * Creates a new wishlist for a user.
 *
 * If makeDefault is true:
 *   - The new list gets is_default = true
 *   - All other lists for this user are flipped to is_default = false
 *
 * Returns the created DbWishlist row, or null on error.
 */
export async function createWishlist(
  params: CreateWishlistParams,
): Promise<DbWishlist | null> {
  const { userId, title, occasion, occasionDate, makeDefault = false } = params
  const supabase = createServerClient()

  const baseSlug = generateSlug(title)
  const slug     = await ensureUniqueSlug(userId, baseSlug)

  // If making default, clear the current default first
  if (makeDefault) {
    await supabase
      .from('wishlists')
      .update({ is_default: false })
      .eq('user_id', userId)
      .eq('is_default', true)
  }

  const { data, error } = await supabase
    .from('wishlists')
    .insert({
      user_id:       userId,
      title,
      occasion,
      occasion_date: occasionDate ?? null,
      slug,
      is_default:    makeDefault,
      is_public:     true,
    })
    .select('id, user_id, title, occasion, occasion_date, slug, is_default, is_public, created_at')
    .single()

  if (error) {
    console.error('[GiftHint/wishlists] createWishlist error:', error.message)
    return null
  }

  return data as DbWishlist
}
