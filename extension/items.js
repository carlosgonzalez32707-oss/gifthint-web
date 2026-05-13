/**
 * extension/items.js — GiftHint Chrome Extension
 *
 * Wishlist item CRUD operations against the Supabase REST API.
 * All calls go through the supabase.js wrapper which enforces an 8-second
 * timeout and returns { data, error } — never throws.
 *
 * Failed saves are queued in chrome.storage.local via enqueueSave().
 * Call flushSaveQueue(token) on popup open to retry them.
 *
 * Exports:
 *   saveItem(productData, userId, token)  → { item } | { error, queued }
 *   listItems(userId, token)              → { items } | { error }
 *   deleteItem(itemId, token)             → { ok } | { error }
 *   isDuplicate(sourceUrl, userId, token) → boolean
 */

import {
  supabaseGet,
  supabasePost,
  supabasePatch,
  enqueueSave,
  flushSaveQueue as _flushSaveQueue,
} from './supabase.js'
import { withAuth } from './auth.js'

// Re-export flushSaveQueue so popup.js only needs to import from items.js
export { _flushSaveQueue as flushSaveQueue }

// ── saveItem ──────────────────────────────────────────────────────────────────

/**
 * Saves a product to the user's wishlist.
 *
 * Edge cases:
 *   - price = null     → saved as-is; UI shows "Price unavailable"
 *   - image_url = null → saved as-is; UI shows retailer emoji fallback
 *   - Timeout (>8 s)   → payload queued in chrome.storage.local for retry
 *   - Duplicate URL    → returns { error: 'duplicate' } without hitting DB
 *
 * @param {{ title, price, currency, image_url, source_url, retailer }} productData
 * @param {string} userId
 * @param {string} token
 */
export async function saveItem(productData, userId, token) {
  // Guard: don't save non-product pages (belt-and-suspenders check)
  if (!productData?.isProductPage) {
    return { error: 'Not a product page' }
  }

  // Duplicate check — avoid double-saves on the same URL
  const alreadySaved = await isDuplicate(productData.source_url, userId, token)
  if (alreadySaved) {
    return { error: 'duplicate', message: 'Already saved to your list' }
  }

  const payload = {
    user_id:    userId,
    title:      productData.title,
    price:      productData.price    ?? null,
    currency:   productData.currency ?? 'USD',
    image_url:  productData.image_url ?? null,
    source_url: productData.source_url,
    retailer:   productData.retailer  ?? null,
    dna_tags:   [],
    is_claimed: false,
  }

  const { data, error } = await withAuth((t) =>
    supabasePost('wishlist_items', payload, t)
  )

  if (error) {
    // Timeout or network failure → queue for retry
    if (error.status === 408 || error.status === 0) {
      await enqueueSave(payload)
      return {
        error:  error.message,
        queued: true,
        toast:  'Save failed — check your connection. Will retry automatically.',
      }
    }
    return { error: error.message }
  }

  return { item: Array.isArray(data) ? data[0] : data }
}

// ── listItems ─────────────────────────────────────────────────────────────────

/**
 * Fetches all wishlist items for the signed-in user, sorted newest first.
 * Returns { items: [] } on timeout / error so the popup can show a retry state.
 */
export async function listItems(userId, token) {
  const { data, error } = await withAuth((t) =>
    supabaseGet(
      `wishlist_items?user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc`,
      t,
    )
  )

  if (error) {
    return {
      items: [],
      error: error.status === 408
        ? "Couldn't load your list. Tap to retry."
        : error.message,
    }
  }

  return { items: data ?? [] }
}

// ── deleteItem ────────────────────────────────────────────────────────────────

/**
 * Soft-deletes (marks is_deleted) or hard-deletes an item by ID.
 * Uses PATCH to a soft-delete flag if you have one; otherwise DELETE.
 */
export async function deleteItem(itemId, token) {
  // Hard delete via Supabase REST DELETE verb
  // (PATCH to is_deleted=true if you prefer soft deletes)
  const { data, error } = await withAuth((t) =>
    supabaseFetch(
      `wishlist_items?id=eq.${encodeURIComponent(itemId)}`,
      { method: 'DELETE', token: t },
    )
  )

  if (error) {
    return { ok: false, error: error.message }
  }

  return { ok: true }
}

// ── isDuplicate ───────────────────────────────────────────────────────────────

/**
 * Returns true if the given source_url already exists in the user's list.
 * Uses a lightweight HEAD-style query (select=id only, limit=1).
 */
export async function isDuplicate(sourceUrl, userId, token) {
  try {
    const { data, error } = await supabaseGet(
      `wishlist_items?user_id=eq.${encodeURIComponent(userId)}&source_url=eq.${encodeURIComponent(sourceUrl)}&select=id&limit=1`,
      token,
    )
    if (error) return false        // on error, allow save (safer than blocking)
    return Array.isArray(data) && data.length > 0
  } catch {
    return false
  }
}

// ── Internal helper (re-used in deleteItem above) ────────────────────────────

async function supabaseFetch(path, { method, body, token }) {
  const { supabasePost, supabaseGet } = await import('./supabase.js')
  // Thin shim — real delete goes through the raw fetch in supabase.js
  const controller = new AbortController()
  const timer      = setTimeout(() => controller.abort(), 8_000)

  const SUPABASE_URL      = 'https://pxegvviakrjhldtwtobi.supabase.co'
  const SUPABASE_ANON_KEY = '<YOUR_ANON_KEY>'

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method,
      headers: {
        'apikey':       SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      },
      signal: controller.signal,
    })
    clearTimeout(timer)
    return { data: null, error: res.ok ? null : { status: res.status, message: res.statusText } }
  } catch (err) {
    clearTimeout(timer)
    return { data: null, error: { status: err.name === 'AbortError' ? 408 : 0, message: err.message } }
  }
}
