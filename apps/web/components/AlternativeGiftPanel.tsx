/**
 * components/AlternativeGiftPanel.tsx — GiftHint
 *
 * Shown below a claimed item card when the item has DNA preference tags.
 * Guides the gifter toward an equivalent alternative gift using the wisher's
 * structured preferences instead of the exact item.
 *
 * Layout (collapsed → expanded toggle):
 *
 *   ┌─────────────────────────────────────────────────────┐
 *   │  🔍 Can't find this? Here's what [Name] wants →     │  ← toggle
 *   └─────────────────────────────────────────────────────┘
 *
 *   ┌─────────────────────────────────────────────────────┐
 *   │  ⚠ This item may be out of stock or already claimed │
 *   │                                                     │
 *   │  "Sony WH-1000XM5 Wireless Headphones"              │  ← original title
 *   │                                                     │
 *   │  What [Name] prefers:                               │
 *   │  [#WiredOnly · Must be wired]  [#NoWhite · Not white] │  ← tag pills
 *   │                                                     │
 *   │  "Must be wired — just not white"                   │  ← guidance text
 *   │                                                     │
 *   │  [ Find a similar item on Amazon ↗ ]               │  ← CTA button
 *   └─────────────────────────────────────────────────────┘
 *
 * Props:
 *   item            — the claimed WishlistItem (must have dna_tags.length > 0)
 *   wisherFirstName — displayed as "Here's what [Name] wants"; defaults to "they"
 *
 * Theme:
 *   Reads accent colour from OccasionThemeContext so the CTA button matches the
 *   occasion colour of the current gifter page.
 */

'use client'

import { useState }              from 'react'
import { tokens }                from '@/tokens'
import { useOccasionTheme }      from '@/components/OccasionThemeContext'
import { generateAlternativeGuidance } from '@/lib/alternative-guidance'
import { buildSearchUrl, buildSearchQueryFromItem, getRetailerLabel } from '@/lib/retailer-search-urls'
import { DNA_TAG_TOOLTIPS }      from '@/lib/dna-tags'
import type { WishlistItem }     from '@/types/wishlist'

// ── Tag label helper ──────────────────────────────────────────────────────────

/**
 * Returns a short plain-English label for a DNA tag, suitable for pill display.
 * Derived from the first clause of the tooltip text (up to the first comma or dash).
 * Falls back to the raw tag text with # stripped.
 *
 * Examples:
 *   '#NoWhite'   → 'Not white'
 *   '#WiredOnly' → 'Must be wired'
 *   '#SizeUp'    → 'Usually sizes up'
 */
function tagLabel(tag: string): string {
  const tooltip = DNA_TAG_TOOLTIPS[tag]
  if (!tooltip) return tag.slice(1)

  // Trim to the first meaningful clause (before " —", comma, or parens)
  const short = tooltip
    .replace(/\s*—.*$/, '')       // drop everything after em-dash
    .replace(/\s*,.*$/,  '')       // drop everything after first comma
    .replace(/\s*\(.*$/, '')       // drop trailing parenthetical
    .trim()

  // Capitalise first letter
  return short.charAt(0).toUpperCase() + short.slice(1)
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      style={{
        flexShrink:  0,
        transition:  'transform 200ms ease',
        transform:   open ? 'rotate(90deg)' : 'rotate(0deg)',
      }}
    >
      <path
        d="M4.5 2.5L8 6l-3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ExternalLinkIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 11 11"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M4.5 2H2a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V6.5"
        stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"
      />
      <path
        d="M6.5 1H10m0 0v3.5M10 1 5 6"
        stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  )
}

// ── Tag pill with label ───────────────────────────────────────────────────────

