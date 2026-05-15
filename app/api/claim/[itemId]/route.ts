/**
 * app/api/claim/[itemId]/route.ts — GiftHint
 *
 * DELETE /api/claim/:itemId
 *
 * Unclaims an item. Only the person who originally claimed it can unclaim it.
 * The ownership check is name-based: the request must supply the same
 * `claimedBy` string that was stored on the row (case-insensitive trim match).
 *
 * Body:
 *   { claimedBy: string }  — the name the gifter used when claiming
 *
 * This is a soft authorisation mechanism suitable for a public wishlist app
 * where there is no gifter account. It prevents accidental unclaims (another
 * gifter randomly submitting someone else's name) but is not cryptographically
 * secure. If you need hard auth, require a gifter session token instead.
 *
 * Responses:
 *   200  { success: true }
 *   400  { error: 'missing_fields' }
 *   403  { error: 'name_mismatch' }   — claimedBy doesn't match what's stored
 *   404  { error: 'not_found' }       — item doesn't exist or isn't claimed
 *   409  { error: 'not_claimed' }     — item exists but is already unclaimed
 *   500  { error: 'server_error' }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }        from '@/lib/supabase-server'

export async function DELETE(
  req: NextRequest,
  { params }: { params: { itemId: string } },
) {
  const { itemId } = params

  if (!itemId || typeof itemId !== 'string') {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: { claimedBy?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const claimedBy =
    typeof body.claimedBy === 'string' ? body.claimedBy.trim() : null

  if (!claimedBy) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
  }

  const supabase = createServerClient()

  // ── Look up the current item state ─────────────────────────────────────────
  const { data: item, error: fetchError } = await supabase
    .from('wishlist_items')
    .select('id, is_claimed, claimed_by, claimed_anonymous')
    .eq('id', itemId)
    .maybeSingle()

  if (fetchError) {
    console.error('[unclaim] fetch error:', fetchError.message)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
  if (!item) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  if (!item.is_claimed) {
    return NextResponse.json({ error: 'not_claimed' }, { status: 409 })
  }

  // ── Name-based authorisation ───────────────────────────────────────────────
  // Anonymous claims cannot be unclaimed via name — the claimant has no
  // verifiable identity. Require them to contact the list owner instead.
  if (item.claimed_anonymous || !item.claimed_by) {
    return NextResponse.json({ error: 'name_mismatch' }, { status: 403 })
  }

  const storedName   = item.claimed_by.trim().toLowerCase()
  const providedName = claimedBy.toLowerCase()

  if (storedName !== providedName) {
    return NextResponse.json({ error: 'name_mismatch' }, { status: 403 })
  }

  // ── Reset claim fields ─────────────────────────────────────────────────────
  const { error: updateError } = await supabase
    .from('wishlist_items')
    .update({
      is_claimed:        false,
      claimed_by:        null,
      claimed_at:        null,
      claimed_anonymous: false,
    })
    .eq('id', itemId)
    .eq('claimed_by', item.claimed_by)  // extra guard: only update if name still matches

  if (updateError) {
    console.error('[unclaim] update error:', updateError.message)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
