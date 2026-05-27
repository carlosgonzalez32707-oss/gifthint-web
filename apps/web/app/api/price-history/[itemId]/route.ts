/**
 * app/api/price-history/[itemId]/route.ts — GiftHint
 *
 * GET /api/price-history/[itemId]
 *
 * Returns up to 90 days of price history for a wishlist item.
 * Scoped to the item's owner — no public access.
 *
 * Auth: Authorization: Bearer <supabase-user-jwt>
 *
 * Response (200):
 *   {
 *     rows: Array<{ price: number; checked_at: string; source: string }>
 *     lowestPrice: number | null
 *     currentPrice: number | null
 *   }
 *   Rows ordered oldest-first (ready for charting).
 *
 * Errors:
 *   401  { error: 'unauthorized' }
 *   403  { error: 'forbidden' }
 *   404  { error: 'not_found' }
 *   500  { error: 'server_error', message: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }         from '@/lib/supabase-server'

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000

export async function GET(
  req:     NextRequest,
  { params }: { params: { itemId: string } },
): Promise<NextResponse> {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const supabase = createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { itemId } = params

  // ── Ownership check ────────────────────────────────────────────────────────
  const { data: item, error: itemErr } = await supabase
    .from('wishlist_items')
    .select('user_id, price, lowest_price')
    .eq('id', itemId)
    .single()

  if (itemErr) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const typedItem = item as { user_id: string; price: number | null; lowest_price: number | null }

  if (typedItem.user_id !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // ── Fetch 90 days of price history ─────────────────────────────────────────
  const since = new Date(Date.now() - NINETY_DAYS_MS).toISOString()

  const { data: rows, error: rowsErr } = await supabase
    .from('price_history')
    .select('price, checked_at, source')
    .eq('item_id', itemId)
    .gte('checked_at', since)
    .order('checked_at', { ascending: false })
    .limit(90)   // 1 check/day × 90 days

  if (rowsErr) {
    return NextResponse.json({ error: 'server_error', message: rowsErr.message }, { status: 500 })
  }

  // Reverse to oldest-first for charting
  const ordered = (rows ?? []).slice().reverse()

  return NextResponse.json({
    rows:         ordered,
    lowestPrice:  typedItem.lowest_price,
    currentPrice: typedItem.price,
  })
}
