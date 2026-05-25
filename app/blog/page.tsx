/**
 * app/blog/page.tsx — GiftHint Blog index
 *
 * Lists all published posts sorted newest-first.
 * Each card shows: title, excerpt, date, read time, occasion tag.
 *
 * Statically generated at build time; no ISR needed — posts are
 * file-system MDX, so a redeploy picks up new content automatically.
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { getAllPosts } from '@/lib/blog'

// ── Metadata ──────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title:       'Gift Ideas & Wishlist Tips | GiftHint Blog',
  description: 'Practical advice on building wishlists people actually buy from, gift ideas for every occasion, and guides to smarter gifting.',
  keywords:    'gift ideas, wishlist tips, birthday gifts, christmas gifts, gift guides',
  alternates:  { canonical: 'https://gifthint.io/blog' },
  openGraph: {
    title:       'Gift Ideas & Wishlist Tips | GiftHint Blog',
    description: 'Practical advice on wishlists, gift ideas, and smarter gifting.',
    url:         'https://gifthint.io/blog',
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
  purple:     '#7C3AED',
  purpleDim:  'rgba(124,58,237,0.08)',
  purpleRing: 'rgba(124,58,237,0.20)',
  shadow:     '0 1px 3px rgba(0,0,0,0.06), 0 6px 20px rgba(0,0,0,0.05)',
}
const font = "var(--font-inter), system-ui, -apple-system, 'Segoe UI', sans-serif"

// ── Helpers ───────────────────────────────────────────────────────────────────

const OCCASION_LABELS: Record<string, string> = {
  birthday:     '🎂 Birthday',
  christmas:    '🎄 Christmas',
  wedding:      '💍 Wedding',
  'baby-shower': '🍼 Baby shower',
  graduation:   '🎓 Graduation',
  housewarming: '🏡 Housewarming',
  anniversary:  '💖 Anniversary',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'month' in {} ? 'numeric' : 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function PostCard({ post }: { post: ReturnType<typeof getAllPosts>[number] }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      style={{
        display:        'flex',
        flexDirection:  'column',
        gap:            12,
        padding:        '28px 28px 24px',
        background:     '#fff',
        borderRadius:   16,
        border:         `1px solid ${c.border}`,
        boxShadow:      c.shadow,
        textDecoration: 'none',
        color:          'inherit',
        transition:     'box-shadow 200ms, transform 200ms',
      }}
      onMouseOver={(e) => {
        const el = e.currentTarget
        el.style.boxShadow = `0 4px 16px rgba(0,0,0,0.10), 0 20px 48px rgba(0,0,0,0.08)`
        el.style.transform  = 'translateY(-2px)'
      }}
      onMouseOut={(e) => {
        const el = e.currentTarget
        el.style.boxShadow = c.shadow
        el.style.transform  = 'translateY(0)'
      }}
    >
      {/* Occasion tag */}
      {post.occasion && (
        <span style={{
          alignSelf:       'flex-start',
          fontSize:        12,
          fontWeight:      600,
          letterSpacing:   '0.04em',
          textTransform:   'uppercase',
          color:           c.purple,
          background:      c.purpleDim,
          border:          `1px solid ${c.purpleRing}`,
          borderRadius:    6,
          padding:         '3px 10px',
        }}>
          {OCCASION_LABELS[post.occasion] ?? post.occasion}
        </span>
      )}

      {/* Title */}
      <h2 style={{
        margin:     0,
        fontSize:   20,
        fontWeight: 700,
        lineHeight: 1.3,
        color:      c.text,
      }}>
        {post.title}
      </h2>

      {/* Excerpt */}
      <p style={{
        margin:     0,
        fontSize:   15,
        lineHeight: 1.6,
        color:      c.textSub,
        flexGrow:   1,
      }}>
        {post.excerpt}
      </p>

      {/* Meta row */}
      <div style={{
        display:    'flex',
        alignItems: 'center',
        gap:        12,
        fontSize:   13,
        color:      c.muted,
        marginTop:  4,
      }}>
        <time dateTime={post.date}>{formatDate(post.date)}</time>
        <span aria-hidden>·</span>
        <span>{post.readTime} min read</span>
        <span
          aria-hidden
          style={{
            marginLeft: 'auto',
            color:      c.purple,
            fontWeight: 600,
          }}
        >
          Read →
        </span>
      </div>
    </Link>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BlogIndexPage() {
  const posts = getAllPosts()

  return (
    <div style={{ fontFamily: font, background: c.bg, minHeight: '100vh' }}>
      {/* Nav */}
      <header style={{
        position:   'sticky',
        top:        0,
        zIndex:     50,
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(12px)',
        borderBottom: `1px solid ${c.border}`,
      }}>
        <div style={{
          maxWidth:  1100,
          margin:    '0 auto',
          padding:   '0 24px',
          height:    60,
          display:   'flex',
          alignItems:'center',
          gap:       32,
        }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: c.purple }}>GiftHint</span>
          </Link>
          <nav style={{ display: 'flex', gap: 24, marginLeft: 'auto' }}>
            <Link href="/blog" style={{ fontSize: 14, fontWeight: 600, color: c.text, textDecoration: 'none' }}>Blog</Link>
            <Link href="/gifts" style={{ fontSize: 14, color: c.muted, textDecoration: 'none' }}>Gift ideas</Link>
            <Link
              href="/gifts"
              style={{
                fontSize:     14,
                fontWeight:   700,
                color:        '#fff',
                background:   c.purple,
                borderRadius: 8,
                padding:      '6px 16px',
                textDecoration: 'none',
              }}
            >
              Get started
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section style={{
        background:   c.bgTint,
        borderBottom: `1px solid ${c.border}`,
        padding:      '64px 24px 56px',
        textAlign:    'center',
      }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <p style={{
            fontSize:      13,
            fontWeight:    700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color:         c.purple,
            margin:        '0 0 16px',
          }}>
            Gift Ideas &amp; Wishlist Advice
          </p>
          <h1 style={{
            fontSize:   'clamp(2rem, 5vw, 3rem)',
            fontWeight: 800,
            lineHeight: 1.15,
            color:      c.text,
            margin:     '0 0 16px',
          }}>
            The GiftHint Blog
          </h1>
          <p style={{
            fontSize:   17,
            lineHeight: 1.65,
            color:      c.textSub,
            margin:     0,
          }}>
            Practical guides on building wishlists people actually buy from, gift ideas for every occasion, and the thinking behind how GiftHint works.
          </p>
        </div>
      </section>

      {/* Post grid */}
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '56px 24px 96px' }}>
        {posts.length === 0 ? (
          <p style={{ textAlign: 'center', color: c.muted, fontSize: 16 }}>
            No posts yet — check back soon.
          </p>
        ) : (
          <div style={{
            display:             'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap:                 24,
          }}>
            {posts.map((post) => (
              <PostCard key={post.slug} post={post} />
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{
        borderTop:  `1px solid ${c.border}`,
        padding:    '32px 24px',
        textAlign:  'center',
        fontSize:   13,
        color:      c.muted,
      }}>
        <p style={{ margin: 0 }}>
          © {new Date().getFullYear()} GiftHint ·{' '}
          <Link href="/gifts" style={{ color: c.purple, textDecoration: 'none' }}>Create your wishlist</Link>
        </p>
      </footer>
    </div>
  )
}
