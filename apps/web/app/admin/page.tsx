/**
 * app/admin/page.tsx — GiftHint internal revenue dashboard
 *
 * Server component — all data is fetched at render time, zero client JS
 * except for the Recharts charts (RevenueChart, RevenueFunnel, GrowthMetrics).
 *
 * ACCESS
 * ──────
 * Middleware gates the route on the `gh_admin` cookie (see middleware.ts).
 * This page does a second check: if ADMIN_EMAIL is not set it renders a 404,
 * and it can also set the admin cookie when `?secret=<ADMIN_SECRET>` is present
 * in the URL (useful for first-time setup).
 *
 * FIRST-TIME SETUP
 * ────────────────
 * 1. Add ADMIN_SECRET and ADMIN_EMAIL to .env.local
 * 2. Visit /admin?secret=<your-ADMIN_SECRET>
 * 3. The page sets the HttpOnly cookie and redirects to /admin
 * 4. Subsequent visits work without the query param
 */

import { cookies }           from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'
import { StatsGrid }         from '@/components/admin/StatsGrid'
import { RevenueChart }      from '@/components/admin/RevenueChart'
import { TopItemsTable }     from '@/components/admin/TopItemsTable'
import { RevenueFunnel }     from '@/components/admin/RevenueFunnel'
import { NetworkBreakdown }  from '@/components/admin/NetworkBreakdown'
import { RetailerLeaderboard } from '@/components/admin/RetailerLeaderboard'
import { GrowthMetrics }     from '@/components/admin/GrowthMetrics'
import type { TopItem }      from '@/components/admin/TopItemsTable'
import type { DailyClickRow } from '@/components/admin/RevenueChart'
import type { FunnelData }   from '@/components/admin/RevenueFunnel'
import type { NetworkData }  from '@/components/admin/NetworkBreakdown'
import type { RetailerRow }  from '@/components/admin/RetailerLeaderboard'
import type { GrowthData }   from '@/components/admin/GrowthMetrics'
import { ReconciliationTable } from '@/components/admin/ReconciliationTable'
import type { ReconciliationRow } from '@/components/admin/ReconciliationTable'
import { tokens }            from '@/tokens'

// ── Types ──────────────────────────────────────────────────────────────────────

interface AdminStats {
  totalUsers:          number
  totalItems:          number
  totalClicks:         number
  estimatedRevenue:    number
  ctaClicks:           number
  affiliateCoveragePct: number
}

// ── Auth helpers ───────────────────────────────────────────────────────────────

const ADMIN_COOKIE   = 'gh_admin'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30  // 30 days

// ── Data fetching ──────────────────────────────────────────────────────────────

async function fetchStats(supabase: ReturnType<typeof createServerClient>): Promise<AdminStats> {
  const [usersRes, itemsRes, clicksRes, revenueRes, ctaRes, coverageRes] =
    await Promise.all([
      supabase.from('users').select('id', { count: 'exact', head: true }),
      supabase.from('wishlist_items').select('id', { count: 'exact', head: true }),
      supabase.from('click_events').select('id', { count: 'exact', head: true }),
      supabase.from('wishlist_items')
        .select('estimated_commission')
        .not('estimated_commission', 'is', null),
      supabase.from('cta_events').select('id', { count: 'exact', head: true }),
      // Coverage = items with an affiliate programme / total items
      supabase.from('wishlist_items').select('source_url, retailer'),
    ])

  // Sum estimated revenue from non-null commission rows
  const rawRevenue = (revenueRes.data ?? []) as { estimated_commission: number }[]
  const estimatedRevenue = rawRevenue.reduce(
    (sum, row) => sum + (row.estimated_commission ?? 0),
    0,
  )

  // Affiliate coverage: count items whose retailer is 'amazon' or have a
  // Skimlinks-eligible domain (proxy: non-null affiliate_url vs source_url)
  const allItems = (coverageRes.data ?? []) as { source_url: string; retailer: string | null }[]
  const covered  = allItems.filter((i) =>
    i.retailer?.toLowerCase().includes('amazon'),
  ).length
  const affiliateCoveragePct =
    allItems.length === 0 ? 0 : Math.round((covered / allItems.length) * 100)

  return {
    totalUsers:           usersRes.count ?? 0,
    totalItems:           itemsRes.count ?? 0,
    totalClicks:          clicksRes.count ?? 0,
    estimatedRevenue:     Math.round(estimatedRevenue * 100) / 100,
    ctaClicks:            ctaRes.count ?? 0,
    affiliateCoveragePct,
  }
}

