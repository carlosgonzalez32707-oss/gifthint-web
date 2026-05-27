/**
 * extension/wishlists.js — GiftHint Chrome Extension
 *
 * Fetches the signed-in user's wishlists from Supabase and manages
 * the "last used list" preference so the popup can pre-select it.
 *
 * v1.1 changes:
 *   - getWishlists now includes embedded item counts (PostgREST count embed)
 *   - getPublicUsername fetches the user's public_username for share URLs
 *
 * Exports:
 *   getWishlists(userId, token)          → { wishlists, error }
 *   getLastUsedWishlist(userId)          → { id, title } | null
 *   setLastUsedWishlist(userId, list)    → void
 *   getPublicUsername(googleUserId, token) → string | null
 *   OCCASION_LABELS                      — display map for occasion keys
 */

import { supabaseGet } from './supabase.js'

// ── Constants ─────────────────────────────────────────────────────────────────

/** Mirrors lib/wishlists.ts OCCASION_TYPES — keep in sync. */
export const OCCASION_LABELS = {
  birthday:     { label: 'Birthday',     emoji: '🎂' },
  christmas:    { label: 'Christmas',    emoji: '🎄' },
  wedding:      { label: 'Wedding',      emoji: '💍' },
  baby_shower:  { label: 'Baby Shower',  emoji: '🍼' },
  graduation:   { label: 'Graduation',   emoji: '🎓' },
  housewarming: { label: 'Housewarming', emoji: '🏠' },
  anniversary:  { label: 'Anniversary',  emoji: '🥂' },
  other:        { label: 'My List',      emoji: '🎁' },
}

/** chrome.storage.local key for the per-user last-used wishlist preference. */
function lastUsedKey(userId) {
  return `gh_last_wishlist_${userId}`
}

// ── API ───────────────────────────────────────────────────────────────────────

/**
 * Fetches all public wishlists for the signed-in user, including embedded
 * item counts so the popup can show "12 items" next to each list name.
 *
 * PostgREST embedded count syntax: `wishlist_items(count)` returns
 * `[{ "count": 5 }]` per wishlist. We normalise this to `w.itemCount`.
 *
 * Returned array order: default list first, then created_at desc.
 *
 * @param {string} userId  Google user ID (stored as google_id in the users table)
 * @param {string} token   JWT from Supabase auth session
 * @returns {Promise<{ wishlists: Array, error: string|null }>}
 */
export async function getWishlists(userId, token) {
  const query = [
    `wishlists?user_id=eq.${encodeURIComponent(userId)}`,
    'is_public=eq.true',
    // Embed item count — PostgREST returns wishlist_items:[{count:N}]
    'select=id,title,occasion,occasion_date,slug,is_default,wishlist_items(count)',
    'order=is_default.desc,created_at.desc',
  ].join('&')

  const { data, error } = await supabaseGet(query, token)

  if (error) {
    return {
      wishlists: [],
      error: error.status === 408
        ? "Couldn't load your lists. Check your connection."
        : error.message,
    }
  }

  // Normalise the embedded count array → flat integer
  const wishlists = (data ?? []).map((w) => ({
    ...w,
    itemCount: w.wishlist_items?.[0]?.count ?? 0,
  }))

  return { wishlists, error: null }
}

// ── Public username ───────────────────────────────────────────────────────────

/**
 * Fetches the user's public_username from Supabase — needed to construct
 * the shareable /list/[username]/[slug] URL in the popup.
 *
 * Looks up by google_id since the extension auth token is a Google OAuth
 * token and the cached user.id is the Google subject identifier.
 *
 * @param {string} googleUserId  user.id from Google's userinfo endpoint
 * @param {string} token         Supabase auth JWT
 * @returns {Promise<string|null>}  e.g. "emma" or null if not yet set up
 */
export async function getPublicUsername(googleUserId, token) {
  try {
    const { data, error } = await supabaseGet(
      `users?google_id=eq.${encodeURIComponent(googleUserId)}&select=public_username&limit=1`,
      token,
    )
    if (error || !data?.length) return null
    return data[0].public_username ?? null
  } catch {
    return null
  }
}

// ── Last-used preference ──────────────────────────────────────────────────────

/**
 * Reads the most recently used wishlist from chrome.storage.local.
 * Returns null if none has been saved yet.
 *
 * @param {string} userId
 * @returns {Promise<{ id: string, title: string } | null>}
 */
export async function getLastUsedWishlist(userId) {
  try {
    const result = await chrome.storage.local.get(lastUsedKey(userId))
    return result[lastUsedKey(userId)] ?? null
  } catch {
    return null
  }
}

/**
 * Persists the selected wishlist so the popup can pre-select it next time.
 *
 * @param {string} userId
 * @param {{ id: string, title: string }} list
 */
export async function setLastUsedWishlist(userId, list) {
  try {
    await chrome.storage.local.set({
      [lastUsedKey(userId)]: { id: list.id, title: list.title },
    })
  } catch {
    // Non-critical — ignore storage errors
  }
}
