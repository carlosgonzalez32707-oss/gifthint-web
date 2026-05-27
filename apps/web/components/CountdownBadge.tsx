/**
 * components/CountdownBadge.tsx — GiftHint
 *
 * Displays how many days remain until an occasion date, with colour-coded
 * urgency and a soft entrance animation.
 *
 * Colour coding:
 *   > 14 days  → green  (#4EC99A)
 *   7–14 days  → amber  (#F5A94E)
 *   < 7 days   → red    (#E24B4A)
 *   0 days     → "🎉 Today is the day!" (green, celebratory)
 *   past       → "Hope they loved their gifts!" (muted, collapsed)
 *   null date  → nothing rendered
 *
 * Usage:
 *   <CountdownBadge occasionDate="2026-12-25" countdownLabel="until Christmas" />
 */

'use client'

import { useMemo, useEffect, useState } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────

interface CountdownBadgeProps {
  /**
   * ISO date string "YYYY-MM-DD" in UTC, or null/undefined if no date was set.
   * When null/undefined the component renders nothing.
   */
  occasionDate:   string | null | undefined
  /**
   * Label appended after the day count, e.g. "until the birthday".
   * Ignored when occasionDate is null, today, or past.
   */
  countdownLabel: string
  /** Accent hex colour — drives the urgency-independent styling. */
  accent:         string
}

// ── Colours ───────────────────────────────────────────────────────────────────

const GREEN = '#4EC99A'
const AMBER = '#F5A94E'
const RED   = '#E24B4A'
const MUTED = '#7A7870'

function urgencyColour(daysLeft: number): string {
  if (daysLeft > 14) return GREEN
  if (daysLeft >= 7) return AMBER
  return RED
}

// ── Day calculation ───────────────────────────────────────────────────────────

/**
 * Returns the integer number of calendar days between UTC-today and the
 * occasion date. Negative means the occasion has already passed.
 */
function daysUntil(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number)
  const occasion = Date.UTC(y, m - 1, d)

  const now   = new Date()
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())

  return Math.round((occasion - today) / (1000 * 60 * 60 * 24))
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CountdownBadge({
  occasionDate,
  countdownLabel,
  accent,
}: CountdownBadgeProps) {
  // Entrance animation: fade + slide up from 8 px
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    // Defer one frame so the CSS transition plays after first paint
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const days = useMemo(
    () => (occasionDate ? daysUntil(occasionDate) : null),
    [occasionDate],
  )

  // No date configured — render nothing at all
  if (days === null) return null

  // ── Occasion has passed ────────────────────────────────────────────────────
  if (days < 0) {
    return (
      <span
        style={{
          display:      'inline-flex',
          alignItems:   'center',
          gap:          '5px',
          fontSize:     '12px',
          color:        MUTED,
          fontStyle:    'italic',
          opacity:      visible ? 1 : 0,
          transform:    visible ? 'translateY(0)' : 'translateY(6px)',
          transition:   'opacity 400ms ease, transform 400ms ease',
        }}
      >
        Hope they loved their gifts!
      </span>
    )
  }

  // ── Today is the day ──────────────────────────────────────────────────────
  if (days === 0) {
    return (
      <span
        role="status"
        aria-live="polite"
        style={{
          display:      'inline-flex',
          alignItems:   'center',
          gap:          '6px',
          padding:      '5px 14px',
          borderRadius: '999px',
          background:   'rgba(78,201,154,0.15)',
          border:       `1px solid rgba(78,201,154,0.35)`,
          fontSize:     '13px',
          fontWeight:   700,
          color:        GREEN,
          letterSpacing: '-0.01em',
          opacity:       visible ? 1 : 0,
          transform:     visible ? 'translateY(0)' : 'translateY(8px)',
          transition:    'opacity 400ms ease, transform 400ms ease',
        }}
      >
        🎉 Today is the day!
      </span>
    )
  }

  // ── Future date ───────────────────────────────────────────────────────────
  const colour  = urgencyColour(days)
  const bgAlpha = days < 7 ? 0.15 : 0.12
  const bg      = colour
    .replace('#', '')
    .match(/.{2}/g)!
    .map((h) => parseInt(h, 16))
    .join(',')

  return (
    <span
      role="timer"
      aria-label={`${days} ${days === 1 ? 'day' : 'days'} ${countdownLabel}`}
      style={{
        display:      'inline-flex',
        alignItems:   'center',
        gap:          '6px',
        padding:      '5px 14px',
        borderRadius: '999px',
        background:   `rgba(${bg},${bgAlpha})`,
        border:       `1px solid rgba(${bg},0.32)`,
        fontSize:     '13px',
        fontWeight:   700,
        color:        colour,
        letterSpacing: '-0.01em',
        opacity:       visible ? 1 : 0,
        transform:     visible ? 'translateY(0)' : 'translateY(8px)',
        transition:    'opacity 400ms ease, transform 400ms ease',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          fontSize:   '18px',
          lineHeight: 1,
          // Pulse animation for urgent countdowns
          animation: days < 7 ? 'gh-pulse 1.8s ease-in-out infinite' : 'none',
        }}
      >
        ⏳
      </span>

      {days} {days === 1 ? 'day' : 'days'}{' '}
      <span style={{ fontWeight: 500, opacity: 0.85 }}>{countdownLabel}</span>

      {/* Keyframes injected only when the pulse animation is actually active */}
      {days < 7 && (
        <style>{`
          @keyframes gh-pulse {
            0%, 100% { opacity: 1;    transform: scale(1);    }
            50%       { opacity: 0.6; transform: scale(0.92); }
          }
        `}</style>
      )}
    </span>
  )
}
