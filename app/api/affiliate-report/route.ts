/**
 * app/api/affiliate-report/route.ts — GiftHint
 *
 * GET /api/affiliate-report
 *
 * Returns an affiliate coverage report for the authenticated user's wishlist
 * items. Protected by Supabase JWT auth — the caller must supply a valid
 * access token in the Authorization header.
 *
 * Authentication:
 *   Authorization: Bearer <supabase_access_token>
 *
 * Success response (200):
 *   {
 *     total:               number,
 *     amazon:              number,
 *     skimlinks_eligible:  number,
 *     ineligible:          number,
 *     unknown:             number,
 *     coverage_pct:        number,   // 0-100, rounded
 *     items: [
 *       { itemId, title, sourceUrl, category, domain },
 *       ...
 *     ]
 *   }
 *
 * Error responses:
 *   401  { error: 'unauthorized' }         — missing or invalid token
 *   500  { error: 'internal_error' }       — unexpected server error
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }         from '@/lib/supabase-server'
import { auditAffiliateLinks }        from '@/lib/affiliate-audit'
import type { WishlistItem }          from '@/types/wishlist'

// ── Auth helper ───────────────────────────────────────────────────────────────

/**
 * Extracts and validates the Bearer token from the Authorization header.
 * Returns the authenticated user's ID, or null if auth fails.
 */
async function resolveUserId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization') ?? ''
  const token      = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : null

  if (!token) return null

  try {
    const supabase = createServerClient()
    // getUser validates the JWT against Supabase's JWKS without a DB round-trip
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data.user) return null
    return data.user.id
  } catch {
    return null
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const userId = await resolveUserId(req)
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // ── Fetch items ───────────────────────────────────────────────────────────
  let items: WishlistItem[]
  try {
    const supabase = createServerClient()

    const { data, error } = await supabase
      .from('wishlist_items')
      .select(
        'id, user_id, title, price, currency, image_url, source_url, ' +
        'original_url, affiliate_url, retailer, hint, dna_tags, ' +
        'is_claimed, claimed_by, claimed_at, claimed_anonymous, ' +
        'sort_order, created_at',
      )
      .eq('user_id', userId)
      .order('sort_order', { ascending: true })

    if (error) throw error

    // Cast DB rows to WishlistItem. skimlinks_fallback_url is a computed field,
    // not a DB column — the audit reads only source_url so the cast is safe.
    items = (data ?? []) as unknown as WishlistItem[]
  } catch (err) {
    console.error('[affiliate-report] db fetch error:', err)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }

  // ── Audit ─────────────────────────────────────────────────────────────────
  const report = auditAffiliateLinks(items)

  return NextResponse.json(report, {
    status: 200,
    headers: {
      // Results are user-specific — never share across users or CDN edge nodes.
      'Cache-Control': 'private, no-store',
    },
  })
}
