/**
 * components/admin/TopItemsTable.tsx — GiftHint admin dashboard
 *
 * Table of the 10 most-clicked items across all users, sorted by click count.
 * Server component — no interactivity needed.
 */

import { tokens } from '@/tokens'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface TopItem {
  id:                   string
  title:                string
  retailer:             string
  clicks:               number
  estimated_commission: number | null
}

interface TopItemsTableProps {
  items: TopItem[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtUsd(n: number | null): string {
  if (n === null) return '—'
  return new Intl.NumberFormat('en-US', {
    style:                 'currency',
    currency:              'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

function retailerChip(retailer: string) {
  const isAmazon = retailer.toLowerCase().includes('amazon')
  const color    = isAmazon ? tokens.colors.amber : tokens.colors.purple
  const bg       = isAmazon ? tokens.colors.amberDim : tokens.colors.purpleDim
  const border   = isAmazon ? tokens.colors.amberRing : tokens.colors.purpleRing

  return (
    <span
      style={{
        fontSize:     '10px',
        fontWeight:   600,
        padding:      '2px 7px',
        borderRadius: tokens.radius.pill,
        background:   bg,
        border:       `1px solid ${border}`,
        color,
        whiteSpace:   'nowrap',
      }}
    >
      {retailer}
    </span>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TopItemsTable({ items }: TopItemsTableProps) {
  if (items.length === 0) {
    return (
      <div
        style={{
          background:   tokens.colors.surface,
          border:       `1px solid ${tokens.colors.border}`,
          borderRadius: tokens.radius.lg,
          padding:      '32px',
          textAlign:    'center',
          color:        tokens.colors.muted,
          fontSize:     '13px',
        }}
      >
        No click data yet. Items will appear here once gifters start clicking Buy buttons.
      </div>
    )
  }

  const headerCell: React.CSSProperties = {
    padding:       '10px 16px',
    fontSize:      '10.5px',
    fontWeight:    700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color:         tokens.colors.muted,
    textAlign:     'left',
    borderBottom:  `1px solid ${tokens.colors.border}`,
    whiteSpace:    'nowrap',
  }

  const bodyCell: React.CSSProperties = {
    padding:      '12px 16px',
    fontSize:     '13px',
    color:        tokens.colors.text,
    borderBottom: `1px solid ${tokens.colors.border}`,
    verticalAlign: 'middle',
  }

  return (
    <div
      style={{
        background:   tokens.colors.surface,
        border:       `1px solid ${tokens.colors.border}`,
        borderRadius: tokens.radius.lg,
        overflow:     'hidden',
      }}
    >
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width:           '100%',
            borderCollapse:  'collapse',
            fontFamily:      tokens.font.sans,
          }}
          aria-label="Top 10 most clicked items"
        >
          <thead>
            <tr>
              <th style={{ ...headerCell, width: '36px', textAlign: 'center' }}>#</th>
              <th style={{ ...headerCell }}>Item</th>
              <th style={{ ...headerCell }}>Retailer</th>
              <th style={{ ...headerCell, textAlign: 'right' }}>Clicks</th>
              <th style={{ ...headerCell, textAlign: 'right' }}>Est. Commission</th>
            </tr>
          </thead>

          <tbody>
            {items.map((item, i) => (
              <tr
                key={item.id}
                style={{
                  transition:  'background 120ms ease',
                }}
                onMouseEnter={(e) => {
                  ;(e.currentTarget as HTMLTableRowElement).style.background =
                    tokens.colors.surface2
                }}
                onMouseLeave={(e) => {
                  ;(e.currentTarget as HTMLTableRowElement).style.background = 'transparent'
                }}
              >
                {/* Rank */}
                <td
                  style={{
                    ...bodyCell,
                    textAlign:  'center',
                    fontWeight: 700,
                    color:      i < 3 ? tokens.colors.amber : tokens.colors.muted,
                    fontSize:   '12px',
                  }}
                >
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                </td>

                {/* Title — truncated at 60 chars */}
                <td style={bodyCell}>
                  <span
                    title={item.title}
                    style={{
                      display:      'block',
                      maxWidth:     '380px',
                      overflow:     'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace:   'nowrap',
                      fontWeight:   500,
                    }}
                  >
                    {item.title}
                  </span>
                </td>

                {/* Retailer chip */}
                <td style={bodyCell}>{retailerChip(item.retailer)}</td>

                {/* Click count */}
                <td
                  style={{
                    ...bodyCell,
                    textAlign:  'right',
                    fontWeight: 700,
                    color:      tokens.colors.green,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {item.clicks.toLocaleString()}
                </td>

                {/* Estimated commission */}
                <td
                  style={{
                    ...bodyCell,
                    textAlign:  'right',
                    color:      item.estimated_commission
                      ? tokens.colors.green
                      : tokens.colors.muted,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {fmtUsd(item.estimated_commission)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer note */}
      <p
        style={{
          margin:     0,
          padding:    '10px 16px',
          fontSize:   '11px',
          color:      tokens.colors.muted,
          borderTop:  `1px solid ${tokens.colors.border}`,
        }}
      >
        Est. commission = item price × Associates rate at time of save. Actual payout depends on completed purchases.
      </p>
    </div>
  )
}
