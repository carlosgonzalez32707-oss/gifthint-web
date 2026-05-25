/**
 * app/gifts/page.tsx — GiftHint gift hub
 *
 * The main marketing entry point for all occasion landing pages.
 * Target query: "gift wishlist" / "wish list for gifts" / "gifthint"
 *
 * Sections:
 *   1. Hero     — "The only wishlist your friends will actually use"
 *   2. Occasion grid — 7 cards linking to /gifts/[occasion]
 *   3. Recent public lists — social proof from real gifter pages
 *   4. How it works — 3-step explainer
 *   5. Bottom CTA
 *
 * Recent public lists are fetched server-side from Supabase.
 * On error, the section renders empty (graceful degradation — no hard failure).
 */

import type { Metadata } from 'next'
import { createServerClient } from '@/lib/supabase-server'
import { OCCASION_CATALOGUE, type OccasionSEO } from '@/lib/occasion-seo'
import { getOccasionTheme } from '@/lib/occasion-themes'

// ── Metadata ──────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title:       'Gift Wish Lists for Every Occasion | GiftHint',
  description: 'Create a wishlist for any occasion — birthday, Christmas, wedding, baby shower, and more. Save from 500+ stores. Share one link. No duplicate gifts.',
  keywords:    'gift wish list, wishlist for gifts, gift registry, birthday wish list, christmas wish list, wedding gift list',
  alternates:  { canonical: 'https://gifthint.io/gifts' },
  openGraph: {
    title:       'Gift Wish Lists for Every Occasion | GiftHint',
    description: 'Save from any store. Share one link. No duplicate gifts.',
    url:         'https://gifthint.io/gifts',
    type:        'website',
  },
}

// ── ISR — revalidate every hour for fresh public lists ────────────────────────

export const revalidate = 3600

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
  purpleDim:  'rgba(124,58,237,0.08)',
  purpleRing: 'rgba(124,58,237,0.2)',
  purpleGlow: 'rgba(124,58,237,0.35)',
  green:      '#059669',
  shadow:     '0 1px 3px rgba(0,0,0,0.06), 0 6px 20px rgba(0,0,0,0.05)',
  shadowMd:   '0 4px 16px rgba(0,0,0,0.08), 0 20px 48px rgba(0,0,0,0.06)',
}
const font = "var(--font-inter), system-ui, -apple-system, 'Segoe UI', sans-serif"
const CHROME_STORE_URL =
  process.env.NEXT_PUBLIC_CHROME_STORE_URL ??
  'https://chromewebstore.google.com/detail/gifthint/PLACEHOLDER'

// ── Styles ────────────────────────────────────────────────────────────────────

const globalCSS = `
  *, *::before, *::after { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body { margin: 0; background: #fff; font-family: ${font}; }
  a { color: inherit; text-decoration: none; }
  p, h1, h2, h3 { margin: 0; }

  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(22px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes shimmer {
    0%   { background-position: -400px 0; }
    100% { background-position:  400px 0; }
  }
  @keyframes gradient-x {
    0%, 100% { background-size: 200% 200%; background-position: left center; }
    50%       { background-size: 200% 200%; background-position: right center; }
  }

  .hero-badge { animation: fadeInUp 0.5s 0.05s ease both; }
  .hero-h1    { animation: fadeInUp 0.6s 0.18s ease both; }
  .hero-sub   { animation: fadeInUp 0.6s 0.32s ease both; }
  .hero-cta   { animation: fadeInUp 0.6s 0.46s ease both; }

  .gh-cta-shimmer {
    position: relative; overflow: hidden;
    transition: transform 140ms ease, box-shadow 140ms ease;
  }
  .gh-cta-shimmer::after {
    content: ''; position: absolute; inset: 0;
    background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.18) 50%, transparent 100%);
    background-size: 400px 100%;
    animation: shimmer 2.5s ease-in-out infinite;
  }
  .gh-cta-shimmer:hover { transform: translateY(-2px); }

  @supports (animation-timeline: view()) {
    .reveal { opacity: 0; animation: fadeInUp 0.55s ease both; animation-timeline: view(); animation-range: entry 5% entry 40%; }
    .reveal-d1 { animation-delay: 0.06s; }
    .reveal-d2 { animation-delay: 0.12s; }
    .reveal-d3 { animation-delay: 0.18s; }
    .reveal-d4 { animation-delay: 0.24s; }
  }

  .occasion-card { transition: transform 180ms ease, box-shadow 180ms ease; }
  .occasion-card:hover { transform: translateY(-5px); }

  .public-card { transition: transform 180ms ease, box-shadow 180ms ease; }
  .public-card:hover { transform: translateY(-3px); box-shadow: ${c.shadowMd} !important; }

  .nav-link { transition: color 140ms; }
  .nav-link:hover { color: #0F0F1A !important; }

  @media (max-width: 720px) {
    .occasion-grid { grid-template-columns: repeat(2, 1fr) !important; }
    .public-grid   { grid-template-columns: repeat(2, 1fr) !important; }
    .steps-grid    { grid-template-columns: 1fr !important; }
  }
  @media (max-width: 440px) {
    .occasion-grid { grid-template-columns: 1fr !important; }
    .public-grid   { grid-template-columns: 1fr !important; }
  }
`

