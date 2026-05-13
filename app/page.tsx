/**
 * app/page.tsx — GiftHint landing page
 *
 * Light-theme redesign inspired by monica.im:
 *   - White background, lavender tint sections
 *   - Vivid violet CTAs (#7C3AED)
 *   - Dark near-black typography
 *   - Soft card shadows
 *
 * Server Component — no 'use client' needed.
 */

import type { Metadata } from 'next'
import type { ReactNode } from 'react'

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

// ── Light-theme design tokens (local — don't affect dark gifter page) ─────────

const c = {
  bg:           '#FFFFFF',
  bgTint:       '#F5F3FF',   // lavender section tint
  bgTintDeep:   '#EDE9FE',   // deeper lavender for pills / badges
  surface:      '#FFFFFF',
  surfaceHover: '#FAFAFA',
  border:       'rgba(0, 0, 0, 0.08)',
  borderMid:    'rgba(0, 0, 0, 0.12)',

  text:    '#0F0F1A',   // near-black headings
  textSub: '#374151',   // slightly lighter body
  muted:   '#6B7280',   // gray captions / secondary

  purple:      '#7C3AED',   // primary violet (monica-style)
  purpleMid:   '#8B5CF6',
  purpleLight: '#A78BFA',
  purpleDim:   'rgba(124, 58, 237, 0.09)',
  purpleRing:  'rgba(124, 58, 237, 0.22)',
  purpleGlow:  'rgba(124, 58, 237, 0.32)',

  green:    '#059669',
  greenDim: 'rgba(5, 150, 105, 0.1)',
  amber:    '#D97706',
  pink:     '#DB2777',

  shadow:    '0 1px 3px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.06)',
  shadowMd:  '0 4px 12px rgba(0,0,0,0.08), 0 16px 40px rgba(0,0,0,0.07)',
  shadowLg:  '0 8px 24px rgba(0,0,0,0.1), 0 32px 64px rgba(0,0,0,0.08)',
}

const font = "var(--font-inter), system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"

// ── Constants ─────────────────────────────────────────────────────────────────

const CHROME_STORE_URL = 'https://chrome.google.com/webstore/detail/gifthint/PLACEHOLDER'

// ── Browser frame wrapper ──────────────────────────────────────────────────────

function BrowserFrame({ url, children }: { url: string; children: ReactNode }) {
  return (
    <div style={{
      borderRadius: '14px',
      overflow:     'hidden',
      border:       `1px solid ${c.border}`,
      background:   c.surface,
      boxShadow:    c.shadowLg,
    }}>
      {/* Traffic-light bar */}
      <div style={{
        display:      'flex',
        alignItems:   'center',
        gap:          '6px',
        padding:      '10px 14px',
        background:   '#F3F4F6',
        borderBottom: `1px solid ${c.border}`,
      }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF5F57', display: 'block', flexShrink: 0 }} />
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#FFBD2E', display: 'block', flexShrink: 0 }} />
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#28CA41', display: 'block', flexShrink: 0 }} />
        <div style={{
          flex: 1, background: '#E5E7EB', borderRadius: '6px',
          padding: '3px 10px', marginLeft: '8px',
          fontSize: '10px', color: '#9CA3AF',
          overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
        }}>
          {url}
        </div>
      </div>
      {children}
    </div>
  )
}

// ── Step 1 mockup — Chrome Web Store listing ───────────────────────────────────

function InstallMockup() {
  return (
    <BrowserFrame url="chrome.google.com/webstore">
      <div style={{ padding: '22px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Extension header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
          <div style={{
            width: 60, height: 60, borderRadius: '14px', flexShrink: 0,
            background: 'linear-gradient(135deg, #7C3AED 0%, #A78BFA 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '28px', boxShadow: '0 4px 12px rgba(124,58,237,0.3)',
          }}>
            🎁
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: '14px', color: c.text }}>
              GiftHint — Wishlist Saver
            </p>
            <p style={{ margin: '2px 0 0', fontSize: '11.5px', color: '#1D4ED8' }}>gifthint.io</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '5px' }}>
              {'★★★★★'.split('').map((s, i) => (
                <span key={i} style={{ fontSize: '12px', color: '#F59E0B' }}>{s}</span>
              ))}
              <span style={{ fontSize: '11px', color: c.muted, marginLeft: '3px' }}>4.9 · 1,024 ratings</span>
            </div>
          </div>
          <div style={{
            background: '#1A73E8', color: '#fff',
            borderRadius: '6px', padding: '8px 16px',
            fontSize: '12.5px', fontWeight: 700, flexShrink: 0,
            boxShadow: '0 2px 8px rgba(26,115,232,0.35)',
          }}>
            Add to Chrome
          </div>
        </div>
        {/* Divider */}
        <div style={{ height: 1, background: c.border }} />
        {/* Feature bullets */}
        {[
          { icon: '♥', text: 'Save any product with one click' },
          { icon: '🔗', text: 'Shareable link — no account for viewers' },
          { icon: '🛡', text: 'No duplicate gifts — items get claimed' },
        ].map(({ icon, text }) => (
          <div key={text} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '14px', flexShrink: 0 }}>{icon}</span>
            <p style={{ margin: 0, fontSize: '12px', color: c.textSub }}>{text}</p>
          </div>
        ))}
      </div>
    </BrowserFrame>
  )
}

