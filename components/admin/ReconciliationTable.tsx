/**
 * components/admin/ReconciliationTable.tsx — GiftHint admin dashboard
 *
 * Side-by-side comparison of:
 *   - Internal estimated revenue (sum of estimated_commission from click_events)
 *   - Actual confirmed revenue (from affiliate_reports synced daily from networks)
 *
 * Per-row variance column: (actual - estimated) / estimated × 100
 *   Positive = we underestimated (good, conservative)
 *   Negative = we overestimated (rate calibration needed)
 *
 * Primary use: calibrating the commission rates in lib/amazon-categories.ts.
 * A consistent +20% variance means our rates are too low; consistent -15%
 * means returns/rejections are eroding more than expected.
 *
 * Date range selector: last 7 / 30 / 90 days (client-side filter).
 *
 * Props:
 *   rows — ReconciliationRow[] fetched server-side in admin/page.tsx from the
 *           affiliate_reconciliation view.
 *
 * Client component — needs useState for the date range selector.
 */

'use client'

import { useState, useMemo } from 'react'
import { tokens } from '@/tokens'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReconciliationRow {
  report_date:      string    // 'YYYY-MM-DD'
  network:          'amazon' | 'skimlinks'
  network_clicks:   number    // clicks reported by the affiliate network
  internal_clicks:  number    // clicks we tracked in click_events
  actual_revenue:   number    // confirmed commission from the network
  estimated_revenue: number   // our internal estimate
  variance_pct:     number | null  // null when estimated = 0
  synced_at:        string    // ISO timestamp of last sync
}

type DateRange = 7 | 30 | 90