async function fetchDailyClicks(
  supabase: ReturnType<typeof createServerClient>,
): Promise<DailyClickRow[]> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('click_events')
    .select('clicked_at, affiliate_network')
    .gte('clicked_at', since)

  if (error || !data) return []

  const map = new Map<string, { amazon: number; skimlinks: number }>()

  for (const row of data as { clicked_at: string; affiliate_network: string }[]) {
    const date = row.clicked_at.slice(0, 10)
    if (!map.has(date)) map.set(date, { amazon: 0, skimlinks: 0 })
    const entry = map.get(date)!
    if (row.affiliate_network === 'amazon_associates') entry.amazon++
    else if (row.affiliate_network === 'skimlinks')    entry.skimlinks++
  }

  const rows: DailyClickRow[] = []
  for (let i = 29; i >= 0; i--) {
    const d    = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
    const date = d.toISOString().slice(0, 10)
    const entry = map.get(date) ?? { amazon: 0, skimlinks: 0 }
    rows.push({ date, amazon: entry.amazon, skimlinks: entry.skimlinks })
  }

  return rows
}

async function fetchTopItems(
  supabase: ReturnType<typeof createServerClient>,
): Promise<TopItem[]> {
  const { data: clicks } = await supabase
    .from('click_events')
    .select('item_id, retailer, affiliate_network')

  if (!clicks) return []

  const countMap = new Map<string, { retailer: string; clicks: number; network: string }>()
  for (const c of clicks as { item_id: string; retailer: string; affiliate_network: string }[]) {
    if (!countMap.has(c.item_id)) {
      countMap.set(c.item_id, { retailer: c.retailer, clicks: 0, network: c.affiliate_network })
    }
    countMap.get(c.item_id)!.clicks++
  }

  const top10Ids = Array.from(countMap.entries())
    .sort((a, b) => b[1].clicks - a[1].clicks)
    .slice(0, 10)
    .map(([id]) => id)

  if (top10Ids.length === 0) return []

  const { data: items } = await supabase
    .from('wishlist_items')
    .select('id, title, retailer, estimated_commission, price')
    .in('id', top10Ids)

  if (!items) return []

  return top10Ids.map((id) => {
    const item = (items as {
      id: string; title: string; retailer: string | null
      estimated_commission: number | null; price: number | null
    }[]).find((i) => i.id === id)
    const meta = countMap.get(id)!
    return {
      id,
      title:               item?.title ?? '(deleted item)',
      retailer:            item?.retailer ?? meta.retailer ?? 'unknown',
      clicks:              meta.clicks,
      estimated_commission: item?.estimated_commission ?? null,
    }
  })
}

async function fetchFunnelData(
  supabase: ReturnType<typeof createServerClient>,
): Promise<FunnelData> {
  const { data, error } = await supabase
    .from('conversion_funnel')
    .select('*')
    .single()

  if (error || !data) {
    return { views: 0, buy_clicks: 0, claims: 0, est_revenue: 0 }
  }

  const row = data as {
    views:       number | string
    buy_clicks:  number | string
    claims:      number | string
    est_revenue: number | string | null
  }

  return {
    views:       Number(row.views)      || 0,
    buy_clicks:  Number(row.buy_clicks) || 0,
    claims:      Number(row.claims)     || 0,
    est_revenue: Number(row.est_revenue ?? 0),
  }
}

