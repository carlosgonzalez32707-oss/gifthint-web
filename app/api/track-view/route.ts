/**
 * app/api/track-view/route.ts — GiftHint
 *
 * POST /api/track-view
 *
 * Records an anonymised page view for a wisher's wishlist.
 * Called client-side from the gifter page after hydration.
 *
 * PRIVACY DESIGN:
 *   We store NO gifter PII. The IP address is used only for rate-limiting
 *   (in-memory, never written to the DB). The referrer is reduced to
 *   scheme+host only before storage ("https://twitter.com", not the full path).
 *
 * RATE LIMITING:
 *   Max 1 view per (IP × wishlist) per hour, enforced with an in-memory
 *   Map. This is best-effort in serverless environments (each function
 *   instance has its own Map). For strict cross-instance deduplication,
 *   replace with Upstash Redis using @upstash/ratelimit.
 *
 * PERFORMANCE DESIGN:
 *   Returns { ok: true } immediately. The Supabase insert runs in a detached
 *   async block — if it fails, the error is logged server-side and invisible
 *   to the gifter.
 *
 * Body:  { wishlistId: string }
 *
 * Responses:
 *   200  { ok: true }        — view recorded (or rate-limited, silently)
 *   400  { error: string }   — invalid body
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }        from '@/lib/supabase-server'

// ── In-memory rate-limit cache ────────────────────────────────────────────────

/**
 * Key:   `${hashedIp}:${wishlistId}`
 * Value: last-seen timestamp (ms since epoch)
 *
 * Grows at most to MAX_CACHE_SIZE entries before the oldest keys are evicted.
 * In production with high traffic, swap this for Upstash Redis.
 */
const VIEW_RATE_CACHE = new Map<string, number>()
const RATE_WINDOW_MS  = 60 * 60 * 1000   // 1 hour
const MAX_CACHE_SIZE  = 50_000           // ~5 MB assuming 100-byte keys

function isRateLimited(ip: string, wishlistId: string): boolean {
  // Evict oldest entries when approaching the size cap
  if (VIEW_RATE_CACHE.size >= MAX_CACHE_SIZE) {
    const cutoff = Date.now() - RATE_WINDOW_MS
    for (const [k, ts] of VIEW_RATE_CACHE) {
      if (ts < cutoff) VIEW_RATE_CACHE.delete(k)
      if (VIEW_RATE_CACHE.size < MAX_CACHE_SIZE * 0.8) break
    }
  }

  const key  = `${ip}:${wishlistId}`
  const last = VIEW_RATE_CACHE.get(key)
  const now  = Date.now()

  if (last !== undefined && now - last < RATE_WINDOW_MS) {
    return true   // within rate window — suppress this view
  }

  VIEW_RATE_CACHE.set(key, now)
  return false
}

// ── Referrer sanitisation ─────────────────────────────────────────────────────

/**
 * Reduces the raw HTTP Referer to scheme+host only so we never store paths,
 * query strings, or fragment identifiers (which may contain PII).
 *
 * "https://twitter.com/someuser/status/123" → "https://twitter.com"
 * "https://google.com/search?q=gift+ideas"  → "https://google.com"
 * Malformed / empty                          → null
 */
function sanitiseReferrer(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const { origin } = new URL(raw)
    // "null" origin means file: or opaque context — treat as direct
    return origin === 'null' ? null : origin.slice(0, 200)
  } catch {
    return null
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const wishlistId = typeof body.wishlistId === 'string'
    ? body.wishlistId.trim().slice(0, 36)
    : null

  if (!wishlistId) {
    return NextResponse.json(
      { error: 'missing_field', field: 'wishlistId' },
      { status: 400 },
    )
  }

  // ── Rate limit ──────────────────────────────────────────────────────────────
  // Derive client IP from headers set by Vercel / reverse proxies.
  const forwarded = req.headers.get('x-forwarded-for')
  const ip        = (forwarded ? forwarded.split(',')[0] : req.headers.get('x-real-ip') ?? 'unknown').trim()

  if (isRateLimited(ip, wishlistId)) {
    // Return 200 (not 429) — the client doesn't need to know it was suppressed.
    return NextResponse.json({ ok: true })
  }

  // ── Sanitise referrer ───────────────────────────────────────────────────────
  const referrer = sanitiseReferrer(req.headers.get('referer'))

  // ── Return immediately; insert is fire-and-forget ───────────────────────────
  const response = NextResponse.json({ ok: true })

  ;(async () => {
    try {
      const supabase = createServerClient()

      // Verify the wishlist exists (guards against inserting orphan rows
      // if a wishlist was deleted between the gifter page load and this call).
      const { data: wishlist } = await supabase
        .from('wishlists')
        .select('id')
        .eq('id', wishlistId)
        .eq('is_public', true)
        .maybeSingle()

      if (!wishlist) return   // silently drop — non-existent or private list

      const { error } = await supabase
        .from('page_views')
        .insert({ wishlist_id: wishlistId, referrer })

      if (error) {
        console.error('[track-view] insert error:', error.message)
      }
    } catch (err) {
      console.error('[track-view] unexpected error:', err)
    }
  })()

  return response
}
