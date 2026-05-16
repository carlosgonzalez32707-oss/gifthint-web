/**
 * components/GifterFooter.tsx — GiftHint
 *
 * Full-width footer rendered at the bottom of every gifter page.
 * NOT dismissible — affiliate and legal disclosures are a legal requirement
 * under FTC guidelines and must remain visible at all times.
 *
 * Layout (three rows, centred on mobile):
 *   Row 1: ℹ affiliate disclosure (left) | partner badges (right)
 *   Row 2: navigation links (centred)
 *
 * On narrow mobile the two-column row stacks vertically.
 */

'use client'

import Link                    from 'next/link'
import { tokens }              from '@/tokens'
import { useOccasionTheme }    from '@/components/OccasionThemeContext'

// ── InfoIcon ──────────────────────────────────────────────────────────────────

function InfoIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0, marginTop: '1px' }}
    >
      <circle cx="6" cy="6" r="5.25" stroke="currentColor" strokeWidth="1.1" />
      <line
        x1="6" y1="5.5" x2="6" y2="8.5"
        stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"
      />
      <circle cx="6" cy="3.5" r="0.65" fill="currentColor" />
    </svg>
  )
}

// ── GifterFooter ──────────────────────────────────────────────────────────────

export function GifterFooter() {
  const theme = useOccasionTheme()

  return (
    <footer
      aria-label="Site footer"
      style={{
        width:      '100%',
        background: tokens.colors.bg,
        borderTop:  '0.5px solid rgba(255,255,255,0.07)',
        padding:    '18px 20px 24px',
      }}
    >
      {/* ── Disclosure + partner badges ────────────────────────────────────── */}
      <div
        style={{
          display:        'flex',
          flexWrap:       'wrap',
          alignItems:     'flex-start',
          justifyContent: 'space-between',
          gap:            '10px',
          marginBottom:   '14px',
        }}
      >
        {/* Affiliate disclosure */}
        <p
          style={{
            margin:     0,
            display:    'flex',
            alignItems: 'flex-start',
            gap:        '6px',
            fontSize:   '11px',
            color:      tokens.colors.muted,
            lineHeight: 1.55,
            maxWidth:   '420px',
            opacity:    0.8,
          }}
        >
          <InfoIcon />
          Purchases made through links on this page may earn GiftHint a small
          affiliate commission at no extra cost to you.
        </p>

        {/* Partner badges */}
        <div
          style={{
            display:    'flex',
            alignItems: 'center',
            gap:        '8px',
            flexWrap:   'wrap',
          }}
        >
          {/* Skimlinks badge */}
          <span
            style={{
              display:      'inline-flex',
              alignItems:   'center',
              gap:          '4px',
              background:   tokens.colors.surface2,
              border:       `1px solid ${tokens.colors.border}`,
              borderRadius: '999px',
              padding:      '3px 9px',
              fontSize:     '10px',
              fontWeight:   600,
              color:        tokens.colors.muted,
              whiteSpace:   'nowrap',
            }}
          >
            {/* Skimlinks "S" monogram */}
            <svg
              width="8" height="10" viewBox="0 0 8 10" fill="none"
              aria-hidden="true"
            >
              <path
                d="M6.5 2.5C6.5 1.67 5.5 1 4 1 2.5 1 1.5 1.67 1.5 2.5c0 .83.9 1.3 2.5 1.7 1.8.44 3 1.1 3 2.3C7 7.7 5.8 9 4 9S1 7.7 1 6.5"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
            Powered by Skimlinks
          </span>

          {/* Amazon Associates badge */}
          <span
            style={{
              fontSize:   '10px',
              fontWeight: 500,
              color:      tokens.colors.muted,
              opacity:    0.7,
              whiteSpace: 'nowrap',
            }}
          >
            &amp; Amazon Associates
          </span>
        </div>
      </div>

      {/* ── Create-your-own CTA ────────────────────────────────────────────── */}
      <div style={{ textAlign: 'center', marginBottom: '16px' }}>
        <a
          href="/get-started"
          style={{
            display:        'inline-flex',
            alignItems:     'center',
            gap:            '6px',
            padding:        '9px 22px',
            borderRadius:   '999px',
            background:     theme.accentDim,
            border:         `1px solid ${theme.accentRing}`,
            color:          theme.accent,
            fontSize:       '12.5px',
            fontWeight:     700,
            textDecoration: 'none',
            letterSpacing:  '-0.01em',
            transition:     'background 150ms ease',
          }}
        >
          ✨ Create your own free wishlist
        </a>
      </div>

      {/* ── Navigation links ───────────────────────────────────────────────── */}
      <nav
        aria-label="Footer navigation"
        style={{
          display:        'flex',
          flexWrap:       'wrap',
          alignItems:     'center',
          justifyContent: 'center',
          gap:            '4px 0',
        }}
      >
        {[
          { href: '/privacy', label: 'Privacy Policy'   },
          { href: '/terms',   label: 'Terms of Service' },
          { href: '/',        label: 'About GiftHint'   },
        ].map(({ href, label }, i, arr) => (
          <span
            key={href}
            style={{ display: 'inline-flex', alignItems: 'center' }}
          >
            <Link
              href={href}
              style={{
                fontSize:       '11px',
                color:          tokens.colors.muted,
                textDecoration: 'none',
                padding:        '2px 8px',
                opacity:        0.75,
                transition:     'opacity 120ms ease',
              }}
            >
              {label}
            </Link>
            {i < arr.length - 1 && (
              <span
                aria-hidden="true"
                style={{
                  fontSize:   '11px',
                  color:      tokens.colors.muted,
                  opacity:    0.35,
                  userSelect: 'none',
                }}
              >
                ·
              </span>
            )}
          </span>
        ))}
      </nav>
    </footer>
  )
}
