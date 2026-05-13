/**
 * app/page.tsx — GiftHint landing page
 *
 * Visually rich redesign:
 *  • Hero with gradient orb, floating product demo, animated headline
 *  • CSS scroll-driven reveals (Chrome/Edge) with graceful fallback
 *  • Infinite CSS marquee for retailers
 *  • Bento feature grid
 *  • Large illustrated "How it works" steps
 *  • Testimonials strip
 *  • Full-gradient bottom CTA
 */

import type { Metadata } from 'next'
import type { ReactNode } from 'react'

// ── Metadata ─────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title:       'GiftHint — Your gift list, anywhere on the web',
  description: 'Save products from any store with one click. Share your wishlist. Let friends buy you exactly what you want — no duplicates.',
  openGraph: {
    title:       'GiftHint — Your gift list, anywhere on the web',
    description: 'Save products from any store with one click. Share your wishlist link.',
    type:        'website',
  },
}

// ── Design tokens ─────────────────────────────────────────────────────────────

const c = {
  bg:         '#FFFFFF',
  bgTint:     '#F5F3FF',
  bgTintDeep: '#EDE9FE',
  border:     'rgba(0,0,0,0.07)',
  text:       '#0F0F1A',
  textSub:    '#374151',
  muted:      '#6B7280',
  mutedLight: '#9CA3AF',
  purple:     '#7C3AED',
  purpleMid:  '#8B5CF6',
  purpleLight:'#A78BFA',
  purplePale: '#C4B5FD',
  purpleDim:  'rgba(124,58,237,0.08)',
  purpleRing: 'rgba(124,58,237,0.2)',
  purpleGlow: 'rgba(124,58,237,0.35)',
  pink:       '#DB2777',
  pinkLight:  '#F472B6',
  green:      '#059669',
  amber:      '#D97706',
  shadow:     '0 1px 3px rgba(0,0,0,0.06), 0 6px 20px rgba(0,0,0,0.05)',
  shadowMd:   '0 4px 16px rgba(0,0,0,0.08), 0 20px 48px rgba(0,0,0,0.06)',
  shadowLg:   '0 8px 32px rgba(0,0,0,0.1), 0 32px 72px rgba(0,0,0,0.08)',
}
const font = "var(--font-inter), system-ui, -apple-system, 'Segoe UI', sans-serif"

const CHROME_STORE_URL = 'https://chrome.google.com/webstore/detail/gifthint/PLACEHOLDER'

// ── All CSS animations + styles ───────────────────────────────────────────────

