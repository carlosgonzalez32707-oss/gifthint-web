/**
 * components/dashboard/TopItemsAnalytics.tsx — GiftHint
 *
 * Per-list item breakdown: shows all items sorted by buy-click count so the
 * wisher can see which gifts gifters are most interested in.
 *
 * Props:
 *   items   — array of { id, title, buy_clicks, is_claimed }
 *   accent  — accent colour from the list's occasion theme
 */

'use client'

import { tokens } from '@/tokens'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AnalyticsItem {
  id:         string
  title:      string
  buy_clicks: number
  is_claimed: boolean
}

interface TopItemsAnalyticsProps {
  items:  AnalyticsItem[]
  accent: string
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TopItemsAnalytics({ items, accent }: TopItemsAnalyticsProps) {
  if (items.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: '12px', color: tokens.colors.muted, fontStyle: 'italic' }}>
        No items yet.
      </p>
    )
  }

  // Find max clicks for relative bar scaling
  const maxClicks = Math.max(...items.map((i) => i.buy_clicks), 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* ── Header row ─────────────────────────────────────────────────────── */}
      <div
        style={{
          display:       'grid',
          gridTemplateColumns: '1fr 56px 64px',
          gap:           '8px',
          padding:       '5px 8px',
          borderBottom:  `1px solid ${tokens.colors.border}`,
          marginBottom:  '2px',
        }}
      >
        <span style={{ fontSize: '10px', fontWeight: 600, color: tokens.colors.muted, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
          Item
        </span>
        <span style={{ fontSize: '10px', fontWeight: 600, color: tokens.colors.muted, letterSpacing: '0.07em', textTransform: 'uppercase', textAlign: 'right' }}>
          Clicks
        </span>
        <span style={{ fontSize: '10px', fontWeight: 600, color: tokens.colors.muted, letterSpacing: '0.07em', textTransform: 'uppercase', textAlign: 'center' }}>
          Status
        </span>
      </div>

      {/* ── Item rows ───────────────────────────────────────────────────────── */}
      {items.map((item, idx) => {
        const barWidth = maxClicks > 0 ? `${Math.round((item.buy_clicks / maxClicks) * 100)}%` : '0%'
        const isTop    = idx === 0 && item.buy_clicks > 0

        return (
          <div
            key={item.id}
            style={{
              display:       'grid',
              gridTemplateColumns: '1fr 56px 64px',
              gap:           '8px',
              alignItems:    'center',
              padding:       '7px 8px',
              borderRadius:  tokens.radius.sm,
              background:    isTop ? `rgba(${hexToRgb(accent)}, 0.05)` : 'transparent',
              position:      'relative',
              overflow:      'hidden',
            }}
          >
            {/* Relative-popularity bar (purely decorative, behind content) */}
            {item.buy_clicks > 0 && (
              <div
                aria-hidden="true"
                style={{
                  position:   'absolute',
                  inset:      0,
                  right:      'auto',
                  width:      barWidth,
                  background: `rgba(${hexToRgb(accent)}, 0.06)`,
                  pointerEvents: 'none',
                }}
              />
            )}

            {/* Title */}
            <span
              style={{
                fontSize:     '12px',
                fontWeight:   isTop ? 600 : 400,
                color:        isTop ? tokens.colors.text : tokens.colors.muted,
                overflow:     'hidden',
                textOverflow: 'ellipsis',
                whiteSpace:   'nowrap',
                position:     'relative',
                zIndex:       1,
              }}
              title={item.title}
            >
              {isTop && <span aria-label="Most clicked" style={{ marginRight: '4px' }}>🔥</span>}
              {item.title}
            </span>

            {/* Click count */}
            <span
              style={{
                fontSize:   '12px',
                fontWeight: item.buy_clicks > 0 ? 700 : 400,
                color:      item.buy_clicks > 0 ? accent : tokens.colors.muted,
                textAlign:  'right',
                position:   'relative',
                zIndex:     1,
              }}
            >
              {item.buy_clicks > 0 ? item.buy_clicks : '—'}
            </span>

            {/* Claimed status badge */}
            <span
              style={{
                display:        'inline-flex',
                alignItems:     'center',
                justifyContent: 'center',
                fontSize:       '10px',
                fontWeight:     600,
                padding:        '2px 8px',
                borderRadius:   tokens.radius.pill,
                background:     item.is_claimed
                  ? tokens.colors.greenDim
                  : tokens.colors.surface2,
                color: item.is_claimed
                  ? tokens.colors.green
                  : tokens.colors.muted,
                border: `1px solid ${item.is_claimed ? tokens.colors.greenRing : tokens.colors.border}`,
                whiteSpace:   'nowrap',
                position:     'relative',
                zIndex:       1,
              }}
            >
              {item.is_claimed ? '✓ Claimed' : 'Available'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Utility ───────────────────────────────────────────────────────────────────

/**
 * Converts a 6-digit hex colour to "R, G, B" so we can use rgba() in styles.
 * Falls back to the purple accent RGB if the hex is malformed.
 */
function hexToRgb(hex: string): string {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return '139, 131, 240'
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return `${r}, ${g}, ${b}`
}
