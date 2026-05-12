/**
 * app/api/claim/route.ts — GiftHint
 *
 * POST /api/claim
 *
 * Body:
 *   { itemId: string, claimedBy: string | null, anonymous: boolean }
 *
 * Responses:
 *   200  { success: true, item: WishlistItem }
 *   400  { error: 'missing_item_id' }
 *   404  { error: 'not_found' }
 *   409  { error: 'already_claimed' }
 *   500  { error: 'server_error' }
 *
 * Race-condition guard:
 *   The UPDATE includes .eq('is_claimed', false) so two concurrent requests
 *   can't both succeed — Supabase / Postgres guarantees only one row is updated.
 *   If the matched row count is zero we do a follow-up SELECT to distinguish
 *   "item doesn't exist" (404) from "already claimed by someone else" (409).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }        from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: { itemId?: unknown; claimedBy?: unknown; anonymous?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const itemId = typeof body.itemId === 'string' ? body.itemId.trim() : null
  if (!itemId) {
    return NextResponse.json({ error: 'missing_item_id' }, { status: 400 })
  }

  // Sanitise claimedBy — max 80 chars; empty string treated as null
  const rawName     = typeof body.claimedBy === 'string' ? body.claimedBy.trim() : null
  const claimedBy   = rawName ? rawName.slice(0, 80) : null
  const isAnonymous = body.anonymous === true

  // ── Atomic claim (race-condition safe) ──────────────────────────────────────
  const supabase = createServerClient()

  const { data: updatedItem, error: updateError } = await supabase
    .from('wishlist_items')
    .update({
      is_claimed:        true,
      claimed_by:        isAnonymous ? null : claimedBy,
      claimed_at:        new Date().toISOString(),
      claimed_anonymous: isAnonymous,
    })
    .eq('id', itemId)
    .eq('is_claimed', false)   // ← only match unclaimed rows; prevents double-claim
    .select('*')
    .maybeSingle()

  if (updateError) {
    console.error('[claim] update error', updateError)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }

  // Update matched a row — success
  if (updatedItem) {
    return NextResponse.json({ success: true, item: updatedItem })
  }

  // Update matched zero rows — distinguish "not found" vs "already claimed"
  const { data: existing, error: selectError } = await supabase
    .from('wishlist_items')
    .select('id, is_claimed')
    .eq('id', itemId)
    .maybeSingle()

  if (selectError) {
    console.error('[claim] select error', selectError)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }

  if (!existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  // Item exists but is already claimed by someone else
  return NextResponse.json({ error: 'already_claimed' }, { status: 409 })
}
