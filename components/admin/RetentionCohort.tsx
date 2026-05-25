/**
 * components/admin/RetentionCohort.tsx — GiftHint admin growth dashboard
 *
 * Cohort retention table: for each signup week, shows the % of that cohort
 * still active at W1 / W2 / W4 / W8.
 *
 * "Active" = user has any wishlist_item row (saved at least one gift) in the
 * relevant week window. This mirrors the product's core activation event.
 *
 * Colour coding:
 *   green  ≥ 40%
 *   amber  20–39%
 *   red    < 20%
 *   muted  no data yet (null)
 *
 * Server-rendered data is passed as a prop — this is a pure presentational
 * component with no data-fetching of its own.
 */

import { tokens } from '@/tokens'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CohortRow {
  /** Week label shown in the first column, e.g. "Mar 31" */
  week:    string
  /** ISO date of the first day of the signup week — used for sorting */
  weekIso: string
  /** Number of users who signed up in this week */
  cohortSize: number
  /** Retention rates 0–100, or null if the window hasn't elapsed yet */
  w1: number | null
  w2: number | null
  w4: number | null
  w8: number | null
}

export interface RetentionCohortProps {
  rows: CohortRow[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Categorise a retention % into a visual tier. */
function tier(pct: number | null): 'green' | 'amber' | 'red' | 'empty' {
  if (pct === null) return 'empty'
  if (pct >= 40)   return 'green'
  if (pct >= 20)   return 'amber'
  return 'red'
}

interface CellStyle {
  background: string
  color:      string
  border:     string
}

// Red doesn't have dim/ring variants in tokens — derive them inline.
const RED_DIM  = 'rgba(226, 75, 74, 0.12)'
const RED_RING = 'rgba(226, 75, 74, 0.28)'

function cellStyle(pct: number | null): CellStyle {
  const c = tokens.colors
  switch (tier(pct)) {
    case 'green': return { background: c.greenDim,   color: c.green,  border: c.greenRing  }
    case 'amber': return { background: c.amberDim,   color: c.amber,  border: c.amberRing  }
    case 'red':   return { background: RED_DIM,       color: c.red,    border: RED_RING      }
    default:      return { background: 'transparent', color: c.muted, border: 'transparent' }
  }
}

function formatPct(pct: number | null): string {
  if (pct === null) return '—'
  return `${Math.round(pct)}%`
}

// ── Legend item ───────────────────────────────────────────────────────────────

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div
        style={{
          width:        '8px',
          height:       '8px',
          borderRadius: '50%',
          background:   color,
          flexShrink:   0,
        }}
      />
      <span>{label}</span>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function RetentionCohort({ rows }: RetentionCohortProps) {
  const c = tokens.colors

  // Sort newest-first so the most recent cohort is at the top
  const sorted = [...rows].sort(
    (a, b) => b.weekIso.localeCompare(a.weekIso),
  )

  const headerCols = ['Cohort week', 'Size', 'W1', 'W2', 'W4', 'W8']

  const baseCell: React.CSSProperties = {
    padding:          '8px 12px',
    fontSize:         '12px',
    whiteSpace:       'nowrap',
    verticalAlign:    'middle',
  }

  const headerCell: React.CSSProperties = {
    ...baseCell,
    fontWeight:    600,
    color:         c.muted,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    fontSize:      '10px',
    paddingBottom: '10px',
    textAlign:     'left',
  }

  return (
    <div
      style={{
        background:   c.surface,
        border:       `1px solid ${c.border}`,
        borderRadius: tokens.radius.lg,
        padding:      '24px',
        overflowX:    'auto',
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
            Cohort retention
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: c.muted }}>
            % of each signup cohort still saving gifts at W1 · W2 · W4 · W8
          </p>
        </div>

        {/* Legend */}
        <div
          style={{
            display:  'flex',
            gap:      '16px',
            fontSize: '11px',
            color:    c.muted,
          }}
        >
          <LegendDot color={c.green} label="≥ 40%" />
          <LegendDot color={c.amber} label="20–39%" />
          <LegendDot color={c.red}   label="< 20%" />
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      {rows.length === 0 ? (
        <div
          style={{
            height:         '120px',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            fontSize:       '13px',
            color:          c.muted,
            fontStyle:      'italic',
          }}
        >
          No cohort data yet.
        </div>
      ) : (
        <table
          style={{
            width:          '100%',
            borderCollapse: 'collapse',
            fontSize:       '12px',
          }}
        >
          <thead>
            <tr
              style={{
                borderBottom: `1px solid ${c.border}`,
              }}
            >
              {headerCols.map((col) => (
                <th key={col} style={{ ...headerCell, textAlign: col === 'Cohort week' ? 'left' : 'right' }}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr
                key={row.weekIso}
                style={{
                  borderBottom: i < sorted.length - 1 ? `1px solid ${c.border}` : 'none',
                }}
              >
                {/* Cohort week label */}
                <td
                  style={{
                    ...baseCell,
                    color:      c.text,
                    fontWeight: 600,
                  }}
                >
                  {row.week}
                </td>

                {/* Cohort size */}
                <td
                  style={{
                    ...baseCell,
                    color:              c.muted,
                    textAlign:          'right',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {row.cohortSize.toLocaleString('en-US')}
                </td>

                {/* W1 / W2 / W4 / W8 retention cells */}
                {([row.w1, row.w2, row.w4, row.w8] as (number | null)[]).map(
                  (pct, idx) => {
                    const style = cellStyle(pct)
                    return (
                      <td
                        key={idx}
                        style={{
                          ...baseCell,
                          textAlign: 'right',
                        }}
                      >
                        <span
                          style={{
                            display:            'inline-block',
                            minWidth:           '44px',
                            padding:            '3px 8px',
                            borderRadius:       tokens.radius.sm,
                            background:         style.background,
                            color:              style.color,
                            border:             `1px solid ${style.border}`,
                            fontVariantNumeric: 'tabular-nums',
                            fontWeight:         pct !== null ? 600 : 400,
                            textAlign:          'center',
                            fontSize:           '11px',
                          }}
                        >
                          {formatPct(pct)}
                        </span>
                      </td>
                    )
                  },
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ── Footer note ─────────────────────────────────────────────────────── */}
      <p
        style={{
          marginTop:  '16px',
          paddingTop: '14px',
          borderTop:  `1px solid ${c.border}`,
          fontSize:   '11px',
          color:      c.muted,
          lineHeight: 1.6,
          margin:     '16px 0 0',
        }}
      >
        <strong style={{ color: c.text }}>Active</strong> = saved at least one item in the relevant week window ·{' '}
        <strong style={{ color: c.text }}>—</strong> = window has not yet elapsed
      </p>
    </div>
  )
}
