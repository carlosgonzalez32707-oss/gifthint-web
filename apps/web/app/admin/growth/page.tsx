/**
 * app/admin/growth/page.tsx — GiftHint admin growth dashboard
 *
 * Route: /admin/growth
 *
 * Server Component — all data fetched at render time, no client JS except
 * the Recharts chart (GrowthChart, 'use client').
 *
 * ACCESS
 * ──────
 * Guarded by the same `gh_admin` cookie pattern as /admin/page.tsx.
 * The middleware covers /admin/* so no extra middleware config is needed.
 * This page does a second check to prevent direct access if the cookie
 * is somehow cleared while the middleware cache is warm.
 *
 * DATA
 * ────
 * Reads three views created in 20260518_growth_metrics_view.sql:
 *   growth_kpis              → single-row KPI scalars
 *   weekly_signup_breakdown  → 12 rows (one per week), for GrowthChart
 *   cohort_retention         → 12 rows (one per cohort), for RetentionCohort
 *
 * KPI CARDS
 * ─────────
 *   1. Viral K   — avg referrals per retained user, last 30 days
 *   2. WAW       — Weekly Active Wishers (wishlist saves, last 7d)
 *   3. RPU       — Revenue Per User (lifetime pence / total users)
 *   4. D30       — % activated users still active at 30 days
 */

import { cookies }           from 'next/headers'
import { redirect }          from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'
import { tokens }            from '@/tokens'
import { GrowthChart }       from '@/components/admin/GrowthChart'
import { RetentionCohort }   from '@/components/admin/RetentionCohort'
import type { WeeklySignupRow } from '@/components/admin/GrowthChart'
import type { CohortRow }       from '@/components/admin/RetentionCohort'

// ── Types ─────────────────────────────────────────────────────────────────────

interface GrowthKpis {
  total_users:             number
  weekly_active_wishers:   number
  viral_k:                 number
  revenue_per_user_pence:  number
  d30_retention_pct:       number | null
}

// ── Auth guard ────────────────────────────────────────────────────────────────

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? ''