const globalCSS = `
  *, *::before, *::after { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body { margin: 0; background: #fff; font-family: ${font}; }
  a { color: inherit; text-decoration: none; }
  p { margin: 0; }
  h1, h2, h3 { margin: 0; }

  /* ── Keyframes ─────────────────────────────────────── */

  @keyframes float {
    0%, 100% { transform: translateY(0px) rotate(-0.5deg); }
    50%       { transform: translateY(-14px) rotate(0.5deg); }
  }
  @keyframes floatSlow {
    0%, 100% { transform: translateY(0px); }
    50%       { transform: translateY(-8px); }
  }
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(28px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes fadeInScale {
    from { opacity: 0; transform: scale(0.94); }
    to   { opacity: 1; transform: scale(1); }
  }
  @keyframes glow {
    0%, 100% { box-shadow: 0 0 24px rgba(124,58,237,0.4), 0 8px 32px rgba(124,58,237,0.25); }
    50%       { box-shadow: 0 0 48px rgba(124,58,237,0.65), 0 8px 48px rgba(124,58,237,0.4); }
  }
  @keyframes shimmer {
    0%   { background-position: -400px 0; }
    100% { background-position: 400px 0; }
  }
  @keyframes marquee {
    from { transform: translateX(0); }
    to   { transform: translateX(-50%); }
  }
  @keyframes heartbeat {
    0%, 100% { transform: scale(1); }
    30%       { transform: scale(1.3); }
    60%       { transform: scale(0.95); }
  }
  @keyframes orb-drift {
    0%, 100% { transform: translate(0, 0) scale(1); }
    33%       { transform: translate(30px, -20px) scale(1.05); }
    66%       { transform: translate(-20px, 15px) scale(0.97); }
  }
  @keyframes revealUp {
    from { opacity: 0; transform: translateY(36px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes revealLeft {
    from { opacity: 0; transform: translateX(-36px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  @keyframes revealRight {
    from { opacity: 0; transform: translateX(36px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  @keyframes gradient-x {
    0%, 100% { background-size: 200% 200%; background-position: left center; }
    50%       { background-size: 200% 200%; background-position: right center; }
  }
  @keyframes spin-slow {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }

  /* ── Load animations (hero) ─────────────────────────── */
  .hero-badge  { animation: fadeInUp 0.6s 0.1s ease both; }
  .hero-h1     { animation: fadeInUp 0.7s 0.25s ease both; }
  .hero-sub    { animation: fadeInUp 0.7s 0.4s ease both; }
  .hero-cta    { animation: fadeInUp 0.7s 0.55s ease both; }
  .hero-mockup { animation: fadeInScale 0.9s 0.7s ease both; }

  .gh-float      { animation: float 5s ease-in-out infinite; }
  .gh-float-slow { animation: floatSlow 7s ease-in-out infinite; }
  .gh-glow       { animation: glow 3s ease-in-out infinite; }
  .gh-heartbeat  { animation: heartbeat 1.8s ease-in-out infinite; }
  .gh-orb        { animation: orb-drift 12s ease-in-out infinite; }

  /* CTA shimmer overlay */
  .gh-cta-shimmer {
    position: relative; overflow: hidden;
    transition: transform 150ms ease, box-shadow 150ms ease;
  }
  .gh-cta-shimmer::after {
    content: '';
    position: absolute; inset: 0;
    background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.18) 50%, transparent 100%);
    background-size: 400px 100%;
    animation: shimmer 2.5s ease-in-out infinite;
  }
  .gh-cta-shimmer:hover { transform: translateY(-2px); box-shadow: 0 12px 40px rgba(124,58,237,0.5) !important; }

  /* ── Scroll-driven reveals (Chrome 115+/Edge) ──────── */
  @supports (animation-timeline: view()) {
    .reveal      { opacity: 0; animation: revealUp   0.65s ease both; animation-timeline: view(); animation-range: entry 5% entry 40%; }
    .reveal-l    { opacity: 0; animation: revealLeft  0.65s ease both; animation-timeline: view(); animation-range: entry 5% entry 40%; }
    .reveal-r    { opacity: 0; animation: revealRight 0.65s ease both; animation-timeline: view(); animation-range: entry 5% entry 40%; }
    .reveal-d1   { animation-delay: 0.1s; }
    .reveal-d2   { animation-delay: 0.2s; }
    .reveal-d3   { animation-delay: 0.3s; }
  }

  /* ── Marquee ───────────────────────────────────────── */
  .marquee-track {
    display: flex; gap: 12px; width: max-content;
    animation: marquee 28s linear infinite;
  }
  .marquee-wrap:hover .marquee-track { animation-play-state: paused; }

  /* ── Card hover lifts ──────────────────────────────── */
  .card-hover { transition: transform 200ms ease, box-shadow 200ms ease; }
  .card-hover:hover { transform: translateY(-4px); box-shadow: ${c.shadowLg} !important; }

  .nav-link { transition: color 150ms; }
  .nav-link:hover { color: ${c.text} !important; }

  .gh-pill-hover { transition: background 150ms, border-color 150ms; }
  .gh-pill-hover:hover { background: ${c.bgTintDeep} !important; }

  details[open] .faq-chevron { transform: rotate(180deg); }
  .faq-chevron { transition: transform 200ms ease; }

  @media (max-width: 640px) {
    .hide-mobile { display: none !important; }
    .bento-grid  { grid-template-columns: 1fr !important; }
    .step-row    { flex-direction: column !important; }
    .step-row.flip { flex-direction: column !important; }
  }
`

// ── Sub-components ────────────────────────────────────────────────────────────

function ChromeIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="10" cy="10" r="8.5" stroke="white" strokeWidth="1.4"/>
      <circle cx="10" cy="10" r="3.3" fill="white"/>
      <line x1="10" y1="6.7" x2="10" y2="1.5" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="13.2" y1="12" x2="17.8" y2="13.2" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="6.8" y1="12" x2="2.2" y2="13.2" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  )
}

