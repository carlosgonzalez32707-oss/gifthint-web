/**
 * app/api/claims/[username]/route.ts — GiftHint
 *
 * GET /api/claims/:username
 *
 * Returns all claimed items on a wisher's public list, shaped for the
 * GifterCoordinationPanel. No authentication required — the gifter page
 * itself is public, and claimed state is visible there already.
 *
 * Anonymous-flag handling:
 *   claimed_anonymous = true  → claimed_by returned as "Someone"
 *   claimed_anonymous = false → claimed_by returned as-is (may be null → "Someone")
 *
 * Response (200):
 *   {
 *     items: Array<{
 *       itemId:    string
 *       title:     string
 *       imageUrl:  string | null
 *       claimedBy: string          // "Someone" if anonymous
 *       claimedAt: string          // ISO 8601
 *     }>
 *   }
 *
 * Errors:
 *   404  { error: 'user_not_found' }
 *   500  { error: 'server_error' }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }        from '@/lib/supabase-server'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ClaimedItemDTO {
  itemId:    string
  title:     string
  imageUrl:  string | null
  claimedBy: string    // always a displayable string — never null
  claimedAt: string    // ISO 8601 timestamptz
}

// ── Cache ─────────────────────────────────────────────────────────────────────
// 10 s CDN cache: claimed state changes infrequently; a short window is fine
// for the coordination panel. The Realtime hook updates it live anyway.
const CACHE_CONTROL = 'public, s-maxage=10, stale-while-revalidate=5'

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
    console.error('[api/claims] user lookup error:', userError.message)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
  if (!user) {
    return NextResponse.json({ error: 'user_not_found' }, { status: 404 })
  }

  // ── Fetch only claimed items ───────────────────────────────────────────────
  const { data: rows, error: itemsError } = await supabase
    .from('wishlist_items')
    .select('id, title, image_url, claimed_by, claimed_anonymous, claimed_at')
    .eq('user_id', user.id)
    .eq('is_claimed', true)
    .order('claimed_at', { ascending: false })  // most-recently claimed first

  if (itemsError) {
    console.error('[api/claims] items query error:', itemsError.message)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }

  // ── Mask anonymous claims ──────────────────────────────────────────────────
  const items: ClaimedItemDTO[] = (rows ?? []).map((row) => ({
    itemId:    row.id,
    title:     row.title,
    imageUrl:  row.image_url,
    // Respect the anonymous flag: show "Someone" for any anonymous or un-named claim
    claimedBy: row.claimed_anonymous || !row.claimed_by ? 'Someone' : row.claimed_by,
    claimedAt: row.claimed_at ?? new Date().toISOString(),
  }))

  return NextResponse.json(
    { items },
    {
      status: 200,
      headers: { 'Cache-Control': CACHE_CONTROL },
    },
  )
}