function TagPillWithLabel({ tag, accent }: { tag: string; accent: string }) {
  const label   = tagLabel(tag)
  const tooltip = DNA_TAG_TOOLTIPS[tag]

  return (
    <div
      title={tooltip}
      style={{
        display:        'flex',
        flexDirection:  'column',
        gap:            '3px',
        alignItems:     'flex-start',
      }}
    >
      {/* Tag pill */}
      <span
        style={{
          fontSize:     '10px',
          fontWeight:   700,
          padding:      '2px 8px',
          borderRadius: tokens.radius.pill,
          background:   `${accent}1A`,
          border:       `1px solid ${accent}33`,
          color:        accent,
          whiteSpace:   'nowrap',
          letterSpacing: '0.01em',
        }}
      >
        {tag}
      </span>
      {/* Explanatory label */}
      <span
        style={{
          fontSize:  '10px',
          color:     tokens.colors.muted,
          lineHeight: 1.3,
        }}
      >
        {label}
      </span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface AlternativeGiftPanelProps {
  item:             WishlistItem
  /**
   * First name of the wisher, shown in "Here's what [Name] actually wants".
   * Defaults to "they" / "them" when not provided.
   */
  wisherFirstName?: string
}

export function AlternativeGiftPanel({
  item,
  wisherFirstName,
}: AlternativeGiftPanelProps) {
  const [open, setOpen] = useState(false)
  const theme           = useOccasionTheme()
  const accent          = theme.accent

  // Guard: only render when there's something meaningful to show
  if (!item.dna_tags || item.dna_tags.length === 0) return null

  const name        = wisherFirstName ?? 'they'
  const nameOrThey  = wisherFirstName ?? 'they'
  const guidance    = generateAlternativeGuidance(item)
  const searchQuery = buildSearchQueryFromItem(item)
  const searchUrl   = buildSearchUrl(item.retailer, searchQuery)
  const retailerLabel = getRetailerLabel(item.retailer)

  // Possessive form: "Sarah's" / "their"
  const possessive  = wisherFirstName
    ? `${wisherFirstName}'s`
    : 'their'

  return (
    <div
      style={{
        marginTop:    '8px',
        borderRadius: tokens.radius.md,
        border:       `1px solid ${open ? `${accent}30` : tokens.colors.border}`,
        overflow:     'hidden',
        transition:   'border-color 200ms ease',
      }}
    >
      {/* ── Toggle button ─────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          width:          '100%',
          padding:        '9px 12px',
          background:     open ? `${accent}0D` : tokens.colors.surface2,
          border:         'none',
          cursor:         'pointer',
          textAlign:      'left',
          gap:            '8px',
          transition:     'background 150ms ease',
        }}
      >
        <span
          style={{
            fontSize:   '11px',
            fontWeight: 600,
            color:      open ? accent : tokens.colors.muted,
            lineHeight: 1.4,
            transition: 'color 150ms ease',
          }}
        >
          🔍 Can&apos;t find this? Here&apos;s what {name} actually wants
        </span>
        <ChevronIcon open={open} />
      </button>

      {/* ── Expanded panel ────────────────────────────────────────────────── */}
      {open && (
        <div
          style={{
            padding:    '14px 14px 16px',
            background: tokens.colors.surface,
            borderTop:  `1px solid ${accent}20`,
          }}
        >
          {/* Status notice */}
          <div
            style={{
              display:      'flex',
              alignItems:   'flex-start',
              gap:          '7px',
              marginBottom: '12px',
              padding:      '8px 10px',
              borderRadius: tokens.radius.sm,
              background:   tokens.colors.surface2,
              border:       `1px solid ${tokens.colors.border}`,
            }}
          >
            <span style={{ fontSize: '12px', flexShrink: 0, lineHeight: 1.5 }}>⚠️</span>
            <p
              style={{
                margin:     0,
                fontSize:   '11px',
                color:      tokens.colors.muted,
                lineHeight: 1.5,
              }}
            >
              This item may be out of stock or already claimed.
              The preferences below can help you find an equally great alternative.
            </p>
          </div>

          {/* Original item title */}
          <p
            style={{
              margin:        '0 0 12px',
              fontSize:      '11.5px',
              fontWeight:    600,
              color:         tokens.colors.text,
              lineHeight:    1.4,
              fontStyle:     'italic',
              opacity:       0.7,
              paddingLeft:   '2px',
              borderLeft:    `2px solid ${accent}50`,
              paddingInlineStart: '8px',
            }}
          >
            &ldquo;{item.title}&rdquo;
          </p>

          {/* Section heading */}
          <p
            style={{
              margin:       '0 0 8px',
              fontSize:     '10.5px',
              fontWeight:   700,
              color:        tokens.colors.muted,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            What {possessive} tags say:
          </p>

          {/* Tag pills with labels — wrapping flex row */}
          <div
            style={{
              display:       'flex',
              flexWrap:      'wrap',
              gap:           '10px 14px',
              marginBottom:  guidance ? '14px' : '16px',
            }}
          >
            {item.dna_tags.map((tag) => (
              <TagPillWithLabel key={tag} tag={tag} accent={accent} />
            ))}
          </div>

          {/* Alternative guidance sentence */}
          {guidance && (
            <div
              style={{
                padding:      '10px 12px',
                borderRadius: tokens.radius.sm,
                background:   `${accent}0D`,
                border:       `1px solid ${accent}22`,
                marginBottom: '16px',
              }}
            >
              <p
                style={{
                  margin:     0,
                  fontSize:   '12px',
                  fontWeight: 500,
                  color:      tokens.colors.text,
                  lineHeight: 1.55,
                }}
              >
                <span
                  style={{
                    fontWeight: 700,
                    color:      accent,
                    marginRight: '4px',
                  }}
                >
                  💡
                </span>
                {guidance}
              </p>
            </div>
          )}

          {/* CTA — search for alternative */}
          <a
            href={searchUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-skimlinks-excluded="true"
            style={{
              display:         'flex',
              alignItems:      'center',
              justifyContent:  'center',
              gap:             '6px',
              width:           '100%',
              padding:         '9px 14px',
              borderRadius:    tokens.radius.md,
              background:      accent,
              color:           '#fff',
              fontSize:        '12px',
              fontWeight:      700,
              textDecoration:  'none',
              letterSpacing:   '-0.01em',
              boxSizing:       'border-box',
              transition:      'opacity 120ms ease',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.opacity = '0.87' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.opacity = '1' }}
            aria-label={`Find a similar item to ${item.title} on ${retailerLabel}`}
          >
            Find a similar item on {retailerLabel}
            <ExternalLinkIcon />
          </a>

          {/* Fine print */}
          <p
            style={{
              margin:    '8px 0 0',
              fontSize:  '10px',
              color:     tokens.colors.muted,
              textAlign: 'center',
              opacity:   0.7,
              lineHeight: 1.4,
            }}
          >
            Search results open on {retailerLabel}. Exact item may be listed differently.
          </p>
        </div>
      )}
    </div>
  )
}
