'use client'

/**
 * components/dashboard/PriceBadge.tsx — GiftHint
 *
 * Inline price status badge for wishlist item cards.
 *
 * Badge priority (highest wins):
 *   1. 🏆 Lowest ever  — currentPrice ≈ lowestPrice (within 0.5%)
 *   2. 📉 Price dropped — currentPrice < lastWeekPrice by ≥ 1%
 *   3. 📈 Price rose    — currentPrice > originalSavedPrice by ≥ 1%
 *   4. null             — price unchanged or insufficient data
 *
 * Usage:
 *   <PriceBadge
 *     currentPrice={item.price}
 *     lowestPrice={item.lowest_price}
 *     lastWeekPrice={priceHistory[priceHistory.length - 8]?.price ?? null}
 *     originalSavedPrice={priceHistory[0]?.price ?? null}
 *     currency={item.currency}
 *   />
 */

import React from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PriceBadgeProps {
  /** Current displayed price (wishlist_items.price) */
  currentPrice:       number | null
  /** All-time lowest price (wishlist_items.lowest_price) */
  lowestPrice:        number | null
  /**
   * Price from ~7 days ago (price_history row closest to today - 7d).
   * Pass null if price history is unavailable.
   */
  lastWeekPrice:      number | null
  /**
   * Price at first save (price_history[0].price or original DB price).
   * Used to detect price-rise relative to original.
   */
  originalSavedPrice: number | null
  currency:           string
  /** Controls size — 'sm' for card badges, 'md' for detail views */
  size?:              'sm' | 'md'
}

type BadgeVariant = 'lowest' | 'dropped' | 'rose'

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

function pctDiff(a: number, b: number): number {
  if (b <= 0) return 0
  return ((b - a) / b) * 100   // positive = a is cheaper
}

// ── Detect variant ────────────────────────────────────────────────────────────

interface BadgeInfo {
  variant: BadgeVariant
  label:   string
  tooltip: string
}

function detectBadge(
  currentPrice:       number,
  lowestPrice:        number | null,
  lastWeekPrice:      number | null,
  originalSavedPrice: number | null,
  currency:           string,
): BadgeInfo | null {
  // 1. Lowest ever — within 0.5% tolerance to handle floating-point noise
  if (lowestPrice !== null && lowestPrice > 0) {
    const diffPct = Math.abs(pctDiff(currentPrice, lowestPrice))
    if (diffPct < 0.5) {
      return {
        variant: 'lowest',
        label:   '🏆 Lowest ever',
        tooltip: `At ${formatPrice(lowestPrice, currency)}, this is the lowest price we've recorded.`,
      }
    }
  }

  // 2. Price dropped vs last week
  if (lastWeekPrice !== null && lastWeekPrice > 0) {
    const drop = pctDiff(currentPrice, lastWeekPrice)
    if (drop >= 1) {
      const dropPct = Math.round(drop)
      return {
        variant: 'dropped',
        label:   `📉 Price dropped ${dropPct}%`,
        tooltip: `Was ${formatPrice(lastWeekPrice, currency)} last week — now ${formatPrice(currentPrice, currency)}.`,
      }
    }
  }

  // 3. Price rose vs original save
  if (originalSavedPrice !== null && originalSavedPrice > 0) {
    const rise = pctDiff(originalSavedPrice, currentPrice)   // positive = current is cheaper = price fell
    const fell = pctDiff(currentPrice, originalSavedPrice)   // positive = current more expensive
    if (fell >= 1) {
      const risePct = Math.round(fell)
      return {
        variant: 'rose',
        label:   `📈 Up ${risePct}% since saved`,
        tooltip: `Saved at ${formatPrice(originalSavedPrice, currency)}, now ${formatPrice(currentPrice, currency)}.`,
      }
    }

    // Could also detect "price came down since saved" here but we prioritise lastWeekPrice above
    void rise
  }

  return null
}

// ── Style map ─────────────────────────────────────────────────────────────────

const STYLES: Record<BadgeVariant, { bg: string; border: string; color: string }> = {
  lowest:  { bg: 'rgba(226,162,74,0.13)',  border: 'rgba(226,162,74,0.30)',  color: '#E2A24A' },
  dropped: { bg: 'rgba(78,201,154,0.13)',  border: 'rgba(78,201,154,0.28)',  color: '#4EC99A' },
  rose:    { bg: 'rgba(240,238,232,0.06)', border: 'rgba(240,238,232,0.12)', color: '#7A7870' },
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PriceBadge({
  currentPrice,
  lowestPrice,
  lastWeekPrice,
  originalSavedPrice,
  currency,
  size = 'sm',
}: PriceBadgeProps) {
  if (currentPrice === null || currentPrice <= 0) return null

  const badge = detectBadge(currentPrice, lowestPrice, lastWeekPrice, originalSavedPrice, currency)
  if (!badge) return null

  const s = STYLES[badge.variant]
  const fontSize   = size === 'sm' ? '10px' : '11px'
  const padding    = size === 'sm' ? '2px 8px' : '4px 10px'
  const fontWeight = size === 'sm' ? 600 : 700

  return (
    <span
      title={badge.tooltip}
      style={{
        display:         'inline-flex',
        alignItems:      'center',
        fontSize,
        fontWeight,
        color:           s.color,
        backgroundColor: s.bg,
        border:          `1px solid ${s.border}`,
        borderRadius:    '100px',
        padding,
        cursor:          'default',
        fontFamily:      '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        whiteSpace:      'nowrap',
        letterSpacing:   '0.01em',
        lineHeight:      1.4,
      }}
    >
      {badge.label}
    </span>
  )
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

export function PriceBadgeSkeleton({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  return (
    <span
      style={{
        display:         'inline-block',
        width:           size === 'sm' ? '90px' : '110px',
        height:          size === 'sm' ? '18px' : '22px',
        borderRadius:    '100px',
        backgroundColor: 'rgba(240,238,232,0.06)',
        animation:       'pulse 1.5s ease-in-out infinite',
      }}
    />
  )
}