function assertAdmin() {
  const jar         = cookies()
  const adminCookie = jar.get('gh_admin')
  if (!ADMIN_SECRET || !adminCookie || adminCookie.value !== ADMIN_SECRET) {
    redirect('/')
  }
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchGrowthData(): Promise<{
  kpis:      GrowthKpis
  weekly:    WeeklySignupRow[]
  cohorts:   CohortRow[]
}> {
  const supabase = createServerClient()

  const [kpisResult, weeklyResult, cohortResult] = await Promise.all([
    supabase.from('growth_kpis').select('*').maybeSingle(),
    supabase.from('weekly_signup_breakdown').select('*'),
    supabase.from('cohort_retention').select('*'),
  ])

  const kpis: GrowthKpis = kpisResult.data ?? {
    total_users:            0,
    weekly_active_wishers:  0,
    viral_k:                0,
    revenue_per_user_pence: 0,
    d30_retention_pct:      null,
  }

  const weekly: WeeklySignupRow[] = (weeklyResult.data ?? []).map((r) => ({
    week:     r.week     as string,
    weekIso:  r.week_iso as string,
    organic:  Number(r.organic  ?? 0),
    referral: Number(r.referral ?? 0),
    partner:  Number(r.partner  ?? 0),
  }))

  const cohorts: CohortRow[] = (cohortResult.data ?? []).map((r) => ({
    week:        r.week      as string,
    weekIso:     r.week_iso  as string,
    cohortSize:  Number(r.cohort_size ?? 0),
    w1:          r.w1  !== null ? Number(r.w1)  : null,
    w2:          r.w2  !== null ? Number(r.w2)  : null,
    w4:          r.w4  !== null ? Number(r.w4)  : null,
    w8:          r.w8  !== null ? Number(r.w8)  : null,
  }))

  return { kpis, weekly, cohorts }
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label:  string
  value:  string
  sub:    string
  accent: string
}) {
  const c = tokens.colors

  return (
    <div
      style={{
        background:   c.surface,
        border:       `1px solid ${c.border}`,
        borderRadius: tokens.radius.lg,
        padding:      '20px 24px',
        display:      'flex',
        flexDirection: 'column',
        gap:          '6px',
      }}
    >
      <p
        style={{
          margin:        0,
          fontSize:      '10px',
          fontWeight:    600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color:         c.muted,
        }}
      >
        {label}
      </p>
      <p
        style={{
          margin:        0,
          fontSize:      '28px',
          fontWeight:    800,
          letterSpacing: '-0.03em',
          color:         accent,
          fontVariantNumeric: 'tabular-nums',
          lineHeight:    1,
        }}
      >
        {value}
      </p>
      <p
        style={{
          margin:   0,
          fontSize: '11px',
          color:    c.muted,
          lineHeight: 1.4,
        }}
      >
        {sub}
      </p>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function GrowthPage() {
  assertAdmin()

  const { kpis, weekly, cohorts } = await fetchGrowthData()
  const c = tokens.colors

  // ── KPI formatting ──────────────────────────────────────────────────────────

  const viralK     = kpis.viral_k.toFixed(2)
  const waw        = kpis.weekly_active_wishers.toLocaleString('en-US')
  const rpuPounds  = (kpis.revenue_per_user_pence / 100).toFixed(1)
  const d30        = kpis.d30_retention_pct !== null
    ? `${kpis.d30_retention_pct.toFixed(1)}%`
    : '—'

  const totalUsers = kpis.total_users

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        minHeight:  '100vh',
        background: c.bg,
        fontFamily: tokens.font.sans,
        color:      c.text,
        padding:    '32px 24px 80px',
        boxSizing:  'border-box',
      }}
    >
      <div style={{ maxWidth: '1080px', margin: '0 auto' }}>

        {/* ── Page header ───────────────────────────────────────────────────── */}
        <div
          style={{
            display:        'flex',
            justifyContent: 'space-between',
            alignItems:     'flex-end',
            marginBottom:   '32px',
            flexWrap:       'wrap',
            gap:            '12px',
          }}
        >
          <div>
            <div
              style={{
                display:      'flex',
                alignItems:   'center',
                gap:          '10px',
                marginBottom: '6px',
              }}
            >
              <a
                href="/admin"
                style={{
                  fontSize:      '12px',
                  color:         c.muted,
                  textDecoration: 'none',
                }}
              >
                ← Admin
              </a>
            </div>
            <h1
              style={{
                margin:        0,
                fontSize:      '22px',
                fontWeight:    800,
                letterSpacing: '-0.03em',
                color:         c.text,
              }}
            >
              Growth dashboard
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: c.muted }}>
              {totalUsers.toLocaleString('en-US')} total users ·{' '}
              Phase 3 North Star tracking
            </p>
          </div>

          {/* Target badge */}
          <div
            style={{
              background:   c.purpleDim,
              border:       `1px solid ${c.purpleRing}`,
              borderRadius: tokens.radius.pill,
              padding:      '6px 16px',
              fontSize:     '12px',
              fontWeight:   600,
              color:        c.purple,
              whiteSpace:   'nowrap',
            }}
          >
            Target: 10,000 users
          </div>
        </div>

        {/* ── KPI cards ─────────────────────────────────────────────────────── */}
        <div
          style={{
            display:             'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap:                 '16px',
            marginBottom:        '28px',
          }}
        >
          <KpiCard
            label="Viral K-factor"
            value={viralK}
            sub="Referral signups (30d) ÷ retained users"
            accent={Number(viralK) >= 0.5 ? c.green : c.amber}
          />
          <KpiCard
            label="Weekly Active Wishers"
            value={waw}
            sub="Unique users who saved an item in last 7 days"
            accent={c.purple}
          />
          <KpiCard
            label="Revenue per user"
            value={`£${rpuPounds}p`}
            sub="Lifetime est. affiliate commission ÷ total users"
            accent={c.amber}
          />
          <KpiCard
            label="D30 retention"
            value={d30}
            sub="Activated users still active at 30 days"
            accent={
              kpis.d30_retention_pct !== null && kpis.d30_retention_pct >= 40
                ? c.green
                : kpis.d30_retention_pct !== null && kpis.d30_retention_pct >= 20
                  ? c.amber
                  : c.muted
            }
          />
        </div>

        {/* ── Growth chart ──────────────────────────────────────────────────── */}
        <div style={{ marginBottom: '28px' }}>
          <GrowthChart
            data={weekly}
            totalUsers={totalUsers}
            targetUsers={10_000}
          />
        </div>

        {/* ── Retention cohort table ────────────────────────────────────────── */}
        <RetentionCohort rows={cohorts} />

        {/* ── Footer ────────────────────────────────────────────────────────── */}
        <p
          style={{
            marginTop:  '40px',
            fontSize:   '11px',
            color:      c.muted,
            textAlign:  'center',
            lineHeight: 1.6,
          }}
        >
          Data is live from Supabase at render time · KPIs use simplified
          definitions — see{' '}
          <span style={{ color: c.text }}>growth-targets.md</span> for full
          methodology
        </p>
      </div>
    </div>
  )
}
