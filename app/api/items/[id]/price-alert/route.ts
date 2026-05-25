/**
 * app/api/items/[id]/price-alert/route.ts — GiftHint
 *
 * PATCH /api/items/[id]/price-alert
 *
 * Updates price alert settings for a single wishlist item.
 * Only the item's owner may call this endpoint.
 *
 * Auth: Authorization: Bearer <supabase-user-jwt>
 *
 * Body (JSON):
 *   { enabled: boolean, threshold?: number }   // threshold: 50–99
 *
 * Response (200):
 *   { ok: true }
 *
 * Errors:
 *   400  { error: 'invalid_body', message?: string }
 *   401  { error: 'unauthorized' }
 *   403  { error: 'forbidden' }
 *   500  { error: 'server_error', message: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }         from '@/lib/supabase-server'

export async function PATCH(
  req:     NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const supabase = createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const enabled   = body['enabled']
  const threshold = body['threshold']

  if (typeof enabled !== 'boolean') {
    return NextResponse.json(
      { error: 'invalid_body', message: 'enabled must be boolean' },
      { status: 400 },
    )
  }

  if (
    threshold !== undefined &&
    (typeof threshold !== 'number' || threshold < 50 || threshold > 99)
  ) {
    return NextResponse.json(
      { error: 'invalid_body', message: 'threshold must be a number between 50 and 99' },
      { status: 400 },
    )
  }

  // ── Ownership check ────────────────────────────────────────────────────────
  const itemId = params.id

  const { data: item, error: fetchErr } = await supabase
    .from('wishlist_items')
    .select('user_id')
    .eq('id', itemId)
    .single()

  if (fetchErr || !item) {
    return NextResponse.json({ error: 'server_error', message: fetchErr?.message ?? 'not found' }, { status: 500 })
  }

  if ((item as { user_id: string }).user_id !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // ── Update ─────────────────────────────────────────────────────────────────
  const patch: Record<string, unknown> = { price_alert_enabled: enabled }
  if (threshold !== undefined) patch['price_alert_threshold'] = threshold

  const { error: updateErr } = await supabase
    .from('wishlist_items')
    .update(patch)
    .eq('id', itemId)

  if (updateErr) {
    return NextResponse.json({ error: 'server_error', message: updateErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