async function fetchNetworkData(
  supabase: ReturnType<typeof createServerClient>,
): Promise<NetworkData> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('click_events')
    .select('affiliate_network, estimated_commission')
    .gte('clicked_at', since)

  if (error || !data) {
    return {
      amazon:           { clicks: 0, est_revenue: 0, avg_order: 0 },
      skimlinks:        { clicks: 0, est_revenue: 0, avg_order: 0 },
      unknown_clicks:   0,
      total_clicks:     0,
      coverage_gap_pct: 0,
    }
  }

  type ClickRow = { affiliate_network: string; estimated_commission: number | null }
  const rows = data as ClickRow[]

  const agg = (network: string) => {
    const subset = rows.filter((r) => r.affiliate_network === network)
    const clicks      = subset.length
    const est_revenue = subset.reduce((s, r) => s + (r.estimated_commission ?? 0), 0)
    return {
      clicks,
      est_revenue: Math.round(est_revenue * 100) / 100,
      avg_order:   clicks === 0 ? 0 : Math.round((est_revenue / clicks) * 100) / 100,
    }
  }

  const amazon    = agg('amazon_associates')
  const skimlinks = agg('skimlinks')
  const unknown_clicks = rows.filter(
    (r) => r.affiliate_network !== 'amazon_associates' && r.affiliate_network !== 'skimlinks',
  ).length
  const total_clicks    = rows.length
  const coverage_gap_pct =
    total_clicks === 0 ? 0 : Math.round((unknown_clicks / total_clicks) * 1000) / 10

  return { amazon, skimlinks, unknown_clicks, total_clicks, coverage_gap_pct }
}

async function fetchRetailerLeaderboard(
  supabase: ReturnType<typeof createServerClient>,
): Promise<RetailerRow[]> {
  const { data, error } = await supabase
    .from('click_events')
    .select('retailer, affiliate_network, estimated_commission')

  if (error || !data) return []

  type ClickRow = { retailer: string | null; affiliate_network: string; estimated_commission: number | null }
  const rows = data as ClickRow[]

  const map = new Map<string, { clicks: number; network: string; est_rev: number }>()

  for (const r of rows) {
    const key = r.retailer?.toLowerCase() ?? 'unknown'
    if (!map.has(key)) {
      map.set(key, { clicks: 0, network: r.affiliate_network ?? 'unknown', est_rev: 0 })
    }
    const entry = map.get(key)!
    entry.clicks++
    entry.est_rev += r.estimated_commission ?? 0
    // Use most specific network (amazon_associates > skimlinks > unknown)
    if (r.affiliate_network === 'amazon_associates') entry.network = 'amazon_associates'
    else if (r.affiliate_network === 'skimlinks' && entry.network === 'unknown') {
      entry.network = 'skimlinks'
    }
  }

  return Array.from(map.entries())
    .sort((a, b) => b[1].clicks - a[1].clicks)
    .slice(0, 20)
    .map(([retailer, { clicks, network, est_rev }]) => ({
      retailer,
      clicks,
      network,
      est_rev: Math.round(est_rev * 100) / 100,
    }))
}

async function fetchReconciliationRows(
  supabase: ReturnType<typeof createServerClient>,
): Promise<ReconciliationRow[]> {
  // Pull 90 days of data; the client-side date range selector filters further.
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)

  const { data, error } = await supabase
    .from('affiliate_reconciliation')
    .select('*')
    .gte('report_date', since)
    .order('report_date', { ascending: false })

  if (error || !data) {
    console.error('[admin] affiliate_reconciliation query failed:', error?.message)
    return []
  }

  return (data as ReconciliationRow[]).map((r) => ({
    report_date:       r.report_date,
    network:           r.network,
    network_clicks:    Number(r.network_clicks)   || 0,
    internal_clicks:   Number(r.internal_clicks)  || 0,
    actual_revenue:    Number(r.actual_revenue)   || 0,
    estimated_revenue: Number(r.estimated_revenue) || 0,
    variance_pct:      r.variance_pct !== null ? Number(r.variance_pct) : null,
    synced_at:         r.synced_at,
  }))
}