// ── Step 2 mockup — product page with floating heart ──────────────────────────

function ProductMockup() {
  return (
    <BrowserFrame url="amazon.com/dp/B0EXAMPLE">
      <div style={{ display: 'flex' }}>
        {/* Product image */}
        <div style={{
          width: '45%', flexShrink: 0,
          background: 'linear-gradient(135deg, #F3F4F6 0%, #E5E7EB 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', minHeight: '200px',
        }}>
          <span style={{ fontSize: '52px', opacity: 0.75 }}>👟</span>
          {/* Floating heart */}
          <div style={{
            position: 'absolute', bottom: '12px', right: '12px',
            width: '38px', height: '38px',
            background: c.pink,
            borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(219,39,119,0.5)',
            fontSize: '17px', color: '#fff',
          }}>
            ♥
          </div>
          {/* Saved toast */}
          <div style={{
            position: 'absolute', top: '12px', left: '50%',
            transform: 'translateX(-50%)',
            background: '#fff',
            border: `1px solid rgba(5,150,105,0.3)`,
            borderRadius: '999px',
            padding: '5px 12px',
            display: 'flex', alignItems: 'center', gap: '6px',
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
          }}>
            <span style={{ fontSize: '11px', color: c.green }}>✓</span>
            <span style={{ fontSize: '11px', color: c.text, fontWeight: 600 }}>Saved to GiftHint!</span>
          </div>
        </div>
        {/* Product details */}
        <div style={{ flex: 1, padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: '13px', color: c.text, lineHeight: 1.4 }}>
            Nike Air Max 270 React — White / Black
          </p>
          <p style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#B45309' }}>$129.99</p>
          <div style={{ height: 1, background: c.border }} />
          <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
            {'★★★★☆'.split('').map((s, i) => (
              <span key={i} style={{ fontSize: '11px', color: '#F59E0B' }}>{s}</span>
            ))}
            <span style={{ fontSize: '11px', color: c.muted, marginLeft: '2px' }}>4,381</span>
          </div>
          <div style={{
            background: '#FFD814', borderRadius: '8px',
            padding: '8px 10px', textAlign: 'center',
            fontSize: '12px', fontWeight: 700, color: '#0F1111',
          }}>
            Add to Cart
          </div>
          <div style={{
            background: '#FFA41C', borderRadius: '8px',
            padding: '8px 10px', textAlign: 'center',
            fontSize: '12px', fontWeight: 700, color: '#0F1111',
          }}>
            Buy Now
          </div>
        </div>
      </div>
    </BrowserFrame>
  )
}

// ── Step 3 mockup — the GiftHint list page ─────────────────────────────────────

