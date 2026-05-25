/**
 * app/gifts/[occasion]/page.tsx — GiftHint
 *
 * SEO-optimised landing pages for each occasion type.
 * Statically generated at build time for all 7 occasions:
 *   /gifts/birthday  /gifts/christmas  /gifts/wedding
 *   /gifts/baby-shower  /gifts/graduation
 *   /gifts/housewarming  /gifts/anniversary
 *
 * Sections:
 *   1. Hero     — H1 + subline + dual CTAs
 *   2. How it works — 3-step explainer
 *   3. Example list — 3 sample gift cards for this occasion
 *   4. FAQ      — 4 Q&As + FAQPage JSON-LD schema
 *   5. Bottom CTA  — final conversion section
 */

import type { Metadata } from 'next'
import { notFound }       from 'next/navigation'
import {
  getOccasionSEO,
  OCCASION_SLUGS,
  type OccasionSEO,
  type SampleItem,
  type OccasionFAQ,
} from '@/lib/occasion-seo'
import { createServerClient } from '@/lib/supabase-server'

// ── ISR — rebuild every hour to pick up new public lists ──────────────────────
export const revalidate = 3600

// ── Static generation ─────────────────────────────────────────────────────────

export function generateStaticParams() {
  return OCCASION_SLUGS.map((slug) => ({ occasion: slug }))
}

// ── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata(
  { params }: { params: { occasion: string } },
): Promise<Metadata> {
  const seo = getOccasionSEO(params.occasion)
  if (!seo) return {}

  const url = `https://gifthint.io/gifts/${seo.slug}`

  return {
    title:       seo.metaTitle,
    description: seo.metaDescription,
    keywords:    seo.keywords.join(', '),
    alternates:  { canonical: url },
    openGraph: {
      title:       seo.metaTitle,
      description: seo.metaDescription,
      url,
      type:        'website',
    },
    twitter: {
      card:        'summary_large_image',
      title:       seo.metaTitle,
      description: seo.metaDescription,
    },
  }
}

