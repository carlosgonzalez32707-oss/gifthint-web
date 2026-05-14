/**
 * app/api/items/[username]/route.ts — GiftHint
 *
 * GET /api/items/:username
 *
 * Returns the claimed state of every item on the named user's wishlist.
 * Used as a polling fallback by useRealtimeClaims when Supabase Realtime
 * is unavailable (WebSocket blocked, add-on not enabled, old browser).
 *
 * Response shape (200):
 *   { items: Array<{ id, is_claimed, claimed_by, claimed_anonymous, claimed_at }> }
 *
 * Errors:
 *   404  { error: 'user_not_found' }
 *   500  { error: 'server_error' }
 *
 * The endpoint is intentionally read-only and returns no PII beyond what is
 * already visible on the public gifter page (claimed_by is null when anonymous).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }        from '@/lib/supabase-server'

// ── Cache ─────────────────────────────────────────────────────────────────────
// 20-second CDN cache so repeat polls from many gifters on a popular list
// don't hammer the DB. The polling client polls every 30 s, so 20 s cache
// still gives fresh data on every other poll.
const CACHE_CONTROL = 'public, s-maxage=20, stale-while-revalidate=10'

export async function GET(
  _req: NextRequest,
  { params }: { params: { username: string } },
) {
  const { username } = params

  if (!username || typeof username !== 'string') {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  const supabase = createServerClient()

  // ── Resolve username → user ID ─────────────────────────────────────────────
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id')
    .eq('public_username', username)
    .maybeSingle()

  if (userError) {
    console.error('[api/items] user lookup error:', userError.message)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }

  if (!user) {
    return NextResponse.json({ error: 'user_not_found' }, { status: 404 })
  }

  // ── Fetch claimed state for all items ─────────────────────────────────────
  // Only return the fields the polling client needs — no price, title, etc.
  const { data: items, error: itemsError } = await supabase
    .from('wishlist_items')
    .select('id, is_claimed, claimed_by, claimed_anonymous, claimed_at')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true })

  if (itemsError) {
    console.error('[api/items] items query error:', itemsError.message)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }

  return NextResponse.json(
    { items: items ?? [] },
    {
      status: 200,
      headers: { 'Cache-Control': CACHE_CONTROL },
    },
  )
}