function BrowserFrame({ url, children, light = false }: { url: string; children: ReactNode; light?: boolean }) {
  const barBg = light ? '#F3F4F6' : '#1E1E2E'
  const urlBg = light ? '#E5E7EB' : '#2D2D3F'
  const urlColor = light ? '#6B7280' : '#6B7280'
  const dotColors = ['#FF5F57','#FFBD2E','#28CA41']
  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', border: `1px solid ${c.border}`, background: light ? '#fff' : '#141420', boxShadow: c.shadowLg }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', background: barBg, borderBottom: `1px solid ${c.border}` }}>
        {dotColors.map(col => <span key={col} style={{ width: 10, height: 10, borderRadius: '50%', background: col, display: 'block', flexShrink: 0 }} />)}
        <div style={{ flex: 1, background: urlBg, borderRadius: 6, padding: '3px 10px', marginLeft: 8, fontSize: 10, color: urlColor, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
          {url}
        </div>
      </div>
      {children}
    </div>
  )
}

function Stars() {
  return <span aria-label="5 stars">{'★★★★★'.split('').map((s,i) => <span key={i} style={{ color: '#F59E0B', fontSize: 13 }}>{s}</span>)}</span>
}

// ── Retailers list ────────────────────────────────────────────────────────────

const RETAILERS = [
  { emoji: '📦', name: 'Amazon'    },
  { emoji: '🎯', name: 'Target'    },
  { emoji: '🛒', name: 'Walmart'   },
  { emoji: '🎨', name: 'Etsy'      },
  { emoji: '🍎', name: 'Apple'     },
  { emoji: '💄', name: 'Sephora'   },
  { emoji: '🏠', name: 'Wayfair'   },
  { emoji: '🏋️', name: 'Nike'      },
  { emoji: '📱', name: 'Best Buy'  },
  { emoji: '🛍️', name: 'H&M'       },
  { emoji: '⌚', name: 'Nordstrom' },
  { emoji: '🎮', name: 'GameStop'  },
]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div style={{ minHeight: '100vh', background: c.bg, color: c.text, fontFamily: font, overflowX: 'hidden' }}>
      <style>{globalCSS}</style>

      {/* ═══════════════════════════════════════════════════ NAV ══ */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 32px', height: 60,
        background: 'rgba(255,255,255,0.88)',
        borderBottom: `1px solid ${c.border}`,
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 22 }}>🎁</span>
          <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.4px' }}>GiftHint</span>
        </a>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <a href="/list" className="nav-link" style={{ fontSize: 13.5, fontWeight: 500, color: c.muted, padding: '6px 12px' }}>Sign in</a>
          <a href={CHROME_STORE_URL} target="_blank" rel="noopener noreferrer"
            className="gh-cta-shimmer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: c.purple, color: '#fff', borderRadius: 999, padding: '7px 18px', fontSize: 13, fontWeight: 700, boxShadow: `0 2px 12px ${c.purpleGlow}` }}>
            <ChromeIcon size={14} /> Add to Chrome
          </a>
        </div>
      </nav>

      {/* ═══════════════════════════════════════════════════ HERO ══ */}
      <section style={{ position: 'relative', textAlign: 'center', padding: '100px 24px 80px', overflow: 'hidden' }}>

        {/* Gradient orbs */}
        <div className="gh-orb" style={{
          position: 'absolute', top: '-120px', left: '50%', transform: 'translateX(-50%)',
          width: 700, height: 500, borderRadius: '50%', pointerEvents: 'none',
          background: 'radial-gradient(ellipse at center, rgba(139,92,246,0.18) 0%, rgba(196,181,253,0.1) 40%, transparent 70%)',
          filter: 'blur(40px)',
        }} />
        <div style={{
          position: 'absolute', top: 60, left: '10%',
          width: 280, height: 280, borderRadius: '50%', pointerEvents: 'none',
          background: 'radial-gradient(circle, rgba(219,39,119,0.1) 0%, transparent 70%)',
          filter: 'blur(32px)',
        }} />
        <div style={{
          position: 'absolute', top: 80, right: '8%',
          width: 240, height: 240, borderRadius: '50%', pointerEvents: 'none',
          background: 'radial-gradient(circle, rgba(5,150,105,0.08) 0%, transparent 70%)',
          filter: 'blur(28px)',
        }} />

        <div style={{ position: 'relative', maxWidth: 680, margin: '0 auto' }}>

          {/* Badge */}
          <div className="hero-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: c.bgTintDeep, border: `1px solid ${c.purpleRing}`, borderRadius: 999, padding: '6px 16px', marginBottom: 28 }}>
            <span style={{ fontSize: 12 }}>✨</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: c.purple }}>100% free · no credit card needed</span>
          </div>

          {/* Headline */}
          <h1 className="hero-h1" style={{ fontSize: 'clamp(40px, 7vw, 68px)', fontWeight: 900, lineHeight: 1.04, letterSpacing: '-2px', marginBottom: 24 }}>
            Your gift list,{' '}
            <span style={{
              background: `linear-gradient(135deg, ${c.purple} 0%, ${c.pinkLight} 60%, ${c.purpleLight} 100%)`,
              backgroundSize: '200% 200%',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              animation: 'gradient-x 4s ease infinite',
            }}>
              anywhere on the web.
            </span>
          </h1>

          {/* Sub-copy */}
          <p className="hero-sub" style={{ fontSize: 'clamp(16px, 2.5vw, 20px)', color: c.muted, lineHeight: 1.65, maxWidth: 520, margin: '0 auto 40px' }}>
            Click a heart on any product page. Share one link. Let friends buy you{' '}
            <strong style={{ color: c.textSub }}>exactly</strong> what you want —{' '}
            <strong style={{ color: c.textSub }}>no more duplicate gifts.</strong>
          </p>

          {/* CTAs */}
          <div className="hero-cta" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 12 }}>
            <a href={CHROME_STORE_URL} target="_blank" rel="noopener noreferrer"
              className="gh-cta-shimmer gh-glow"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: c.purple, color: '#fff', borderRadius: 14, padding: '16px 36px', fontSize: 17, fontWeight: 800, letterSpacing: '-0.2px' }}>
              <ChromeIcon size={20} /> Add to Chrome — it&apos;s free
            </a>
            <a href="/list/carlos"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 15, fontWeight: 600, color: c.purple, padding: '16px 20px', borderRadius: 14, border: `1.5px solid ${c.purpleRing}`, transition: 'background 150ms' }}
              className="gh-pill-hover">
              See example list →
            </a>
          </div>

          {/* Trust row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 20, marginTop: 28 }}>
            {[
              { icon: '⭐', label: '4.9 Chrome rating' },
              { icon: '🛡️', label: 'No card required' },
              { icon: '🌐', label: '500+ stores' },
            ].map(({ icon, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: c.muted }}>
                <span style={{ fontSize: 14 }}>{icon}</span> {label}
              </div>
            ))}
          </div>
        </div>

        {/* Floating hero demo */}
        <div className="hero-mockup gh-float" style={{ maxWidth: 680, margin: '56px auto 0', position: 'relative' }}>
          <BrowserFrame url="amazon.com/dp/B0EXAMPLE">
            <div style={{ display: 'flex', background: '#F9FAFB', minHeight: 260 }}>
              {/* Product image */}
              <div style={{
                width: '38%', flexShrink: 0, position: 'relative',
                background: 'linear-gradient(135deg, #F3F4F6, #E5E7EB)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: 64, opacity: 0.8 }}>👟</span>
                {/* Floating heart */}
                <div className="gh-heartbeat" style={{
                  position: 'absolute', bottom: 16, right: 16,
                  width: 44, height: 44, borderRadius: '50%',
                  background: c.pink, color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20, boxShadow: `0 6px 20px rgba(219,39,119,0.55)`,
                }}>♥</div>
                {/* Toast */}
                <div style={{
                  position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)',
                  background: '#fff', border: '1px solid rgba(5,150,105,0.25)',
                  borderRadius: 999, padding: '6px 14px',
                  display: 'flex', alignItems: 'center', gap: 7,
                  whiteSpace: 'nowrap', boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                }}>
                  <span style={{ fontSize: 12, color: c.green, fontWeight: 700 }}>✓</span>
                  <span style={{ fontSize: 12, color: c.text, fontWeight: 600 }}>Saved to GiftHint!</span>
                </div>
              </div>
              {/* Details */}
              <div style={{ flex: 1, padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ fontWeight: 700, fontSize: 15, color: c.text, lineHeight: 1.4 }}>Nike Air Max 270 React — White / Black</p>
                <p style={{ fontSize: 22, fontWeight: 800, color: '#B45309' }}>$129.99</p>
                <div style={{ height: 1, background: c.border }} />
                <Stars />
                <div style={{ background: '#FFD814', borderRadius: 8, padding: '9px 12px', textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#0F1111' }}>Add to Cart</div>
                <div style={{ background: '#FFA41C', borderRadius: 8, padding: '9px 12px', textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#0F1111' }}>Buy Now</div>
              </div>
              {/* GiftHint sidebar panel */}
              <div style={{
                width: 180, flexShrink: 0,
                borderLeft: `1px solid ${c.border}`,
                background: '#fff', padding: 14,
                display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                  <span style={{ fontSize: 16 }}>🎁</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: c.purple }}>GiftHint</span>
                </div>
                <p style={{ fontSize: 11, color: c.muted, lineHeight: 1.4 }}>This item is on your wishlist</p>
                <div style={{ background: c.purpleDim, border: `1px solid ${c.purpleRing}`, borderRadius: 8, padding: '8px 10px', fontSize: 11, color: c.purple, fontWeight: 600, textAlign: 'center' }}>
                  ✓ Saved
                </div>
                <div style={{ fontSize: 10, color: c.mutedLight, textAlign: 'center' }}>
                  3 friends viewing your list
                </div>
              </div>
            </div>
          </BrowserFrame>

          {/* Floating stat cards */}
          <div className="gh-float-slow" style={{
            position: 'absolute', top: -20, left: -20,
            background: '#fff', border: `1px solid ${c.border}`,
            borderRadius: 12, padding: '10px 14px', boxShadow: c.shadowMd,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 22 }}>🎉</span>
            <div>
              <p style={{ fontSize: 10, color: c.muted }}>Gift claimed!</p>
              <p style={{ fontSize: 12, fontWeight: 700 }}>Nike Air Max 270</p>
            </div>
          </div>
          <div className="gh-float-slow" style={{
            position: 'absolute', bottom: -16, right: -16,
            background: '#fff', border: `1px solid ${c.border}`,
            borderRadius: 12, padding: '10px 14px', boxShadow: c.shadowMd,
            display: 'flex', alignItems: 'center', gap: 8,
            animationDelay: '2s',
          }}>
            <span style={{ fontSize: 22 }}>🔗</span>
            <div>
              <p style={{ fontSize: 10, color: c.muted }}>Your list is live</p>
              <p style={{ fontSize: 12, fontWeight: 700, color: c.purple }}>gifthint.io/list/you</p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════ STATS STRIP ══ */}
      <div style={{ borderTop: `1px solid ${c.border}`, borderBottom: `1px solid ${c.border}`, background: c.bgTint, padding: '24px 32px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '16px 48px' }}>
          {[
            { num: '10,000+', label: 'Active wishlists' },
            { num: '500+',    label: 'Supported stores' },
            { num: '4.9 ★',   label: 'Chrome Web Store' },
            { num: '0',       label: 'Duplicate gifts' },
          ].map(({ num, label }) => (
            <div key={label} className="reveal" style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 'clamp(20px, 3vw, 28px)', fontWeight: 900, letterSpacing: '-0.5px', color: c.text }}>{num}</p>
              <p style={{ fontSize: 12.5, color: c.muted, marginTop: 2 }}>{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════ MARQUEE ══ */}
      <div style={{ padding: '36px 0', overflow: 'hidden', background: c.bg }}>
        <p style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, color: c.mutedLight, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 20 }}>
          Works with all your favourite stores
        </p>
        <div className="marquee-wrap" style={{ overflow: 'hidden' }}>
          <div className="marquee-track">
            {[...RETAILERS, ...RETAILERS].map(({ emoji, name }, i) => (
              <div key={`${name}-${i}`} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: '#fff', border: `1px solid ${c.border}`,
                borderRadius: 999, padding: '8px 18px', flexShrink: 0,
                boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                fontSize: 14, fontWeight: 500, color: c.textSub,
              }}>
                <span style={{ fontSize: 18 }}>{emoji}</span> {name}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════ BENTO FEATURES ══ */}
      <section style={{ background: c.bgTint, padding: '88px 24px' }}>
        <div style={{ maxWidth: 920, margin: '0 auto' }}>
          <p className="reveal" style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: c.purple, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
            Why GiftHint
          </p>
          <h2 className="reveal" style={{ textAlign: 'center', fontSize: 'clamp(28px, 4.5vw, 42px)', fontWeight: 900, letterSpacing: '-1px', marginBottom: 48, lineHeight: 1.15 }}>
            Everything you need,<br />nothing you don&apos;t.
          </h2>

          {/* Bento grid */}
          <div className="bento-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: 'auto auto', gap: 16 }}>

            {/* Card 1 — large, Save anywhere */}
            <div className="card-hover reveal-l" style={{
              gridRow: '1 / 3', background: '#fff', borderRadius: 20,
              border: `1px solid ${c.border}`, padding: 28, boxShadow: c.shadow,
              display: 'flex', flexDirection: 'column', gap: 16, minHeight: 320,
            }}>
              <div style={{ fontSize: 32 }}>🌍</div>
              <div>
                <h3 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.3px', marginBottom: 8 }}>Save from any store</h3>
                <p style={{ fontSize: 14, color: c.muted, lineHeight: 1.65 }}>Works on Amazon, Etsy, Walmart, Apple, Sephora and 500+ more. If a product has a price, GiftHint can save it.</p>
              </div>
              <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 8, alignContent: 'flex-start', marginTop: 4 }}>
                {RETAILERS.slice(0, 8).map(({ emoji, name }) => (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 5, background: c.bgTint, border: `1px solid ${c.border}`, borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 500, color: c.textSub }}>
                    <span style={{ fontSize: 14 }}>{emoji}</span>{name}
                  </div>
                ))}
                <div style={{ background: c.purpleDim, border: `1px solid ${c.purpleRing}`, borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 600, color: c.purple }}>
                  + 492 more
                </div>
              </div>
            </div>

            {/* Card 2 — One-click save */}
            <div className="card-hover reveal-r" style={{
              background: `linear-gradient(135deg, ${c.purple} 0%, #9333EA 100%)`,
              borderRadius: 20, padding: 28, boxShadow: `0 8px 32px ${c.purpleGlow}`,
              display: 'flex', flexDirection: 'column', gap: 12, color: '#fff',
            }}>
              <div className="gh-heartbeat" style={{ fontSize: 40, display: 'inline-block', width: 'fit-content' }}>♥</div>
              <h3 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.3px', color: '#fff' }}>One-click saving</h3>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', lineHeight: 1.65 }}>
                A floating heart appears on every product page. Tap it — your item is saved instantly. No copy-pasting URLs. No forms.
              </p>
            </div>

            {/* Card 3 — No duplicates */}
            <div className="card-hover reveal-r reveal-d2" style={{
              background: '#fff', borderRadius: 20, border: `1px solid ${c.border}`,
              padding: 28, boxShadow: c.shadow,
              display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              <div style={{ fontSize: 32 }}>🛡️</div>
              <h3 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.3px' }}>Zero duplicate gifts</h3>
              <p style={{ fontSize: 14, color: c.muted, lineHeight: 1.65 }}>When a friend buys something, it&apos;s marked claimed. Everyone else sees it greyed out. Problem solved.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                {[
                  { name: 'Sony WH-1000XM5', price: '$348', claimed: true },
                  { name: 'Atomic Habits',   price: '$18',  claimed: false },
                ].map(c2 => (
                  <div key={c2.name} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 10px', borderRadius: 8,
                    background: c2.claimed ? '#F3F4F6' : c.bgTint,
                    opacity: c2.claimed ? 0.55 : 1,
                    border: `1px solid ${c.border}`,
                  }}>
                    <span style={{ fontSize: 11.5, flex: 1, fontWeight: 600, color: c.text }}>{c2.name}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: c2.claimed ? c.muted : c.green }}>
                      {c2.claimed ? '✓ Claimed' : c2.price}
                    </span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ══════════════════════════════════ HOW IT WORKS ══ */}
      <section style={{ background: c.bg, padding: '88px 24px' }}>
        <div style={{ maxWidth: 920, margin: '0 auto' }}>
          <p className="reveal" style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: c.purple, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
            How it works
          </p>
          <h2 className="reveal" style={{ textAlign: 'center', fontSize: 'clamp(28px, 4.5vw, 42px)', fontWeight: 900, letterSpacing: '-1px', marginBottom: 72, lineHeight: 1.15 }}>
            Up and running in 60 seconds.
          </h2>

          {/* Step 1 */}
          <div className="step-row reveal" style={{ display: 'flex', alignItems: 'center', gap: 48, marginBottom: 80, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 340px', minWidth: 0 }}>
              <BrowserFrame url="chrome.google.com/webstore" light>
                <div style={{ padding: '22px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                    <div style={{ width: 56, height: 56, borderRadius: 12, flexShrink: 0, background: `linear-gradient(135deg, ${c.purple}, ${c.purpleLight})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, boxShadow: `0 4px 16px ${c.purpleGlow}` }}>🎁</div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontWeight: 700, fontSize: 14, color: c.text }}>GiftHint — Wishlist Saver</p>
                      <p style={{ fontSize: 11.5, color: '#1D4ED8', marginTop: 2 }}>gifthint.io</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 5 }}><Stars /><span style={{ fontSize: 11, color: c.muted, marginLeft: 4 }}>4.9 · 1,024 ratings</span></div>
                    </div>
                    <div style={{ background: '#1A73E8', color: '#fff', borderRadius: 6, padding: '8px 16px', fontSize: 12.5, fontWeight: 700, flexShrink: 0 }}>Add to Chrome</div>
                  </div>
                  <div style={{ height: 1, background: c.border }} />
                  {['♥  Save any product with one click','🔗  Shareable link — no login for viewers','🛡  No duplicate gifts — items get claimed'].map(t => (
                    <p key={t} style={{ fontSize: 12.5, color: c.textSub }}>{t}</p>
                  ))}
                </div>
              </BrowserFrame>
            </div>
            <div style={{ flex: '1 1 280px', minWidth: 0 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: c.purpleDim, border: `1px solid ${c.purpleRing}`, borderRadius: 999, padding: '5px 14px', marginBottom: 16 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: c.purple }}>01</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: c.purple, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Install</span>
              </div>
              <h3 style={{ fontSize: 'clamp(22px, 3.5vw, 30px)', fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1.2, marginBottom: 14 }}>
                Add the free Chrome extension
              </h3>
              <p style={{ fontSize: 15, color: c.muted, lineHeight: 1.7, maxWidth: 340 }}>
                One click from the Chrome Web Store. Works on Chrome, Edge, Brave, and Arc. No account required to start saving.
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="step-row flip reveal" style={{ display: 'flex', alignItems: 'center', gap: 48, marginBottom: 80, flexWrap: 'wrap', flexDirection: 'row-reverse' }}>
            <div style={{ flex: '1 1 340px', minWidth: 0 }}>
              <BrowserFrame url="etsy.com/listing/123456" light>
                <div style={{ display: 'flex', minHeight: 240 }}>
                  <div style={{ width: '45%', background: 'linear-gradient(135deg, #FEF3C7, #FDE68A)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                    <span style={{ fontSize: 56 }}>🕯️</span>
                    <div className="gh-heartbeat" style={{ position: 'absolute', bottom: 12, right: 12, width: 40, height: 40, borderRadius: '50%', background: c.pink, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, boxShadow: `0 4px 14px rgba(219,39,119,0.5)` }}>♥</div>
                    <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', background: '#fff', border: '1px solid rgba(5,150,105,0.3)', borderRadius: 999, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                      <span style={{ fontSize: 11, color: c.green, fontWeight: 700 }}>✓</span>
                      <span style={{ fontSize: 11, color: c.text, fontWeight: 600 }}>Saved!</span>
                    </div>
                  </div>
                  <div style={{ flex: 1, padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <p style={{ fontWeight: 700, fontSize: 12.5, color: c.text, lineHeight: 1.4 }}>Handmade Soy Candle — Vanilla & Amber</p>
                    <p style={{ fontSize: 16, fontWeight: 800, color: c.amber }}>$32.00</p>
                    <div style={{ height: 1, background: c.border }} />
                    <Stars />
                    <p style={{ fontSize: 11, color: c.muted }}>3,218 sales · Etsy favourite</p>
                    <div style={{ marginTop: 'auto', background: '#F97316', borderRadius: 8, padding: '8px 10px', textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#fff' }}>Add to cart</div>
                  </div>
                </div>
              </BrowserFrame>
            </div>
            <div style={{ flex: '1 1 280px', minWidth: 0 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#FDF2F8', border: '1px solid rgba(219,39,119,0.2)', borderRadius: 999, padding: '5px 14px', marginBottom: 16 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: c.pink }}>02</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: c.pink, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Save</span>
              </div>
              <h3 style={{ fontSize: 'clamp(22px, 3.5vw, 30px)', fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1.2, marginBottom: 14 }}>
                Tap the ♥ heart on any product
              </h3>
              <p style={{ fontSize: 15, color: c.muted, lineHeight: 1.7, maxWidth: 340 }}>
                A floating pink heart appears on every product page — Amazon, Etsy, Walmart, anywhere you shop. One tap saves it to your list instantly.
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="step-row reveal" style={{ display: 'flex', alignItems: 'center', gap: 48, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 340px', minWidth: 0 }}>
              <BrowserFrame url="gifthint.io/list/yourname" light>
                <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 52, height: 52, borderRadius: '50%', background: `linear-gradient(135deg, ${c.bgTintDeep}, ${c.bgTint})`, border: `2px solid ${c.purple}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>😊</div>
                    <p style={{ fontWeight: 800, fontSize: 15 }}>Alex&apos;s Gift List</p>
                    <p style={{ fontSize: 12, color: c.muted }}>3 gifts · gifthint.io/list/alex</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: c.purpleDim, border: `1px solid ${c.purpleRing}`, borderRadius: 999, padding: '6px 16px' }}>
                      <span style={{ fontSize: 12 }}>🔗</span>
                      <span style={{ fontSize: 12, color: c.purple, fontWeight: 600 }}>Copy gift list link</span>
                    </div>
                  </div>
                  {[
                    { e: '👟', n: 'Nike Air Max 270', p: '$129.99', claimed: false },
                    { e: '📚', n: 'Atomic Habits',   p: '$18.00',  claimed: true  },
                    { e: '🎧', n: 'Sony WH-1000XM5', p: '$348.00', claimed: false },
                  ].map(item => (
                    <div key={item.n} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 10, background: item.claimed ? '#F9FAFB' : '#fff', opacity: item.claimed ? 0.5 : 1, border: `1px solid ${item.claimed ? c.border : 'rgba(124,58,237,0.12)'}`, boxShadow: item.claimed ? 'none' : '0 1px 4px rgba(0,0,0,0.04)' }}>
                      <span style={{ fontSize: 20, flexShrink: 0 }}>{item.e}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: c.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.n}</p>
                        <p style={{ fontSize: 11, color: item.claimed ? c.muted : c.green, fontWeight: 600 }}>{item.claimed ? '✓ Claimed' : item.price}</p>
                      </div>
                      {!item.claimed && <div style={{ background: c.purple, borderRadius: 6, padding: '4px 10px', fontSize: 11, color: '#fff', fontWeight: 700, flexShrink: 0 }}>Buy</div>}
                    </div>
                  ))}
                </div>
              </BrowserFrame>
            </div>
            <div style={{ flex: '1 1 280px', minWidth: 0 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#F0FDF4', border: '1px solid rgba(5,150,105,0.2)', borderRadius: 999, padding: '5px 14px', marginBottom: 16 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: c.green }}>03</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: c.green, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Share</span>
              </div>
              <h3 style={{ fontSize: 'clamp(22px, 3.5vw, 30px)', fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1.2, marginBottom: 14 }}>
                Share your link. Friends buy. No duplicates.
              </h3>
              <p style={{ fontSize: 15, color: c.muted, lineHeight: 1.7, maxWidth: 340 }}>
                You get a permanent page at gifthint.io/list/yourname. When a friend buys an item, it&apos;s claimed for everyone else — no awkward doubles.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════ TESTIMONIALS ══ */}
      <section style={{ background: c.bgTint, padding: '88px 24px' }}>
        <div style={{ maxWidth: 920, margin: '0 auto' }}>
          <p className="reveal" style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: c.purple, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>Love notes</p>
          <h2 className="reveal" style={{ textAlign: 'center', fontSize: 'clamp(26px, 4vw, 38px)', fontWeight: 900, letterSpacing: '-0.8px', marginBottom: 48, lineHeight: 1.2 }}>
            Real people, zero duplicate gifts.
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
            {[
              { avatar: '👩‍🦱', name: 'Emma K.', role: 'Birthday person', quote: 'This is genius! My whole family uses my GiftHint link now. Zero awkward doubles this year — finally.' },
              { avatar: '👨‍💻', name: 'Marcus T.', role: 'Husband, dad of two', quote: 'I sent my Christmas list to the group chat and my wife and mum didn\'t buy the same thing for the first time in years. Incredible.' },
              { avatar: '👩‍🎓', name: 'Sarah L.', role: 'University student', quote: 'The Chrome extension took 10 seconds to install. I saved my first item from ASOS immediately. Sharing it was one click.' },
            ].map(({ avatar, name, role, quote }) => (
              <div key={name} className="card-hover reveal" style={{ background: '#fff', borderRadius: 20, padding: 28, border: `1px solid ${c.border}`, boxShadow: c.shadow, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <Stars />
                <p style={{ fontSize: 14.5, color: c.textSub, lineHeight: 1.7, flex: 1 }}>&ldquo;{quote}&rdquo;</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', background: c.bgTintDeep, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{avatar}</div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700 }}>{name}</p>
                    <p style={{ fontSize: 11.5, color: c.muted }}>{role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════ BOTTOM CTA ══ */}
      <section style={{
        background: `linear-gradient(135deg, #4F1D96 0%, ${c.purple} 40%, #9333EA 70%, #DB2777 100%)`,
        padding: '96px 24px', textAlign: 'center', position: 'relative', overflow: 'hidden',
      }}>
        {/* Decorative orb */}
        <div style={{ position: 'absolute', top: '-80px', left: '50%', transform: 'translateX(-50%)', width: 600, height: 400, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', filter: 'blur(40px)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', maxWidth: 600, margin: '0 auto' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>Start for free</p>
          <h2 style={{ fontSize: 'clamp(30px, 5vw, 52px)', fontWeight: 900, color: '#fff', letterSpacing: '-1.5px', lineHeight: 1.1, marginBottom: 20 }}>
            Your wishlist is waiting.
          </h2>
          <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.75)', lineHeight: 1.65, marginBottom: 40, maxWidth: 440, margin: '0 auto 40px' }}>
            Takes 30 seconds to install. No credit card. Your first saved item will make it worth it.
          </p>
          <a href={CHROME_STORE_URL} target="_blank" rel="noopener noreferrer"
            className="gh-cta-shimmer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              background: '#fff', color: c.purple,
              borderRadius: 14, padding: '17px 38px',
              fontSize: 17, fontWeight: 900, letterSpacing: '-0.3px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
            }}>
            <span style={{ fontSize: 20 }}>🎁</span>
            Add to Chrome — it&apos;s free
          </a>
          <p style={{ marginTop: 16, fontSize: 12.5, color: 'rgba(255,255,255,0.55)' }}>Chrome · Edge · Brave · Arc</p>
        </div>
      </section>

      {/* ════════════════════════════════════════ FOOTER ══ */}
      <footer style={{ borderTop: `1px solid ${c.border}`, padding: '28px 32px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: c.bg }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>🎁</span>
          <span style={{ fontSize: 13, color: c.muted }}>© {new Date().getFullYear()} GiftHint · Some links are affiliate links.</span>
        </div>
        <nav style={{ display: 'flex', gap: 20 }} aria-label="Footer">
          {[{href:'/privacy',label:'Privacy'},{href:'/terms',label:'Terms'}].map(({href,label}) => (
            <a key={href} href={href} className="nav-link" style={{ fontSize: 13, color: c.muted }}>{label}</a>
          ))}
        </nav>
      </footer>

    </div>
  )
}