// ── Helpers ───────────────────────────────────────────────────────────────────

function hexAlpha(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface PublicList {
  name:            string
  slug:            string
  occasion:        string | null
  public_username: string
  display_name:    string | null
}

// ── Page (Server Component) ───────────────────────────────────────────────────

export default async function GiftsHubPage() {

  // ── Fetch recent public lists for social proof ─────────────────────────────
  let recentLists: PublicList[] = []
  try {
    const supabase = createServerClient()
    const { data } = await supabase
      .from('wishlists')
      .select('name, slug, occasion, users!inner(public_username, display_name)')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(6)

    recentLists = (data ?? [])
      .map((row) => {
        const user = row.users as unknown as { public_username: string | null; display_name: string | null }
        if (!user?.public_username) return null
        return {
          name:            row.name,
          slug:            row.slug,
          occasion:        row.occasion ?? null,
          public_username: user.public_username,
          display_name:    user.display_name,
        }
      })
      .filter((r): r is PublicList => r !== null)
  } catch {
    // Graceful degradation — hub page still renders without social proof
  }

  return (
    <div style={{ minHeight: '100vh', background: c.bg, color: c.text, fontFamily: font, overflowX: 'hidden' }}>
      <style>{globalCSS}</style>

      {/* ════════════════════════════════════════════ NAV ══ */}
      <nav style={{
        position:            'sticky',
        top:                 0,
        zIndex:              100,
        display:             'flex',
        alignItems:          'center',
        justifyContent:      'space-between',
        padding:             '0 32px',
        height:              60,
        background:          'rgba(255,255,255,0.88)',
        borderBottom:        `1px solid ${c.border}`,
        backdropFilter:      'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 22 }}>🎁</span>
          <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.4px' }}>GiftHint</span>
        </a>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <a href="/signin" className="nav-link" style={{ fontSize: 13, fontWeight: 500, color: c.muted, padding: '6px 12px' }}>Sign in</a>
          <a
            href={CHROME_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="gh-cta-shimmer"
            style={{
              display:    'inline-flex',
              alignItems: 'center',
              gap:        7,
              background: c.purple,
              color:      '#fff',
              borderRadius: 999,
              padding:    '7px 18px',
              fontSize:   13,
              fontWeight: 700,
              boxShadow:  `0 2px 12px ${c.purpleGlow}`,
            }}
          >
            Add to Chrome — free
          </a>
        </div>
      </nav>

      {/* ════════════════════════════════════════════ HERO ══ */}
      <section style={{ position: 'relative', textAlign: 'center', padding: '88px 24px 64px', overflow: 'hidden' }}>
        <div style={{
          position:    'absolute',
          top:         '-80px',
          left:        '50%',
          transform:   'translateX(-50%)',
          width:       700,
          height:      500,
          borderRadius: '50%',
          background:  'radial-gradient(ellipse, rgba(124,58,237,0.12) 0%, transparent 70%)',
          filter:      'blur(40px)',
          pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative', maxWidth: 700, margin: '0 auto' }}>
          <div className="hero-badge" style={{ marginBottom: 24 }}>
            <div style={{
              display:      'inline-flex',
              alignItems:   'center',
              gap:          8,
              background:   c.bgTintDeep,
              border:       `1px solid ${c.purpleRing}`,
              borderRadius: 999,
              padding:      '6px 18px',
            }}>
              <span style={{ fontSize: 13 }}>🎁</span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: c.purple }}>Gift wishlists for every occasion</span>
            </div>
          </div>

          <h1
            className="hero-h1"
            style={{
              fontSize:      'clamp(38px, 6.5vw, 64px)',
              fontWeight:    900,
              lineHeight:    1.05,
              letterSpacing: '-2px',
              marginBottom:  22,
            }}
          >
            The only wish list your{' '}
            <span style={{
              background:           `linear-gradient(135deg, ${c.purple} 0%, #EC4899 60%, #A78BFA 100%)`,
              backgroundSize:       '200% 200%',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor:  'transparent',
              backgroundClip:       'text',
              animation:            'gradient-x 4s ease infinite',
            }}>
              friends will actually use.
            </span>
          </h1>

          <p
            className="hero-sub"
            style={{ fontSize: 'clamp(16px, 2.2vw, 19px)', color: c.muted, lineHeight: 1.65, maxWidth: 520, margin: '0 auto 36px' }}
          >
            Save anything from any store, share one link, and watch gifts get claimed — one at a time. No duplicates, no awkward conversations.
          </p>

          <div className="hero-cta" style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 12 }}>
            <a
              href={CHROME_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="gh-cta-shimmer"
              style={{
                display:      'inline-flex',
                alignItems:   'center',
                gap:          10,
                background:   c.purple,
                color:        '#fff',
                borderRadius: 14,
                padding:      '15px 32px',
                fontSize:     16,
                fontWeight:   800,
                letterSpacing: '-0.2px',
                boxShadow:    `0 4px 24px ${c.purpleGlow}`,
              }}
            >
              🎁 Create your free list
            </a>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '8px 24px', marginTop: 20 }}>
            {['✨ 100% free', '🌐 500+ stores', '🛡️ No duplicate gifts'].map((t) => (
              <span key={t} style={{ fontSize: 12.5, color: c.muted }}>{t}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════ OCCASION GRID ══ */}
      <section style={{ background: c.bgTint, padding: '80px 24px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <p className="reveal" style={{ textAlign: 'center', fontSize: 11.5, fontWeight: 700, color: c.purple, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
            Choose your occasion
          </p>
          <h2 className="reveal" style={{ textAlign: 'center', fontSize: 'clamp(26px, 4vw, 38px)', fontWeight: 900, letterSpacing: '-0.8px', marginBottom: 44, lineHeight: 1.15 }}>
            A wishlist for every milestone.
          </h2>

          <div
            className="occasion-grid"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}
          >
            {OCCASION_CATALOGUE.map((occ: OccasionSEO, i: number) => {
              const accentDim  = hexAlpha(occ.accentColor, 0.11)
              const accentSoft = hexAlpha(occ.accentColor, 0.18)
              const accentRing = hexAlpha(occ.accentColor, 0.26)

              return (
                <a
                  key={occ.slug}
                  href={`/gifts/${occ.slug}`}
                  className={`occasion-card reveal reveal-d${(i % 4) + 1}`}
                  style={{
                    display:       'flex',
                    flexDirection: 'column',
                    gap:           12,
                    background:    '#fff',
                    border:        `1px solid ${c.border}`,
                    borderRadius:  16,
                    padding:       '24px 20px',
                    boxShadow:     c.shadow,
                    textDecoration: 'none',
                  }}
                >
                  {/* Emoji badge */}
                  <div style={{
                    width:        52,
                    height:       52,
                    borderRadius: 14,
                    background:   accentDim,
                    border:       `1px solid ${accentRing}`,
                    display:      'flex',
                    alignItems:   'center',
                    justifyContent: 'center',
                    fontSize:     26,
                  }}>
                    {occ.emoji}
                  </div>

                  <div>
                    <h3 style={{ fontSize: 15, fontWeight: 800, color: c.text, marginBottom: 6, lineHeight: 1.25 }}>
                      {occ.displayName}
                    </h3>
                    <p style={{ fontSize: 12.5, color: c.muted, lineHeight: 1.5 }}>
                      {occ.metaDescription.split('. ')[0]}.
                    </p>
                  </div>

                  <div style={{
                    display:      'inline-flex',
                    alignItems:   'center',
                    gap:          5,
                    background:   accentSoft,
                    border:       `1px solid ${accentRing}`,
                    borderRadius: 999,
                    padding:      '5px 12px',
                    fontSize:     12,
                    fontWeight:   700,
                    color:        occ.accentColor,
                    marginTop:    'auto',
                    width:        'fit-content',
                  }}>
                    Create list →
                  </div>
                </a>
              )
            })}
          </div>
        </div>
      </section>

      {/* ════════════════════ RECENT PUBLIC LISTS ══ */}
      {recentLists.length > 0 && (
        <section style={{ background: c.bg, padding: '80px 24px' }}>
          <div style={{ maxWidth: 960, margin: '0 auto' }}>
            <p className="reveal" style={{ textAlign: 'center', fontSize: 11.5, fontWeight: 700, color: c.purple, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
              Real lists, real people
            </p>
            <h2 className="reveal" style={{ textAlign: 'center', fontSize: 'clamp(24px, 3.8vw, 36px)', fontWeight: 900, letterSpacing: '-0.7px', marginBottom: 44, lineHeight: 1.15 }}>
              Already loved by thousands.
            </h2>

            <div
              className="public-grid"
              style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}
            >
              {recentLists.map((list, i) => {
                const theme  = list.occasion ? getOccasionTheme(list.occasion) : null
                const accent = theme?.accent ?? c.purple
                const dim    = hexAlpha(accent, 0.10)
                const ring   = hexAlpha(accent, 0.24)
                const initial = (list.display_name ?? list.public_username)[0]?.toUpperCase() ?? '?'

                return (
                  <a
                    key={`${list.public_username}-${list.slug}`}
                    href={`/list/${list.public_username}/${list.slug}`}
                    className={`public-card reveal reveal-d${(i % 3) + 1}`}
                    style={{
                      display:       'flex',
                      flexDirection: 'column',
                      gap:           12,
                      background:    '#fff',
                      border:        `1px solid ${c.border}`,
                      borderRadius:  16,
                      padding:       '20px',
                      boxShadow:     c.shadow,
                      textDecoration: 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {/* Avatar */}
                      <div style={{
                        width:        40,
                        height:       40,
                        borderRadius: '50%',
                        background:   `linear-gradient(135deg, ${dim}, ${ring})`,
                        border:       `2px solid ${ring}`,
                        display:      'flex',
                        alignItems:   'center',
                        justifyContent: 'center',
                        fontSize:     16,
                        fontWeight:   800,
                        color:        accent,
                        flexShrink:   0,
                      }}>
                        {initial}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 13.5, fontWeight: 700, color: c.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {list.display_name ?? list.public_username}
                        </p>
                        <p style={{ fontSize: 11.5, color: c.muted }}>@{list.public_username}</p>
                      </div>
                    </div>

                    <p style={{
                      fontSize:      13.5,
                      fontWeight:    600,
                      color:         c.text,
                      lineHeight:    1.35,
                      whiteSpace:    'nowrap',
                      overflow:      'hidden',
                      textOverflow:  'ellipsis',
                    }}>
                      {list.name}
                    </p>

                    {theme && (
                      <div style={{
                        display:      'inline-flex',
                        alignItems:   'center',
                        gap:          5,
                        background:   dim,
                        border:       `1px solid ${ring}`,
                        borderRadius: 999,
                        padding:      '3px 10px',
                        fontSize:     11,
                        fontWeight:   600,
                        color:        accent,
                        width:        'fit-content',
                      }}>
                        {theme.emoji} {list.occasion?.replace('_', ' ')}
                      </div>
                    )}

                    <p style={{ fontSize: 12, color: c.purple, fontWeight: 600, marginTop: 'auto' }}>
                      View list →
                    </p>
                  </a>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* ════════════════════════ HOW IT WORKS ══ */}
      <section style={{ background: c.bgTint, padding: '80px 24px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <p className="reveal" style={{ textAlign: 'center', fontSize: 11.5, fontWeight: 700, color: c.purple, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
            How it works
          </p>
          <h2 className="reveal" style={{ textAlign: 'center', fontSize: 'clamp(26px, 4vw, 38px)', fontWeight: 900, letterSpacing: '-0.8px', marginBottom: 52, lineHeight: 1.15 }}>
            Up and running in 60 seconds.
          </h2>

          <div
            className="steps-grid"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}
          >
            {[
              {
                icon:  '🔧',
                step:  '01',
                title: 'Install — free',
                copy:  'Add GiftHint to Chrome in one click. No account needed to start saving.',
                color: c.purple,
                dim:   c.purpleDim,
                ring:  c.purpleRing,
              },
              {
                icon:  '♥',
                step:  '02',
                title: 'Save from any store',
                copy:  'Tap the pink heart on any product page — Amazon, Etsy, Zara, IKEA, anywhere.',
                color: '#E872A0',
                dim:   'rgba(232,114,160,0.10)',
                ring:  'rgba(232,114,160,0.24)',
              },
              {
                icon:  '🔗',
                step:  '03',
                title: 'Share one link',
                copy:  'Your page is live at gifthint.io/list/you. When friends buy, gifts are claimed. No duplicates.',
                color: c.green,
                dim:   'rgba(5,150,105,0.09)',
                ring:  'rgba(5,150,105,0.22)',
              },
            ].map((step) => (
              <div
                key={step.step}
                style={{
                  background:    '#fff',
                  border:        `1px solid ${c.border}`,
                  borderRadius:  16,
                  padding:       '24px 20px',
                  boxShadow:     c.shadow,
                  display:       'flex',
                  flexDirection: 'column',
                  gap:           12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width:        38,
                    height:       38,
                    borderRadius: '50%',
                    background:   step.dim,
                    border:       `1px solid ${step.ring}`,
                    display:      'flex',
                    alignItems:   'center',
                    justifyContent: 'center',
                    fontSize:     18,
                  }}>
                    {step.icon}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 800, color: step.color, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                    Step {step.step}
                  </span>
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: c.text }}>{step.title}</h3>
                <p style={{ fontSize: 13.5, color: c.muted, lineHeight: 1.65 }}>{step.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════ BOTTOM CTA ══ */}
      <section style={{
        background:  `linear-gradient(135deg, #4F1D96 0%, ${c.purple} 40%, #9333EA 70%, #DB2777 100%)`,
        padding:     '88px 24px',
        textAlign:   'center',
        position:    'relative',
        overflow:    'hidden',
      }}>
        <div style={{
          position:    'absolute',
          top:         '-60px',
          left:        '50%',
          transform:   'translateX(-50%)',
          width:       560,
          height:      320,
          borderRadius: '50%',
          background:  'rgba(255,255,255,0.06)',
          filter:      'blur(40px)',
          pointerEvents: 'none',
        }} />
        <div style={{ position: 'relative', maxWidth: 560, margin: '0 auto' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14 }}>
            Start for free
          </p>
          <h2 style={{ fontSize: 'clamp(28px, 4.5vw, 48px)', fontWeight: 900, color: '#fff', letterSpacing: '-1.2px', lineHeight: 1.1, marginBottom: 16 }}>
            Your list is 60 seconds away.
          </h2>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6, marginBottom: 36, maxWidth: 400, margin: '0 auto 36px' }}>
            Install the extension, tap a heart, share the link. That&apos;s it.
          </p>
          <a
            href={CHROME_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="gh-cta-shimmer"
            style={{
              display:      'inline-flex',
              alignItems:   'center',
              gap:          10,
              background:   '#fff',
              color:        c.purple,
              borderRadius: 14,
              padding:      '16px 36px',
              fontSize:     16,
              fontWeight:   900,
              letterSpacing: '-0.2px',
              boxShadow:    '0 6px 28px rgba(0,0,0,0.2)',
            }}
          >
            🎁 Create your free wish list
          </a>
          <p style={{ marginTop: 14, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Chrome · Edge · Brave · Arc</p>
        </div>
      </section>

      {/* ════════════════════════════════ FOOTER ══ */}
      <footer style={{
        borderTop:   `1px solid ${c.border}`,
        padding:     '24px 32px',
        display:     'flex',
        flexWrap:    'wrap',
        alignItems:  'center',
        justifyContent: 'space-between',
        gap:         12,
        background:  c.bg,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>🎁</span>
          <span style={{ fontSize: 13, color: c.muted }}>
            © {new Date().getFullYear()} GiftHint · Some links are affiliate links.
          </span>
        </div>
        <nav style={{ display: 'flex', gap: 20 }} aria-label="Footer navigation">
          {[
            { href: '/',        label: 'Home' },
            { href: '/privacy', label: 'Privacy' },
            { href: '/terms',   label: 'Terms' },
          ].map(({ href, label }) => (
            <a key={href} href={href} className="nav-link" style={{ fontSize: 13, color: c.muted }}>{label}</a>
          ))}
        </nav>
      </footer>
    </div>
  )
}
