'use client'

/**
 * components/gifter-page/PriceDropBadge.tsx — GiftHint
 *
 * Urgency badge shown to gifters when a wishlist item has dropped > 5%
 * in the last 7 days, prompting them to buy before the price rises again.
 *
 * Visible to gifters only — not the wisher (avoids "spoiler" of claiming intent).
 *
 * Usage:
 *   <PriceDropBadge
 *     dropPct={item.dropPct}          // pre-computed by the page (see below)
 *     currentPrice={item.price}
 *     currency={item.currency}
 *     affiliateUrl={item.affiliate_url ?? item.source_url}
 *   />
 *
 * How to compute dropPct server-side:
 *   JOIN price_history ON item_id = wishlist_items.id
 *   WHERE checked_at >= NOW() - INTERVAL '7 days'
 *   ORDER BY checked_at ASC LIMIT 1
 *   → firstPrice
 *   dropPct = ((firstPrice - currentPrice) / firstPrice) * 100
 *
 * Only render when dropPct > 5 to avoid noise from micro-fluctuations.
 */

import React, { useState } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PriceDropBadgeProps {
  /**
   * Percentage drop over last 7 days. Positive = price went down.
   * Badge only renders when this is ≥ 5.
   */
  dropPct:      number
  currentPrice: number
  currency:     string
  /** URL for the "Buy now" CTA — should be the affiliate link */
  affiliateUrl: string
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

// ── Component ─────────────────────────────────────────────────────────────────

export function PriceDropBadge({
  dropPct,
  currentPrice,
  currency,
  affiliateUrl,
}: PriceDropBadgeProps) {
  const [expanded, setExpanded] = useState(false)

  // Only render for meaningful drops
  if (dropPct < 5) return null

  const roundedPct = Math.round(dropPct)

  // Urgency tier
  const isBigDrop = dropPct >= 20
  const isHotDrop = dropPct >= 10

  const colors = isBigDrop
    ? { bg: 'rgba(226,75,74,0.13)',  border: 'rgba(226,75,74,0.32)',  text: '#E24B4A' }
    : isHotDrop
    ? { bg: 'rgba(226,162,74,0.13)', border: 'rgba(226,162,74,0.32)', text: '#E2A24A' }
    : { bg: 'rgba(78,201,154,0.13)', border: 'rgba(78,201,154,0.28)', text: '#4EC99A' }

  const emoji = isBigDrop ? '🔥' : '📉'

  return (
    <div
      style={{
        backgroundColor: colors.bg,
        border:          `1px solid ${colors.border}`,
        borderRadius:    '10px',
        overflow:        'hidden',
        fontFamily:      '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      {/* ── Collapsed badge row ─────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'space-between',
          width:           '100%',
          padding:         '7px 10px',
          background:      'transparent',
          border:          'none',
          cursor:          'pointer',
          gap:             '6px',
          textAlign:       'left',
        }}
        aria-expanded={expanded}
      >
        <span
          style={{
            display:    'flex',
            alignItems: 'center',
            gap:        '5px',
            fontSize:   '11px',
            fontWeight: 700,
            color:      colors.text,
          }}
        >
          {emoji} Price dropped {roundedPct}% this week
        </span>
        <span style={{ fontSize: '10px', color: colors.text, opacity: 0.7, flexShrink: 0 }}>
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {/* ── Expanded detail panel ───────────────────────────────────────── */}
      {expanded && (
        <div
          style={{
            padding:      '0 10px 10px',
            borderTop:    `1px solid ${colors.border}`,
          }}
        >
          <p
            style={{
              margin:     '8px 0 10px',
              fontSize:   '12px',
              color:      '#F0EEE8',
              lineHeight: 1.5,
            }}
          >
            This item is currently {formatPrice(currentPrice, currency)} —{' '}
            <strong style={{ color: colors.text }}>{roundedPct}% lower</strong> than
            7 days ago. Prices can change — grab it now before it goes back up.
          </p>

          <a
            href={affiliateUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display:         'inline-flex',
              alignItems:      'center',
              gap:             '5px',
              padding:         '7px 14px',
              borderRadius:    '8px',
              backgroundColor: colors.text,
              color:           '#0C0C0E',
              fontSize:        '12px',
              fontWeight:      800,
              textDecoration:  'none',
              letterSpacing:   '-0.01em',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            Buy now at {formatPrice(currentPrice, currency)} →
          </a>
        </div>
      )}
    </div>
  )
}

// ── Server-side helper (export for use in page.tsx) ───────────────────────────

/**
 * Computes the 7-day drop percentage for an item given two price points.
 *
 * @param priceNow      Current item price
 * @param priceWeekAgo  Price from 7 days ago (first price_history row >= NOW()-7d)
 * @returns             Positive number = price fell. 0 if no meaningful drop.
 */
export function computeDropPct(priceNow: number, priceWeekAgo: number): number {
  if (priceWeekAgo <= 0 || priceNow >= priceWeekAgo) return 0
  return ((priceWeekAgo - priceNow) / priceWeekAgo) * 100
}
