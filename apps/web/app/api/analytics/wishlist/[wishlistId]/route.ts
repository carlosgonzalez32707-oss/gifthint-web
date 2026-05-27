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
 *
 * N+1 fix (20260518_db_optimisation.sql)
 * ──────────────────────────────────────
 * Previously this route fetched wishlist_items then separately fetched
 * click_events and counted client-side — two sequential queries after the
 * initial Promise.all. The get_items_with_click_counts() RPC collapses both
 * into a single LEFT JOIN aggregate executed inside Postgres, running in
 * parallel with the other two fetches.
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

/** Shape returned by the get_items_with_click_counts() Postgres RPC. */
interface ItemWithClicks {
  id:         string
  title:      string
  is_claimed: boolean
  buy_clicks: number    // BIGINT from Postgres — cast to Number on use
  sort_order: number
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
  //
  // All three queries run concurrently. The third query uses the
  // get_items_with_click_counts() RPC (added in 20260518_db_optimisation.sql)
  // which executes a single LEFT JOIN aggregate inside Postgres — eliminating
  // the previous two-step pattern (items SELECT → click_events SELECT → count).
  const [summaryResult, sparklineResult, itemsWithClicksResult] = await Promise.all([

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

    // ③ Items + click counts in a single SQL round-trip (replaces N+1 pattern)
    supabase.rpc('get_items_with_click_counts', {
      p_wishlist_id: wishlistId,
    }),
  ])

  if (summaryResult.error) {
    console.error('[analytics] summary error:', summaryResult.error.message)
    return NextResponse.json(
      { error: 'server_error', message: summaryResult.error.message },
      { status: 500 },
    )
  }

  if (itemsWithClicksResult.error) {
    console.error('[analytics] items-with-clicks error:', itemsWithClicksResult.error.message)
    return NextResponse.json(
      { error: 'server_error', message: itemsWithClicksResult.error.message },
      { status: 500 },
    )
  }

  // ── Build top-items list ────────────────────────────────────────────────────
  // The RPC already returns items ordered by sort_order; we re-sort here by
  // buy_clicks descending for the "most clicked" ranking.
  const topItems: TopItem[] = ((itemsWithClicksResult.data ?? []) as ItemWithClicks[])
    .map((item) => ({
      id:         item.id,
      title:      item.title,
      buy_clicks: Number(item.buy_clicks),   // Postgres BIGINT → JS number
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
