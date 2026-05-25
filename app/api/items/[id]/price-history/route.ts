/**
 * app/api/items/[id]/price-history/route.ts — GiftHint
 *
 * GET /api/items/[id]/price-history
 *
 * Returns the last 30 price_history rows for a wishlist item, oldest first.
 * Used by the PriceAlertSettings sparkline in the dashboard.
 *
 * Auth: Authorization: Bearer <supabase-user-jwt>
 *
 * Response (200):
 *   { rows: Array<{ price: number; checked_at: string; source: string }> }
 *
 * Errors:
 *   401  { error: 'unauthorized' }
 *   403  { error: 'forbidden' }
 *   500  { error: 'server_error', message: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }         from '@/lib/supabase-server'

export async function GET(
  req:     NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const supabase = createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

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

  // ── Fetch history ──────────────────────────────────────────────────────────
  const { data: rows, error: rowsErr } = await supabase
    .from('price_history')
    .select('price, checked_at, source')
    .eq('item_id', itemId)
    .order('checked_at', { ascending: false })
    .limit(30)

  if (rowsErr) {
    return NextResponse.json({ error: 'server_error', message: rowsErr.message }, { status: 500 })
  }

  // Reverse to oldest-first for charting
  const ordered = (rows ?? []).slice().reverse()

  return NextResponse.json({ rows: ordered })
}
