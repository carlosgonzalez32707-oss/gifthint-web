/**
 * app/bookmarklet/page.tsx — GiftHint
 *
 * Bookmarklet install page — "Save gifts from any browser or device".
 *
 * Server Component: generates static HTML + proper <head> metadata.
 * The draggable <a> href is the minified bookmarklet javascript: URL,
 * produced at request time by getBookmarkletHref() (no I/O, pure computation).
 *
 * Interactive elements (browser tab switcher, iOS copy button) are handled
 * by the BrowserInstructions client island imported below.
 */

import type { Metadata }          from 'next'
import { getBookmarkletHref }     from '@/lib/bookmarklet-minifier'
import { BrowserInstructions }    from './BrowserInstructions'

// ── Metadata ───────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title:       'Install GiftHint on Any Browser — Bookmarklet',
  description: 'Save gift ideas from Safari, Firefox, Edge, or iOS with the GiftHint bookmarklet. Drag one button to your bookmarks bar and save from any store.',
  openGraph: {
    title:       'GiftHint Bookmarklet — Save Gifts from Any Browser',
    description: 'One button. Every browser. Save gifts from Amazon, Etsy, ASOS, Apple, or anywhere else.',
    url:         'https://gifthint.io/bookmarklet',
  },
}

// ── Shared styles (inline — no external stylesheet needed for this page) ───────

const S = {
  page: {
    minHeight: '100vh',
    background: '#0C0C0E',
    color: '#F0EEE8',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
    WebkitFontSmoothing: 'antialiased' as const,
  },
  container: {
    maxWidth: '680px',
    margin: '0 auto',
    padding: '0 24px 80px',
  },
} as const

// ── Page ───────────────────────────────────────────────────────────────────────

