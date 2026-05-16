/**
 * components/OccasionHero.tsx — GiftHint
 *
 * The full-bleed hero section rendered at the top of every gifter list page.
 * Replaces the inline HeroSection that used to live in GifterPage.tsx.
 *
 * Anatomy (top → bottom):
 *   ┌──────────────────────────────────────────┐
 *   │  [large occasion emoji] (60 px)          │
 *   │  [occasion pill badge]                   │
 *   │  [h1: list title / tagline]              │
 *   │  [CountdownBadge]                        │
 *   │  ──── divider ────                       │
 *   │  [avatar]  [name + subtitle]             │
 *   │  [copy share link button]                │
 *   │  [🔒 no-spoilers notice]                 │
 *   └──────────────────────────────────────────┘
 *
 * The accent colour comes from OccasionThemeContext — no prop needed.
 *
 * Usage:
 *   <OccasionHero user={user} wishlist={wishlist} itemCount={42} listUrl="…" />
 */

'use client'

import { useState }           from 'react'
import { tokens }             from '@/tokens'
import { CountdownBadge }     from '@/components/CountdownBadge'
import { useOccasionTheme }   from '@/components/OccasionThemeContext'
import type { DbWishlist }    from '@/lib/supabase-server'
import type { WishUser }      from '@/app/list/[username]/page'

// ── LockIcon ──────────────────────────────────────────────────────────────────

function LockIcon() {
  return (
    <svg
      width="11"
      height="13"
      viewBox="0 0 11 13"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <rect x="1" y="5.5" width="9" height="7" rx="1.25"
        stroke="currentColor" strokeWidth="1.2" />
      <path d="M3.5 5.5V3.5a2 2 0 1 1 4 0v2"
        stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="5.5" cy="9" r="0.9" fill="currentColor" />
    </svg>
  )
}

// ── AvatarBubble ──────────────────────────────────────────────────────────────

function AvatarBubble({
  user,
  name,
  accent,
}: {
  user:   WishUser
  name:   string
  accent: string
}) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

  return (
    <div
      aria-hidden="true"
      style={{
        width:           '52px',
        height:          '52px',
        borderRadius:    '50%',
        flexShrink:      0,
        overflow:        'hidden',
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        fontSize:        '18px',
        fontWeight:      800,
        color:           '#fff',
        background:      user.avatar_url
          ? 'transparent'
          : `linear-gradient(140deg, ${accent} 0%, ${accent}99 100%)`,
        border:          `2.5px solid ${accent}55`,
        boxShadow:       `0 0 0 1px ${accent}22`,
      }}
    >
      {user.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.avatar_url}
          alt={name}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        initials
      )}
    </div>
  )
}

// ── OccasionHero ──────────────────────────────────────────────────────────────

interface OccasionHeroProps {
  user:      WishUser
  wishlist?: DbWishlist
  itemCount: number
  listUrl:   string
}

