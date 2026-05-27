/**
 * components/admin/GrowthMetrics.tsx — GiftHint admin dashboard
 *
 * User growth panel showing:
 *   - New users per day (last 30 days) — Recharts AreaChart
 *   - Viral coefficient estimate: new signups this week / gifter page views last week
 *   - Top referring wishlists: public lists driving the most new signups via viral CTA
 *
 * Client component (Recharts requires browser).
 *
 * Props:
 *   data — GrowthData fetched server-side in admin/page.tsx
 */

'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { tokens } from '@/tokens'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DailySignup {
  date:  string   // 'YYYY-MM-DD'
  users: number
}

export interface TopReferrer {
  wisher_username: string
  wishlist_slug:   string
  wishlist_title:  string
  cta_clicks:      number
}

export interface GrowthData {
  daily_signups:      DailySignup[]
  total_new_users:    number          // last 30 days
  viral_coefficient:  number          // new users this week / gifter views last week
  top_referrers:      TopReferrer[]   // up to 10
}

interface GrowthMetricsProps {
  data: GrowthData
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function shortDate(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${parseInt(m)}/${parseInt(d)}`
}

function viralLabel(k: number): { text: string; colour: string } {
  if (k >= 1.5)  return { text: 'Viral growth',        colour: tokens.colors.green  }
  if (k >= 1.0)  return { text: 'Sustainable growth',  colour: tokens.colors.green  }
  if (k >= 0.5)  return { text: 'Moderate growth',     colour: tokens.colors.amber  }
  return           { text: 'Sub-viral',                 colour: tokens.colors.muted  }
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

function GrowthTooltip({
  active,
  payload,
}: {
  active?:  boolean
  payload?: Array<{ payload: DailySignup }>
}) {
  if (!active || !payload?.length) return null
  const { date, users } = payload[0].payload
  return (
    <div
      style={{
        background:   tokens.colors.surface,
        border:       `1px solid ${tokens.colors.border}`,
        borderRadius: tokens.radius.sm,
        padding:      '7px 11px',
        fontSize:     '12px',
        color:        tokens.colors.text,
        boxShadow:    tokens.shadow.pop,
      }}
    >
      <span style={{ color: tokens.colors.muted }}>{shortDate(date)}</span>
      {'  '}
      <strong style={{ color: tokens.colors.purple }}>
        {users} {users === 1 ? 'signup' : 'signups'}
      </strong>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function GrowthMetrics({ data }: GrowthMetricsProps) {
  const viral       = viralLabel(data.viral_coefficient)
  const maxSignups  = Math.max(...data.daily_signups.map((d) => d.users), 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* ── KPI row ──────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>

        {/* Total new users */}
        <div
          style={{
            flex:          '1 1 160px',
            padding:       '16px 20px',
            borderRadius:  tokens.radius.lg,
            background:    tokens.colors.surface2,
            border:        `1px solid ${tokens.colors.border}`,
          }}
        >
          <p style={{ margin: '0 0 4px', fontSize: '11px', fontWeight: 700, color: tokens.colors.muted, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            New users (30d)
          </p>
          <p
            style={{
              margin:        0,
              fontSize:      '32px',
              fontWeight:    700,
              color:         tokens.colors.purple,
              letterSpacing: '-0.03em',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {data.total_new_users.toLocaleString('en-US')}
          </p>
        </div>

        {/* Viral coefficient */}
        <div
          style={{
            flex:          '1 1 200px',
            padding:       '16px 20px',
            borderRadius:  tokens.radius.lg,
            background:    tokens.colors.surface2,
            border:        `1px solid ${tokens.colors.border}`,
          }}
        >
          <p style={{ margin: '0 0 4px', fontSize: '11px', fontWeight: 700, color: tokens.colors.muted, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Viral coefficient (K)
          </p>
          <p
            style={{
              margin:        '0 0 4px',
              fontSize:      '32px',
              fontWeight:    700,
              color:         viral.colour,
              letterSpacing: '-0.03em',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {data.viral_coefficient.toFixed(2)}
          </p>
          <p style={{ margin: 0, fontSize: '12px', color: viral.colour, fontWeight: 600 }}>
            {viral.text}
          </p>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: tokens.colors.muted, lineHeight: 1.5 }}>
            New signups this week ÷ gifter page views last week.{' '}
            K ≥ 1.0 = self-sustaining growth.
          </p>
        </div>
      </div>

      {/* ── Daily signups AreaChart ───────────────────────────────────────────── */}
      <div
        style={{
          background:   tokens.colors.surface2,
          border:       `1px solid ${tokens.colors.border}`,
          borderRadius: tokens.radius.lg,
          padding:      '16px 16px 8px',
        }}
      >
        <p style={{ margin: '0 0 12px', fontSize: '12px', fontWeight: 700, color: tokens.colors.text }}>
          New signups — last 30 days
        </p>

        {maxSignups === 1 && data.total_new_users === 0 ? (
          <div
            style={{
              height:         '120px',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              fontSize:       '12px',
              color:          tokens.colors.muted,
              fontStyle:      'italic',
            }}
          >
            No signup data yet.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={120}>
            <AreaChart
              data={data.daily_signups}
              margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
            >
              <defs>
                <linearGradient id="growth-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={tokens.colors.purple} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={tokens.colors.purple} stopOpacity={0.02} />
                </linearGradient>
              </defs>

              <XAxis
                dataKey="date"
                tickFormatter={shortDate}
                tick={{ fill: tokens.colors.muted, fontSize: 10 }}
                tickLine={false}
                axisLine={{ stroke: tokens.colors.border }}
                interval={6}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: tokens.colors.muted, fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={28}
              />
              <Tooltip content={<GrowthTooltip />} cursor={{ stroke: tokens.colors.border, strokeWidth: 1 }} />

              <Area
                type="monotone"
                dataKey="users"
                stroke={tokens.colors.purple}
                strokeWidth={2}
                fill="url(#growth-grad)"
                dot={false}
                activeDot={{ r: 3, fill: tokens.colors.purple, strokeWidth: 0 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Top referring wishlists ───────────────────────────────────────────── */}
      <div
        style={{
          borderRadius: tokens.radius.lg,
          border:       `1px solid ${tokens.colors.border}`,
          overflow:     'hidden',
          background:   tokens.colors.surface,
        }}
      >
        {/* Header */}
        <div
          style={{
            padding:    '10px 16px',
            borderBottom: `1px solid ${tokens.colors.border}`,
            background: tokens.colors.surface2,
            display:    'grid',
            gridTemplateColumns: '1fr 90px',
            gap:        '0 12px',
          }}
        >
          {['Top referring wishlists', 'CTA clicks'].map((h) => (
            <span
              key={h}
              style={{
                fontSize:      '10px',
                fontWeight:    700,
                color:         tokens.colors.muted,
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
              }}
            >
              {h}
            </span>
          ))}
        </div>

        {data.top_referrers.length === 0 ? (
          <p style={{ margin: 0, padding: '14px 16px', fontSize: '13px', color: tokens.colors.muted, fontStyle: 'italic' }}>
            No referral data yet.
          </p>
        ) : (
          data.top_referrers.map((ref, i) => {
            const barWidth = `${Math.round((ref.cta_clicks / (data.top_referrers[0]?.cta_clicks || 1)) * 100)}%`
            const isTop = i < 3

            return (
              <div
                key={`${ref.wisher_username}/${ref.wishlist_slug}`}
                style={{
                  display:             'grid',
                  gridTemplateColumns: '1fr 90px',
                  gap:                 '0 12px',
                  padding:             '10px 16px',
                  borderBottom:        i < data.top_referrers.length - 1
                    ? `1px solid ${tokens.colors.border}`
                    : 'none',
                  alignItems:          'center',
                  background:          isTop ? 'rgba(139, 131, 240, 0.03)' : 'transparent',
                }}
              >
                {/* List name + owner + bar */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '3px' }}>
                    <span
                      style={{
                        fontSize:     '13px',
                        fontWeight:   isTop ? 600 : 400,
                        color:        tokens.colors.text,
                        overflow:     'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace:   'nowrap',
                        maxWidth:     '240px',
                        display:      'inline-block',
                      }}
                    >
                      {ref.wishlist_title || ref.wishlist_slug}
                    </span>
                    <span style={{ fontSize: '11px', color: tokens.colors.muted, whiteSpace: 'nowrap' }}>
                      @{ref.wisher_username}
                    </span>
                  </div>
                  {/* Relative bar */}
                  <div
                    style={{
                      height:       '3px',
                      borderRadius: '9999px',
                      background:   tokens.colors.surface2,
                      overflow:     'hidden',
                    }}
                  >
                    <div
                      style={{
                        height:       '100%',
                        width:        barWidth,
                        borderRadius: '9999px',
                        background:   tokens.colors.purple,
                        opacity:      0.55,
                      }}
                    />
                  </div>
                </div>

                {/* CTA click count */}
                <span
                  style={{
                    fontSize:           '13px',
                    fontWeight:         600,
                    color:              tokens.colors.text,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {ref.cta_clicks.toLocaleString('en-US')}
                </span>
              </div>
            )
          })
        )}

        {/* Footer */}
        <div
          style={{
            padding:    '10px 16px',
            borderTop:  `1px solid ${tokens.colors.border}`,
            background: tokens.colors.surface2,
            fontSize:   '11px',
            color:      tokens.colors.muted,
            lineHeight: 1.5,
          }}
        >
          CTA clicks = gifters who tapped the "Sign up and add to your own list" prompt
          on a public wishlist page. High CTA count = strong organic acquisition funnel.
        </div>
      </div>
    </div>
  )
}