async function fetchGrowthData(
  supabase: ReturnType<typeof createServerClient>,
): Promise<GrowthData> {
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const since7  = new Date(Date.now() -  7 * 24 * 60 * 60 * 1000).toISOString()
  const since14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()

  const [usersRes, viewsRes, ctaRes] = await Promise.all([
    // Users created in last 30 days
    supabase
      .from('users')
      .select('created_at')
      .gte('created_at', since30),
    // Gifter page views in the 7-day window before this week (days 8-14 ago)
    supabase
      .from('page_views')
      .select('id', { count: 'exact', head: true })
      .gte('viewed_at', since14)
      .lt('viewed_at', since7),
    // Top referring wishlists via CTA click events
    supabase
      .from('cta_events')
      .select('gifter_page_username, gifter_page_slug, wishlist_title')
      .not('gifter_page_username', 'is', null),
  ])

  // ── Daily signups (last 30 days, gapless) ──
  type UserRow = { created_at: string }
  const userRows = (usersRes.data ?? []) as UserRow[]
  const signupMap = new Map<string, number>()
  for (const u of userRows) {
    const date = u.created_at.slice(0, 10)
    signupMap.set(date, (signupMap.get(date) ?? 0) + 1)
  }

  const daily_signups = []
  for (let i = 29; i >= 0; i--) {
    const d    = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
    const date = d.toISOString().slice(0, 10)
    daily_signups.push({ date, users: signupMap.get(date) ?? 0 })
  }

  const total_new_users = userRows.length

  // ── Viral coefficient: new users this week / gifter views last week ──
  const newThisWeek   = userRows.filter((u) => u.created_at >= since7).length
  const viewsLastWeek = viewsRes.count ?? 0
  const viral_coefficient =
    viewsLastWeek === 0 ? 0 : Math.round((newThisWeek / viewsLastWeek) * 100) / 100

  // ── Top referrers: aggregate CTA clicks by wishlist ──
  type CtaRow = {
    gifter_page_username: string | null
    gifter_page_slug:     string | null
    wishlist_title:       string | null
  }
  const ctaRows = (ctaRes.data ?? []) as CtaRow[]
  const ctaMap  = new Map<string, { cta_clicks: number; title: string; slug: string }>()

  for (const c of ctaRows) {
    if (!c.gifter_page_username) continue
    const key = `${c.gifter_page_username}/${c.gifter_page_slug ?? ''}`
    if (!ctaMap.has(key)) {
      ctaMap.set(key, {
        cta_clicks: 0,
        title:      c.wishlist_title ?? c.gifter_page_slug ?? '',
        slug:       c.gifter_page_slug ?? '',
      })
    }
    ctaMap.get(key)!.cta_clicks++
  }

  const top_referrers = Array.from(ctaMap.entries())
    .sort((a, b) => b[1].cta_clicks - a[1].cta_clicks)
    .slice(0, 10)
    .map(([key, { cta_clicks, title, slug }]) => ({
      wisher_username: key.split('/')[0],
      wishlist_slug:   slug,
      wishlist_title:  title,
      cta_clicks,
    }))

  return { daily_signups, total_new_users, viral_coefficient, top_referrers }
}

// ── Page ───────────────────────────────────────────────────────────────────────

interface AdminPageProps {
  searchParams: Record<string, string | string[] | undefined>
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  // ── Guard: ADMIN_EMAIL must be configured ──────────────────────────────────
  const adminEmail = process.env.ADMIN_EMAIL
  if (!adminEmail) notFound()

  // ── Cookie seeding (first-time setup) ─────────────────────────────────────
  const incomingSecret   = typeof searchParams.secret === 'string' ? searchParams.secret : null
  const configuredSecret = process.env.ADMIN_SECRET

  if (incomingSecret && configuredSecret && incomingSecret === configuredSecret) {
    const cookieStore = await cookies()
    cookieStore.set(ADMIN_COOKIE, configuredSecret, {
      httpOnly: true,
      sameSite: 'strict',
      secure:   process.env.NODE_ENV === 'production',
      maxAge:   COOKIE_MAX_AGE,
      path:     '/admin',
    })
    redirect('/admin')
  }

  // ── Verify cookie (secondary check after middleware) ───────────────────────
  const cookieStore = await cookies()
  const adminCookie = cookieStore.get(ADMIN_COOKIE)
  if (!adminCookie || adminCookie.value !== configuredSecret) {
    redirect('/')
  }

