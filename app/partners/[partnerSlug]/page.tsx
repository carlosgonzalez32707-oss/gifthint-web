/**
 * app/partners/[partnerSlug]/page.tsx — GiftHint
 *
 * Co-branded partner landing pages.
 *
 * Route: /partners/[partnerSlug]
 *   e.g.  /partners/knighton-weddings
 *         /partners/lawn-tennis-chiswick
 *         /partners/nct-group-islington
 *
 * Server Component — renders a co-branded landing page for the partner.
 * Does NOT set cookies (Next.js 14 App Router Server Components cannot set
 * cookies). Cookie attribution is handled by the CTA, which links to:
 *   GET /api/partners/track?code=<partner.referral_code>
 * That Route Handler sets gifthint_ref and redirects to / so the user can
 * start the Google OAuth flow. On signup, /api/auth/signup reads the cookie
 * and attributes the new user to the partner — identical to user referrals.
 *
 * ISR: revalidate = 3600. Partner data changes rarely; one-hour staleness is
 * acceptable and avoids a DB hit on every page load.
 *
 * SEO: partner pages are private UTM-style landing pages, not intended to rank.
 * robots = noindex so they don't dilute gifthint.io/gifts/[occasion] pages.
 *
 * Design: matches the light-mode palette used by app/gifts/[occasion]/page.tsx.
 * The partner's accent_colour (if set) overrides the default GiftHint purple
 * on the badge, step numbers, and CTA button.
 */

import type { Metadata }    from 'next'
import { notFound }          from 'next/navigation'
import {
  fetchPartnerBySlug,
  fetchActivePartnerSlugs,
  CATEGORY_COPY,
  type PartnerRow,
}                            from '@/lib/partners'

// ── ISR ───────────────────────────────────────────────────────────────────────

export const revalidate = 3600

// ── Static generation ─────────────────────────────────────────────────────────
// Pre-render known partner slugs at build time for fastest TTFB.
// New partners added after deploy are served on-demand and cached after first hit.

export async function generateStaticParams() {
  const slugs = await fetchActivePartnerSlugs()
  return slugs.map((slug) => ({ partnerSlug: slug }))
}

// ── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata(
  { params }: { params: { partnerSlug: string } },
): Promise<Metadata> {
  const partner = await fetchPartnerBySlug(params.partnerSlug)
  if (!partner) return {}

  const title       = `GiftHint × ${partner.name}`
  const description = partner.tagline
    ?? `The free wishlist tool recommended by ${partner.name}. Save from any store. Share one link. No duplicate gifts.`

  return {
    title,
    description,
    // Partner pages are private tracking landing pages — exclude from search.
    robots: { index: false, follow: false },
  }
}

// ── Design tokens (light-mode, mirrors app/gifts/[occasion]/page.tsx) ─────────

const c = {
  bg:         '#FFFFFF',
  bgTint:     '#F5F3FF',
  border:     'rgba(0,0,0,0.07)',
  text:       '#0F0F1A',
  textSub:    '#374151',
  muted:      '#6B7280',
  mutedLight: '#9CA3AF',
  purple:     '#7C3AED',
  shadow:     '0 1px 3px rgba(0,0,0,0.06), 0 6px 20px rgba(0,0,0,0.05)',
}
const font = "var(--font-inter), system-ui, -apple-system, 'Segoe UI', sans-serif"

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build an rgba() string from a hex colour and alpha 0–1. */
function hexAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Nav({ partner, accent }: { partner: PartnerRow; accent: string }) {
  return (
    <nav
      style={{
        borderBottom:   `1px solid ${c.border}`,
        padding:        '0 24px',
        height:         '56px',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        background:     c.bg,
        position:       'sticky',
        top:            0,
        zIndex:         10,
      }}
    >
      {/* Co-brand lockup */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {partner.logo_url && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={partner.logo_url}
              alt={partner.name}
              style={{ height: '26px', objectFit: 'contain' }}
            />
            <span style={{ color: c.border, fontSize: '18px' }}>×</span>
          </>
        )}
        <span
          style={{
            fontSize:      '16px',
            fontWeight:    800,
            letterSpacing: '-0.03em',
            color:         c.text,
          }}
        >
          🎁 GiftHint
        </span>
      </div>

      {/* CTA — lightweight text link so the nav never dominates */}
      <a
        href={`/api/partners/track?code=${partner.referral_code}`}
        style={{
          fontSize:      '13px',
          fontWeight:    600,
          color:         accent,
          textDecoration: 'none',
        }}
      >
        Get started →
      </a>
    </nav>
  )
}

