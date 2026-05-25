'use client'

/**
 * components/dashboard/PriceHistoryChart.tsx — GiftHint
 *
 * Full price-history chart for the item detail / editor panel.
 *
 * Features:
 *   - Recharts LineChart — last 90 days of price data
 *   - X axis: short date labels, thinned automatically
 *   - Y axis: formatted price, domain padded 5% above/below
 *   - Reference line at all-time lowest price with "Lowest ever: £X" label
 *   - "Current: £X" annotation pinned to the right edge
 *   - Custom active dot highlighting
 *   - Hover tooltip: price + full date
 *   - Fewer than 3 points → placeholder
 *
 * Props:
 *   history       — array from GET /api/price-history/[itemId], oldest first
 *   lowestPrice   — wishlist_items.lowest_price (may differ from min(history))
 *   currentPrice  — wishlist_items.price (latest)
 *   currency      — ISO 4217
 */

import React, { useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Label,
} from 'recharts'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PricePoint {
  price:       number
  checked_at:  string   // ISO 8601
}

export interface PriceHistoryChartProps {
  history:      PricePoint[]
  lowestPrice:  number | null
  currentPrice: number | null
  currency:     string
  accentColor?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPrice(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-GB', {
      style:                 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    const sym = currency === 'GBP' ? '£' : currency === 'USD' ? '$' : `${currency} `
    return `${sym}${amount.toFixed(2)}`
  }
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function fullDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
  })
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

interface TooltipProps {
  active?:   boolean
  payload?:  Array<{ value: number; payload: { checked_at: string } }>
  currency:  string
}

function PriceTooltip({ active, payload, currency }: TooltipProps) {
  if (!active || !payload?.length) return null
  const { value, payload: row } = payload[0]
  return (
    <div
      style={{
        background:   '#1C1C22',
        border:       '1px solid rgba(240,238,232,0.1)',
        borderRadius: '10px',
        padding:      '9px 13px',
        fontFamily:   '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        boxShadow:    '0 4px 20px rgba(0,0,0,0.4)',
      }}
    >
      <div
        style={{
          fontSize:           '16px',
          fontWeight:         800,
          color:              '#4EC99A',
          letterSpacing:      '-0.03em',
          fontVariantNumeric: 'tabular-nums',
          marginBottom:       '3px',
        }}
      >
        {formatPrice(value, currency)}
      </div>
      <div style={{ fontSize: '11px', color: '#7A7870' }}>
        {fullDate(row.checked_at)}
      </div>
    </div>
  )
}

// ── Placeholder ───────────────────────────────────────────────────────────────

function Placeholder({ message }: { message: string }) {
  return (
    <div
      style={{
        height:          '160px',
        display:         'flex',
        flexDirection:   'column',
        alignItems:      'center',
        justifyContent:  'center',
        gap:             '8px',
        backgroundColor: 'rgba(240,238,232,0.03)',
        border:          '1px dashed rgba(240,238,232,0.1)',
        borderRadius:    '12px',
      }}
    >
      <span style={{ fontSize: '22px', opacity: 0.5 }}>📈</span>
      <span
        style={{
          fontSize:   '12px',
          color:      '#7A7870',
          textAlign:  'center',
          maxWidth:   '200px',
          lineHeight: 1.5,
        }}
      >
        {message}
      </span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function PriceHistoryChart({
  history,
  lowestPrice,
  currentPrice,
  currency,
  accentColor = '#8B83F0',
}: PriceHistoryChartProps) {
  // ── Data preparation ───────────────────────────────────────────────────────
  const chartData = useMemo(
    () => history.map((p) => ({ ...p, label: shortDate(p.checked_at) })),
    [history],
  )

  if (chartData.length < 3) {
    return (
      <Placeholder
        message={
          chartData.length === 0
            ? 'No price history yet. Check back after the first daily scan.'
            : 'Tracking started — check back soon for your price trend.'
        }
      />
    )
  }

  // ── Y-axis domain ──────────────────────────────────────────────────────────
  const prices  = chartData.map((d) => d.price)
  const minData = Math.min(...prices)
  const maxData = Math.max(...prices)
  const pad     = (maxData - minData) * 0.08 || maxData * 0.05
  const yMin    = Math.max(0, minData - pad)
  const yMax    = maxData + pad

  // Lowest-price reference: use the prop (all-time low) if available, else
  // fall back to min within visible history.
  const lowestRef = lowestPrice ?? minData

  // ── X-axis tick thinning ───────────────────────────────────────────────────
  // Show at most 6 date labels to prevent crowding at small widths.
  const MAX_TICKS = 6
  const tickIndices = useMemo(() => {
    if (chartData.length <= MAX_TICKS) return chartData.map((_, i) => i)
    const step = Math.ceil(chartData.length / (MAX_TICKS - 1))
    const ticks: number[] = []
    for (let i = 0; i < chartData.length; i += step) ticks.push(i)
    if (!ticks.includes(chartData.length - 1)) ticks.push(chartData.length - 1)
    return ticks
  }, [chartData])

  const tickLabels = new Set(tickIndices.map((i) => chartData[i].label))

  return (
    <div style={{ position: 'relative' }}>
      {/* ── "Current" annotation ─────────────────────────────────────────── */}
      {currentPrice !== null && (
        <div
          style={{
            position:    'absolute',
            top:         0,
            right:       0,
            fontSize:    '11px',
            fontWeight:  700,
            color:       '#4EC99A',
            fontFamily:  '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            letterSpacing: '-0.01em',
          }}
        >
          Current: {formatPrice(currentPrice, currency)}
        </div>
      )}

      <ResponsiveContainer width="100%" height={180}>
        <LineChart
          data={chartData}
          margin={{ top: 20, right: 10, bottom: 4, left: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(240,238,232,0.05)"
            vertical={false}
          />

          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: '#7A7870', fontFamily: 'inherit' }}
            tickLine={false}
            axisLine={false}
            interval={0}
            tickFormatter={(label: string) => tickLabels.has(label) ? label : ''}
          />

          <YAxis
            domain={[yMin, yMax]}
            tickFormatter={(v: number) => formatPrice(v, currency)}
            tick={{ fontSize: 10, fill: '#7A7870', fontFamily: 'inherit' }}
            tickLine={false}
            axisLine={false}
            width={62}
          />

          <Tooltip
            content={<PriceTooltip currency={currency} />}
            isAnimationActive={false}
            cursor={{ stroke: 'rgba(240,238,232,0.12)', strokeWidth: 1 }}
          />

          {/* Lowest-ever reference line */}
          <ReferenceLine
            y={lowestRef}
            stroke="rgba(78,201,154,0.35)"
            strokeDasharray="4 3"
          >
            <Label
              value={`Lowest ever: ${formatPrice(lowestRef, currency)}`}
              position="insideTopLeft"
              style={{
                fontSize:   10,
                fill:       '#4EC99A',
                fontFamily: 'inherit',
                fontWeight: 600,
              }}
              dy={-14}
            />
          </ReferenceLine>

          <Line
            type="monotone"
            dataKey="price"
            stroke={accentColor}
            strokeWidth={2}
            dot={false}
            activeDot={{
              r:           4,
              fill:        accentColor,
              strokeWidth: 2,
              stroke:      '#0C0C0E',
            }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