export function OccasionHero({
  user,
  wishlist,
  itemCount,
  listUrl,
}: OccasionHeroProps) {
  const theme  = useOccasionTheme()
  const [copied, setCopied] = useState(false)

  const name     = user.display_name?.split(' ')[0] ?? user.public_username ?? 'Someone'
  const tagline  = theme.heroTagline ? theme.heroTagline(name) : null
  const hasSlug  = !!wishlist

  // Use the list title when it's a named custom list, otherwise default headline
  const headline = (() => {
    if (tagline)                                          return tagline
    if (wishlist && wishlist.title !== 'My Wishlist')     return wishlist.title
    return `${name}'s Gift List`
  })()

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(listUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2_000)
    } catch {
      /* clipboard unavailable on http:// */
    }
  }

  const isDefaultOccasion = !wishlist || wishlist.occasion === 'other'

  return (
    <section
      aria-label={`${name}'s gift list`}
      style={{
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        gap:            '0',
        paddingTop:     '40px',
        paddingBottom:  '36px',
        paddingInline:  '24px',
        textAlign:      'center',
        position:       'relative',
        overflow:       'hidden',
      }}
    >
      {/* Radial glow from the accent colour — purely decorative */}
      <div
        aria-hidden="true"
        style={{
          position:      'absolute',
          top:           '-60px',
          left:          '50%',
          transform:     'translateX(-50%)',
          width:         '480px',
          height:        '280px',
          borderRadius:  '50%',
          background:    `radial-gradient(ellipse at center, ${theme.accentDim} 0%, transparent 70%)`,
          pointerEvents: 'none',
          zIndex:        0,
        }}
      />

      <div style={{ position: 'relative', zIndex: 1, display: 'contents' }}>

        {/* ── Large occasion emoji ─────────────────────────────────────────── */}
        {hasSlug && (
          <div
            aria-hidden="true"
            style={{
              fontSize:    '56px',
              lineHeight:  1,
              marginBottom: '16px',
              // Subtle drop shadow matching accent
              filter:      `drop-shadow(0 4px 16px ${theme.accentDim})`,
              userSelect:  'none',
            }}
          >
            {theme.emoji}
          </div>
        )}

        {/* ── Occasion pill badge ──────────────────────────────────────────── */}
        {hasSlug && !isDefaultOccasion && (
          <span
            style={{
              display:      'inline-flex',
              alignItems:   'center',
              gap:          '5px',
              padding:      '4px 12px',
              borderRadius: '999px',
              background:   theme.accentSoft,
              border:       `1px solid ${theme.accentRing}`,
              fontSize:     '11px',
              fontWeight:   700,
              color:        theme.accent,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              marginBottom: '12px',
            }}
          >
            {theme.emoji} {wishlist.occasion.replace('_', ' ')}
          </span>
        )}

        {/* ── Headline ─────────────────────────────────────────────────────── */}
        <h1
          style={{
            margin:        '0 0 12px',
            fontSize:      'clamp(22px, 5vw, 30px)',
            fontWeight:    800,
            color:         tokens.colors.text,
            lineHeight:    1.2,
            letterSpacing: '-0.03em',
            maxWidth:      '520px',
          }}
        >
          {headline}
        </h1>

        {/* ── Countdown badge ──────────────────────────────────────────────── */}
        {hasSlug && wishlist.occasion_date && (
          <div style={{ marginBottom: '20px' }}>
            <CountdownBadge
              occasionDate={wishlist.occasion_date}
              countdownLabel={theme.countdownLabel}
              accent={theme.accent}
            />
          </div>
        )}

        {/* ── Divider ──────────────────────────────────────────────────────── */}
        {hasSlug && (
          <div
            aria-hidden="true"
            style={{
              width:        '48px',
              height:       '1.5px',
              borderRadius: '999px',
              background:   `linear-gradient(90deg, transparent, ${theme.accentRing}, transparent)`,
              marginBottom: '20px',
            }}
          />
        )}

        {/* ── Avatar + name row ────────────────────────────────────────────── */}
        <div
          style={{
            display:    'flex',
            alignItems: 'center',
            gap:        '10px',
            marginBottom: '6px',
          }}
        >
          <AvatarBubble user={user} name={name} accent={theme.accent} />
          <div style={{ textAlign: 'left' }}>
            <p
              style={{
                margin:      0,
                fontSize:    '15px',
                fontWeight:  700,
                color:       tokens.colors.text,
                lineHeight:  1.3,
              }}
            >
              {user.display_name ?? user.public_username}
            </p>
            <p
              style={{
                margin:     0,
                fontSize:   '12px',
                color:      tokens.colors.muted,
                lineHeight: 1.4,
              }}
            >
              {itemCount} {itemCount === 1 ? 'gift' : 'gifts'} ·{' '}
              <span style={{ fontFamily: tokens.font.mono }}>
                gifthint.io
              </span>
            </p>
          </div>
        </div>

        {/* ── Copy share link button ───────────────────────────────────────── */}
        <button
          onClick={copyLink}
          aria-label={copied ? 'Link copied!' : 'Copy gift list link'}
          style={{
            display:      'inline-flex',
            alignItems:   'center',
            gap:          '7px',
            padding:      '8px 20px',
            borderRadius: '999px',
            background:   copied ? 'rgba(78,201,154,0.13)' : theme.accentDim,
            border:       `1px solid ${copied ? 'rgba(78,201,154,0.30)' : theme.accentRing}`,
            color:        copied ? '#4EC99A' : theme.accent,
            fontSize:     '13px',
            fontWeight:   700,
            cursor:       'pointer',
            transition:   'background 200ms ease, border-color 200ms ease, color 200ms ease',
            marginTop:    '14px',
            letterSpacing: '-0.01em',
          }}
        >
          {copied ? '✓ Copied!' : '🔗 Copy gift list link'}
        </button>

        {/* ── No-spoilers notice ───────────────────────────────────────────── */}
        <p
          style={{
            display:    'flex',
            alignItems: 'center',
            gap:        '5px',
            margin:     '14px 0 0',
            fontSize:   '11px',
            color:      tokens.colors.muted,
            opacity:    0.7,
          }}
        >
          <LockIcon />
          We won&apos;t tell{' '}
          <strong style={{ color: tokens.colors.muted, fontWeight: 600 }}>
            {name}
          </strong>{' '}
          who&apos;s buying what — no spoilers.
        </p>

      </div>
    </section>
  )
}