interface ReconciliationTableProps {
  rows: ReconciliationRow[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${parseInt(m)}/${parseInt(d)}`
}

function fmtUsd(n: number): string {
  if (n === 0) return '—'
  return n.toLocaleString('en-US', {
    style:                 'currency',
    currency:              'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function fmtClicks(n: number): string {
  return n === 0 ? '—' : n.toLocaleString('en-US')
}

function varianceColour(pct: number | null): string {
  if (pct === null) return tokens.colors.muted
  if (pct >  10)   return tokens.colors.green   // underestimated — conservative, good
  if (pct < -10)   return tokens.colors.red      // overestimated — calibration needed
  return tokens.colors.amber                      // within ±10% — acceptable
}

function varianceLabel(pct: number | null): string {
  if (pct === null) return '—'
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}

const NETWORK_LABELS: Record<string, string> = {
  amazon:    'Amazon',
  skimlinks: 'Skimlinks',
}

const NETWORK_COLOURS: Record<string, string> = {
  amazon:    tokens.colors.amber,
  skimlinks: tokens.colors.purple,
}

/** Aggregates rows for the summary totals footer */
function aggregate(rows: ReconciliationRow[]) {
  return rows.reduce(
    (acc, r) => ({
      actual_revenue:    acc.actual_revenue    + r.actual_revenue,
      estimated_revenue: acc.estimated_revenue + r.estimated_revenue,
      network_clicks:    acc.network_clicks    + r.network_clicks,
      internal_clicks:   acc.internal_clicks   + r.internal_clicks,
    }),
    { actual_revenue: 0, estimated_revenue: 0, network_clicks: 0, internal_clicks: 0 },
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function RangeButton({
  days,
  active,
  onClick,
}: {
  days: DateRange
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding:      '5px 12px',
        borderRadius: tokens.radius.sm,
        border:       `1px solid ${active ? tokens.colors.purple : tokens.colors.border}`,
        background:   active ? tokens.colors.purpleDim : 'transparent',
        color:        active ? tokens.colors.purple    : tokens.colors.muted,
        fontSize:     '12px',
        fontWeight:   active ? 700 : 400,
        cursor:       'pointer',
        transition:   'background 120ms ease, border-color 120ms ease, color 120ms ease',
      }}
    >
      {days}d
    </button>
  )
}

function VarianceLegend() {
  return (
    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '10px', color: tokens.colors.muted }}>
      <span>
        <span style={{ color: tokens.colors.green, fontWeight: 700 }}>▲ Positive</span>
        {' '}= actual {'>'} estimate (underestimated)
      </span>
      <span>
        <span style={{ color: tokens.colors.red, fontWeight: 700 }}>▼ Negative</span>
        {' '}= actual {'<'} estimate (overestimated)
      </span>
      <span>
        <span style={{ color: tokens.colors.amber, fontWeight: 700 }}>±10%</span>
        {' '}= acceptable range
      </span>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ReconciliationTable({ rows }: ReconciliationTableProps) {
  const [range, setRange] = useState<DateRange>(30)

  // Filter to the selected date range
  const cutoff = useMemo(() => {
    const d = new Date(Date.now() - range * 24 * 60 * 60 * 1000)
    return d.toISOString().slice(0, 10)
  }, [range])

  const filtered = useMemo(
    () => rows.filter((r) => r.report_date >= cutoff),
    [rows, cutoff],
  )

  const totals = useMemo(() => aggregate(filtered), [filtered])

  const totalVariancePct =
    totals.estimated_revenue === 0
      ? null
      : Math.round(
          ((totals.actual_revenue - totals.estimated_revenue) / totals.estimated_revenue) * 1000,
        ) / 10

  if (rows.length === 0) {
    return (
      <div
        style={{
          padding:      '24px',
          borderRadius: tokens.radius.lg,
          border:       `1px solid ${tokens.colors.border}`,
          background:   tokens.colors.surface,
          fontSize:     '13px',
          color:        tokens.colors.muted,
          fontStyle:    'italic',
        }}
      >
        No synced affiliate data yet. Run the cron job at{' '}
        <code style={{ fontFamily: tokens.font.mono, fontSize: '12px' }}>
          /api/cron/sync-affiliate-data
        </code>{' '}
        or wait for the daily schedule.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* ── Controls ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <VarianceLegend />
        <div style={{ display: 'flex', gap: '6px' }}>
          {([7, 30, 90] as DateRange[]).map((d) => (
            <RangeButton key={d} days={d} active={range === d} onClick={() => setRange(d)} />
          ))}
        </div>
      </div>

      {/* ── Summary KPI strip ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {[
          {
            label: 'Confirmed revenue',
            value: fmtUsd(totals.actual_revenue),
            colour: tokens.colors.green,
          },
          {
            label: 'Internal estimate',
            value: fmtUsd(totals.estimated_revenue),
            colour: tokens.colors.purple,
          },
          {
            label: 'Overall variance',
            value: varianceLabel(totalVariancePct),
            colour: varianceColour(totalVariancePct),
          },
          {
            label: 'Network clicks',
            value: fmtClicks(totals.network_clicks),
            colour: tokens.colors.text,
          },
          {
            label: 'Internal clicks',
            value: fmtClicks(totals.internal_clicks),
            colour: tokens.colors.text,
          },
        ].map(({ label, value, colour }) => (
          <div
            key={label}
            style={{
              flex:          '1 1 140px',
              padding:       '12px 16px',
              borderRadius:  tokens.radius.md,
              background:    tokens.colors.surface2,
              border:        `1px solid ${tokens.colors.border}`,
            }}
          >
            <p style={{ margin: '0 0 3px', fontSize: '10px', fontWeight: 700, color: tokens.colors.muted, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              {label}
            </p>
            <p style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: colour, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* ── Table ────────────────────────────────────────────────────────────── */}
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
            display:             'grid',
            gridTemplateColumns: '80px 90px 90px 110px 110px 90px 90px',
            gap:                 '0 8px',
            padding:             '10px 16px',
            borderBottom:        `1px solid ${tokens.colors.border}`,
            background:          tokens.colors.surface2,
          }}
        >
          {[
            'Date',
            'Network',
            'Variance',
            'Actual rev.',
            'Est. rev.',
            'Net clicks',
            'Int. clicks',
          ].map((h) => (
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

        {/* Rows */}
        {filtered.length === 0 ? (
          <p style={{ margin: 0, padding: '16px', fontSize: '13px', color: tokens.colors.muted, fontStyle: 'italic' }}>
            No data for the last {range} days.
          </p>
        ) : (
          filtered.map((row, i) => {
            const netColour  = NETWORK_COLOURS[row.network] ?? tokens.colors.muted
            const varColour  = varianceColour(row.variance_pct)
            const isLastRow  = i === filtered.length - 1

            return (
              <div
                key={`${row.report_date}-${row.network}`}
                style={{
                  display:             'grid',
                  gridTemplateColumns: '80px 90px 90px 110px 110px 90px 90px',
                  gap:                 '0 8px',
                  padding:             '10px 16px',
                  borderBottom:        isLastRow ? 'none' : `1px solid ${tokens.colors.border}`,
                  alignItems:          'center',
                }}
              >
                {/* Date */}
                <span
                  style={{
                    fontSize:           '12px',
                    color:              tokens.colors.muted,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {fmtDate(row.report_date)}
                </span>

                {/* Network badge */}
                <span
                  style={{
                    fontSize:     '11px',
                    fontWeight:   600,
                    color:        netColour,
                    background:   `${netColour}18`,
                    border:       `1px solid ${netColour}30`,
                    borderRadius: tokens.radius.pill,
                    padding:      '2px 8px',
                    display:      'inline-block',
                    whiteSpace:   'nowrap',
                  }}
                >
                  {NETWORK_LABELS[row.network] ?? row.network}
                </span>

                {/* Variance */}
                <span
                  style={{
                    fontSize:           '13px',
                    fontWeight:         700,
                    color:              varColour,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {varianceLabel(row.variance_pct)}
                </span>

                {/* Actual revenue */}
                <span
                  style={{
                    fontSize:           '13px',
                    fontWeight:         row.actual_revenue > 0 ? 600 : 400,
                    color:              row.actual_revenue > 0 ? tokens.colors.green : tokens.colors.muted,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {fmtUsd(row.actual_revenue)}
                </span>

                {/* Estimated revenue */}
                <span
                  style={{
                    fontSize:           '13px',
                    color:              row.estimated_revenue > 0 ? tokens.colors.text : tokens.colors.muted,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {fmtUsd(row.estimated_revenue)}
                </span>

                {/* Network clicks */}
                <span
                  style={{
                    fontSize:           '12px',
                    color:              tokens.colors.muted,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {fmtClicks(row.network_clicks)}
                </span>

                {/* Internal clicks */}
                <span
                  style={{
                    fontSize:           '12px',
                    color:              tokens.colors.muted,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {fmtClicks(row.internal_clicks)}
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
          Actual revenue sourced from affiliate_reports (synced daily at 06:00 UTC).
          Internal estimate sourced from click_events.estimated_commission. A persistent
          negative variance means commission rates in{' '}
          <code style={{ fontFamily: tokens.font.mono, fontSize: '10px' }}>
            lib/amazon-categories.ts
          </code>{' '}
          need calibration downward.
        </div>
      </div>
    </div>
  )
}