function BadgePill({
  label,
  accent,
}: {
  label:  string
  accent: string
}) {
  return (
    <div
      style={{
        display:      'inline-flex',
        alignItems:   'center',
        gap:          '6px',
        background:   hexAlpha(accent, 0.08),
        border:       `1px solid ${hexAlpha(accent, 0.22)}`,
        borderRadius: '100px',
        padding:      '5px 14px',
        fontSize:     '12px',
        fontWeight:   600,
        color:        accent,
        marginBottom: '24px',
      }}
    >
      <span>🤝</span>
      <span>Recommended {label}</span>
    </div>
  )
}

function StepList({
  steps,
  accent,
}: {
  steps:  [string, string, string]
  accent: string
}) {
  return (
    <div style={{ marginTop: '48px' }}>
      <h2
        style={{
          fontSize:      '17px',
          fontWeight:    700,
          letterSpacing: '-0.02em',
          color:         c.text,
          marginBottom:  '20px',
          margin:        '0 0 20px',
        }}
      >
        How it works
      </h2>

      {steps.map((step, i) => (
        <div
          key={i}
          style={{
            display:     'flex',
            alignItems:  'flex-start',
            gap:         '16px',
            marginBottom: i < steps.length - 1 ? '14px' : 0,
          }}
        >
          {/* Step number */}
          <div
            style={{
              width:          '28px',
              height:         '28px',
              borderRadius:   '50%',
              background:     hexAlpha(accent, 0.1),
              border:         `1px solid ${hexAlpha(accent, 0.25)}`,
              color:          accent,
              fontSize:       '12px',
              fontWeight:     700,
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              flexShrink:     0,
              marginTop:      '2px',
            }}
          >
            {i + 1}
          </div>

          <p
            style={{
              fontSize:   '15px',
              color:      c.textSub,
              lineHeight: 1.55,
              margin:     0,
            }}
          >
            {step}
          </p>
        </div>
      ))}
    </div>
  )
}

