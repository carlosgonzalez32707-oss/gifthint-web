/**
 * app/api/track-click/route.ts — GiftHint click tracking endpoint
 *
 * POST /api/track-click
 *
 * Records that a gifter clicked a "Buy" button on a wishlist item.
 * Used to attribute affiliate revenue to individual items and wishers.
 *
 * PRIVACY DESIGN:
 *   We deliberately store NO gifter PII — no name, email, IP, or user agent.
 *   The only identifiers are item_id and wisher_user_id (both pseudonymous
 *   UUIDs). This means the table is safe to retain indefinitely without
 *   triggering GDPR/CCPA deletion obligations for gifters.
 *
 * PERFORMANCE DESIGN:
 *   The route returns {ok: true} immediately after validation. The Supabase
 *   insert runs in the background via a detached promise. This means the
 *   client's fetch resolves in ~5ms regardless of DB latency, so it never
 *   slows down the affiliate link opening.
 *
 * Body: { itemId, wisherUserId, retailer, affiliateNetwork, gifterPageUsername }
 *
 * Responses:
 *   200  { ok: true }
 *   400  { error: 'missing_fields', missing: string[] }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }        from '@/lib/supabase-server'

// Valid affiliate network values — anything else is coerced to 'unknown'
const VALID_NETWORKS = new Set(['amazon_associates', 'skimlinks', 'unknown'])

export async function POST(req: NextRequest) {
  // ── Parse ──────────────────────────────────────────────────────────────────
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  // ── Validate required fields ───────────────────────────────────────────────
  const required = ['itemId', 'wisherUserId', 'retailer', 'affiliateNetwork', 'gifterPageUsername']
  const missing  = required.filter((k) => !body[k])
  if (missing.length > 0) {
    return NextResponse.json({ error: 'missing_fields', missing }, { status: 400 })
  }

  // ── Sanitise ───────────────────────────────────────────────────────────────
  const itemId             = String(body.itemId).slice(0, 36)           // UUID max
  const wisherUserId       = String(body.wisherUserId).slice(0, 36)     // UUID max
  const retailer           = String(body.retailer).slice(0, 128)
  const gifterPageUsername = String(body.gifterPageUsername).slice(0, 64)
  const affiliateNetwork   = VALID_NETWORKS.has(String(body.affiliateNetwork))
    ? String(body.affiliateNetwork)
    : 'unknown'

  // ── Return immediately — insert is fire-and-forget ─────────────────────────
  // The client's keepalive fetch resolves here; the DB insert runs async.
  // If the insert fails, it's logged server-side but invisible to the gifter.
  const response = NextResponse.json({ ok: true })

  // Detached async insert — NOT awaited
  ;(async () => {
    try {
      const supabase = createServerClient()
      const { error } = await supabase
        .from('click_events')
        .insert({
          item_id:             itemId,
          wisher_user_id:      wisherUserId,
          retailer,
          affiliate_network:   affiliateNetwork,
          gifter_page_username: gifterPageUsername,
          // clicked_at defaults to now() in the DB — no need to send it
        })

      if (error) {
        console.error('[track-click] insert error:', error.message)
      }
    } catch (err) {
      console.error('[track-click] unexpected error:', err)
    }
  })()

  return response
}
