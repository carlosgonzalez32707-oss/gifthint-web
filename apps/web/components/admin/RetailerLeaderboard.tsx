/**
 * components/admin/RetailerLeaderboard.tsx — GiftHint admin dashboard
 *
 * Ranked list of retailers by total buy-click volume, with their affiliate
 * network and estimated revenue contribution.
 *
 * Primary use: identifying which retailers to prioritise for direct affiliate
 * partnership negotiations in Phase 4 (retailers with high click volume but
 * no affiliate coverage are the most valuable targets).
 *
 * Server component — no Recharts. Pure table layout.
 *
 * Props:
 *   rows — RetailerRow[] fetched and sorted server-side in admin/page.tsx
 */

import { tokens } from '@/tokens'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RetailerRow {
  retailer:    string
  clicks:      number
  network:     'amazon_associates' | 'skimlinks' | 'unknown' | string
  est_rev:     number    // sum of estimated_commission for clicked items at this retailer
}

interface RetailerLeaderboardProps {
  rows: RetailerRow[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const NETWORK_LABELS: Record<string, string> = {
  amazon_associates: 'Amazon',
  skimlinks:         'Skimlinks',
  unknown:           '—',
}

const NETWORK_COLOURS: Record<string, string> = {
  amazon_associates: tokens.colors.amber,
  skimlinks:         tokens.colors.purple,
  unknown:           tokens.colors.muted,
}

function fmtUsd(n: number): string {
  if (n === 0) return '—'
  return n.toLocaleString('en-US', {
    style:                 'currency',
    currency:              'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

function fmtRetailer(raw: string): string {
  // Capitalise and clean up common raw retailer strings
  if (!raw || raw === 'unknown') return 'Unknown'
  return raw.charAt(0).toUpperCase() + raw.slice(1).replace(/[._-]/g, ' ')
}

// ── Component ─────────────────────────────────────────────────────────────────

export function RetailerLeaderboard({ rows }: RetailerLeaderboardProps) {
  if (rows.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: '13px', color: tokens.colors.muted, fontStyle: 'italic' }}>
        No click data yet.
      </p>
    )
  }

  const maxClicks = rows[0].clicks   // rows are pre-sorted descending

  return (
    <div
      style={{
        borderRadius: tokens.radius.lg,
        border:       `1px solid ${tokens.colors.border}`,
        overflow:     'hidden',
        background:   tokens.colors.surface,
      }}
    >
      {/* ── Table header ─────────────────────────────────────────────────── */}
      <div
        style={{
          display:             'grid',
          gridTemplateColumns: '28px 1fr 80px 110px 100px',
          gap:                 '0 12px',
          padding:             '10px 16px',
          borderBottom:        `1px solid ${tokens.colors.border}`,
          background:          tokens.colors.surface2,
        }}
      >
        {['#', 'Retailer', 'Clicks', 'Network', 'Est. Rev'].map((h) => (
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

      {/* ── Rows ─────────────────────────────────────────────────────────── */}
      {rows.map((row, i) => {
        const barWidth    = `${Math.round((row.clicks / maxClicks) * 100)}%`
        const networkColour = NETWORK_COLOURS[row.network] ?? tokens.colors.muted
        const isTop3        = i < 3
        const hasNoNetwork  = row.network === 'unknown'

        return (
          <div
            key={row.retailer}
            style={{
              display:             'grid',
              gridTemplateColumns: '28px 1fr 80px 110px 100px',
              gap:                 '0 12px',
              padding:             '11px 16px',
              borderBottom:        i < rows.length - 1
                ? `1px solid ${tokens.colors.border}`
                : 'none',
              alignItems:          'center',
              position:            'relative',
              background:          isTop3 ? 'rgba(139, 131, 240, 0.03)' : 'transparent',
            }}
          >
            {/* Rank */}
            <span
              style={{
                fontSize:  '12px',
                fontWeight: isTop3 ? 700 : 400,
                color:      isTop3 ? tokens.colors.purple : tokens.colors.muted,
              }}
            >
              {i + 1}
            </span>

            {/* Retailer name + relative bar */}
            <div style={{ minWidth: 0 }}>
              <span
                style={{
                  fontSize:     '13px',
                  fontWeight:   isTop3 ? 600 : 400,
                  color:        tokens.colors.text,
                  display:      'block',
                  overflow:     'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace:   'nowrap',
                  marginBottom: '4px',
                }}
              >
                {fmtRetailer(row.retailer)}
                {hasNoNetwork && (
                  <span
                    style={{
                      marginLeft:   '6px',
                      fontSize:     '9px',
                      fontWeight:   700,
                      color:        tokens.colors.red,
                      background:   'rgba(226, 75, 74, 0.12)',
                      border:       '1px solid rgba(226, 75, 74, 0.28)',
                      borderRadius: tokens.radius.pill,
                      padding:      '1px 5px',
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                    }}
                  >
                    No affiliate
                  </span>
                )}
              </span>
              {/* Relative-popularity bar */}
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
                    background:   hasNoNetwork ? tokens.colors.red : tokens.colors.purple,
                    opacity:      hasNoNetwork ? 0.5 : 0.6,
                  }}
                />
              </div>
            </div>

            {/* Clicks */}
            <span
              style={{
                fontSize:           '13px',
                fontWeight:         600,
                color:              tokens.colors.text,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {row.clicks.toLocaleString('en-US')}
            </span>

            {/* Network badge */}
            <span
              style={{
                fontSize:     '11px',
                fontWeight:   600,
                color:        networkColour,
                background:   `${networkColour}18`,
                border:       `1px solid ${networkColour}30`,
                borderRadius: tokens.radius.pill,
                padding:      '2px 8px',
                display:      'inline-block',
                whiteSpace:   'nowrap',
              }}
            >
              {NETWORK_LABELS[row.network] ?? row.network}
            </span>

            {/* Estimated revenue */}
            <span
              style={{
                fontSize:           '13px',
                fontWeight:         row.est_rev > 0 ? 600 : 400,
                color:              row.est_rev > 0 ? tokens.colors.green : tokens.colors.muted,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {fmtUsd(row.est_rev)}
            </span>
          </div>
        )
      })}

      {/* ── Footer note ───────────────────────────────────────────────────── */}
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
        Retailers with <span style={{ color: tokens.colors.red }}>No affiliate</span> badge
        have click volume but no commission programme. Prioritise these for Phase 4
        direct partnership outreach.
      </div>
    </div>
  )
}
