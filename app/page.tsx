/**
 * app/page.tsx — GiftHint landing page
 *
 * Reached from "Create your free list →" on every gifter page.
 * Server Component — no 'use client' needed; all interactivity is plain HTML.
 *
 * Sections:
 *   1. Nav bar         — logo + "Sign in" link
 *   2. Hero            — headline, sub-copy, primary CTA
 *   3. How it works    — 3-step explainer
 *   4. Social proof    — strip with logos / count
 *   5. FAQ             — two key questions
 *   6. Footer          — minimal links
 */

import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { tokens } from '@/tokens'

// ── Metadata ──────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title:       'GiftHint — Your gift list, anywhere on the web',
  description: 'Save products from any store with one click. Share your wishlist link. Let friends buy you exactly what you want.',
  openGraph: {
    title:       'GiftHint — Your gift list, anywhere on the web',
    description: 'Save products from any store with one click. Share your wishlist link.',
    type:        'website',
  },
}

// ── Constants ─────────────────────────────────────────────────────────────────

// Replace with real Chrome Web Store URL when published
const CHROME_STORE_URL = 'https://chrome.google.com/webstore/detail/gifthint/PLACEHOLDER'
const APP_URL          = process.env.NEXT_PUBLIC_APP_URL ?? 'https://gifthint.io'

// ── Inline helpers (no extra component files needed for a single-page route) ──

/** Shared browser-chrome wrapper used by all three step mockups */
function BrowserFrame({
  url,
  children,
}: {
  url: string
  children: ReactNode
}) {
  return (
    <div
      style={{
        borderRadius: '12px',
        overflow:     'hidden',
        border:       `1px solid ${tokens.colors.borderSoft}`,
        background:   tokens.colors.surface,
        boxShadow:    '0 16px 48px rgba(0,0,0,0.55)',
        userSelect:   'none',
      }}
    >
      {/* Traffic-light bar */}
      <div
        style={{
          display:        'flex',
          alignItems:     'center',
          gap:            '6px',
          padding:        '9px 12px',
          background:     tokens.colors.surface2,
          borderBottom:   `1px solid ${tokens.colors.border}`,
        }}
      >
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF5F57', display: 'block' }} />
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#FFBD2E', display: 'block' }} />
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#28CA41', display: 'block' }} />
        <div
          style={{
            flex:         1,
            background:   tokens.colors.surface3,
            borderRadius: '6px',
            padding:      '3px 10px',
            marginLeft:   '8px',
            fontSize:     '10px',
            color:        tokens.colors.muted,
            overflow:     'hidden',
            whiteSpace:   'nowrap',
            textOverflow: 'ellipsis',
          }}
        >
          {url}
        </div>
      </div>
      {/* Page content */}
      <div style={{ padding: '0' }}>
        {children}
      </div>
    </div>
  )
}

