/**
 * app/api/group-gift/create-pool/route.ts — GiftHint
 *
 * POST /api/group-gift/create-pool
 *
 * Creates a gift pool for a wishlist item and marks the item as a group gift.
 * Only the item's owner (the wisher) may create a pool.
 *
 * Request body:
 *   {
 *     itemId:          string   — wishlist_items.id
 *     targetAmount:    number   — monetary target in major units (e.g. 50.00)
 *     organiserName:   string   — display name for the pool page
 *     organiserEmail:  string   — contact / payout email
 *   }
 *
 * Auth:
 *   Requires a valid Supabase access token in Authorization: Bearer <token>.
 *   Verified via supabase.auth.getUser() — the item must belong to the
 *   authenticated user's user_id.
 *
 * Responses:
 *   201  { pool: GiftPool }
 *   400  { error: 'invalid_body',    message: string }
 *   401  { error: 'unauthorized' }
 *   403  { error: 'forbidden' }       — item belongs to a different user
 *   409  { error: 'pool_exists' }     — item already has an open pool
 *   500  { error: 'server_error',    message: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }        from '@/lib/supabase-server'

// ── Types ─────────────────────────────────────────────────────────────────────

type CreatePoolBody = {
  itemId:         string
  targetAmount:   number
  organiserName:  string
  organiserEmail: string
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: Partial<CreatePoolBody>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'invalid_body', message: 'Request body must be valid JSON.' },
      { status: 400 },
    )
  }

  const { itemId, targetAmount, organiserName, organiserEmail } = body

  // ── Validate fields ────────────────────────────────────────────────────────

  if (typeof itemId !== 'string' || !itemId.trim()) {
    return NextResponse.json(
      { error: 'invalid_body', message: 'itemId is required.' },
      { status: 400 },
    )
  }

  if (typeof targetAmount !== 'number' || targetAmount <= 0 || !isFinite(targetAmount)) {
    return NextResponse.json(
      { error: 'invalid_body', message: 'targetAmount must be a positive number.' },
      { status: 400 },
    )
  }

  if (typeof organiserName !== 'string' || !organiserName.trim()) {
    return NextResponse.json(
      { error: 'invalid_body', message: 'organiserName is required.' },
      { status: 400 },
    )
  }

  if (typeof organiserEmail !== 'string' || !organiserEmail.includes('@')) {
    return NextResponse.json(
      { error: 'invalid_body', message: 'organiserEmail must be a valid email address.' },
      { status: 400 },
    )
  }

  // ── Auth: verify Supabase JWT → resolve user ──────────────────────────────

  const authHeader = req.headers.get('authorization') ?? ''
  const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''

  if (!token) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)

  if (authError || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // ── Verify item ownership ──────────────────────────────────────────────────

  const { data: item, error: itemError } = await supabase
    .from('wishlist_items')
    .select('id, user_id, is_group_gift')
    .eq('id', itemId)
    .maybeSingle()

  if (itemError) {
    console.error('[create-pool] item lookup error:', itemError.message)
    return NextResponse.json({ error: 'server_error', message: itemError.message }, { status: 500 })
  }

  if (!item) {
    return NextResponse.json(
      { error: 'invalid_body', message: 'Item not found.' },
      { status: 400 },
    )
  }

  if (item.user_id !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // ── Check for existing open pool ───────────────────────────────────────────

  const { data: existingPool } = await supabase
    .from('gift_pools')
    .select('id')
    .eq('item_id', itemId)
    .eq('status', 'open')
    .maybeSingle()

  if (existingPool) {
    return NextResponse.json({ error: 'pool_exists' }, { status: 409 })
  }

  // ── Create pool ────────────────────────────────────────────────────────────

  const { data: pool, error: poolError } = await supabase
    .from('gift_pools')
    .insert({
      item_id:          itemId,
      target_amount:    targetAmount,
      organiser_name:   organiserName.trim(),
      organiser_email:  organiserEmail.trim().toLowerCase(),
    })
    .select()
    .single()

  if (poolError) {
    console.error('[create-pool] insert error:', poolError.message)
    return NextResponse.json({ error: 'server_error', message: poolError.message }, { status: 500 })
  }

  // ── Mark item as group gift ────────────────────────────────────────────────

  const { error: updateError } = await supabase
    .from('wishlist_items')
    .update({
      is_group_gift:     true,
      group_gift_target: targetAmount,
    })
    .eq('id', itemId)

  if (updateError) {
    // Non-fatal — pool was created; the item flag can be repaired on next sync.
    console.error('[create-pool] item update error:', updateError.message)
  }

  return NextResponse.json({ pool }, { status: 201 })
}
