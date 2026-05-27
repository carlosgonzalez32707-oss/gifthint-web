/**
 * extension/supabase.js — GiftHint Chrome Extension
 *
 * Lightweight Supabase wrapper for the extension.
 * All calls include an 8-second AbortController timeout.
 * Failed saves are queued in chrome.storage.local for retry.
 *
 * Exports:
 *   supabaseGet(path, token)          → { data, error }
 *   supabasePost(path, body, token)   → { data, error }
 *   supabasePatch(path, body, token)  → { data, error }
 *   flushSaveQueue()                  → void (retry queued saves)
 */

const SUPABASE_URL      = 'https://pxegvviakrjhldtwtobi.supabase.co'
const SUPABASE_ANON_KEY = '<YOUR_ANON_KEY>'  // replaced at build time
const TIMEOUT_MS        = 8_000
const SAVE_QUEUE_KEY    = 'gh_save_queue'

// ── Core fetch wrapper ────────────────────────────────────────────────────────

/**
 * Makes a fetch request to Supabase REST API with an 8-second timeout.
 * Returns { data, error } — never throws.
 */
async function supabaseFetch(path, { method = 'GET', body, token } = {}) {
  const controller = new AbortController()
  const timer      = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const headers = {
      'apikey':        SUPABASE_ANON_KEY,
      'Content-Type':  'application/json',
      'Prefer':        'return=representation',
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method,
      headers,
      body:   body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })

    clearTimeout(timer)

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}))
      return { data: null, error: { status: response.status, message: errBody.message ?? response.statusText } }
    }

    // 204 No Content (PATCH with no Prefer header)
    if (response.status === 204) return { data: null, error: null }

    const data = await response.json()
    return { data, error: null }

  } catch (err) {
    clearTimeout(timer)
    if (err.name === 'AbortError') {
      return { data: null, error: { status: 408, message: 'Request timed out. Check your connection.' } }
    }
    return { data: null, error: { status: 0, message: err.message ?? 'Network error' } }
  }
}

// ── Public helpers ────────────────────────────────────────────────────────────

export async function supabaseGet(path, token) {
  return supabaseFetch(path, { method: 'GET', token })
}

export async function supabasePost(path, body, token) {
  return supabaseFetch(path, { method: 'POST', body, token })
}

export async function supabasePatch(path, body, token) {
  return supabaseFetch(path, { method: 'PATCH', body, token })
}

// ── Save queue — persist failed saves, retry on next open ────────────────────

/**
 * Adds a failed save payload to the local retry queue.
 * Called by items.js when a save returns an error.
 */
export async function enqueueSave(payload) {
  const result = await chrome.storage.local.get(SAVE_QUEUE_KEY)
  const queue  = result[SAVE_QUEUE_KEY] ?? []
  queue.push({ payload, queuedAt: Date.now() })
  await chrome.storage.local.set({ [SAVE_QUEUE_KEY]: queue })
}

/**
 * Retries all queued saves. Removes successful ones; keeps failures.
 * Call this from popup.js on open so no saves are permanently lost.
 *
 * @param {string} token  Current auth token for the API call.
 */
export async function flushSaveQueue(token) {
  const result = await chrome.storage.local.get(SAVE_QUEUE_KEY)
  const queue  = result[SAVE_QUEUE_KEY] ?? []
  if (queue.length === 0) return

  const remaining = []
  for (const entry of queue) {
    const { data, error } = await supabasePost('wishlist_items', entry.payload, token)
    if (error) {
      remaining.push(entry)           // keep it — try again next time
    } else {
      console.log('[GiftHint] flushed queued save:', data)
    }
  }

  await chrome.storage.local.set({ [SAVE_QUEUE_KEY]: remaining })
}
