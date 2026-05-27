/**
 * app/api/auth/exchange/route.ts — GiftHint
 *
 * Server-side OAuth authorization code exchange for the Firefox extension.
 *
 * WHY THIS EXISTS
 * ───────────────
 * Browser extensions cannot safely store GOOGLE_CLIENT_SECRET — it would be
 * visible in the extension source distributed to users. This endpoint holds
 * the secret server-side and exchanges the authorization code on the
 * extension's behalf.
 *
 * REQUEST
 * ───────
 * POST /api/auth/exchange
 * Content-Type: application/json
 * Body: {
 *   code:         string   — authorization code from Google OAuth redirect
 *   redirect_uri: string   — must match the URI used in the auth request
 * }
 *
 * RESPONSE (success)
 * ──────────────────
 * { access_token: string }
 *
 * RESPONSE (error)
 * ────────────────
 * { error: string }   HTTP 400 / 429 / 500 / 502
 *
 * RATE LIMIT
 * ──────────
 * 10 requests per IP per minute (in-memory; survives per Vercel instance).
 * For multi-instance deployments swap rateMap for Redis / Vercel KV.
 *
 * ENVIRONMENT VARIABLES REQUIRED
 * ───────────────────────────────
 *   GOOGLE_CLIENT_ID      — OAuth client ID (also in the extension manifest)
 *   GOOGLE_CLIENT_SECRET  — OAuth client secret (server-side only, never ship
 *                           to the extension)
 */

import { NextRequest, NextResponse } from 'next/server'

// ── Constants ──────────────────────────────────────────────────────────────────

const GOOGLE_TOKEN_URL  = 'https://oauth2.googleapis.com/token'
const MAX_PER_MINUTE    = 10
const RATE_WINDOW_MS    = 60_000

/**
 * Firefox extensions use the chromiumapp.org domain for their redirect URLs.
 * This allowlist prevents this endpoint from being used as a general-purpose
 * OAuth proxy for arbitrary redirect URIs.
 */
const ALLOWED_REDIRECT_ORIGINS = [
  'https://',      // must be https
  // host will be validated as *.chromiumapp.org below
]

// ── In-memory rate limiter ─────────────────────────────────────────────────────
// Resets on cold start. Replace with Redis or Vercel KV for multi-instance.

interface RateBucket {
  count:   number
  resetAt: number
}

const rateMap = new Map<string, RateBucket>()

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

/**
 * Returns true if the IP has exceeded MAX_PER_MINUTE within the sliding window.
 * Mutates rateMap as a side effect.
 */
function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const rec = rateMap.get(ip)

  if (!rec || now > rec.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return false
  }

  if (rec.count >= MAX_PER_MINUTE) return true

  rec.count++
  return false
}

// ── Validation helpers ─────────────────────────────────────────────────────────

/**
 * Firefox extension redirect URIs always have the form:
 *   https://<random-hash>.chromiumapp.org/<path>
 *
 * We validate this before sending to Google to prevent the endpoint from
 * being used as a general OAuth code exchange proxy.
 */
function isValidRedirectUri(uri: string): boolean {
  try {
    const parsed = new URL(uri)
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname.endsWith('.chromiumapp.org')
    )
  } catch {
    return false
  }
}

// ── Route handler ──────────────────────────────────────────────────────────────

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  // ── Rate limit ──────────────────────────────────────────────────────────────
  const ip = getClientIp(req)
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': '60' } },
    )
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let code: string | undefined
  let redirect_uri: string | undefined

  try {
    const body   = await req.json() as Record<string, unknown>
    code         = typeof body.code         === 'string' ? body.code         : undefined
    redirect_uri = typeof body.redirect_uri === 'string' ? body.redirect_uri : undefined
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!code || code.trim() === '') {
    return NextResponse.json({ error: 'code is required' }, { status: 400 })
  }

  if (!redirect_uri || redirect_uri.trim() === '') {
    return NextResponse.json({ error: 'redirect_uri is required' }, { status: 400 })
  }

  // ── Validate redirect_uri ────────────────────────────────────────────────────
  if (!isValidRedirectUri(redirect_uri)) {
    return NextResponse.json(
      { error: 'redirect_uri must be a Firefox extension URL (*.chromiumapp.org)' },
      { status: 400 },
    )
  }

  // ── Validate server config ───────────────────────────────────────────────────
  const clientId     = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    console.error('[auth/exchange] Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET')
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  // ── Exchange code with Google ────────────────────────────────────────────────
  let tokenData: Record<string, unknown>

  try {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        code:          code.trim(),
        client_id:     clientId,
        client_secret: clientSecret,
        redirect_uri:  redirect_uri.trim(),
        grant_type:    'authorization_code',
      }),
    })

    tokenData = await res.json() as Record<string, unknown>

    if (!res.ok) {
      const errDesc = tokenData.error_description ?? tokenData.error ?? 'Token exchange failed'
      console.error('[auth/exchange] Google token error:', tokenData)
      return NextResponse.json({ error: String(errDesc) }, { status: 400 })
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Network error reaching Google'
    console.error('[auth/exchange] Fetch error:', err)
    return NextResponse.json({ error: message }, { status: 502 })
  }

  // ── Return access token ──────────────────────────────────────────────────────
  const access_token = tokenData.access_token
  if (typeof access_token !== 'string' || access_token.trim() === '') {
    console.error('[auth/exchange] No access_token in Google response:', tokenData)
    return NextResponse.json(
      { error: 'No access_token in Google response' },
      { status: 502 },
    )
  }

  // Only return the access token — never forward refresh_token or id_token
  // to the extension (those should remain server-side if ever used).
  return NextResponse.json({ access_token })
}
