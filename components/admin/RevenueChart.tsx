/**
 * components/admin/RevenueChart.tsx — GiftHint admin dashboard
 *
 * Recharts LineChart showing Amazon Associates vs Skimlinks click volume
 * for the last 30 days. Client component — Recharts requires browser APIs.
 */

'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { tokens } from '@/tokens'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface DailyClickRow {
  /** ISO date string: YYYY-MM-DD */
  date:      string
  amazon:    number
  skimlinks: number
}

interface RevenueChartProps {
  data: DailyClickRow[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format "2025-05-14" → "May 14" for the X axis */
function formatXAxis(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────

interface TooltipPayloadEntry {
  name:  string
  value: number
  color: string
}

interface CustomTooltipProps {
  active?:  boolean
  payload?: TooltipPayloadEntry[]
  label?:   string
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length || !label) return null

  const dateLabel = formatXAxis(label)
  const total     = payload.reduce((s, e) => s + e.value, 0)

  return (
    <div
      style={{
        background:   tokens.colors.surface2,
        border:       `1px solid ${tokens.colors.borderSoft}`,
        borderRadius: tokens.radius.md,
        padding:      '10px 14px',
        fontSize:     '12px',
        fontFamily:   tokens.font.sans,
        boxShadow:    tokens.shadow.pop,
        minWidth:     '160px',
      }}
    >
      <p
        style={{
          margin:     '0 0 8px',
          fontWeight: 700,
          color:      tokens.colors.text,
        }}
      >
        {dateLabel}
      </p>

      {payload.map((entry) => (
        <div
          key={entry.name}
          style={{
            display:        'flex',
            justifyContent: 'space-between',
            gap:            '16px',
            color:          entry.color,
            marginBottom:   '4px',
          }}
        >
          <span>{entry.name}</span>
          <span style={{ fontWeight: 600 }}>{entry.value.toLocaleString()}</span>
        </div>
      ))}

      {payload.length > 1 && (
        <div
          style={{
            display:        'flex',
            justifyContent: 'space-between',
            gap:            '16px',
            color:          tokens.colors.muted,
            marginTop:      '6px',
            paddingTop:     '6px',
            borderTop:      `1px solid ${tokens.colors.border}`,
          }}
        >
          <span>Total</span>
          <span style={{ fontWeight: 600, color: tokens.colors.text }}>
            {total.toLocaleString()}
          </span>
        </div>
      )}
    </div>
  )
}

// ── Chart ─────────────────────────────────────────────────────────────────────

const PURPLE = tokens.colors.purple    // Amazon Associates line
const GREEN  = tokens.colors.green     // Skimlinks line

/**
 * Renders a 30-day dual-line click chart. Expects `data` to already have
 * one entry per day (gaps filled with zeros by the server).
 */
export function RevenueChart({ data }: RevenueChartProps) {
  // Show only every 5th label to avoid X axis crowding
  const tickIndices = new Set(
    data
      .map((_, i) => i)
      .filter((i) => i % 5 === 0 || i === data.length - 1),
  )

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart
        data={data}
        margin={{ top: 4, right: 8, bottom: 0, left: -8 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke={tokens.colors.border}
          vertical={false}
        />

        <XAxis
          dataKey="date"
          tick={{ fill: tokens.colors.muted, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(val: string, i: number) =>
            tickIndices.has(i) ? formatXAxis(val) : ''
          }
          interval={0}
        />

        <YAxis
          allowDecimals={false}
          tick={{ fill: tokens.colors.muted, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={32}
        />

        <Tooltip
          content={<CustomTooltip />}
          cursor={{ stroke: tokens.colors.borderSoft, strokeWidth: 1 }}
        />

        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{
            fontSize:    '12px',
            color:       tokens.colors.muted,
            paddingTop:  '12px',
          }}
          formatter={(value: string) =>
            value === 'amazon' ? 'Amazon Associates' : 'Skimlinks'
          }
        />

        <Line
          type="monotone"
          dataKey="amazon"
          name="amazon"
          stroke={PURPLE}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: PURPLE, strokeWidth: 0 }}
        />

        <Line
          type="monotone"
          dataKey="skimlinks"
          name="skimlinks"
          stroke={GREEN}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: GREEN, strokeWidth: 0 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
