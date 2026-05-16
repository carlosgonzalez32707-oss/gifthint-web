/**
 * components/ViralCTABar.tsx — GiftHint
 *
 * A fixed 44 px purple bar pinned to the very top of every gifter page.
 * Invites visitors to create their own free wishlist.
 *
 * Behaviour:
 *   - Dismissible via ×; dismiss state stored in localStorage so it never
 *     re-appears across sessions (key: 'gh_cta_dismissed').
 *   - Click on the CTA button fires a fire-and-forget analytics insert to
 *     the `cta_events` Supabase table (no await — never blocks navigation).
 *   - The bar reserves 44 px of space in the document flow (no layout shift
 *     after dismiss because we conditionally render null and the parent page
 *     should account for the bar height only while it is shown).
 *
 * Mobile:
 *   - Explanatory copy is hidden; only the CTA button is shown.
 *   - Close button moves flush right.
 *
 * Usage:
 *   <ViralCTABar username="sarahchen42" />
 *   Place as the very first child of your page layout.
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useOccasionTheme }                  from '@/components/OccasionThemeContext'

// ── Constants ─────────────────────────────────────────────────────────────────

const DISMISS_KEY = 'gh_cta_dismissed'
const CTA_HREF    = '/get-started'
const BAR_HEIGHT  = 44          // px — matches the fixed height in styles

// ── Analytics (fire-and-forget) ───────────────────────────────────────────────

async function trackClick(username: string) {
  try {
    await fetch('/api/analytics/cta', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        event_type:            'cta_bar_click',
        gifter_page_username:  username,
      }),
      // keepalive ensures the request survives page navigation
      keepalive: true,
    })
  } catch {
    // Swallow — analytics must never break the user journey
  }
}

// ── GiftIcon ──────────────────────────────────────────────────────────────────

function GiftIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 15 15"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0, opacity: 0.9 }}
    >
      <rect x="1" y="6" width="13" height="8" rx="1.25"
        stroke="white" strokeWidth="1.25" />
      <rect x="3" y="6" width="9" height="8"
        fill="none" />
      <line x1="7.5" y1="6" x2="7.5" y2="14"
        stroke="white" strokeWidth="1.25" />
      {/* Ribbon bow */}
      <path d="M7.5 6 C7.5 6 5 3 3.5 3.5 C2 4 3 6 5.5 6"
        stroke="white" strokeWidth="1.1" strokeLinecap="round" fill="none" />
      <path d="M7.5 6 C7.5 6 10 3 11.5 3.5 C13 4 12 6 9.5 6"
        stroke="white" strokeWidth="1.1" strokeLinecap="round" fill="none" />
    </svg>
  )
}

// ── ViralCTABar ───────────────────────────────────────────────────────────────

interface ViralCTABarProps {
  /** The public_username of the wishlist owner — used in analytics */
  username: string
}

export function ViralCTABar({ username }: ViralCTABarProps) {
  const theme = useOccasionTheme()

  // Start as null (unknown) to avoid SSR/hydration mismatch
  const [dismissed, setDismissed] = useState<boolean | null>(null)

  // Read localStorage only on the client, after hydration
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === 'true')
    } catch {
      setDismissed(false)
    }
  }, [])

  const handleDismiss = useCallback(() => {
    try { localStorage.setItem(DISMISS_KEY, 'true') } catch { /* private mode */ }
    setDismissed(true)
  }, [])

  const handleCtaClick = useCallback(() => {
    // Fire-and-forget — don't await, don't block navigation
    trackClick(username)
  }, [username])

  // Don't render until we know dismiss state (avoids flash of bar on dismissed sessions)
  if (dismissed === null || dismissed === true) return null

  return (
    <>
      {/* The bar itself */}
      <div
        role="banner"
        style={{
          position:       'fixed',
          top:            0,
          left:           0,
          right:          0,
          zIndex:         1000,
          height:         `${BAR_HEIGHT}px`,
          background:     theme.accent,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        '0 12px 0 14px',
          gap:            '10px',
        }}
      >
        {/* ── Left: icon + copy (hidden on mobile) ──────────────────────────── */}
        <div
          className="gh-cta-copy"
          style={{
            display:    'flex',
            alignItems: 'center',
            gap:        '8px',
            minWidth:   0,
            flex:       1,
          }}
        >
          <GiftIcon />
          <p
            style={{
              margin:       0,
              fontSize:     '12.5px',
              fontWeight:   500,
              color:        'rgba(255,255,255,0.92)',
              whiteSpace:   'nowrap',
              overflow:     'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            Want your own free gift list?{' '}
            <span style={{ opacity: 0.8 }}>
              Friends can buy you exactly what you want.
            </span>
          </p>
        </div>

        {/* ── Right: CTA button + close ─────────────────────────────────────── */}
        <div
          style={{
            display:    'flex',
            alignItems: 'center',
            gap:        '8px',
            flexShrink: 0,
          }}
        >
          <a
            href={CTA_HREF}
            onClick={handleCtaClick}
            style={{
              display:         'inline-flex',
              alignItems:      'center',
              background:      '#fff',
              color:           theme.accent,
              borderRadius:    '999px',
              padding:         '5px 14px',
              fontSize:        '12px',
              fontWeight:      700,
              textDecoration:  'none',
              whiteSpace:      'nowrap',
              letterSpacing:   '0.1px',
              transition:      'background 120ms ease, color 120ms ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#f5f3ff' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'    }}
          >
            Create your free list →
          </a>

          {/* Dismiss button */}
          <button
            onClick={handleDismiss}
            aria-label="Dismiss banner"
            style={{
              background:  'transparent',
              border:      'none',
              padding:     '4px',
              cursor:      'pointer',
              color:       'rgba(255,255,255,0.65)',
              display:     'flex',
              alignItems:  'center',
              justifyContent: 'center',
              borderRadius: '4px',
              transition:  'color 120ms ease',
              flexShrink:  0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#fff' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.65)' }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M1 1l10 10M11 1L1 11"
                stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Reserve layout space so the page content isn't hidden under the bar */}
      <div aria-hidden="true" style={{ height: `${BAR_HEIGHT}px`, flexShrink: 0 }} />

      {/* Mobile: hide the explanatory copy, keep just the CTA + close */}
      <style>{`
        @media (max-width: 479px) {
          .gh-cta-copy { display: none !important; }
        }
      `}</style>
    </>
  )
}

// ── Convenience: bar height export so the gifter page can offset sticky els ───
export { BAR_HEIGHT as VIRAL_BAR_HEIGHT }