export default function BookmarkletPage() {
  const bookmarkletHref = getBookmarkletHref()

  return (
    <div style={S.page}>
      <div style={S.container}>

        {/* ── Nav strip ──────────────────────────────────────────────────── */}
        <nav style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 0 0',
        }}>
          <a
            href="/"
            style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <span style={{ fontSize: '20px' }}>🎁</span>
            <span style={{ fontWeight: 700, fontSize: '15px', color: '#F0EEE8' }}>GiftHint</span>
          </a>
          <a
            href="https://chromewebstore.google.com/detail/gifthint"
            style={{
              fontSize: '12px', color: '#7A7870', textDecoration: 'none',
              padding: '6px 12px', borderRadius: '999px',
              border: '1px solid rgba(240,238,232,0.12)',
            }}
          >
            Chrome Extension ↗
          </a>
        </nav>

        {/* ── Hero ───────────────────────────────────────────────────────── */}
        <header style={{ padding: '56px 0 48px', textAlign: 'center' }}>

          {/* Browser pills */}
          <div style={{
            display: 'flex', justifyContent: 'center', flexWrap: 'wrap',
            gap: '6px', marginBottom: '28px',
          }}>
            {['Chrome', 'Safari', 'Firefox', 'Edge', 'iOS Safari', 'Samsung'].map(b => (
              <span key={b} style={{
                padding: '4px 12px', borderRadius: '999px', fontSize: '12px',
                fontWeight: 600, color: '#A09AF2',
                background: 'rgba(139,131,240,0.12)',
                border: '1px solid rgba(139,131,240,0.25)',
              }}>
                {b}
              </span>
            ))}
          </div>

          <h1 style={{
            fontSize: 'clamp(28px, 6vw, 42px)',
            fontWeight: 800, lineHeight: 1.15,
            letterSpacing: '-0.03em', margin: '0 0 16px',
          }}>
            Save gifts from{' '}
            <span style={{ color: '#8B83F0' }}>any browser</span>
            {' '}or device
          </h1>

          <p style={{
            fontSize: '16px', color: '#9A9690', lineHeight: 1.7,
            maxWidth: '480px', margin: '0 auto',
          }}>
            The GiftHint bookmarklet works in Safari, Firefox, Edge, iOS, and any
            corporate browser where you can't install extensions. One drag to install.
          </p>
        </header>

        {/* ── Drag zone ──────────────────────────────────────────────────── */}
        <section
          aria-label="Install the bookmarklet"
          style={{
            borderRadius: '16px',
            background: 'linear-gradient(135deg, rgba(139,131,240,0.12) 0%, rgba(139,131,240,0.04) 100%)',
            border: '1px solid rgba(139,131,240,0.3)',
            padding: '40px 32px',
            marginBottom: '48px',
            textAlign: 'center',
          }}
        >
          {/* Drag instruction */}
          <p style={{
            fontSize: '13px', fontWeight: 600, color: '#7A7870',
            letterSpacing: '0.04em', textTransform: 'uppercase',
            marginBottom: '24px',
          }}>
            Step 1 — Drag this button to your bookmarks bar
          </p>

          {/* Drag arrows */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '16px', marginBottom: '8px',
          }}>
            <span style={{ fontSize: '20px', color: 'rgba(139,131,240,0.5)' }} aria-hidden>←</span>

            {/*
              THE BOOKMARKLET BUTTON
              ─────────────────────
              Must be an <a> tag — only anchor elements can be dragged to the
              bookmarks bar. The href IS the bookmarklet; dragging it installs it.
              Never use a <button> here.
            */}
            <a
              href={bookmarkletHref}
              draggable={true}
              onClick={(e) => {
                // Clicking (not dragging) on the install page itself is
                // harmless but confusing — intercept and show a tip instead.
                // The bookmarklet only runs when clicked from OTHER sites.
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                padding: '14px 28px',
                borderRadius: '12px',
                background: '#8B83F0',
                color: '#fff',
                textDecoration: 'none',
                fontWeight: 700,
                fontSize: '16px',
                fontFamily: 'inherit',
                letterSpacing: '-0.01em',
                boxShadow: '0 0 0 1px rgba(139,131,240,0.6), 0 8px 32px rgba(139,131,240,0.35)',
                cursor: 'grab',
                userSelect: 'none' as const,
                WebkitUserSelect: 'none' as const,
                transition: 'transform 80ms ease, box-shadow 80ms ease',
              }}
              title="Drag me to your bookmarks bar"
            >
              <span style={{ fontSize: '20px' }}>🎁</span>
              Save to GiftHint
            </a>

            <span style={{ fontSize: '20px', color: 'rgba(139,131,240,0.5)' }} aria-hidden>→</span>
          </div>

          <p style={{ fontSize: '12px', color: 'rgba(139,131,240,0.7)', marginBottom: '28px' }}>
            grab and drag ↑
          </p>

          {/* Divider */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            color: '#3A3830', marginBottom: '20px',
          }}>
            <div style={{ flex: 1, height: '1px', background: 'rgba(240,238,232,0.08)' }} />
            <span style={{ fontSize: '11px', color: '#4A4840', fontWeight: 600 }}>
              THEN DO THIS ON ANY PRODUCT PAGE
            </span>
            <div style={{ flex: 1, height: '1px', background: 'rgba(240,238,232,0.08)' }} />
          </div>

          {/* Steps 2 + 3 summary */}
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
            {[
              { n: '2', text: 'Browse any product page on any site' },
              { n: '3', text: 'Click your bookmark — a save sheet opens' },
            ].map(({ n, text }) => (
              <div key={n} style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 16px', borderRadius: '10px',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(240,238,232,0.07)',
              }}>
                <span style={{
                  width: '22px', height: '22px', borderRadius: '50%',
                  background: 'rgba(139,131,240,0.2)',
                  color: '#8B83F0', fontSize: '11px', fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {n}
                </span>
                <span style={{ fontSize: '13px', color: '#C8C4BC' }}>{text}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Browser-specific + iOS instructions (client island) ─────────── */}
        <BrowserInstructions bookmarkletHref={bookmarkletHref} />

        {/* ── FAQ ────────────────────────────────────────────────────────── */}
        <section style={{ marginBottom: '48px' }}>
          <h2 style={{
            fontSize: '13px', fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: '#7A7870', marginBottom: '16px',
          }}>
            Quick answers
          </h2>

          {[
            {
              q: 'Does it work on Amazon?',
              a: 'Yes. Product title, price, and image are all read automatically. The affiliate link is handled on our server — the extension never injects tracking codes on pages you visit.',
            },
            {
              q: 'What about sites with no OG tags?',
              a: 'GiftHint falls back to the page title and whatever image it can find. You can always edit the item title and image after saving.',
            },
            {
              q: 'Is the bookmarklet safe?',
              a: 'The bookmarklet only runs when you click it. It reads page meta tags (title, image, price) and opens a small GiftHint popup. It does not run in the background, does not track your browsing, and does not access any other tabs.',
            },
            {
              q: 'I already have the Chrome extension — do I need this?',
              a: 'Not for Chrome on desktop. The bookmarklet is for Safari, Firefox, Edge, corporate browsers, and iPhone/iPad where the extension can\'t be installed.',
            },
          ].map(({ q, a }) => (
            <details
              key={q}
              style={{
                borderBottom: '1px solid rgba(240,238,232,0.07)',
                padding: '16px 0',
              }}
            >
              <summary style={{
                cursor: 'pointer', fontWeight: 600, fontSize: '14px',
                color: '#F0EEE8', listStyle: 'none', display: 'flex',
                justifyContent: 'space-between', alignItems: 'center',
              }}>
                {q}
                <span style={{ color: '#7A7870', fontSize: '16px', flexShrink: 0, marginLeft: '12px' }}>+</span>
              </summary>
              <p style={{
                margin: '12px 0 0', fontSize: '14px',
                color: '#9A9690', lineHeight: 1.7,
              }}>
                {a}
              </p>
            </details>
          ))}
        </section>

        {/* ── Footer CTA ─────────────────────────────────────────────────── */}
        <footer style={{
          textAlign: 'center',
          padding: '32px',
          borderRadius: '16px',
          background: '#13131A',
          border: '1px solid rgba(240,238,232,0.08)',
        }}>
          <p style={{ fontSize: '20px', marginBottom: '12px' }}>🎁</p>
          <p style={{ fontSize: '15px', fontWeight: 600, color: '#F0EEE8', marginBottom: '8px' }}>
            On Chrome desktop?
          </p>
          <p style={{ fontSize: '13px', color: '#7A7870', marginBottom: '20px' }}>
            The full Chrome extension is faster and shows a floating button on every product page.
          </p>
          <a
            href="https://chromewebstore.google.com/detail/gifthint"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: '12px 24px', borderRadius: '10px',
              background: 'rgba(139,131,240,0.15)',
              border: '1px solid rgba(139,131,240,0.35)',
              color: '#8B83F0', textDecoration: 'none',
              fontWeight: 700, fontSize: '14px',
              fontFamily: 'inherit',
            }}
          >
            Add to Chrome — it's free
          </a>
        </footer>

      </div>
    </div>
  )
}
