/**
 * components/admin/GrowthChart.tsx — GiftHint admin growth dashboard
 *
 * Stacked area chart: weekly new signups split by acquisition channel
 * (organic / referral / partner) over the last 12 weeks.
 *
 * Also renders:
 *   - A ReferenceLine at 10,000 users (North Star target)
 *   - A countdown badge: "N weeks to target at current pace"
 *
 * Client component — Recharts requires browser.
 */

'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import { tokens } from '@/tokens'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WeeklySignupRow {
  /** Week label, e.g. "Jun 2" */
  week:     string
  /** ISO date string for the first day of this week (used for sorting) */
  weekIso:  string
  /** Signups with no referred_by */
  organic:  number
  /** Signups referred by another user */
  referral: number
  /** Signups attributed to a partner page */
  partner:  number
}

export interface GrowthChartProps {
  data:         WeeklySignupRow[]
  totalUsers:   number
  targetUsers?: number  // defaults to 10_000
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_TARGET = 10_000

// ── Helpers ───────────────────────────────────────────────────────────────────

function weeksToTarget(data: WeeklySignupRow[], totalUsers: number, target: number): number | null {
  if (data.length < 2) return null
  const last  = data[data.length - 1]
  const prev  = data[data.length - 2]
  const weeklyNew = (last.organic + last.referral + last.partner)
    + (prev.organic + prev.referral + prev.partner)
  const avgPerWeek = weeklyNew / 2
  if (avgPerWeek <= 0) return null
  const remaining = target - totalUsers
  if (remaining <= 0) return 0
  return Math.ceil(remaining / avgPerWeek)
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

interface TooltipPayload {
  name:  string
  value: number
  color: string
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?:  boolean
  payload?: TooltipPayload[]
  label?:   string
}) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, p) => s + (p.value ?? 0), 0)
  const c = tokens.colors

  return (
    <div
      style={{
        background:   c.surface,
        border:       `1px solid ${c.border}`,
        borderRadius: tokens.radius.md,
        padding:      '10px 14px',
        fontSize:     '12px',
        color:        c.text,
        boxShadow:    tokens.shadow.pop,
        minWidth:     '140px',
      }}
    >
      <p style={{ margin: '0 0 8px', fontWeight: 700, color: c.muted }}>{label}</p>
      {[...payload].reverse().map((p) => (
        <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', marginBottom: '4px' }}>
          <span style={{ color: p.color }}>{p.name}</span>
          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{p.value}</span>
        </div>
      ))}
      <div
        style={{
          marginTop:  '8px',
          paddingTop: '8px',
          borderTop:  `1px solid ${c.border}`,
          display:    'flex',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ color: c.muted }}>Total</span>
        <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{total}</span>
      </div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function GrowthChart({
  data,
  totalUsers,
  targetUsers = DEFAULT_TARGET,
}: GrowthChartProps) {
  const c           = tokens.colors
  const weeks       = weeksToTarget(data, totalUsers, targetUsers)
  const atTarget    = totalUsers >= targetUsers
  const pct         = Math.min(100, Math.round((totalUsers / targetUsers) * 100))

  const hasData = data.some((d) => d.organic + d.referral + d.partner > 0)

  return (
    <div
      style={{
        background:   c.surface,
        border:       `1px solid ${c.border}`,
        borderRadius: tokens.radius.lg,
        padding:      '24px',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          display:        'flex',
          justifyContent: 'space-between',
          alignItems:     'flex-start',
          marginBottom:   '20px',
          flexWrap:       'wrap',
          gap:            '12px',
        }}
      >
        <div>
          <h2
            style={{
              margin:        0,
              fontSize:      '14px',
              fontWeight:    700,
              color:         c.text,
              letterSpacing: '-0.02em',
            }}
          >
            Weekly signups — last 12 weeks
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: c.muted }}>
            Organic · Referral · Partner
          </p>
        </div>

        {/* Target countdown badge */}
        <div
          style={{
            background:   atTarget ? c.greenDim : c.purpleDim,
            border:       `1px solid ${atTarget ? c.greenRing : c.purpleRing}`,
            borderRadius: tokens.radius.pill,
            padding:      '6px 14px',
            fontSize:     '12px',
            fontWeight:   600,
            color:        atTarget ? c.green : c.purple,
            whiteSpace:   'nowrap',
          }}
        >
          {atTarget
            ? '🎉 Target reached!'
            : weeks !== null
              ? `~${weeks}w to ${targetUsers.toLocaleString('en-US')} users`
              : `${pct}% to ${targetUsers.toLocaleString('en-US')} users`}
        </div>
      </div>

      {/* ── Progress bar to target ─────────────────────────────────────────── */}
      <div
        style={{
          height:       '4px',
          borderRadius: tokens.radius.pill,
          background:   c.surface2,
          marginBottom: '24px',
          overflow:     'hidden',
        }}
      >
        <div
          style={{
            height:       '100%',
            width:        `${pct}%`,
            borderRadius: tokens.radius.pill,
            background:   atTarget ? c.green : c.purple,
            transition:   'width 0.6s ease',
          }}
        />
      </div>

      {/* ── Chart ──────────────────────────────────────────────────────────── */}
      {!hasData ? (
        <div
          style={{
            height:         '200px',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            fontSize:       '13px',
            color:          c.muted,
            fontStyle:      'italic',
          }}
        >
          No weekly signup data yet.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart
            data={data}
            margin={{ top: 10, right: 4, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="grad-organic"  x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={c.purple} stopOpacity={0.4} />
                <stop offset="100%" stopColor={c.purple} stopOpacity={0.03} />
              </linearGradient>
              <linearGradient id="grad-referral" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={c.green}  stopOpacity={0.4} />
                <stop offset="100%" stopColor={c.green}  stopOpacity={0.03} />
              </linearGradient>
              <linearGradient id="grad-partner"  x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={c.amber}  stopOpacity={0.4} />
                <stop offset="100%" stopColor={c.amber}  stopOpacity={0.03} />
              </linearGradient>
            </defs>

            <CartesianGrid
              strokeDasharray="3 3"
              stroke={c.border}
              vertical={false}
            />

            <XAxis
              dataKey="week"
              tick={{ fill: c.muted, fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: c.border }}
              interval={1}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: c.muted, fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={32}
            />

            <Tooltip content={<ChartTooltip />} cursor={{ stroke: c.border, strokeWidth: 1 }} />

            <Legend
              wrapperStyle={{ fontSize: '11px', color: c.muted, paddingTop: '12px' }}
              iconType="circle"
              iconSize={8}
            />

            {/* Target line */}
            {totalUsers < targetUsers && (
              <ReferenceLine
                y={targetUsers}
                stroke={c.amberRing}
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value:    `Target: ${targetUsers.toLocaleString()}`,
                  position: 'insideTopRight',
                  fill:     c.amber,
                  fontSize: 10,
                  fontWeight: 600,
                }}
              />
            )}

            <Area
              type="monotone"
              dataKey="organic"
              name="Organic"
              stackId="1"
              stroke={c.purple}
              strokeWidth={1.5}
              fill="url(#grad-organic)"
              dot={false}
              activeDot={{ r: 3, fill: c.purple, strokeWidth: 0 }}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="referral"
              name="Referral"
              stackId="1"
              stroke={c.green}
              strokeWidth={1.5}
              fill="url(#grad-referral)"
              dot={false}
              activeDot={{ r: 3, fill: c.green, strokeWidth: 0 }}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="partner"
              name="Partner"
              stackId="1"
              stroke={c.amber}
              strokeWidth={1.5}
              fill="url(#grad-partner)"
              dot={false}
              activeDot={{ r: 3, fill: c.amber, strokeWidth: 0 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}

      {/* ── Footer legend ───────────────────────────────────────────────────── */}
      <div
        style={{
          marginTop:  '16px',
          paddingTop: '14px',
          borderTop:  `1px solid ${c.border}`,
          fontSize:   '11px',
          color:      c.muted,
          lineHeight: 1.6,
        }}
      >
        <strong style={{ color: c.text }}>Organic:</strong> no referral code at signup ·{' '}
        <strong style={{ color: c.text }}>Referral:</strong> signed up via another user's /r/[code] link ·{' '}
        <strong style={{ color: c.text }}>Partner:</strong> signed up via /partners/[slug] page
      </div>
    </div>
  )
}
