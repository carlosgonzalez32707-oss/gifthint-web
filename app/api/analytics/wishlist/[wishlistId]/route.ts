/**
 * app/api/analytics/wishlist/[wishlistId]/route.ts — GiftHint
 *
 * GET /api/analytics/wishlist/:wishlistId
 *
 * Returns analytics data for a single wishlist, for use by the wisher
 * dashboard. Only the wishlist owner may call this endpoint.
 *
 * Auth: Bearer token (Supabase JWT) in the Authorization header.
 *
 * Response 200:
 *   {
 *     summary: {
 *       total_views:             number
 *       unique_view_days:        number
 *       total_buy_clicks:        number
 *       claimed_items_count:     number
 *       most_clicked_item_title: string | null
 *     }
 *     sparkline: Array<{ date: string; views: number }>   // last 14 days, oldest first
 *     topItems:  Array<{ id: string; title: string; buy_clicks: number; is_claimed: boolean }>
 *   }
 *
 * Errors:
 *   401  { error: 'unauthorized' }
 *   403  { error: 'forbidden' }
 *   404  { error: 'not_found' }
 *   500  { error: 'server_error', message: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }        from '@/lib/supabase-server'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AnalyticsSummary {
  total_views:             number
  unique_view_days:        number
  total_buy_clicks:        number
  claimed_items_count:     number
  most_clicked_item_title: string | null
}

interface SparklinePoint {
  date:  string   // 'YYYY-MM-DD'
  views: number
}

interface TopItem {
  id:         string
  title:      string
  buy_clicks: number
  is_claimed: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fills gaps in the 14-day sparkline so every day has an entry (0 views if no rows). */
function buildSparkline(
  rows: Array<{ date: string; views: number }>,
): SparklinePoint[] {
  const byDate = new Map(rows.map((r) => [r.date, r.views]))
  const points: SparklinePoint[] = []

  for (let i = 13; i >= 0; i--) {
    const d     = new Date()
    d.setUTCDate(d.getUTCDate() - i)
    const iso   = d.toISOString().slice(0, 10)   // 'YYYY-MM-DD'
    points.push({ date: iso, views: byDate.get(iso) ?? 0 })
  }

  return points
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(
  request:                          NextRequest,
  { params }: { params: { wishlistId: string } },
) {
  const { wishlistId } = params

  // ── Auth ────────────────────────────────────────────────────────────────────
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // ── Ownership check ─────────────────────────────────────────────────────────
  const { data: wishlist, error: wishlistError } = await supabase
    .from('wishlists')
    .select('id, user_id')
    .eq('id', wishlistId)
    .maybeSingle()

  if (wishlistError || !wishlist) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  if (wishlist.user_id !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // ── Parallel data fetch ─────────────────────────────────────────────────────
  const [summaryResult, sparklineResult, topItemsResult] = await Promise.all([

    // ① Summary from the wisher_analytics view
    supabase
      .from('wisher_analytics')
      .select(
        'total_views, unique_view_days, total_buy_clicks, claimed_items_count, most_clicked_item_title',
      )
      .eq('wishlist_id', wishlistId)
      .maybeSingle(),

    // ② 14-day sparkline: page_views grouped by UTC calendar day
    supabase.rpc('get_wishlist_daily_views', {
      p_wishlist_id: wishlistId,
      p_days:        14,
    }),

    // ③ Per-item breakdown: title, click count, claimed status
    supabase
      .from('wishlist_items')
      .select('id, title, is_claimed')
      .eq('wishlist_id', wishlistId)
      .order('sort_order', { ascending: true }),
  ])

  if (summaryResult.error) {
    console.error('[analytics] summary error:', summaryResult.error.message)
    return NextResponse.json(
      { error: 'server_error', message: summaryResult.error.message },
      { status: 500 },
    )
  }

  // ── Build top-items list (join click counts client-side to avoid raw SQL) ───
  // Fetch click counts for all items in this wishlist in one query.
  const itemIds = (topItemsResult.data ?? []).map((i: { id: string }) => i.id)

  let clicksByItem: Record<string, number> = {}

  if (itemIds.length > 0) {
    const { data: clickRows } = await supabase
      .from('click_events')
      .select('item_id')
      .in('item_id', itemIds)

    for (const row of clickRows ?? []) {
      clicksByItem[row.item_id] = (clicksByItem[row.item_id] ?? 0) + 1
    }
  }

  const topItems: TopItem[] = ((topItemsResult.data ?? []) as Array<{
    id:         string
    title:      string
    is_claimed: boolean
  }>)
    .map((item) => ({
      id:         item.id,
      title:      item.title,
      buy_clicks: clicksByItem[item.id] ?? 0,
      is_claimed: item.is_claimed,
    }))
    .sort((a, b) => b.buy_clicks - a.buy_clicks)

  // ── Assemble summary ────────────────────────────────────────────────────────
  const raw     = summaryResult.data
  const summary: AnalyticsSummary = {
    total_views:             Number(raw?.total_views             ?? 0),
    unique_view_days:        Number(raw?.unique_view_days        ?? 0),
    total_buy_clicks:        Number(raw?.total_buy_clicks        ?? 0),
    claimed_items_count:     Number(raw?.claimed_items_count     ?? 0),
    most_clicked_item_title: raw?.most_clicked_item_title ?? null,
  }

  // ── Sparkline (from RPC or fallback raw query) ───────────────────────────────
  // The RPC `get_wishlist_daily_views` is defined in the migration below.
  // If it isn't deployed yet, sparklineResult.data may be null — fall back
  // to an all-zeros array so the UI renders gracefully.
  const sparklineRows = (sparklineResult.data ?? []) as Array<{
    date:  string
    views: number
  }>
  const sparkline = buildSparkline(sparklineRows)

  return NextResponse.json({ summary, sparkline, topItems }, { status: 200 })
}
