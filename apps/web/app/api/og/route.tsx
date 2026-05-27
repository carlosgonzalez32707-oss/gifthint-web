/**
 * app/api/og/route.tsx — GiftHint dynamic OG image generation
 *
 * GET /api/og?username=&occasion=&itemCount=&availableCount=&topItemTitle=
 *             &img0=&img1=&img2=&occasionDate=
 *
 * Returns a 1200×630 PNG using Next.js built-in ImageResponse (powered by
 * Satori + Resvg — no external service, runs at the Edge).
 *
 * Query params:
 *   username       — wisher's first name or public_username (e.g. "Emma")
 *   occasion       — occasion key (birthday, christmas, wedding, …)
 *   itemCount      — total items on the list
 *   availableCount — unclaimed items (defaults to itemCount when absent)
 *   topItemTitle   — title of the top unclaimed item (optional)
 *   img0..img2     — up to 3 product image URLs (optional, HTTPS only)
 *   occasionDate   — ISO date string for countdown display (optional)
 *
 * Fallbacks:
 *   - No username       → generic "Create your GiftHint list" promo card
 *   - Missing img urls  → occasion emoji used as hero visual instead
 *   - Any param error   → generic card (never 500)
 *
 * Edge runtime: no Node.js APIs, no filesystem access.
 */

import { ImageResponse } from 'next/og'
import type { NextRequest } from 'next/server'

export const runtime = 'edge'

// ── Dimensions ────────────────────────────────────────────────────────────────

const W = 1200
const H = 630

// ── Occasion catalogue — mirrors lib/occasion-themes.ts ───────────────────────
// Duplicated here to keep this file edge-compatible (no lib/ imports that pull
// in Node-only modules).

const OCCASION_META: Record<string, { emoji: string; label: string; accent: string }> = {
  birthday:    { emoji: '🎂', label: 'Birthday',    accent: '#E872A0' },
  christmas:   { emoji: '🎄', label: 'Christmas',   accent: '#4EC99A' },
  wedding:     { emoji: '💍', label: 'Wedding',     accent: '#E8A84A' },
  baby_shower: { emoji: '👶', label: 'Baby Shower', accent: '#38BDF8' },
  graduation:  { emoji: '🎓', label: 'Graduation',  accent: '#8B83F0' },
  housewarming:{ emoji: '🏠', label: 'Housewarming',accent: '#F5A94E' },
  anniversary: { emoji: '🥂', label: 'Anniversary', accent: '#E872A0' },
  other:       { emoji: '🎁', label: 'Wish List',   accent: '#8B83F0' },
}

function getMeta(occasion: string) {
  return OCCASION_META[occasion] ?? OCCASION_META.other
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Hex → rgba() with alpha (no external dep, safe in Edge). */
function hexAlpha(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}

/** Clamp a number. */
function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

/** ISO date → "Dec 25" style label, or null on error. */
function formatDate(iso: string): string | null {
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return null
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return null
  }
}

// ── URL safety check ──────────────────────────────────────────────────────────
// Only pass HTTPS image URLs through to avoid SSRF via open redirect on the OG
// route. ImageResponse will fetch these at render time.

