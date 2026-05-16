/**
 * lib/digest.ts — GiftHint
 *
 * Aggregates the last 7 days of activity for a wisher's account into the
 * shape needed by WeeklyDigestEmail.
 *
 * SERVER-SIDE ONLY — uses the service-role Supabase client.
 *
 * DATA SOURCES
 * ────────────
 *   page_views      → view counts per wishlist
 *   click_events    → buy-click counts per item (to find the top clicked item)
 *   wishlist_items  → item titles, image URLs, claimed_at timestamps
 *   wishlists       → wisher's list names and slugs
 *
 * PII BOUNDARY
 * ────────────
 * This module aggregates counts only — it never returns gifter identities,
 * email addresses, or session data to the wisher. Exactly what ListAnalyticsCard
 * sends to the wisher dashboard via /api/analytics/wishlist/[id].
 *
 * EMPTY DIGEST POLICY
 * ───────────────────
 * Returns null if totalViews === 0 (no one visited in the past 7 days).
 * The cron job MUST check for null and skip sending. Sending a "0 views this
 * week" digest trains users to ignore the email and increases unsubscribes.
 */

import { createServerClient } from '@/lib/supabase-server'
import type {
  DigestListSummary,
  DigestTopItem,
  DigestClaimedItem,
} from '@/lib/email-templates/weekly-digest'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WeeklyDigestData {
  totalViews:     number
  listSummaries:  DigestListSummary[]
  topClickedItem: DigestTopItem | null
  claimedItems:   DigestClaimedItem[]
}

// ── Date window ───────────────────────────────────────────────────────────────

function sevenDaysAgo(): string {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * getWeeklyDigestData
 *
 * Returns aggregated activity for the given wisher (userId) over the past
 * 7 days. Returns null if there were no page views — caller should skip
 * sending in that case.
 *
 * @param userId  The wisher's auth user ID (auth.users.id / users.id)
 */
export async function getWeeklyDigestData(
  userId: string,
): Promise<WeeklyDigestData | null> {
  const supabase = createServerClient()
  const since    = sevenDaysAgo()

  // ── 1. Fetch all wishlists for this user ─────────────────────────────────
  const { data: wishlists, error: wlError } = await supabase
    .from('wishlists')
    .select('id, name, slug')
    .eq('user_id', userId)

  if (wlError || !wishlists || wishlists.length === 0) {
    return null
  }

  type WishlistRow = { id: string; name: string; slug: string }
  const wl      = wishlists as WishlistRow[]
  const wlIds   = wl.map((w) => w.id)
  const wlById  = new Map(wl.map((w) => [w.id, w]))

  // ── 2. Page views per wishlist (last 7 days) ─────────────────────────────
  // We do a simple count-per-wishlist by fetching all rows in the window and
  // grouping in JS. Supabase JS client doesn't support GROUP BY natively.
  const { data: viewRows, error: viewError } = await supabase
    .from('page_views')
    .select('wishlist_id')
    .in('wishlist_id', wlIds)
    .gte('viewed_at', since)

  if (viewError) {
    console.error('[digest] page_views query failed:', viewError.message)
  }

  type ViewRow = { wishlist_id: string }
  const viewsByList = new Map<string, number>()
  for (const row of (viewRows ?? []) as ViewRow[]) {
    viewsByList.set(row.wishlist_id, (viewsByList.get(row.wishlist_id) ?? 0) + 1)
  }

  const totalViews = Array.from(viewsByList.values()).reduce((s, n) => s + n, 0)

  // Empty digest gate — return null so the cron skips this user
  if (totalViews === 0) return null

  // ── 3. List summaries (only lists with ≥1 view, sorted desc) ─────────────
  const listSummaries: DigestListSummary[] = wlIds
    .map((id) => ({
      listName: wlById.get(id)?.name ?? 'My Wishlist',
      slug:     wlById.get(id)?.slug ?? id,
      views:    viewsByList.get(id) ?? 0,
    }))
    .filter((l) => l.views > 0)
    .sort((a, b) => b.views - a.views)

  // ── 4. Click events per item (last 7 days) ────────────────────────────────
  const { data: clickRows, error: clickError } = await supabase
    .from('click_events')
    .select('item_id')
    .in('wishlist_id', wlIds)
    .gte('clicked_at', since)

  if (clickError) {
    console.error('[digest] click_events query failed:', clickError.message)
  }

  type ClickRow = { item_id: string }
  const clicksByItem = new Map<string, number>()
  for (const row of (clickRows ?? []) as ClickRow[]) {
    clicksByItem.set(row.item_id, (clicksByItem.get(row.item_id) ?? 0) + 1)
  }

  // ── 5. Top clicked item ───────────────────────────────────────────────────
  let topClickedItem: DigestTopItem | null = null

  if (clicksByItem.size > 0) {
    const [topItemId, topClicks] = Array.from(clicksByItem.entries())
      .sort((a, b) => b[1] - a[1])[0]

    const { data: topItemRow } = await supabase
      .from('wishlist_items')
      .select('title, image_url, source_url, affiliate_url')
      .eq('id', topItemId)
      .single()

    if (topItemRow) {
      const item = topItemRow as {
        title:         string
        image_url:     string | null
        source_url:    string
        affiliate_url: string | null
      }
      topClickedItem = {
        title:     item.title,
        imageUrl:  item.image_url,
        clicks:    topClicks,
        // Prefer the affiliate URL so the email click itself is attributed.
        // Falls back to source_url if no affiliate URL has been generated yet.
        sourceUrl: item.affiliate_url ?? item.source_url,
      }
    }
  }

  // ── 6. Claimed items (last 7 days) ────────────────────────────────────────
  const { data: claimedRows, error: claimedError } = await supabase
    .from('wishlist_items')
    .select('title, image_url, claimed_at')
    .in('wishlist_id', wlIds)
    .gte('claimed_at', since)
    .not('claimed_at', 'is', null)
    .order('claimed_at', { ascending: false })

  if (claimedError) {
    console.error('[digest] claimed items query failed:', claimedError.message)
  }

  type ClaimedRow = { title: string; image_url: string | null; claimed_at: string }
  const claimedItems: DigestClaimedItem[] = ((claimedRows ?? []) as ClaimedRow[]).map((r) => ({
    title:    r.title,
    imageUrl: r.image_url,
  }))

  return {
    totalViews,
    listSummaries,
    topClickedItem,
    claimedItems,
  }
}

// ── Week label helper ─────────────────────────────────────────────────────────

/**
 * weekOfLabel
 *
 * Produces a human-readable "May 12–18, 2025" label for the past 7 days.
 * Used in the email template header and subject line.
 */
export function weekOfLabel(): string {
  const now   = new Date()
  const end   = new Date(now)
  const start = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)

  const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) =>
    d.toLocaleDateString('en-US', { timeZone: 'UTC', ...opts })

  const startMonth = fmt(start, { month: 'long' })
  const endMonth   = fmt(end,   { month: 'long' })
  const startDay   = fmt(start, { day: 'numeric' })
  const endDay     = fmt(end,   { day: 'numeric' })
  const year       = fmt(end,   { year: 'numeric' })

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay}–${endDay}, ${year}`
  }
  return `${startMonth} ${startDay} – ${endMonth} ${endDay}, ${year}`
}