function GiftListMockup() {
  const cards = [
    { emoji: '👟', name: 'Nike Air Max 270',  price: '$129.99', claimed: false },
    { emoji: '📚', name: 'Atomic Habits',      price: '$18.00',  claimed: true  },
    { emoji: '🎧', name: 'Sony WH-1000XM5',   price: '$348.00', claimed: false },
  ]
  return (
    <BrowserFrame url="gifthint.io/list/yourname">
      <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* Profile */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: 'linear-gradient(135deg, #EDE9FE, #DDD6FE)',
            border: `2px solid ${c.purple}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '20px',
          }}>
            😊
          </div>
          <p style={{ margin: 0, fontWeight: 800, fontSize: '14px', color: c.text }}>Alex&apos;s Gift List</p>
          {/* Copy link */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: c.purpleDim,
            border: `1px solid ${c.purpleRing}`,
            borderRadius: '999px', padding: '5px 14px',
          }}>
            <span style={{ fontSize: '11px' }}>🔗</span>
            <span style={{ fontSize: '11px', color: c.purple, fontWeight: 600 }}>Copy gift list link</span>
          </div>
        </div>
        {/* Gift cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
          {cards.map((card) => (
            <div key={card.name} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              background: card.claimed ? '#F9FAFB' : '#fff',
              borderRadius: '10px', padding: '9px 11px',
              opacity: card.claimed ? 0.5 : 1,
              border: `1px solid ${card.claimed ? c.border : 'rgba(124,58,237,0.12)'}`,
              boxShadow: card.claimed ? 'none' : '0 1px 4px rgba(0,0,0,0.05)',
            }}>
              <span style={{ fontSize: '20px', flexShrink: 0 }}>{card.emoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '11.5px', fontWeight: 600, color: c.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {card.name}
                </p>
                <p style={{ margin: 0, fontSize: '10.5px', color: card.claimed ? c.muted : c.green, fontWeight: card.claimed ? 400 : 600 }}>
                  {card.claimed ? '✓ Claimed' : card.price}
                </p>
              </div>
              {!card.claimed && (
                <div style={{
                  background: c.purple, borderRadius: '6px',
                  padding: '4px 10px', fontSize: '11px', color: '#fff',
                  fontWeight: 700, flexShrink: 0,
                }}>
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

// ── Step row (mockup + text, alternating) ──────────────────────────────────────

function StepRow({ number, title, body, mockup, flip = false }: {
  number: number
  title:  string
  body:   string
  mockup: ReactNode
  flip?:  boolean
}) {
  return (
    <div style={{
      display:       'flex',
      flexWrap:      'wrap',
      alignItems:    'center',
      gap:           '40px',
      flexDirection: flip ? 'row-reverse' : 'row',
    }}>
      <div style={{ flex: '1 1 300px', minWidth: 0 }}>{mockup}</div>
      <div style={{ flex: '1 1 260px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* Step badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: '30px', height: '30px', borderRadius: '50%',
            background: c.purpleDim, border: `1.5px solid ${c.purpleRing}`,
            fontSize: '12px', fontWeight: 900, color: c.purple, flexShrink: 0,
          }}>
            {number}
          </span>
          <span style={{ fontSize: '11px', fontWeight: 700, color: c.purple, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Step {number}
          </span>
        </div>
        <p style={{ margin: 0, fontSize: 'clamp(20px, 3vw, 26px)', fontWeight: 800, color: c.text, lineHeight: 1.2, letterSpacing: '-0.4px' }}>
          {title}
        </p>
        <p style={{ margin: 0, fontSize: '15px', color: c.muted, lineHeight: 1.7, maxWidth: '340px' }}>
          {body}
        </p>
      </div>
    </div>
  )
}

// ── FAQ accordion ──────────────────────────────────────────────────────────────

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <details style={{ borderBottom: `1px solid ${c.border}`, padding: '20px 0' }}>
      <summary style={{
        fontSize: '15px', fontWeight: 600, color: c.text,
        cursor: 'pointer', listStyle: 'none',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: '12px', userSelect: 'none',
      }}>
        {q}
        <svg width="16" height="16" viewBox="0 0 14 14" fill="none" aria-hidden="true"
          style={{ flexShrink: 0, transition: 'transform 200ms ease' }}
          className="gh-faq-chevron">
          <path d="M2 4.5l5 5 5-5" stroke={c.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <p style={{ margin: '12px 0 0', fontSize: '14px', color: c.muted, lineHeight: 1.7, maxWidth: '640px' }}>
        {a}
      </p>
    </details>
  )
}

// ── Retailers ──────────────────────────────────────────────────────────────────

const RETAILERS = [
  { emoji: '📦', name: 'Amazon'  },
  { emoji: '🎯', name: 'Target'  },
  { emoji: '🛒', name: 'Walmart' },
  { emoji: '🎨', name: 'Etsy'    },
  { emoji: '🍎', name: 'Apple'   },
  { emoji: '💄', name: 'Sephora' },
]

// ── Chrome icon SVG ────────────────────────────────────────────────────────────

function ChromeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="9" stroke="white" strokeWidth="1.5" />
      <circle cx="10" cy="10" r="3.5" fill="white" />
      <line x1="10" y1="6.5" x2="10" y2="1" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="13.5" y1="12.5" x2="18.5" y2="13.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="6.5" y1="12.5" x2="1.5" y2="13.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div style={{ minHeight: '100vh', background: c.bg, color: c.text, fontFamily: font }}>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        body { margin: 0; background: #fff; }
        a { color: inherit; text-decoration: none; }

        details[open] .gh-faq-chevron { transform: rotate(180deg); }

        @keyframes gh-pulse {
          0%   { box-shadow: 0 0 0 0    rgba(124,58,237,0.4); }
          70%  { box-shadow: 0 0 0 14px rgba(124,58,237,0); }
          100% { box-shadow: 0 0 0 0    rgba(124,58,237,0); }
        }
        .gh-pulse { animation: gh-pulse 2.4s ease-out infinite; }

        .gh-nav-link:hover { color: #0F0F1A !important; }
        .gh-cta-nav:hover  { background: #6D28D9 !important; }
        .gh-cta-main:hover { background: #6D28D9 !important; transform: translateY(-1px); }
        .gh-cta-main { transition: background 150ms, transform 150ms, box-shadow 150ms; }

        @media (prefers-reduced-motion: reduce) {
          .gh-pulse { animation: none; }
          .gh-cta-main { transition: none; }
        }
      `}</style>

      {/* ══════════════════════════════════════════════════════ 1. NAV ══ */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 32px', height: '60px',
        background: 'rgba(255,255,255,0.92)',
        borderBottom: `1px solid ${c.border}`,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}>
        {/* Logo */}
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '22px', lineHeight: 1 }}>🎁</span>
          <span style={{ fontSize: '16px', fontWeight: 800, color: c.text, letterSpacing: '-0.4px' }}>
            GiftHint
          </span>
        </a>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <a href="/list" className="gh-nav-link" style={{
            fontSize: '13.5px', fontWeight: 500, color: c.muted, padding: '6px 12px',
          }}>
            Sign in
          </a>
          <a href={CHROME_STORE_URL} target="_blank" rel="noopener noreferrer"
            className="gh-cta-nav"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              background: c.purple, color: '#fff',
              borderRadius: '999px', padding: '7px 16px',
              fontSize: '13px', fontWeight: 700, whiteSpace: 'nowrap',
              boxShadow: `0 2px 8px ${c.purpleGlow}`,
            }}>
            Add to Chrome
          </a>
        </div>
      </nav>

      {/* ══════════════════════════════════════════════════════ 2. HERO ══ */}
      <section style={{ textAlign: 'center', padding: '88px 24px 0', maxWidth: '720px', margin: '0 auto' }}>

        {/* Eyebrow */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '7px',
          background: c.bgTintDeep,
          borderRadius: '999px', padding: '5px 14px', marginBottom: '28px',
        }}>
          <span style={{ fontSize: '12px' }}>✨</span>
          <span style={{ fontSize: '12px', fontWeight: 600, color: c.purple, letterSpacing: '0.02em' }}>
            100% free · no credit card
          </span>
        </div>

        {/* Headline */}
        <h1 style={{
          margin: '0 0 20px',
          fontSize: 'clamp(36px, 6.5vw, 58px)',
          fontWeight: 900,
          lineHeight: 1.06,
          letterSpacing: '-1.5px',
          color: c.text,
        }}>
          Your gift list,{' '}
          <span style={{
            background: `linear-gradient(135deg, ${c.purple} 0%, ${c.purpleLight} 100%)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            anywhere on the web.
          </span>
        </h1>

        {/* Sub-copy */}
        <p style={{
          margin: '0 auto 36px',
          fontSize: 'clamp(16px, 2.5vw, 19px)',
          color: c.muted,
          lineHeight: 1.65,
          maxWidth: '500px',
          fontWeight: 400,
        }}>
          Click a heart on any product page. Share one link. Let friends buy you{' '}
          <strong style={{ color: c.textSub, fontWeight: 700 }}>exactly</strong>{' '}
          what you want — no more duplicate gifts.
        </p>

        {/* CTA */}
        <a href={CHROME_STORE_URL} target="_blank" rel="noopener noreferrer"
          className="gh-pulse gh-cta-main"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '10px',
            background: c.purple, color: '#fff',
            borderRadius: '14px', padding: '16px 36px',
            fontSize: '17px', fontWeight: 800, letterSpacing: '-0.2px',
            boxShadow: `0 6px 28px ${c.purpleGlow}`,
          }}>
          <ChromeIcon />
          Add to Chrome — it&apos;s free
        </a>

        <p style={{ marginTop: '14px', fontSize: '12px', color: c.muted }}>
          Works on Chrome · Edge · Brave · Arc
        </p>
      </section>

      {/* ══════════════════════════════════════════════ 3. HOW IT WORKS ══ */}
      <section style={{ background: c.bgTint, marginTop: '72px', padding: '80px 24px' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto' }}>

          {/* Section label */}
          <p style={{
            textAlign: 'center', margin: '0 0 64px',
            fontSize: '12px', fontWeight: 700, color: c.purple,
            letterSpacing: '0.12em', textTransform: 'uppercase',
          }}>
            How it works
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '72px' }}>
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
              title="Share your link. Friends buy. No duplicates."
              body="You get a permanent page at gifthint.io/list/yourname. When a friend clicks Buy, the item is claimed — nobody buys the same thing twice."
              mockup={<GiftListMockup />}
            />
          </div>
        </div>
      </section>

      {/* ═════════════════════════════════════════════ 4. SOCIAL PROOF ══ */}
      <section style={{ padding: '56px 24px', textAlign: 'center', background: c.bg }}>
        <p style={{ margin: '0 0 24px', fontSize: '14px', color: c.muted, fontWeight: 500 }}>
          Join <strong style={{ color: c.text }}>thousands of wishers</strong> who&apos;ve saved items from
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: '10px' }}>
          {RETAILERS.map(({ emoji, name }) => (
            <div key={name} style={{
              display: 'flex', alignItems: 'center', gap: '7px',
              background: c.bg, border: `1px solid ${c.border}`,
              borderRadius: '999px', padding: '6px 14px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}>
              <span style={{ fontSize: '15px', lineHeight: 1 }}>{emoji}</span>
              <span style={{ fontSize: '13px', fontWeight: 500, color: c.textSub }}>{name}</span>
            </div>
          ))}
          <div style={{
            background: c.bgTintDeep, border: `1px solid ${c.purpleRing}`,
            borderRadius: '999px', padding: '6px 14px',
          }}>
            <span style={{ fontSize: '13px', fontWeight: 500, color: c.purple }}>+ any store</span>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════ 5. FAQ ══ */}
      <section style={{ background: c.bgTint, padding: '72px 24px' }}>
        <div style={{ maxWidth: '680px', margin: '0 auto' }}>
          <p style={{
            margin: '0 0 8px', fontSize: '12px', fontWeight: 700, color: c.purple,
            letterSpacing: '0.12em', textTransform: 'uppercase',
          }}>
            FAQ
          </p>
          <h2 style={{ margin: '0 0 36px', fontSize: 'clamp(24px, 4vw, 32px)', fontWeight: 800, color: c.text, letterSpacing: '-0.5px' }}>
            Questions? We&apos;ve got answers.
          </h2>
          <div style={{ background: c.bg, borderRadius: '16px', padding: '0 24px', boxShadow: c.shadow }}>
            <FaqItem
              q="Do my friends need to install anything to view my list?"
              a="Nope. Your wishlist is a regular web page anyone can open in a browser — no extension, no account, no app. Just send them your link."
            />
            <FaqItem
              q="How do I share my wishlist link?"
              a="After installing the extension, sign in with Google and your personal link (e.g. gifthint.io/list/yourname) is ready instantly. Copy it from the popup and paste it anywhere."
            />
            <FaqItem
              q="Can two people accidentally buy the same gift?"
              a="No. When a gifter clicks 'Buy on [Store]' they claim the item first. Other visitors then see it greyed out as already claimed, so there are no duplicates."
            />
            <FaqItem
              q="How does GiftHint make money?"
              a="Some product links on your wishlist page are affiliate links. When a friend clicks through and makes a purchase, we may earn a small commission from the retailer at no extra cost to anyone."
            />
            <FaqItem
              q="Which browsers are supported?"
              a="The save extension works on Chrome, Edge, Brave, and Arc (any Chromium-based browser). The wishlist page works in every modern browser."
            />
            <FaqItem
              q="Is my wishlist public or private?"
              a="Your wishlist URL is unlisted — it won't show up in search engines and isn't discoverable from GiftHint.io. Only people you share the link with can see it."
            />
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════ 6. BOTTOM CTA ══ */}
      <section style={{ textAlign: 'center', padding: '88px 24px', background: c.bg }}>
        <p style={{
          margin: '0 0 14px',
          fontSize: 'clamp(26px, 4vw, 36px)',
          fontWeight: 900, letterSpacing: '-0.6px', color: c.text,
        }}>
          Ready to build your list?
        </p>
        <p style={{ margin: '0 auto 36px', fontSize: '15px', color: c.muted, maxWidth: '340px', lineHeight: 1.65 }}>
          Takes about 30 seconds to install and save your first item.
        </p>
        <a href={CHROME_STORE_URL} target="_blank" rel="noopener noreferrer"
          className="gh-cta-main"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '10px',
            background: c.purple, color: '#fff',
            borderRadius: '14px', padding: '15px 32px',
            fontSize: '16px', fontWeight: 800,
            boxShadow: `0 6px 28px ${c.purpleGlow}`,
          }}>
          <ChromeIcon />
          Add to Chrome — it&apos;s free
        </a>
      </section>

      {/* ═════════════════════════════════════════════════ 7. FOOTER ══ */}
      <footer style={{
        borderTop: `1px solid ${c.border}`,
        padding: '24px 32px',
        display: 'flex', flexWrap: 'wrap',
        alignItems: 'center', justifyContent: 'space-between', gap: '12px',
        background: c.bg,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>🎁</span>
          <span style={{ fontSize: '13px', color: c.muted }}>
            © {new Date().getFullYear()} GiftHint · Some links are affiliate links.
          </span>
        </div>
        <nav style={{ display: 'flex', gap: '20px' }} aria-label="Footer links">
          {[{ href: '/privacy', label: 'Privacy' }, { href: '/terms', label: 'Terms' }].map(({ href, label }) => (
            <a key={href} href={href} style={{ fontSize: '13px', color: c.muted }}
              className="gh-nav-link">
              {label}
            </a>
          ))}
        </nav>
      </footer>

    </div>
  )
}