  // ── Fetch all dashboard data in parallel ───────────────────────────────────
  const supabase = createServerClient()
  const [stats, dailyClicks, topItems, funnelData, networkData, retailerRows, growthData, reconciliationRows] =
    await Promise.all([
      fetchStats(supabase),
      fetchDailyClicks(supabase),
      fetchTopItems(supabase),
      fetchFunnelData(supabase),
      fetchNetworkData(supabase),
      fetchRetailerLeaderboard(supabase),
      fetchGrowthData(supabase),
      fetchReconciliationRows(supabase),
    ])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <main
      style={{
        minHeight:  '100vh',
        background: tokens.colors.bg,
        color:      tokens.colors.text,
        fontFamily: tokens.font.sans,
        padding:    '32px 24px 64px',
        maxWidth:   '1200px',
        margin:     '0 auto',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, letterSpacing: '-0.3px' }}>
              GiftHint Revenue Dashboard
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: tokens.colors.muted }}>
              Admin: {adminEmail} · Data as of {new Date().toLocaleDateString('en-US', {
                month: 'long', day: 'numeric', year: 'numeric',
              })}
            </p>
          </div>
          <span
            style={{
              fontSize:     '11px',
              fontWeight:   600,
              padding:      '4px 10px',
              borderRadius: tokens.radius.pill,
              background:   tokens.colors.purpleDim,
              color:        tokens.colors.purple,
              border:       `1px solid ${tokens.colors.purpleRing}`,
            }}
          >
            INTERNAL
          </span>
        </div>
      </header>

      {/* ── KPI cards ──────────────────────────────────────────────────────── */}
      <section style={{ marginBottom: '32px' }}>
        <SectionLabel>Key Metrics</SectionLabel>
        <StatsGrid stats={stats} />
      </section>

      {/* ── Conversion funnel ──────────────────────────────────────────────── */}
      <section style={{ marginBottom: '32px' }}>
        <SectionLabel>30-Day Conversion Funnel</SectionLabel>
        <div
          style={{
            background:   tokens.colors.surface,
            borderRadius: tokens.radius.lg,
            border:       `1px solid ${tokens.colors.border}`,
            padding:      '24px',
          }}
        >
          <RevenueFunnel data={funnelData} />
        </div>
      </section>

      {/* ── Network breakdown ──────────────────────────────────────────────── */}
      <section style={{ marginBottom: '32px' }}>
        <SectionLabel>Affiliate Network Performance — Last 30 Days</SectionLabel>
        <NetworkBreakdown data={networkData} />
      </section>

      {/* ── Retailer leaderboard ───────────────────────────────────────────── */}
      <section style={{ marginBottom: '32px' }}>
        <SectionLabel>Retailer Leaderboard — All Time</SectionLabel>
        <RetailerLeaderboard rows={retailerRows} />
      </section>

      {/* ── Click chart ────────────────────────────────────────────────────── */}
      <section style={{ marginBottom: '32px' }}>
        <SectionLabel>Affiliate Clicks — Last 30 Days</SectionLabel>
        <div
          style={{
            background:   tokens.colors.surface,
            borderRadius: tokens.radius.lg,
            border:       `1px solid ${tokens.colors.border}`,
            padding:      '24px',
          }}
        >
          <RevenueChart data={dailyClicks} />
        </div>
      </section>

      {/* ── Growth metrics ──────────────────────────────────────────────────── */}
      <section style={{ marginBottom: '32px' }}>
        <SectionLabel>User Growth & Viral Metrics</SectionLabel>
        <GrowthMetrics data={growthData} />
      </section>

      {/* ── Revenue reconciliation ──────────────────────────────────────────── */}
      <section style={{ marginBottom: '32px' }}>
        <SectionLabel>Estimate vs Actual — Affiliate Revenue Reconciliation</SectionLabel>
        <ReconciliationTable rows={reconciliationRows} />
      </section>

      {/* ── Top items table ─────────────────────────────────────────────────── */}
      <section>
        <SectionLabel>Top 10 Most Clicked Items</SectionLabel>
        <TopItemsTable items={topItems} />
      </section>
    </main>
  )
}

// ── Small helper ──────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        margin:        '0 0 12px',
        fontSize:      '11px',
        fontWeight:    700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color:         tokens.colors.muted,
      }}
    >
      {children}
    </p>
  )
}

export const metadata = {
  title:  'Admin — GiftHint',
  robots: { index: false, follow: false },
}
