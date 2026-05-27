/**
 * extension/auth.firefox.js — GiftHint Firefox OAuth
 *
 * Drop-in replacement for auth.js when building for Firefox.
 *
 * WHY A SEPARATE FILE
 * ───────────────────
 * Chrome's chrome.identity.getAuthToken() is Chrome-proprietary — it relies
 * on Chrome's built-in OAuth client management and the `oauth2` manifest block.
 * Firefox offers browser.identity.launchWebAuthFlow() instead, which is a
 * generic OAuth launcher that works with any provider.
 *
 * FLOW
 * ────
 *  1. Build a Google OAuth authorization URL (response_type=code).
 *  2. Call browser.identity.launchWebAuthFlow() — opens a Firefox popup.
 *  3. Google redirects to the extension's redirect URI with ?code=…
 *  4. Extract the auth code from the redirect URL.
 *  5. POST {code, redirect_uri} to https://gifthint.io/api/auth/exchange.
 *     The server holds GOOGLE_CLIENT_SECRET and returns {access_token}.
 *     This avoids ever storing the client secret inside the extension.
 *  6. Fetch the Google user profile; cache {…user, token} in storage.
 *
 * EXPORTS (identical surface to auth.js)
 * ───────────────────────────────────────
 *   getToken()          → string | null
 *   signIn()            → { token, user } | { error }
 *   signOut()           → void
 *   withAuth(fn)        → wraps any API call with auth token
 *   getCachedUser()     → cached user object | null
 *
 * NOTE: Token refresh is not supported for access_type=online tokens.
 * If a 401 is returned, the user is asked to sign in again. For offline
 * access (refresh tokens), move to access_type=offline and store
 * refresh_token server-side — out of scope for v1.
 */

import { ext } from './compat.js'

// ── Constants ──────────────────────────────────────────────────────────────────

const OAUTH_CLIENT_ID = '987313469607-drno4044uvbr9v4fjdkfskuq1o43cd4v.apps.googleusercontent.com'
const EXCHANGE_URL    = 'https://gifthint.io/api/auth/exchange'
const SCOPES          = ['email', 'profile', 'openid']
const USER_KEY        = 'gh_user'

// ── Redirect URL ───────────────────────────────────────────────────────────────

/**
 * Firefox generates a deterministic redirect URL for each extension.
 * Format: https://<hash>.chromiumapp.org/
 *
 * This URL must be added to the Google Cloud Console "Authorized redirect URIs"
 * list for the OAuth client. Retrieve it by calling:
 *
 *   console.log(browser.identity.getRedirectURL())
 *
 * in the extension's browser console.
 */
function getRedirectUrl() {
  // Append a path so the redirect_uri is scoped to GiftHint
  return browser.identity.getRedirectURL('oauth/callback')
}

// ── Auth URL builder ───────────────────────────────────────────────────────────