/** Step 1 mockup — Chrome Web Store extension listing */
function InstallMockup() {
  return (
    <BrowserFrame url="chrome.google.com/webstore">
      <div style={{ padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* Extension header row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
          {/* Icon */}
          <div
            style={{
              width: 56, height: 56, borderRadius: '12px',
              background: 'linear-gradient(135deg, #8B83F0 0%, #c4b5fd 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '26px', flexShrink: 0,
            }}
          >
            🎁
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: '13px', color: tokens.colors.text }}>GiftHint — Wishlist Saver</p>
            <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#4EC99A' }}>gifthint.io</p>
            {/* Stars */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
              {'★★★★★'.split('').map((s, i) => (
                <span key={i} style={{ fontSize: '11px', color: '#F5A94E' }}>{s}</span>
              ))}
              <span style={{ fontSize: '10px', color: tokens.colors.muted, marginLeft: '2px' }}>4.9 (1,024)</span>
            </div>
          </div>
          {/* CTA */}
          <div
            style={{
              background: '#1A73E8', color: '#fff',
              borderRadius: '4px', padding: '7px 14px',
              fontSize: '12px', fontWeight: 700, flexShrink: 0,
              boxShadow: '0 2px 8px rgba(26,115,232,0.4)',
            }}
          >
            Add to Chrome
          </div>
        </div>
        {/* Divider */}
        <div style={{ height: 1, background: tokens.colors.border }} />
        {/* Feature bullets */}
        {[
          '♥  Save any product with one click',
          '🔗  Shareable wishlist link — no account for viewers',
          '🛡  No duplicate gifts — items get claimed',
        ].map((text) => (
          <p key={text} style={{ margin: 0, fontSize: '11.5px', color: tokens.colors.muted, lineHeight: 1.5 }}>
            {text}
          </p>
        ))}
      </div>
    </BrowserFrame>
  )
}

/** Step 2 mockup — product page with floating heart button */
function ProductMockup() {
  return (
    <BrowserFrame url="amazon.com/dp/B0EXAMPLE">
      <div style={{ display: 'flex', gap: '0', fontSize: '11px' }}>
        {/* Product image area */}
        <div
          style={{
            width: '44%', flexShrink: 0, aspectRatio: '1',
            background: 'linear-gradient(135deg, #1C1C22 0%, #242430 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative',
          }}
        >
          {/* Product placeholder */}
          <span style={{ fontSize: '42px', opacity: 0.6 }}>👟</span>
          {/* Floating heart button */}
          <div
            style={{
              position: 'absolute', bottom: '10px', right: '10px',
              width: '36px', height: '36px',
              background: 'rgba(244,114,182,0.95)',
              borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 3px 12px rgba(244,114,182,0.55)',
              fontSize: '16px', cursor: 'pointer',
            }}
          >
            ♥
          </div>
          {/* "Saved!" toast */}
          <div
            style={{
              position: 'absolute', top: '10px', left: '50%',
              transform: 'translateX(-50%)',
              background: tokens.colors.surface,
              border: `1px solid ${tokens.colors.greenRing}`,
              borderRadius: '999px',
              padding: '4px 10px',
              display: 'flex', alignItems: 'center', gap: '5px',
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            }}
          >
            <span style={{ fontSize: '10px', color: tokens.colors.green }}>✓</span>
            <span style={{ fontSize: '10px', color: tokens.colors.text, fontWeight: 600 }}>Saved to GiftHint!</span>
          </div>
        </div>
        {/* Product details */}
        <div style={{ flex: 1, padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: '12px', color: tokens.colors.text, lineHeight: 1.4 }}>
            Nike Air Max 270 React — White/Black
          </p>
          <p style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: tokens.colors.green }}>$129.99</p>
          <div style={{ height: 1, background: tokens.colors.border }} />
          {/* Fake rating */}
          <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
            {'★★★★☆'.split('').map((s, i) => (
              <span key={i} style={{ fontSize: '10px', color: '#F5A94E' }}>{s}</span>
            ))}
            <span style={{ fontSize: '10px', color: tokens.colors.muted }}>4,381</span>
          </div>
          {/* Fake ATC button */}
          <div
            style={{
              background: '#F5A94E', borderRadius: '8px',
              padding: '7px 10px', textAlign: 'center',
              fontSize: '11px', fontWeight: 700, color: '#000',
            }}
          >
            Add to Cart
          </div>
        </div>
      </div>
    </BrowserFrame>
  )
}

