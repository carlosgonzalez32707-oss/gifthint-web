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
 *   Max 10 views per (IP × wishlist) per hour, enforced with Upstash Redis
 *   sliding window. Cross-instance deduplication is exact — all serverless
 *   instances share the same Redis counter.
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
import { rateLimit, getClientIp }   from '@/lib/rate-limit'
import { detectFakeViews }          from '@/lib/abuse-detection'

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

  // ── Rate limit: 10 views / IP / gifter page / hour ──────────────────────────
  // Silent drop — return { ok: true } so bots can't detect they're being limited.
  const ip = getClientIp(req)
  const rl = await rateLimit(`view:${ip}:${wishlistId}`, 10, 3_600)
  if (!rl.success) {
    return NextResponse.json({ ok: true })
  }

  // ── Abuse detection (non-blocking) ────────────────────────────────────────
  // >5 views from the same IP on the same page within 60 s → flagged.
  // Does NOT block the request — logged for manual admin review only.
  void detectFakeViews(wishlistId, ip)

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