function buildAuthUrl(redirectUrl) {
  const params = new URLSearchParams({
    client_id:     OAUTH_CLIENT_ID,
    redirect_uri:  redirectUrl,
    response_type: 'code',
    scope:         SCOPES.join(' '),
    access_type:   'online',
    // Prompt selects the account every time — avoids silent re-use of a
    // wrong Google account when multiple accounts are logged in.
    prompt:        'select_account',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

// ── Server-side token exchange ─────────────────────────────────────────────────

/**
 * Sends the authorization code to the GiftHint server.
 * The server holds GOOGLE_CLIENT_SECRET and exchanges the code with Google,
 * then returns the access token to the extension.
 *
 * @param {string} code        Authorization code from the OAuth redirect URL
 * @param {string} redirectUrl The exact redirect_uri used in buildAuthUrl()
 * @returns {Promise<string>}  Access token
 * @throws  {Error}            On network failure or server error
 */
async function exchangeCodeForToken(code, redirectUrl) {
  const res = await fetch(EXCHANGE_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ code, redirect_uri: redirectUrl }),
  })

  let body
  try {
    body = await res.json()
  } catch {
    throw new Error(`Token exchange returned non-JSON response (HTTP ${res.status})`)
  }

  if (!res.ok) {
    throw new Error(body?.error ?? `Token exchange failed (HTTP ${res.status})`)
  }

  if (typeof body?.access_token !== 'string') {
    throw new Error('No access_token in exchange response')
  }

  return body.access_token
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Returns the cached access token from storage, or null if not signed in.
 * Non-interactive — never opens a popup.
 *
 * @returns {Promise<string|null>}
 */
export async function getToken() {
  const result = await ext.storage.local.get(USER_KEY)
  return result[USER_KEY]?.token ?? null
}

// ── signIn ─────────────────────────────────────────────────────────────────────

/**
 * Launches the interactive Google OAuth flow.
 * Returns { token, user } on success, { error: string } on failure.
 *
 * @returns {Promise<{token: string, user: object} | {error: string}>}
 */
export async function signIn() {
  const redirectUrl = getRedirectUrl()
  const authUrl     = buildAuthUrl(redirectUrl)

  // ── Step 1: Launch OAuth popup ──────────────────────────────────────────────
  let responseUrl
  try {
    responseUrl = await browser.identity.launchWebAuthFlow({
      url:         authUrl,
      interactive: true,
    })
  } catch (err) {
    const msg = err?.message ?? String(err)
    if (
      msg.toLowerCase().includes('cancel') ||
      msg.toLowerCase().includes('dismiss') ||
      msg.toLowerCase().includes('user closed')
    ) {
      return { error: 'Sign-in was cancelled. Click the extension icon and try again.' }
    }
    console.error('[GiftHint] launchWebAuthFlow error:', err)
    return { error: `Sign-in failed: ${msg}` }
  }

  // ── Step 2: Extract authorization code ─────────────────────────────────────
  let code
  try {
    const url = new URL(responseUrl)
    const err = url.searchParams.get('error')
    if (err) {
      return { error: `Google OAuth error: ${err}` }
    }
    code = url.searchParams.get('code')
    if (!code) throw new Error('no code param in redirect URL')
  } catch (parseErr) {
    console.error('[GiftHint] Failed to parse redirect URL:', responseUrl, parseErr)
    return { error: 'Unexpected OAuth response. Please try again.' }
  }

  // ── Step 3: Server-side token exchange ──────────────────────────────────────
  let token
  try {
    token = await exchangeCodeForToken(code, redirectUrl)
  } catch (exchangeErr) {
    console.error('[GiftHint] Token exchange error:', exchangeErr)
    return { error: exchangeErr?.message ?? 'Token exchange failed. Please try again.' }
  }

  // ── Step 4: Fetch user profile ──────────────────────────────────────────────
  let user
  try {
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!profileRes.ok) throw new Error(`Profile fetch failed (HTTP ${profileRes.status})`)
    user = await profileRes.json()
  } catch (profileErr) {
    return { error: `Couldn't fetch Google profile: ${profileErr?.message}` }
  }

  // ── Step 5: Cache in storage ────────────────────────────────────────────────
  await ext.storage.local.set({ [USER_KEY]: { ...user, token } })

  return { token, user }
}

// ── signOut ────────────────────────────────────────────────────────────────────

/**
 * Clears the cached token and user profile.
 * Firefox access tokens are not revocable via the extension identity API, so
 * we simply remove the local cache. The token will expire naturally.
 */
export async function signOut() {
  await ext.storage.local.remove(USER_KEY)
}

// ── withAuth ───────────────────────────────────────────────────────────────────

/**
 * Wraps an async function that takes a token, injecting the cached token.
 * On 401, clears the cache and returns an error (user must re-sign-in;
 * silent refresh is not available for online-only tokens).
 *
 * Usage:
 *   const { data, error } = await withAuth((token) => supabaseGet('...', token))
 *
 * @param {(token: string) => Promise<{data, error}>} fn
 */
export async function withAuth(fn) {
  const token = await getToken()
  if (!token) {
    return { data: null, error: { status: 401, message: 'Not signed in' } }
  }

  const result = await fn(token)

  // Token is no longer valid — force re-sign-in
  if (result.error?.status === 401) {
    await signOut()
    return {
      data:  null,
      error: { status: 401, message: 'Session expired — please sign in again.' },
    }
  }

  return result
}

// ── getCachedUser ──────────────────────────────────────────────────────────────

/**
 * Returns the locally cached user object without a network call.
 * Used by popup.js for instant render on repeated opens.
 *
 * @returns {Promise<object|null>}
 */
export async function getCachedUser() {
  const result = await ext.storage.local.get(USER_KEY)
  return result[USER_KEY] ?? null
}