function TrustStrip() {
  const items = [
    { emoji: '🔗', label: 'Works across every store' },
    { emoji: '🛡', label: 'No login for your guests' },
    { emoji: '✓',  label: 'Free forever' },
  ]

  return (
    <div
      style={{
        display:        'flex',
        flexWrap:       'wrap',
        gap:            '10px',
        marginTop:      '20px',
      }}
    >
      {items.map(({ emoji, label }) => (
        <span
          key={label}
          style={{
            display:      'inline-flex',
            alignItems:   'center',
            gap:          '6px',
            fontSize:     '12px',
            fontWeight:   500,
            color:        c.muted,
            background:   c.bgTint,
            border:       `1px solid ${c.border}`,
            borderRadius: '100px',
            padding:      '4px 12px',
          }}
        >
          {emoji} {label}
        </span>
      ))}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function PartnerPage(
  { params }: { params: { partnerSlug: string } },
) {
  const partner = await fetchPartnerBySlug(params.partnerSlug)
  if (!partner) notFound()

  const copy   = CATEGORY_COPY[partner.category]
  const accent = partner.accent_colour ?? c.purple

  // URL that the CTA points to — Route Handler sets the cookie then redirects to /
  const trackUrl = `/api/partners/track?code=${encodeURIComponent(partner.referral_code)}`

  return (
    <>
      {/* Global reset — scoped via style tag */}
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        html { scroll-behavior: smooth; }
        body { margin: 0; background: #fff; font-family: ${font}; }
        a { color: inherit; text-decoration: none; }
        p, h1, h2, h3 { margin: 0; }
      `}</style>

      <div
        style={{
          minHeight:  '100vh',
          background: c.bg,
          fontFamily: font,
          color:      c.text,
        }}
      >
        <Nav partner={partner} accent={accent} />

        <main
          style={{
            maxWidth: '660px',
            margin:   '0 auto',
            padding:  '60px 24px 80px',
          }}
        >
          {/* ── Partnership badge ──────────────────────────────────────────── */}
          <BadgePill label={copy.badgeLabel} accent={accent} />

          {/* ── Headline ──────────────────────────────────────────────────── */}
          <h1
            style={{
              fontSize:      'clamp(26px, 5vw, 42px)',
              fontWeight:    800,
              letterSpacing: '-0.04em',
              lineHeight:    1.1,
              color:         c.text,
              marginBottom:  '14px',
            }}
          >
            {copy.headline}
          </h1>

          {/* ── Subline ───────────────────────────────────────────────────── */}
          <p
            style={{
              fontSize:     '17px',
              color:        c.muted,
              lineHeight:   1.65,
              maxWidth:     '520px',
              marginBottom: '32px',
            }}
          >
            {copy.subline}
          </p>

          {/* ── Primary CTA ───────────────────────────────────────────────── */}
          <a
            href={trackUrl}
            style={{
              display:        'inline-flex',
              alignItems:     'center',
              gap:            '8px',
              background:     accent,
              color:          '#fff',
              fontWeight:     700,
              fontSize:       '15px',
              padding:        '13px 26px',
              borderRadius:   '10px',
              textDecoration: 'none',
              boxShadow:      `0 4px 14px ${hexAlpha(accent, 0.35)}`,
            }}
          >
            Create my free list →
          </a>

          {/* ── Trust strip ───────────────────────────────────────────────── */}
          <TrustStrip />

          {/* ── Partner attribution note ──────────────────────────────────── */}
          <p
            style={{
              fontSize:   '12px',
              color:      c.mutedLight,
              marginTop:  '14px',
            }}
          >
            Recommended by{' '}
            <strong style={{ color: c.muted }}>{partner.name}</strong>
            {partner.tagline ? ` · ${partner.tagline}` : ''}
          </p>

          {/* ── How it works ──────────────────────────────────────────────── */}
          <StepList steps={copy.steps} accent={accent} />

          {/* ── Feature trio ──────────────────────────────────────────────── */}
          <div
            style={{
              display:             'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap:                 '12px',
              marginTop:           '48px',
            }}
          >
            {[
              {
                emoji: '🛒',
                title: 'Any store',
                body:  'Amazon, Etsy, ASOS, John Lewis, M&S — if you can open it in a browser, you can save from it.',
              },
              {
                emoji: '🔗',
                title: 'One link',
                body:  'Your guests don\'t download anything or create an account. They just click your link.',
              },
              {
                emoji: '✓',
                title: 'No duplicates',
                body:  'Items are claimed in real time. Everyone sees what\'s been bought — no double gifts.',
              },
            ].map(({ emoji, title, body }) => (
              <div
                key={title}
                style={{
                  background:   c.bgTint,
                  border:       `1px solid ${c.border}`,
                  borderRadius: '12px',
                  padding:      '20px 18px',
                  boxShadow:    c.shadow,
                }}
              >
                <div style={{ fontSize: '22px', marginBottom: '10px' }}>{emoji}</div>
                <h3
                  style={{
                    fontSize:      '14px',
                    fontWeight:    700,
                    letterSpacing: '-0.01em',
                    color:         c.text,
                    marginBottom:  '6px',
                  }}
                >
                  {title}
                </h3>
                <p
                  style={{
                    fontSize:   '13px',
                    color:      c.muted,
                    lineHeight: 1.55,
                  }}
                >
                  {body}
                </p>
              </div>
            ))}
          </div>

          {/* ── Secondary CTA ─────────────────────────────────────────────── */}
          <div
            style={{
              marginTop:    '56px',
              textAlign:    'center',
              background:   hexAlpha(accent, 0.06),
              border:       `1px solid ${hexAlpha(accent, 0.18)}`,
              borderRadius: '16px',
              padding:      '36px 24px',
            }}
          >
            <p
              style={{
                fontSize:      '20px',
                fontWeight:    800,
                letterSpacing: '-0.03em',
                color:         c.text,
                marginBottom:  '8px',
              }}
            >
              Ready to start?
            </p>
            <p
              style={{
                fontSize:     '14px',
                color:        c.muted,
                marginBottom: '20px',
              }}
            >
              Takes about 90 seconds. Free forever.
            </p>
            <a
              href={trackUrl}
              style={{
                display:        'inline-flex',
                alignItems:     'center',
                gap:            '8px',
                background:     accent,
                color:          '#fff',
                fontWeight:     700,
                fontSize:       '14px',
                padding:        '11px 22px',
                borderRadius:   '8px',
                textDecoration: 'none',
              }}
            >
              Create my free list →
            </a>
          </div>

          {/* ── Footer ────────────────────────────────────────────────────── */}
          <footer
            style={{
              marginTop:      '48px',
              paddingTop:     '20px',
              borderTop:      `1px solid ${c.border}`,
              display:        'flex',
              justifyContent: 'space-between',
              alignItems:     'center',
              flexWrap:       'wrap',
              gap:            '8px',
            }}
          >
            <span style={{ fontSize: '12px', color: c.mutedLight }}>
              © {new Date().getFullYear()} GiftHint · Some links earn us a small commission.
            </span>
            <div style={{ display: 'flex', gap: '16px' }}>
              {[
                { href: '/privacy', label: 'Privacy' },
                { href: '/terms',   label: 'Terms' },
                { href: '/',        label: 'gifthint.io' },
              ].map(({ href, label }) => (
                <a
                  key={href}
                  href={href}
                  style={{ fontSize: '12px', color: c.mutedLight }}
                >
                  {label}
                </a>
              ))}
            </div>
          </footer>
        </main>
      </div>
    </>
  )
}
