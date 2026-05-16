/**
 * components/admin/RevenueFunnel.tsx — GiftHint admin dashboard
 *
 * Horizontal funnel chart showing the 30-day conversion pipeline:
 *   Page Views → Buy Clicks → Claims → Est. Revenue
 *
 * Rendered as a Recharts BarChart with layout="vertical" so bars grow
 * left-to-right. Each bar is sized relative to the top-of-funnel (views),
 * making drop-off visual without any D3 dependency.
 *
 * Drop-off % labels are shown to the right of each bar.
 *
 * Props:
 *   data — FunnelData fetched server-side in admin/page.tsx
 */

'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { tokens } from '@/tokens'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FunnelData {
  views:       number
  buy_clicks:  number
  claims:      number
  est_revenue: number   // dollar value — shown as annotation, not a bar
}

interface RevenueFunnelProps {
  data: FunnelData
}

// ── Derived funnel rows ───────────────────────────────────────────────────────

interface FunnelRow {
  step:        string
  value:       number
  pct:         number    // relative to top of funnel (views)
  dropOffPct:  number | null   // vs. the preceding step; null for first step
  colour:      string
}

function buildRows(d: FunnelData): FunnelRow[] {
  const baseline = d.views || 1   // guard /0

  const pct = (n: number) => Math.round((n / baseline) * 100)
  const drop = (a: number, b: number) =>
    a === 0 ? null : Math.round(((a - b) / a) * 100)

  return [
    {
      step:       'Page views',
      value:      d.views,
      pct:        100,
      dropOffPct: null,
      colour:     tokens.colors.purple,
    },
    {
      step:       'Buy clicks',
      value:      d.buy_clicks,
      pct:        pct(d.buy_clicks),
      dropOffPct: drop(d.views, d.buy_clicks),
      colour:     '#7C9EE8',   // blue-purple
    },
    {
      step:       'Claims',
      value:      d.claims,
      pct:        pct(d.claims),
      dropOffPct: drop(d.buy_clicks, d.claims),
      colour:     tokens.colors.green,
    },
  ]
}

// ── Custom Y-axis tick ────────────────────────────────────────────────────────

function StepTick({ x, y, payload }: {
  x?: number; y?: number; payload?: { value: string }
}) {
  return (
    <text
      x={x}
      y={y}
      dy={4}
      textAnchor="end"
      fill={tokens.colors.muted}
      fontSize={11}
      fontFamily={tokens.font.sans}
    >
      {payload?.value ?? ''}
    </text>
  )
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

function FunnelTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: FunnelRow }>
}) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload

  return (
    <div
      style={{
        background:   tokens.colors.surface,
        border:       `1px solid ${tokens.colors.border}`,
        borderRadius: tokens.radius.sm,
        padding:      '8px 12px',
        fontSize:     '12px',
        color:        tokens.colors.text,
        boxShadow:    tokens.shadow.pop,
        minWidth:     '160px',
      }}
    >
      <p style={{ margin: '0 0 4px', fontWeight: 700, color: row.colour }}>
        {row.step}
      </p>
      <p style={{ margin: '0 0 2px', color: tokens.colors.muted }}>
        Count:{' '}
        <strong style={{ color: tokens.colors.text }}>
          {row.value.toLocaleString('en-US')}
        </strong>
      </p>
      <p style={{ margin: 0, color: tokens.colors.muted }}>
        Of views:{' '}
        <strong style={{ color: tokens.colors.text }}>{row.pct}%</strong>
      </p>
      {row.dropOffPct !== null && (
        <p style={{ margin: '4px 0 0', color: tokens.colors.red, fontSize: '11px' }}>
          ↓ {row.dropOffPct}% dropped off from previous step
        </p>
      )}
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function RevenueFunnel({ data }: RevenueFunnelProps) {
  const rows = buildRows(data)

  const fmtUsd = (n: number) =>
    n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* ── Horizontal BarChart ──────────────────────────────────────────────── */}
      <ResponsiveContainer width="100%" height={140}>
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 4, right: 48, left: 88, bottom: 4 }}
          barCategoryGap="28%"
        >
          <XAxis
            type="number"
            domain={[0, data.views || 1]}
            tick={{ fill: tokens.colors.muted, fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: tokens.colors.border }}
            tickFormatter={(v: number) =>
              v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)
            }
          />
          <YAxis
            type="category"
            dataKey="step"
            width={84}
            tick={<StepTick />}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<FunnelTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={28} isAnimationActive={false}>
            {rows.map((row) => (
              <Cell key={row.step} fill={row.colour} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* ── Drop-off annotation row ───────────────────────────────────────── */}
      <div
        style={{
          display:    'flex',
          gap:        '8px',
          flexWrap:   'wrap',
          paddingLeft: '92px',   // align under bars
        }}
      >
        {rows.map((row, i) => (
          <div
            key={row.step}
            style={{
              flex:         '1 1 auto',
              minWidth:     '110px',
              padding:      '8px 10px',
              borderRadius: tokens.radius.md,
              background:   tokens.colors.surface2,
              border:       `1px solid ${tokens.colors.border}`,
            }}
          >
            <p style={{ margin: '0 0 2px', fontSize: '10px', color: tokens.colors.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {row.step}
            </p>
            <p style={{ margin: '0 0 2px', fontSize: '17px', fontWeight: 700, color: row.colour, letterSpacing: '-0.02em' }}>
              {row.value.toLocaleString('en-US')}
            </p>
            {i > 0 && row.dropOffPct !== null && (
              <p style={{ margin: 0, fontSize: '11px', color: tokens.colors.red }}>
                ↓ {row.dropOffPct}% drop-off
              </p>
            )}
          </div>
        ))}

        {/* Est. revenue tile — not a bar, shown as an annotation */}
        <div
          style={{
            flex:         '1 1 auto',
            minWidth:     '110px',
            padding:      '8px 10px',
            borderRadius: tokens.radius.md,
            background:   tokens.colors.greenDim,
            border:       `1px solid ${tokens.colors.greenRing}`,
          }}
        >
          <p style={{ margin: '0 0 2px', fontSize: '10px', color: tokens.colors.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Est. Commission
          </p>
          <p style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: tokens.colors.green, letterSpacing: '-0.02em' }}>
            {fmtUsd(data.est_revenue)}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: '11px', color: tokens.colors.muted }}>
            from {data.claims.toLocaleString()} claims
          </p>
        </div>
      </div>
    </div>
  )
}
