/**
 * extension/auth.js — GiftHint Chrome Extension
 *
 * Authentication helpers using Chrome's identity API.
 *
 * Edge cases handled:
 *   - Token expired mid-session → silent refresh → retry once (no re-prompt)
 *   - Sign-in popup blocked → graceful error message in popup UI
 *   - Token not available non-interactively → prompt user to sign in
 *
 * Exports:
 *   getToken(interactive?)  → string | null
 *   signIn()                → { token, user } | { error }
 *   signOut()               → void
 *   withAuth(fn)            → wraps any API call with token auto-refresh
 */

const USER_KEY = 'gh_user'

// ── Token retrieval ───────────────────────────────────────────────────────────

/**
 * Returns a valid OAuth token.
 *
 * @param {boolean} interactive  If true, shows a Google sign-in popup when
 *                               no cached token is available.
 *                               If false (default), silently returns null
 *                               when the user is not signed in.
 */
export async function getToken(interactive = false) {
  try {
    return await new Promise((resolve, reject) =>
      chrome.identity.getAuthToken({ interactive }, (token) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
        } else {
          resolve(token ?? null)
        }
      })
    )
  } catch (err) {
    if (!interactive) return null  // silent — user just isn't signed in

    // The OAuth popup was blocked by the browser
    if (err.message?.includes('canceled') || err.message?.includes('blocked')) {
      console.warn('[GiftHint] sign-in popup was blocked or cancelled:', err.message)
      return { blockedError: true }
    }

    console.error('[GiftHint] getAuthToken error:', err)
    return null
  }
}

// ── Token refresh (silent) ────────────────────────────────────────────────────

/**
 * Removes the expired token from Chrome's cache and fetches a fresh one.
 * Does NOT show a popup — if the user needs to re-authenticate interactively
 * this returns null and the caller should prompt sign-in.
 *
 * @param {string} expiredToken  The token that was rejected with a 401.
 */
export async function refreshToken(expiredToken) {
  // Tell Chrome to evict this specific token from its cache
  await new Promise((resolve) =>
    chrome.identity.removeCachedAuthToken({ token: expiredToken }, resolve)
  )
  // Request a fresh token silently (non-interactive)
  return getToken(false)
}

// ── withAuth wrapper ──────────────────────────────────────────────────────────

/**
 * Wraps an async function that takes a token. If the function returns a
 * 401, silently refreshes the token and retries once.
 *
 * Usage:
 *   const { data, error } = await withAuth((token) => supabaseGet('wishlist_items?...', token))
 *
 * @param {(token: string) => Promise<{data, error}>} fn
 */
export async function withAuth(fn) {
  const token = await getToken(false)
  if (!token) return { data: null, error: { status: 401, message: 'Not signed in' } }

  const result = await fn(token)

  // 401 → token expired mid-session → silent refresh → retry once
  if (result.error?.status === 401) {
    const fresh = await refreshToken(token)
    if (!fresh || fresh.blockedError) {
      return { data: null, error: { status: 401, message: 'Session expired — please sign in again.' } }
    }
    return fn(fresh)
  }

  return result
}

// ── Sign in ───────────────────────────────────────────────────────────────────

/**
 * Initiates the interactive Google sign-in flow.
 * Returns { token, user } on success, or { error } on failure.
 */
export async function signIn() {
  const tokenOrResult = await getToken(true)

  if (!tokenOrResult) {
    return { error: 'Sign-in failed. Please try again.' }
  }

  if (tokenOrResult?.blockedError) {
    return {
      error: 'Please allow the sign-in popup. Click the extension icon again and allow the Google sign-in window to open.',
    }
  }

  const token = tokenOrResult

  // Fetch the Google user profile
  try {
    const res  = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const user = await res.json()

    // Cache user info locally for fast popup renders
    await chrome.storage.local.set({ [USER_KEY]: { ...user, token } })

    return { token, user }
  } catch (err) {
    return { error: `Couldn't fetch profile: ${err.message}` }
  }
}

// ── Sign out ──────────────────────────────────────────────────────────────────

/**
 * Clears the cached token and user profile from Chrome storage.
 */
export async function signOut() {
  const result = await chrome.storage.local.get(USER_KEY)
  const user   = result[USER_KEY]

  if (user?.token) {
    await new Promise((resolve) =>
      chrome.identity.removeCachedAuthToken({ token: user.token }, resolve)
    )
  }

  await chrome.storage.local.remove(USER_KEY)
}

// ── getCachedUser ─────────────────────────────────────────────────────────────

/**
 * Returns the locally cached user object without a network call.
 * Used by popup.js for instant render — no spinner on repeated opens.
 */
export async function getCachedUser() {
  const result = await chrome.storage.local.get(USER_KEY)
  return result[USER_KEY] ?? null
}