/** Step 3 mockup — the gifthint list page a friend would see */
function GiftListMockup() {
  const cards = [
    { emoji: '👟', name: 'Nike Air Max 270', price: '$129.99', claimed: false },
    { emoji: '📚', name: 'Atomic Habits', price: '$18.00', claimed: true  },
    { emoji: '🎧', name: 'Sony WH-1000XM5', price: '$348.00', claimed: false },
  ]
  return (
    <BrowserFrame url="gifthint.io/list/yourname">
      <div style={{ padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* Profile row */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
          <div
            style={{
              width: 40, height: 40, borderRadius: '50%',
              background: tokens.colors.purpleDim,
              border: `2px solid ${tokens.colors.purple}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '16px',
            }}
          >
            😊
          </div>
          <p style={{ margin: 0, fontWeight: 800, fontSize: '13px', color: tokens.colors.text }}>Alex&apos;s Gift List</p>
          {/* Copy link button */}
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              background: tokens.colors.purpleDim,
              border: `1px solid ${tokens.colors.purpleRing}`,
              borderRadius: '999px', padding: '4px 12px',
            }}
          >
            <span style={{ fontSize: '10px' }}>🔗</span>
            <span style={{ fontSize: '10px', color: tokens.colors.purple, fontWeight: 600 }}>Copy gift list link</span>
          </div>
        </div>
        {/* Gift cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {cards.map((c) => (
            <div
              key={c.name}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                background: tokens.colors.surface2,
                borderRadius: '8px', padding: '8px 10px',
                opacity: c.claimed ? 0.45 : 1,
                border: `1px solid ${tokens.colors.border}`,
              }}
            >
              <span style={{ fontSize: '18px', flexShrink: 0 }}>{c.emoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '11px', fontWeight: 600, color: tokens.colors.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</p>
                <p style={{ margin: 0, fontSize: '10px', color: c.claimed ? tokens.colors.muted : tokens.colors.green }}>{c.claimed ? '✓ Claimed' : c.price}</p>
              </div>
              {!c.claimed && (
                <div style={{ background: tokens.colors.purple, borderRadius: '6px', padding: '3px 8px', fontSize: '10px', color: '#fff', fontWeight: 700, flexShrink: 0 }}>
                  Buy
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </BrowserFrame>
  )
}

/** A single illustrated step row (image above on mobile, side-by-side on desktop) */
function StepRow({
  number,
  title,
  body,
  mockup,
  flip = false,
}: {
  number: number
  title:  string
  body:   string
  mockup: ReactNode
  flip?:  boolean
}) {
  return (
    <div
      style={{
        display:       'flex',
        flexWrap:      'wrap',
        alignItems:    'center',
        gap:           '32px',
        flexDirection: flip ? 'row-reverse' : 'row',
      }}
    >
      {/* Mockup — grows to fill half the width on wide screens */}
      <div style={{ flex: '1 1 280px', minWidth: '0' }}>
        {mockup}
      </div>

      {/* Text */}
      <div style={{ flex: '1 1 240px', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: '28px', height: '28px',
              borderRadius: '50%',
              background: tokens.colors.purpleDim,
              border: `1px solid ${tokens.colors.purpleRing}`,
              fontSize: '12px', fontWeight: 900,
              color: tokens.colors.purple,
              flexShrink: 0,
            }}
          >
            {number}
          </span>
          <span style={{ fontSize: '11px', fontWeight: 700, color: tokens.colors.muted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Step {number}
          </span>
        </div>
        <p style={{ margin: 0, fontSize: 'clamp(18px, 3vw, 22px)', fontWeight: 800, color: tokens.colors.text, lineHeight: 1.25, letterSpacing: '-0.3px' }}>
          {title}
        </p>
        <p style={{ margin: 0, fontSize: '14px', color: tokens.colors.muted, lineHeight: 1.7, maxWidth: '340px' }}>
          {body}
        </p>
      </div>
    </div>
  )
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <details
      style={{
        borderBottom: `1px solid ${tokens.colors.border}`,
        padding:      '18px 0',
      }}
    >
      <summary
        style={{
          fontSize:    '14px',
          fontWeight:  600,
          color:       tokens.colors.text,
          cursor:      'pointer',
          listStyle:   'none',
          display:     'flex',
          justifyContent: 'space-between',
          alignItems:  'center',
          gap:         '12px',
          userSelect:  'none',
        }}
      >
        {q}
        {/* Chevron — CSS rotates it when open via details[open] */}
        <svg
          width="14" height="14" viewBox="0 0 14 14" fill="none"
          aria-hidden="true"
          style={{ flexShrink: 0, transition: 'transform 200ms ease' }}
          className="gh-faq-chevron"
        >
          <path d="M2 4.5l5 5 5-5"
            stroke={tokens.colors.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <p
        style={{
          margin:     '10px 0 0',
          fontSize:   '13.5px',
          color:      tokens.colors.muted,
          lineHeight: 1.65,
          maxWidth:   '640px',
        }}
      >
        {a}
      </p>
    </details>
  )
}

// ── Retailer logos (text-based, no external images) ───────────────────────────

const RETAILERS = [
  { emoji: '📦', name: 'Amazon'    },
  { emoji: '🎯', name: 'Target'    },
  { emoji: '🛒', name: 'Walmart'   },
  { emoji: '🎨', name: 'Etsy'      },
  { emoji: '🍎', name: 'Apple'     },
  { emoji: '💄', name: 'Sephora'   },
]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div
      style={{
        minHeight:   '100vh',
        background:  tokens.colors.bg,
        color:       tokens.colors.text,
        fontFamily:  tokens.font.sans,
      }}
    >

      {/* ── Global styles injected once ─────────────────────────────────────── */}
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        body { margin: 0; }

        /* FAQ chevron rotation when open */
        details[open] .gh-faq-chevron { transform: rotate(180deg); }

        /* Pulse ring on the Chrome icon */
        @keyframes gh-pulse {
          0%   { box-shadow: 0 0 0 0   rgba(139,131,240,0.45); }
          70%  { box-shadow: 0 0 0 12px rgba(139,131,240,0); }
          100% { box-shadow: 0 0 0 0   rgba(139,131,240,0); }
        }
        .gh-cta-pulse { animation: gh-pulse 2.2s ease-out infinite; }

        a { color: inherit; }
      `}</style>

      {/* ══════════════════════════════════════════════════════════════════════
          1. NAV
      ══════════════════════════════════════════════════════════════════════ */}
      <nav
        style={{
          position:       'sticky',
          top:            0,
          zIndex:         100,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        '0 24px',
          height:         '56px',
          background:     tokens.colors.bg,
          borderBottom:   `1px solid ${tokens.colors.border}`,
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        }}
      >
        {/* Logo */}
        <a
          href="/"
          style={{
            display:        'flex',
            alignItems:     'center',
            gap:            '7px',
            textDecoration: 'none',
          }}
        >
          <span style={{ fontSize: '20px', lineHeight: 1 }}>🎁</span>
          <span
            style={{
              fontSize:   '15px',
              fontWeight: 800,
              color:      tokens.colors.text,
              letterSpacing: '-0.3px',
            }}
          >
            GiftHint
          </span>
        </a>

        {/* Nav actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <a
            href="/list"
            style={{
              fontSize:       '12.5px',
              fontWeight:     500,
              color:          tokens.colors.muted,
              textDecoration: 'none',
              padding:        '6px 10px',
            }}
          >
            Sign in
          </a>
          <a
            href={CHROME_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display:        'inline-flex',
              alignItems:     'center',
              gap:            '6px',
              background:     tokens.colors.purple,
              color:          '#fff',
              borderRadius:   '999px',
              padding:        '6px 14px',
              fontSize:       '12px',
              fontWeight:     700,
              textDecoration: 'none',
              letterSpacing:  '0.1px',
              whiteSpace:     'nowrap',
            }}
          >
            Add to Chrome
          </a>
        </div>
      </nav>

      {/* Main content wrapper */}
      <main style={{ maxWidth: '860px', margin: '0 auto', padding: '0 20px' }}>

        {/* ════════════════════════════════════════════════════════════════════
            2. HERO
        ════════════════════════════════════════════════════════════════════ */}
        <section
          style={{
            textAlign: 'center',
            padding:   '80px 0 72px',
          }}
        >
          {/* Eyebrow pill */}
          <div
            style={{
              display:        'inline-flex',
              alignItems:     'center',
              gap:            '6px',
              background:     tokens.colors.purpleDim,
              border:         `1px solid ${tokens.colors.purpleRing}`,
              borderRadius:   '999px',
              padding:        '4px 13px',
              marginBottom:   '28px',
            }}
          >
            <span style={{ fontSize: '11px' }} aria-hidden="true">✨</span>
            <span
              style={{
                fontSize:   '11.5px',
                fontWeight: 600,
                color:      tokens.colors.purple,
                letterSpacing: '0.02em',
              }}
            >
              100% free · no credit card
            </span>
          </div>

          {/* Headline */}
          <h1
            style={{
              margin:       '0 0 20px',
              fontSize:     'clamp(32px, 6vw, 52px)',
              fontWeight:   900,
              lineHeight:   1.08,
              letterSpacing: '-1.5px',
              color:        tokens.colors.text,
            }}
          >
            Your gift list.
            <br />
            <span
              style={{
                background:            `linear-gradient(135deg, ${tokens.colors.purple} 0%, #c4b5fd 100%)`,
                WebkitBackgroundClip:  'text',
                WebkitTextFillColor:   'transparent',
                backgroundClip:        'text',
              }}
            >
              Anywhere on the web.
            </span>
          </h1>

          {/* Sub-copy */}
          <p
            style={{
              margin:     '0 auto 40px',
              fontSize:   'clamp(15px, 2.5vw, 18px)',
              fontWeight: 400,
              color:      tokens.colors.muted,
              lineHeight: 1.65,
              maxWidth:   '480px',
            }}
          >
            Click a heart on any product page. Share one link. Let friends buy
            you{' '}
            <em style={{ color: tokens.colors.text, fontStyle: 'normal', fontWeight: 600 }}>
              exactly
            </em>{' '}
            what you want — no more duplicate gifts.
          </p>

          {/* Primary CTA */}
          <a
            href={CHROME_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="gh-cta-pulse"
            style={{
              display:        'inline-flex',
              alignItems:     'center',
              gap:            '10px',
              background:     tokens.colors.purple,
              color:          '#fff',
              borderRadius:   '14px',
              padding:        '16px 32px',
              fontSize:       '16px',
              fontWeight:     800,
              textDecoration: 'none',
              letterSpacing:  '-0.2px',
              boxShadow:      `0 4px 24px ${tokens.colors.purpleGlow}`,
            }}
          >
            {/* Chrome icon */}
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <circle cx="10" cy="10" r="9" stroke="white" strokeWidth="1.5" />
              <circle cx="10" cy="10" r="3.5" fill="white" />
              <line x1="10" y1="6.5" x2="10" y2="1" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="13.5" y1="12.5" x2="18.5" y2="13.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" transform="rotate(0 10 10)"/>
              <line x1="6.5" y1="12.5" x2="1.5" y2="13.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Add to Chrome — it{"'"}s free
          </a>

          <p
            style={{
              marginTop:  '14px',
              fontSize:   '11.5px',
              color:      tokens.colors.muted,
              opacity:    0.7,
            }}
          >
            Works on Chrome · Edge · Brave · Arc
          </p>
        </section>

        {/* ════════════════════════════════════════════════════════════════════
            3. HOW IT WORKS
        ════════════════════════════════════════════════════════════════════ */}
        <section style={{ paddingBottom: '80px' }}>
          <h2
            style={{
              textAlign:    'center',
              fontSize:     '11.5px',
              fontWeight:   700,
              color:        tokens.colors.muted,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginBottom: '56px',
            }}
          >
            How it works
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '64px' }}>
            <StepRow
              number={1}
              title="Install the free extension"
              body="One click from the Chrome Web Store. Works on Chrome, Edge, Brave, and Arc. No account needed to start saving items right away."
              mockup={<InstallMockup />}
            />

            <StepRow
              number={2}
              title="Click the heart on any product"
              body="Browse Amazon, Etsy, Walmart — anywhere you shop. A floating pink heart appears on every product page. Tap it and the item is instantly saved to your list."
              mockup={<ProductMockup />}
              flip
            />

            <StepRow
              number={3}
              title="Share your link — friends buy, no duplicates"
              body="You get a permanent page at gifthint.io/list/yourname. When a friend clicks Buy, the item is claimed so nobody buys the same thing twice."
              mockup={<GiftListMockup />}
            />
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════════
            4. SOCIAL PROOF STRIP
        ════════════════════════════════════════════════════════════════════ */}
        <section
          style={{
            borderTop:    `1px solid ${tokens.colors.border}`,
            borderBottom: `1px solid ${tokens.colors.border}`,
            padding:      '32px 0',
            marginBottom: '72px',
            textAlign:    'center',
          }}
        >
          <p
            style={{
              margin:     '0 0 22px',
              fontSize:   '13px',
              fontWeight: 500,
              color:      tokens.colors.muted,
            }}
          >
            Join{' '}
            <strong style={{ color: tokens.colors.text }}>thousands of wishers</strong>{' '}
            who{"'"}ve saved items from
          </p>

          <div
            style={{
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              flexWrap:       'wrap',
              gap:            '8px 16px',
            }}
          >
            {RETAILERS.map(({ emoji, name }) => (
              <div
                key={name}
                style={{
                  display:      'flex',
                  alignItems:   'center',
                  gap:          '6px',
                  background:   tokens.colors.surface,
                  border:       `1px solid ${tokens.colors.border}`,
                  borderRadius: '999px',
                  padding:      '5px 12px',
                }}
              >
                <span style={{ fontSize: '14px', lineHeight: 1 }} aria-hidden="true">
                  {emoji}
                </span>
                <span
                  style={{
                    fontSize:   '12.5px',
                    fontWeight: 500,
                    color:      tokens.colors.muted,
                  }}
                >
                  {name}
                </span>
              </div>
            ))}

            {/* "and more" pill */}
            <div
              style={{
                background:   tokens.colors.surface2,
                border:       `1px solid ${tokens.colors.border}`,
                borderRadius: '999px',
                padding:      '5px 12px',
              }}
            >
              <span
                style={{
                  fontSize:   '12.5px',
                  fontWeight: 500,
                  color:      tokens.colors.muted,
                }}
              >
                + any store
              </span>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════════
            5. FAQ
        ════════════════════════════════════════════════════════════════════ */}
        <section style={{ paddingBottom: '80px' }}>
          <h2
            style={{
              fontSize:     '11.5px',
              fontWeight:   700,
              color:        tokens.colors.muted,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginBottom: '4px',
            }}
          >
            FAQ
          </h2>

          <div>
            <FaqItem
              q="Do my friends need to install anything to view my list?"
              a="Nope. Your wishlist is a regular web page anyone can open in a browser — no extension, no account, no app. Just send them your link."
            />
            <FaqItem
              q="How do I share my wishlist link?"
              a="After installing the extension, sign in with Google and your personal link (e.g. gifthint.io/list/yourname) is ready instantly. Copy it from the popup and paste it anywhere — texts, emails, group chats, Instagram bio."
            />
            <FaqItem
              q="Can two people accidentally buy the same gift?"
              a="No. When a gifter clicks 'Buy on [Store]' they claim the item first. Other visitors then see it greyed out as already claimed, so there are no duplicates."
            />
            <FaqItem
              q="How does GiftHint make money?"
              a="Some product links on your wishlist page are affiliate links. When a friend clicks through and makes a purchase, we may earn a small commission from the retailer at no extra cost to anyone. This is how we keep GiftHint free forever."
            />
            <FaqItem
              q="Which browsers are supported?"
              a="The save extension works on Chrome, Edge, Brave, and Arc (any Chromium-based browser). The wishlist page works in every modern browser — your friends don't need a specific browser to view your list."
            />
            <FaqItem
              q="Is my wishlist public or private?"
              a="Your wishlist URL is unlisted — it won't show up in search engines and isn't discoverable from GiftHint.io. Only people you share the link with can see it."
            />
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════════
            6. BOTTOM CTA
        ════════════════════════════════════════════════════════════════════ */}
        <section
          style={{
            textAlign:    'center',
            padding:      '56px 0 80px',
            borderTop:    `1px solid ${tokens.colors.border}`,
          }}
        >
          <p
            style={{
              margin:       '0 0 12px',
              fontSize:     'clamp(22px, 4vw, 30px)',
              fontWeight:   900,
              letterSpacing: '-0.5px',
              color:        tokens.colors.text,
            }}
          >
            Ready to build your list?
          </p>
          <p
            style={{
              margin:     '0 auto 32px',
              fontSize:   '14px',
              color:      tokens.colors.muted,
              maxWidth:   '340px',
              lineHeight: 1.6,
            }}
          >
            It takes about 30 seconds to install and save your first item.
          </p>
          <a
            href={CHROME_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display:        'inline-flex',
              alignItems:     'center',
              gap:            '8px',
              background:     tokens.colors.purple,
              color:          '#fff',
              borderRadius:   '14px',
              padding:        '14px 28px',
              fontSize:       '14.5px',
              fontWeight:     800,
              textDecoration: 'none',
              letterSpacing:  '-0.1px',
              boxShadow:      `0 4px 24px ${tokens.colors.purpleGlow}`,
            }}
          >
            Add to Chrome — it{"'"}s free
          </a>
        </section>

      </main>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer
        style={{
          borderTop:      `1px solid ${tokens.colors.border}`,
          padding:        '20px 24px',
          display:        'flex',
          flexWrap:       'wrap',
          alignItems:     'center',
          justifyContent: 'space-between',
          gap:            '10px',
        }}
      >
        <p
          style={{
            margin:   0,
            fontSize: '12px',
            color:    tokens.colors.muted,
            opacity:  0.7,
          }}
        >
          © {new Date().getFullYear()} GiftHint. Some links are affiliate links.
        </p>

        <nav
          style={{
            display: 'flex',
            gap:     '16px',
          }}
          aria-label="Footer links"
        >
          {[
            { href: '/privacy', label: 'Privacy' },
            { href: '/terms',   label: 'Terms'   },
          ].map(({ href, label }) => (
            <a
              key={href}
              href={href}
              style={{
                fontSize:       '12px',
                color:          tokens.colors.muted,
                textDecoration: 'none',
                opacity:        0.7,
              }}
            >
              {label}
            </a>
          ))}
        </nav>
      </footer>

    </div>
  )
}