// ── Design tokens (matching app/page.tsx palette) ─────────────────────────────

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
    from { opacity: 0; transform: translateY(24px); }
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
  @keyframes floatSlow {
    0%, 100% { transform: translateY(0px); }
    50%       { transform: translateY(-7px); }
  }

  .hero-badge { animation: fadeInUp 0.5s 0.05s ease both; }
  .hero-h1    { animation: fadeInUp 0.6s 0.18s ease both; }
  .hero-sub   { animation: fadeInUp 0.6s 0.32s ease both; }
  .hero-cta   { animation: fadeInUp 0.6s 0.46s ease both; }
  .card-float { animation: floatSlow 6s ease-in-out infinite; }

  .gh-cta-shimmer {
    position: relative; overflow: hidden;
    transition: transform 140ms ease, box-shadow 140ms ease;
  }
  .gh-cta-shimmer::after {
    content: '';
    position: absolute; inset: 0;
    background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.18) 50%, transparent 100%);
    background-size: 400px 100%;
    animation: shimmer 2.5s ease-in-out infinite;
  }
  .gh-cta-shimmer:hover { transform: translateY(-2px); }

  @supports (animation-timeline: view()) {
    .reveal { opacity: 0; animation: fadeInUp 0.55s ease both; animation-timeline: view(); animation-range: entry 5% entry 40%; }
    .reveal-d1 { animation-delay: 0.08s; }
    .reveal-d2 { animation-delay: 0.16s; }
    .reveal-d3 { animation-delay: 0.24s; }
  }

  .card-hover { transition: transform 180ms ease, box-shadow 180ms ease; }
  .card-hover:hover { transform: translateY(-4px); box-shadow: ${c.shadowMd} !important; }

  .gh-occasion-card { transition: box-shadow 180ms, transform 180ms; }
  .gh-occasion-card:hover { box-shadow: var(--gh-hover-shadow, 0 4px 20px rgba(0,0,0,0.10)) !important; transform: translateY(-2px); }

  .faq-chevron { transition: transform 200ms ease; }
  details[open] .faq-chevron { transform: rotate(180deg); }

  .nav-link { transition: color 140ms; }
  .nav-link:hover { color: #0F0F1A !important; }

  @media (max-width: 640px) {
    .hide-sm { display: none !important; }
    .steps-grid { grid-template-columns: 1fr !important; }
    .sample-grid { grid-template-columns: 1fr !important; }
  }
`

// ── Sub-components ────────────────────────────────────────────────────────────

function Nav() {
  return (
    <nav style={{
      position:        'sticky',
      top:             0,
      zIndex:          100,
      display:         'flex',
      alignItems:      'center',
      justifyContent:  'space-between',
      padding:         '0 32px',
      height:          60,
      background:      'rgba(255,255,255,0.88)',
      borderBottom:    `1px solid ${c.border}`,
      backdropFilter:  'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
    }}>
      <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 22 }}>🎁</span>
        <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.4px' }}>GiftHint</span>
      </a>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <a href="/gifts" className="nav-link" style={{ fontSize: 13, fontWeight: 500, color: c.muted, padding: '6px 12px' }}>
          All occasions
        </a>
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
  )
}

function GiftCard({ item, accent }: { item: SampleItem; accent: string }) {
  const accentDim  = hexAlpha(accent, 0.11)
  const accentRing = hexAlpha(accent, 0.25)

  return (
    <div
      className="card-hover"
      style={{
        background:   '#fff',
        border:       `1px solid ${c.border}`,
        borderRadius: 16,
        overflow:     'hidden',
        boxShadow:    c.shadow,
        display:      'flex',
        flexDirection: 'column',
      }}
    >
      {/* Image area */}
      <div style={{
        height:     140,
        background: `linear-gradient(135deg, ${accentDim}, rgba(0,0,0,0.03))`,
        display:    'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position:   'relative',
        fontSize:   64,
      }}>
        {item.emoji}
        {item.tag && (
          <div style={{
            position:    'absolute',
            top:         12,
            left:        12,
            background:  accent,
            color:       '#fff',
            borderRadius: 999,
            padding:     '3px 10px',
            fontSize:    11,
            fontWeight:  700,
          }}>
            {item.tag}
          </div>
        )}
      </div>

      {/* Card body */}
      <div style={{ padding: '14px 16px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <p style={{ fontSize: 13.5, fontWeight: 700, color: c.text, lineHeight: 1.35, marginBottom: 3 }}>
            {item.title}
          </p>
          <p style={{ fontSize: 11.5, color: c.muted }}>{item.retailer}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: c.text }}>{item.price}</span>
          <div style={{
            background:   accentDim,
            border:       `1px solid ${accentRing}`,
            borderRadius: 8,
            padding:      '6px 12px',
            fontSize:     12,
            fontWeight:   700,
            color:        accent,
          }}>
            View gift →
          </div>
        </div>
      </div>
    </div>
  )
}

function FaqItem({ faq, index }: { faq: OccasionFAQ; index: number }) {
  return (
    <details
      key={index}
      style={{
        borderBottom: `1px solid ${c.border}`,
        paddingBottom: 0,
      }}
    >
      <summary style={{
        display:     'flex',
        alignItems:  'center',
        justifyContent: 'space-between',
        padding:     '18px 0',
        cursor:      'pointer',
        listStyle:   'none',
        gap:         16,
        userSelect:  'none',
      }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: c.text, lineHeight: 1.4 }}>
          {faq.question}
        </span>
        <span className="faq-chevron" style={{ fontSize: 16, color: c.muted, flexShrink: 0 }}>▼</span>
      </summary>
      <p style={{
        fontSize:   14.5,
        color:      c.textSub,
        lineHeight: 1.7,
        paddingBottom: 20,
      }}>
        {faq.answer}
      </p>
    </details>
  )
}

// ── Utility ───────────────────────────────────────────────────────────────────

function hexAlpha(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}

// ── Page ──────────────────────────────────────────────────────────────────────

// ── Recent list type ──────────────────────────────────────────────────────────

interface RecentList {
  id:        string
  title:     string
  slug:      string
  occasion:  string
  users:     { public_username: string; display_name: string | null }
  itemCount: number
  retailers: string[]
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function OccasionLandingPage({ params }: { params: { occasion: string } }) {
  const seo = getOccasionSEO(params.occasion)
  if (!seo) notFound()

  // Fetch 6 most recently created public lists for this occasion (ISR-cached)
  let recentLists: RecentList[] = []
  try {
    const supabase = createServerClient()
    const { data } = await supabase
      .from('wishlists')
      .select(`
        id, title, slug, occasion,
        users!inner(public_username, display_name),
        wishlist_items(id, retailer)
      `)
      .eq('is_public', true)
      .eq('occasion', seo.dbKey)
      .order('created_at', { ascending: false })
      .limit(6)

    if (data) {
      recentLists = data.map((row: {
        id: string
        title: string
        slug: string
        occasion: string
        users: { public_username: string; display_name: string | null } | { public_username: string; display_name: string | null }[]
        wishlist_items: { id: string; retailer: string | null }[]
      }) => {
        const user = Array.isArray(row.users) ? row.users[0] : row.users
        const retailers = Array.from(
          new Set(
            (row.wishlist_items ?? [])
              .map((i) => i.retailer)
              .filter((r): r is string => !!r),
          ),
        ).slice(0, 3)
        return {
          id:        row.id,
          title:     row.title,
          slug:      row.slug,
          occasion:  row.occasion,
          users:     user,
          itemCount: row.wishlist_items?.length ?? 0,
          retailers,
        }
      })
    }
  } catch {
    // Graceful degradation — section is hidden if Supabase is unavailable
  }

  const { accentColor: accent } = seo
  const accentDim  = hexAlpha(accent, 0.11)
  const accentSoft = hexAlpha(accent, 0.18)
  const accentRing = hexAlpha(accent, 0.28)
  const accentGlow = hexAlpha(accent, 0.40)

  // FAQPage JSON-LD for Google rich results
  const faqSchema = {
    '@context':  'https://schema.org',
    '@type':     'FAQPage',
    mainEntity:  seo.faqs.map((faq) => ({
      '@type':         'Question',
      name:            faq.question,
      acceptedAnswer:  { '@type': 'Answer', text: faq.answer },
    })),
  }

  return (
    <div style={{ minHeight: '100vh', background: c.bg, color: c.text, fontFamily: font, overflowX: 'hidden' }}>
      <style>{globalCSS}</style>

      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <Nav />

      {/* ═══════════════════════════════════════════════════ HERO ══ */}
      <section style={{
        position:   'relative',
        textAlign:  'center',
        padding:    '88px 24px 72px',
        overflow:   'hidden',
      }}>
        {/* Accent gradient orb */}
        <div style={{
          position:    'absolute',
          top:         '-100px',
          left:        '50%',
          transform:   'translateX(-50%)',
          width:        640,
          height:       480,
          borderRadius: '50%',
          pointerEvents: 'none',
          background:  `radial-gradient(ellipse at center, ${accentDim} 0%, transparent 70%)`,
          filter:      'blur(40px)',
        }} />

        <div style={{ position: 'relative', maxWidth: 680, margin: '0 auto' }}>
          {/* Breadcrumb badge */}
          <div className="hero-badge" style={{ marginBottom: 20 }}>
            <a href="/gifts" style={{
              display:      'inline-flex',
              alignItems:   'center',
              gap:          6,
              background:   accentDim,
              border:       `1px solid ${accentRing}`,
              borderRadius: 999,
              padding:      '5px 14px',
              fontSize:     12,
              fontWeight:   600,
              color:        accent,
            }}>
              ← All occasions
            </a>
          </div>

          {/* Occasion pill */}
          <div className="hero-badge" style={{ marginBottom: 24 }}>
            <div style={{
              display:      'inline-flex',
              alignItems:   'center',
              gap:          8,
              background:   accentSoft,
              border:       `1px solid ${accentRing}`,
              borderRadius: 999,
              padding:      '7px 18px',
            }}>
              <span style={{ fontSize: 20 }}>{seo.emoji}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: accent }}>
                {seo.displayName} Wish List
              </span>
            </div>
          </div>

          {/* H1 */}
          <h1
            className="hero-h1"
            style={{
              fontSize:      'clamp(36px, 6vw, 60px)',
              fontWeight:    900,
              lineHeight:    1.06,
              letterSpacing: '-2px',
              marginBottom:  22,
            }}
          >
            {seo.h1.replace('That ', `That `)}
          </h1>

          {/* Sub */}
          <p
            className="hero-sub"
            style={{
              fontSize:     'clamp(16px, 2.2vw, 19px)',
              color:        c.muted,
              lineHeight:   1.65,
              maxWidth:     520,
              margin:       '0 auto 36px',
            }}
          >
            {seo.heroSubline}
          </p>

          {/* CTAs */}
          <div className="hero-cta" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 12 }}>
            <a
              href={CHROME_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="gh-cta-shimmer"
              style={{
                display:      'inline-flex',
                alignItems:   'center',
                gap:          10,
                background:   accent,
                color:        '#fff',
                borderRadius: 14,
                padding:      '15px 32px',
                fontSize:     16,
                fontWeight:   800,
                letterSpacing: '-0.2px',
                boxShadow:    `0 4px 24px ${accentGlow}`,
              }}
            >
              {seo.emoji} Create your free list
            </a>
            <a
              href={`/list/gifthint`}
              style={{
                display:      'inline-flex',
                alignItems:   'center',
                gap:          6,
                fontSize:     14,
                fontWeight:   600,
                color:        c.purple,
                padding:      '15px 20px',
                borderRadius: 14,
                border:       `1.5px solid ${c.purpleRing}`,
              }}
            >
              See example list →
            </a>
          </div>

          {/* Trust row */}
          <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '8px 24px', marginTop: 24 }}>
            {['✨ 100% free', '🌐 Works with 500+ stores', '🛡️ No duplicate gifts'].map((t) => (
              <span key={t} style={{ fontSize: 12.5, color: c.muted }}>{t}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════ HOW IT WORKS ══ */}
      <section style={{ background: c.bgTint, padding: '80px 24px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <p className="reveal" style={{ textAlign: 'center', fontSize: 11.5, fontWeight: 700, color: accent, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
            How it works
          </p>
          <h2 className="reveal" style={{ textAlign: 'center', fontSize: 'clamp(26px, 4vw, 38px)', fontWeight: 900, letterSpacing: '-0.8px', marginBottom: 56, lineHeight: 1.15 }}>
            Up and running in 60 seconds.
          </h2>

          <div className="steps-grid reveal" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
            {[
              {
                num:   '01',
                icon:  '🔧',
                title: 'Install the extension',
                copy:  'Add GiftHint to Chrome in one click. Free, no account needed to start. Works on Chrome, Edge, Brave, and Arc.',
                color: c.purple,
                colorDim: c.purpleDim,
                colorRing: c.purpleRing,
              },
              {
                num:   '02',
                icon:  '♥',
                title: 'Save what you want',
                copy:  seo.saveStepCopy,
                color: accent,
                colorDim: accentDim,
                colorRing: accentRing,
              },
              {
                num:   '03',
                icon:  '🔗',
                title: 'Share your list link',
                copy:  `You get a permanent link at gifthint.io/list/you. When a friend buys a gift, it's automatically claimed — no duplicate ${seo.displayName.toLowerCase()} gifts.`,
                color: c.green,
                colorDim: 'rgba(5,150,105,0.09)',
                colorRing: 'rgba(5,150,105,0.22)',
              },
            ].map((step) => (
              <div
                key={step.num}
                className="card-hover"
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
                    background:   step.colorDim,
                    border:       `1px solid ${step.colorRing}`,
                    display:      'flex',
                    alignItems:   'center',
                    justifyContent: 'center',
                    fontSize:     18,
                    flexShrink:   0,
                  }}>
                    {step.icon}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 800, color: step.color, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                    Step {step.num}
                  </span>
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: c.text, lineHeight: 1.25 }}>{step.title}</h3>
                <p style={{ fontSize: 13.5, color: c.muted, lineHeight: 1.65 }}>{step.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════ SAMPLE LISTS ══ */}
      <section style={{ background: c.bg, padding: '80px 24px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <p className="reveal" style={{ textAlign: 'center', fontSize: 11.5, fontWeight: 700, color: accent, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
            Example {seo.displayName} list
          </p>
          <h2 className="reveal" style={{ textAlign: 'center', fontSize: 'clamp(24px, 3.8vw, 36px)', fontWeight: 900, letterSpacing: '-0.7px', marginBottom: 12, lineHeight: 1.15 }}>
            Popular {seo.displayName} Gifts
          </h2>
          <p className="reveal" style={{ textAlign: 'center', fontSize: 15, color: c.muted, marginBottom: 44, maxWidth: 480, margin: '0 auto 44px' }}>
            These are the kinds of items people add to their {seo.displayName.toLowerCase()} lists. You can save anything from any store.
          </p>

          <div className="sample-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
            {seo.sampleItems.map((item, i) => (
              <div key={i} className="reveal" style={{ animationDelay: `${i * 0.08}s` }}>
                <GiftCard item={item} accent={accent} />
              </div>
            ))}
          </div>

          <p className="reveal" style={{ textAlign: 'center', marginTop: 28, fontSize: 13, color: c.muted }}>
            Want these on your list? <a href={CHROME_STORE_URL} style={{ color: accent, fontWeight: 700 }}>Install GiftHint</a> and save from any store in one click.
          </p>
        </div>
      </section>

      {/* ══════════════════════════ REAL LISTS ══ */}
      {recentLists.length > 0 && (
        <section style={{ background: '#fff', padding: '72px 24px' }}>
          <div style={{ maxWidth: 860, margin: '0 auto' }}>
            <p className="reveal" style={{ textAlign: 'center', fontSize: 11.5, fontWeight: 700, color: accent, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
              Real GiftHint users
            </p>
            <h2 className="reveal" style={{ textAlign: 'center', fontSize: 'clamp(22px, 3.5vw, 32px)', fontWeight: 900, letterSpacing: '-0.6px', marginBottom: 8, lineHeight: 1.2, color: c.text }}>
              Real {seo.displayName.toLowerCase()} lists from GiftHint users
            </h2>
            <p className="reveal" style={{ textAlign: 'center', fontSize: 14, color: c.muted, marginBottom: 44 }}>
              These are live wishlists — click through to see what people are actually saving.
            </p>

            <div style={{
              display:             'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
              gap:                 16,
            }}>
              {recentLists.map((list) => {
                const displayName = list.users.display_name?.split(' ')[0] ?? list.users.public_username
                const listHref    = `/list/${list.users.public_username}/${list.slug}`

                return (
                  <a
                    key={list.id}
                    href={listHref}
                    className="gh-occasion-card"
                    style={{
                      display:        'flex',
                      flexDirection:  'column',
                      gap:            10,
                      padding:        '18px 20px',
                      background:     c.bgTint,
                      border:         `1px solid ${c.border}`,
                      borderRadius:   14,
                      textDecoration: 'none',
                      color:          'inherit',
                      '--gh-hover-shadow': `0 4px 20px ${hexAlpha(accent, 0.15)}`,
                    } as React.CSSProperties}
                  >
                    {/* Avatar + name */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width:          36,
                        height:         36,
                        borderRadius:   '50%',
                        background:     hexAlpha(accent, 0.18),
                        border:         `1px solid ${hexAlpha(accent, 0.28)}`,
                        display:        'flex',
                        alignItems:     'center',
                        justifyContent: 'center',
                        fontSize:       14,
                        fontWeight:     800,
                        color:          accent,
                        flexShrink:     0,
                      }}>
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: c.text }}>
                          {displayName}&apos;s list
                        </p>
                        <p style={{ margin: 0, fontSize: 11, color: c.muted }}>
                          @{list.users.public_username}
                        </p>
                      </div>
                    </div>

                    {/* List title */}
                    <p style={{
                      margin:     0,
                      fontSize:   13.5,
                      fontWeight: 600,
                      color:      c.textSub,
                      lineHeight: 1.4,
                    }}>
                      {list.title}
                    </p>

                    {/* Stats row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {list.itemCount > 0 && (
                        <span style={{
                          fontSize:     11,
                          fontWeight:   600,
                          color:        accent,
                          background:   hexAlpha(accent, 0.11),
                          border:       `1px solid ${hexAlpha(accent, 0.22)}`,
                          borderRadius: '999px',
                          padding:      '2px 8px',
                          whiteSpace:   'nowrap',
                        }}>
                          {list.itemCount} item{list.itemCount === 1 ? '' : 's'}
                        </span>
                      )}
                      {list.retailers.map((r) => (
                        <span
                          key={r}
                          style={{
                            fontSize:     10,
                            fontWeight:   500,
                            color:        c.muted,
                            background:   c.bgTintDeep,
                            borderRadius: '999px',
                            padding:      '2px 7px',
                            whiteSpace:   'nowrap',
                          }}
                        >
                          {r}
                        </span>
                      ))}
                    </div>

                    <span style={{
                      marginTop:  'auto',
                      fontSize:   12,
                      fontWeight: 700,
                      color:      accent,
                    }}>
                      View list →
                    </span>
                  </a>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════ FAQ ══ */}
      <section style={{ background: c.bgTint, padding: '80px 24px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <p className="reveal" style={{ textAlign: 'center', fontSize: 11.5, fontWeight: 700, color: accent, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
            Questions
          </p>
          <h2 className="reveal" style={{ textAlign: 'center', fontSize: 'clamp(24px, 3.8vw, 36px)', fontWeight: 900, letterSpacing: '-0.7px', marginBottom: 44, lineHeight: 1.15 }}>
            Frequently asked
          </h2>

          <div style={{ borderTop: `1px solid ${c.border}` }}>
            {seo.faqs.map((faq, i) => (
              <FaqItem key={i} faq={faq} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════ BOTTOM CTA ══ */}
      <section style={{
        background:  `linear-gradient(135deg, ${hexAlpha(accent, 0.95)} 0%, ${accent} 50%, ${c.purple} 100%)`,
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
          background:  'rgba(255,255,255,0.07)',
          filter:      'blur(40px)',
          pointerEvents: 'none',
        }} />
        <div style={{ position: 'relative', maxWidth: 560, margin: '0 auto' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14 }}>
            Start for free
          </p>
          <h2 style={{ fontSize: 'clamp(28px, 4.5vw, 48px)', fontWeight: 900, color: '#fff', letterSpacing: '-1.2px', lineHeight: 1.1, marginBottom: 16 }}>
            {seo.bottomCtaHeadline}
          </h2>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6, marginBottom: 36, maxWidth: 400, margin: '0 auto 36px' }}>
            {seo.bottomCtaSub}
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
              color:        accent,
              borderRadius: 14,
              padding:      '16px 36px',
              fontSize:     16,
              fontWeight:   900,
              letterSpacing: '-0.2px',
              boxShadow:    '0 6px 28px rgba(0,0,0,0.2)',
            }}
          >
            {seo.emoji} Create your free {seo.displayName.toLowerCase()} list
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
          <a href="/gifts"   className="nav-link" style={{ fontSize: 13, color: c.muted }}>All occasions</a>
          <a href="/privacy" className="nav-link" style={{ fontSize: 13, color: c.muted }}>Privacy</a>
          <a href="/terms"   className="nav-link" style={{ fontSize: 13, color: c.muted }}>Terms</a>
        </nav>
      </footer>
    </div>
  )
}