function safeImageUrl(raw: string | null): string | null {
  if (!raw) return null
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' ? raw : null
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OG card layouts
// ─────────────────────────────────────────────────────────────────────────────

/** Full personalised card shown when a username is present. */
function PersonalisedCard({
  name,
  occasion,
  itemCount,
  availableCount,
  images,
  occasionDate,
}: {
  name:           string
  occasion:       string
  itemCount:      number
  availableCount: number
  images:         (string | null)[]
  occasionDate:   string | null
}) {
  const meta    = getMeta(occasion)
  const accent  = meta.accent
  const validImgs = images.filter((u): u is string => !!u)
  const showImgs  = validImgs.length > 0

  const headline  = `${name}'s ${meta.label} List`
  const subline   = `${itemCount} gift${itemCount !== 1 ? 's' : ''} saved · ${availableCount} still available`
  const dateLabel = occasionDate ? formatDate(occasionDate) : null

  return (
    <div
      style={{
        width:          W,
        height:         H,
        display:        'flex',
        flexDirection:  'column',
        background:     '#0C0C0E',
        fontFamily:     '"DM Serif Display", Georgia, serif',
        position:       'relative',
        overflow:       'hidden',
      }}
    >
      {/* ── Accent strip — top edge ─────────────────────────────────────── */}
      <div
        style={{
          position:   'absolute',
          top:        0,
          left:       0,
          right:      0,
          height:     '6px',
          background: accent,
          display:    'flex',
        }}
      />

      {/* ── Radial glow ────────────────────────────────────────────────── */}
      <div
        style={{
          position:     'absolute',
          top:          '-120px',
          left:         '-80px',
          width:        '520px',
          height:       '520px',
          borderRadius: '50%',
          background:   `radial-gradient(ellipse at center, ${hexAlpha(accent, 0.14)} 0%, transparent 70%)`,
          display:      'flex',
        }}
      />

      {/* ── Main content ────────────────────────────────────────────────── */}
      <div
        style={{
          flex:           1,
          display:        'flex',
          flexDirection:  'row',
          alignItems:     'center',
          padding:        '54px 72px',
          gap:            '64px',
          marginTop:      '6px',
        }}
      >
        {/* Left column — text */}
        <div
          style={{
            display:        'flex',
            flexDirection:  'column',
            flex:           1,
            gap:            '0',
          }}
        >
          {/* Occasion emoji */}
          <div style={{ fontSize: '72px', lineHeight: 1, marginBottom: '24px', display: 'flex' }}>
            {meta.emoji}
          </div>

          {/* Occasion pill */}
          <div
            style={{
              display:      'flex',
              alignItems:   'center',
              gap:          '6px',
              marginBottom: '18px',
            }}
          >
            <div
              style={{
                background:   hexAlpha(accent, 0.18),
                border:       `1px solid ${hexAlpha(accent, 0.40)}`,
                borderRadius: '999px',
                padding:      '5px 16px',
                fontSize:     '22px',
                color:        accent,
                fontFamily:   '"Inter", system-ui, sans-serif',
                fontWeight:   700,
                display:      'flex',
                letterSpacing: '0.01em',
              }}
            >
              {meta.label}
            </div>
            {dateLabel && (
              <div
                style={{
                  background:   'rgba(240,238,232,0.07)',
                  border:       '1px solid rgba(240,238,232,0.10)',
                  borderRadius: '999px',
                  padding:      '5px 16px',
                  fontSize:     '20px',
                  color:        'rgba(240,238,232,0.55)',
                  fontFamily:   '"Inter", system-ui, sans-serif',
                  display:      'flex',
                }}
              >
                {dateLabel}
              </div>
            )}
          </div>

          {/* Headline */}
          <div
            style={{
              fontSize:      '68px',
              fontWeight:    700,
              color:         '#F0EEE8',
              lineHeight:    1.05,
              letterSpacing: '-0.02em',
              marginBottom:  '22px',
              display:       'flex',
              flexWrap:      'wrap',
            }}
          >
            {headline}
          </div>

          {/* Subline */}
          <div
            style={{
              fontSize:    '28px',
              color:       'rgba(240,238,232,0.50)',
              fontFamily:  '"Inter", system-ui, sans-serif',
              fontWeight:  400,
              lineHeight:  1.4,
              display:     'flex',
            }}
          >
            {subline}
          </div>
        </div>

        {/* Right column — product images */}
        {showImgs && (
          <div
            style={{
              display:        'flex',
              flexDirection:  'row',
              alignItems:     'center',
              gap:            '-24px',
              flexShrink:     0,
            }}
          >
            {validImgs.slice(0, 3).map((url, i) => (
              <div
                key={i}
                style={{
                  width:        clamp(260 - i * 28, 180, 260) + 'px',
                  height:       clamp(260 - i * 28, 180, 260) + 'px',
                  borderRadius: '20px',
                  overflow:     'hidden',
                  border:       `2px solid ${hexAlpha(accent, 0.25)}`,
                  boxShadow:    `0 ${8 + i * 4}px ${24 + i * 8}px rgba(0,0,0,0.55)`,
                  background:   '#18181B',
                  flexShrink:   0,
                  // Overlap cards: later cards shift left behind earlier ones
                  marginLeft:   i > 0 ? '-28px' : '0',
                  // Z-index: first card on top
                  zIndex:       3 - i,
                  display:      'flex',
                  position:     'relative',
                  transform:    i === 0 ? 'rotate(-3deg)' : i === 1 ? 'rotate(1deg)' : 'rotate(4deg)',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt=""
                  style={{
                    width:      '100%',
                    height:     '100%',
                    objectFit:  'cover',
                  }}
                />
              </div>
            ))}
          </div>
        )}

        {/* Fallback: big emoji when no product images */}
        {!showImgs && (
          <div
            style={{
              width:          '280px',
              height:         '280px',
              borderRadius:   '32px',
              background:     hexAlpha(accent, 0.10),
              border:         `2px solid ${hexAlpha(accent, 0.22)}`,
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              fontSize:       '120px',
              flexShrink:     0,
            }}
          >
            {meta.emoji}
          </div>
        )}
      </div>

      {/* ── Footer branding ─────────────────────────────────────────────── */}
      <div
        style={{
          display:        'flex',
          flexDirection:  'row',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        '0 72px 36px',
        }}
      >
        {/* Left: available count badge */}
        <div
          style={{
            display:      'flex',
            alignItems:   'center',
            gap:          '8px',
            background:   hexAlpha(accent, 0.12),
            border:       `1px solid ${hexAlpha(accent, 0.28)}`,
            borderRadius: '999px',
            padding:      '7px 20px',
            fontSize:     '22px',
            color:        accent,
            fontFamily:   '"Inter", system-ui, sans-serif',
            fontWeight:   600,
          }}
        >
          {availableCount} gift{availableCount !== 1 ? 's' : ''} left to buy
        </div>

        {/* Right: domain */}
        <div
          style={{
            fontSize:    '24px',
            color:       'rgba(240,238,232,0.28)',
            fontFamily:  '"Inter", system-ui, sans-serif',
            fontWeight:  500,
            letterSpacing: '-0.01em',
            display:     'flex',
          }}
        >
          gifthint.io
        </div>
      </div>
    </div>
  )
}

/** Generic promo card shown when no username is provided. */
function GenericCard() {
  const accent = '#8B83F0'
  return (
    <div
      style={{
        width:           W,
        height:          H,
        display:         'flex',
        flexDirection:   'column',
        alignItems:      'center',
        justifyContent:  'center',
        background:      '#0C0C0E',
        fontFamily:      '"DM Serif Display", Georgia, serif',
        position:        'relative',
        overflow:        'hidden',
      }}
    >
      {/* Accent strip */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '6px', background: accent, display: 'flex' }} />

      {/* Glow */}
      <div
        style={{
          position:     'absolute',
          top:          '50%',
          left:         '50%',
          transform:    'translate(-50%, -50%)',
          width:        '700px',
          height:       '700px',
          borderRadius: '50%',
          background:   `radial-gradient(ellipse at center, ${hexAlpha(accent, 0.10)} 0%, transparent 68%)`,
          display:      'flex',
        }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0', position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: '80px', marginBottom: '28px', display: 'flex' }}>🎁</div>

        <div
          style={{
            fontSize:      '72px',
            fontWeight:    700,
            color:         '#F0EEE8',
            letterSpacing: '-0.025em',
            lineHeight:    1.05,
            marginBottom:  '22px',
            display:       'flex',
          }}
        >
          Share your wish list
        </div>

        <div
          style={{
            fontSize:    '30px',
            color:       'rgba(240,238,232,0.48)',
            fontFamily:  '"Inter", system-ui, sans-serif',
            marginBottom:'40px',
            display:     'flex',
          }}
        >
          Tell people exactly what you want — no guessing.
        </div>

        <div
          style={{
            background:   accent,
            borderRadius: '999px',
            padding:      '16px 40px',
            fontSize:     '28px',
            color:        '#fff',
            fontFamily:   '"Inter", system-ui, sans-serif',
            fontWeight:   700,
            display:      'flex',
          }}
        >
          Create your free list at gifthint.io
        </div>
      </div>

      {/* Domain branding */}
      <div
        style={{
          position:   'absolute',
          bottom:     '32px',
          right:      '60px',
          fontSize:   '22px',
          color:      'rgba(240,238,232,0.22)',
          fontFamily: '"Inter", system-ui, sans-serif',
          display:    'flex',
        }}
      >
        gifthint.io
      </div>
    </div>
  )
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)

    const username       = searchParams.get('username')?.trim() ?? ''
    const occasion       = searchParams.get('occasion')?.trim() ?? 'other'
    const itemCount      = parseInt(searchParams.get('itemCount')  ?? '0', 10) || 0
    const availableRaw   = searchParams.get('availableCount')
    const availableCount = availableRaw !== null
      ? (parseInt(availableRaw, 10) || 0)
      : itemCount
    const occasionDate   = searchParams.get('occasionDate') ?? null

    // Collect up to 3 product image URLs
    const images: (string | null)[] = [
      safeImageUrl(searchParams.get('img0')),
      safeImageUrl(searchParams.get('img1')),
      safeImageUrl(searchParams.get('img2')),
    ]

    // Decide which layout to render
    const card = username
      ? PersonalisedCard({ name: username, occasion, itemCount, availableCount, images, occasionDate })
      : GenericCard()

    return new ImageResponse(card, {
      width:  W,
      height: H,
    })
  } catch (err) {
    // Never let OG generation crash the page — return generic card
    console.error('[GiftHint/og] render error:', err)
    return new ImageResponse(GenericCard(), { width: W, height: H })
  }
}
