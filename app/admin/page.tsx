/**
 * app/admin/page.tsx — GiftHint internal revenue dashboard
 *
 * Server component — all data is fetched at render time, zero client JS
 * except for the Recharts LineChart (which is in RevenueChart.tsx).
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
import type { TopItem }      from '@/components/admin/TopItemsTable'
import type { DailyClickRow } from '@/components/admin/RevenueChart'
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
  // Last 30 days, grouped by date + affiliate_network
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('click_events')
    .select('clicked_at, affiliate_network')
    .gte('clicked_at', since)

  if (error || !data) return []

  // Aggregate by date × network
  const map = new Map<string, { amazon: number; skimlinks: number }>()

  for (const row of data as { clicked_at: string; affiliate_network: string }[]) {
    const date = row.clicked_at.slice(0, 10)   // YYYY-MM-DD
    if (!map.has(date)) map.set(date, { amazon: 0, skimlinks: 0 })
    const entry = map.get(date)!
    if (row.affiliate_network === 'amazon_associates') entry.amazon++
    else if (row.affiliate_network === 'skimlinks')    entry.skimlinks++
  }

  // Fill in all 30 days so the chart has no gaps
  const rows: DailyClickRow[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
    const date = d.toISOString().slice(0, 10)
    const entry = map.get(date) ?? { amazon: 0, skimlinks: 0 }
    rows.push({ date, amazon: entry.amazon, skimlinks: entry.skimlinks })
  }

  return rows
}

async function fetchTopItems(
  supabase: ReturnType<typeof createServerClient>,
): Promise<TopItem[]> {
  // Click counts per item — aggregate in JS since Supabase doesn't support
  // GROUP BY in the JS client without raw SQL or RPC.
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

// ── Page ───────────────────────────────────────────────────────────────────────

interface AdminPageProps {
  searchParams: Record<string, string | string[] | undefined>
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  // ── Guard: ADMIN_EMAIL must be configured ──────────────────────────────────
  const adminEmail = process.env.ADMIN_EMAIL
  if (!adminEmail) notFound()

  // ── Cookie seeding (first-time setup) ─────────────────────────────────────
  // If ?secret=... matches ADMIN_SECRET, set the admin cookie and redirect.
  const incomingSecret  = typeof searchParams.secret === 'string'
    ? searchParams.secret
    : null
  const configuredSecret = process.env.ADMIN_SECRET

  if (incomingSecret && configuredSecret && incomingSecret === configuredSecret) {
    // Set the cookie and redirect to the clean URL
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
  const [stats, dailyClicks, topItems] = await Promise.all([
    fetchStats(supabase),
    fetchDailyClicks(supabase),
    fetchTopItems(supabase),
  ])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <main
      style={{
        minHeight:   '100vh',
        background:  tokens.colors.bg,
        color:       tokens.colors.text,
        fontFamily:  tokens.font.sans,
        padding:     '32px 24px 64px',
        maxWidth:    '1200px',
        margin:      '0 auto',
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
              fontSize:   '11px',
              fontWeight: 600,
              padding:    '4px 10px',
              borderRadius: tokens.radius.pill,
              background: tokens.colors.purpleDim,
              color:      tokens.colors.purple,
              border:     `1px solid ${tokens.colors.purpleRing}`,
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
