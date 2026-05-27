/**
 * app/blog/[slug]/page.tsx — GiftHint individual blog post
 *
 * Renders a single MDX post with:
 *   • generateStaticParams — pre-builds all published posts at build time
 *   • generateMetadata     — per-post title/description/OG tags
 *   • MDXRemote (RSC)      — next-mdx-remote/rsc; custom component map
 *   • InlineCTA            — mid-article "Create your list" prompt
 *   • Affiliate disclosure — shown when hasAffiliateLinks === true
 *   • Author section       — "Carlos — GiftHint founder"
 *   • Related posts        — right sidebar (desktop) / stacked below (mobile)
 *   • EmailCapture         — bottom-of-post newsletter subscribe
 *
 * Layout:
 *   [article 680px] + [aside 280px] via CSS Grid; collapses to single
 *   column below 900px using a <style> tag with a media query.
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MDXRemote } from 'next-mdx-remote/rsc'
import { getAllPosts, getPostBySlug, getRelatedPosts } from '@/lib/blog'
import { EmailCapture } from './EmailCapture'

// ── Static generation ─────────────────────────────────────────────────────────

export function generateStaticParams() {
  return getAllPosts().map((p) => ({ slug: p.slug }))
}

// ── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: { slug: string }
}): Promise<Metadata> {
  const post = getPostBySlug(params.slug)
  if (!post) return {}

  return {
    title:       `${post.title} | GiftHint Blog`,
    description: post.excerpt,
    alternates:  { canonical: `https://gifthint.io/blog/${post.slug}` },
    openGraph: {
      title:       post.title,
      description: post.excerpt,
      url:         `https://gifthint.io/blog/${post.slug}`,
      type:        'article',
      publishedTime: post.date,
    },
  }
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
  codeBlock:  '#1E1E2E',
  codeText:   '#CDD6F4',
}
const font = "var(--font-inter), system-ui, -apple-system, 'Segoe UI', sans-serif"

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
}

const OCCASION_LABELS: Record<string, string> = {
  birthday:      '🎂 Birthday',
  christmas:     '🎄 Christmas',
  wedding:       '💍 Wedding',
  'baby-shower': '🍼 Baby shower',
  graduation:    '🎓 Graduation',
  housewarming:  '🏡 Housewarming',
  anniversary:   '💖 Anniversary',
}

// ── Custom MDX components ─────────────────────────────────────────────────────

/**
 * InlineCTA — placed inside MDX via <InlineCTA /> tag.
 * Shows a visually distinct "Create your wishlist" prompt mid-article.
 */
function InlineCTA() {
  return (
    <div style={{
      margin:       '36px 0',
      padding:      '24px 28px',
      background:   `linear-gradient(135deg, ${c.bgTint} 0%, ${c.bgTintDeep} 100%)`,
      borderRadius: 14,
      border:       `1px solid ${c.purpleRing}`,
      display:      'flex',
      flexWrap:     'wrap',
      alignItems:   'center',
      gap:          16,
    }}>
      <div style={{ flex: '1 1 240px' }}>
        <p style={{
          margin:     '0 0 4px',
          fontSize:   15,
          fontWeight: 700,
          color:      c.text,
        }}>
          Build your wishlist in 30 seconds
        </p>
        <p style={{
          margin:   0,
          fontSize: 13,
          color:    c.muted,
        }}>
          Save from any store. Share one link. No duplicate gifts.
        </p>
      </div>
      <a
        href="/gifts"
        style={{
          flex:           '0 0 auto',
          display:        'inline-block',
          padding:        '10px 22px',
          background:     c.purple,
          color:          '#fff',
          borderRadius:   10,
          fontSize:       14,
          fontWeight:     700,
          textDecoration: 'none',
          whiteSpace:     'nowrap',
        }}
      >
        Create your list →
      </a>
    </div>
  )
}

/** Styled heading components — replace bare MDX h2/h3 */
function H2({ children }: { children?: React.ReactNode }) {
  return (
    <h2 style={{
      fontSize:   22,
      fontWeight: 700,
      lineHeight: 1.3,
      color:      c.text,
      margin:     '40px 0 14px',
      paddingBottom: 10,
      borderBottom: `1px solid ${c.border}`,
    }}>
      {children}
    </h2>
  )
}

function H3({ children }: { children?: React.ReactNode }) {
  return (
    <h3 style={{
      fontSize:   18,
      fontWeight: 700,
      lineHeight: 1.35,
      color:      c.text,
      margin:     '28px 0 10px',
    }}>
      {children}
    </h3>
  )
}

function Paragraph({ children }: { children?: React.ReactNode }) {
  return (
    <p style={{
      fontSize:   16,
      lineHeight: 1.75,
      color:      c.textSub,
      margin:     '0 0 18px',
    }}>
      {children}
    </p>
  )
}

function InlineCode({ children }: { children?: React.ReactNode }) {
  return (
    <code style={{
      fontFamily:   "ui-monospace, 'Cascadia Code', 'Fira Code', monospace",
      fontSize:     '0.875em',
      background:   c.bgTintDeep,
      color:        c.purple,
      borderRadius: 4,
      padding:      '2px 6px',
    }}>
      {children}
    </code>
  )
}

function CodeBlock({ children }: { children?: React.ReactNode }) {
  return (
    <pre style={{
      margin:       '0 0 20px',
      padding:      '20px 22px',
      background:   c.codeBlock,
      borderRadius: 12,
      overflowX:    'auto',
      fontSize:     13,
      lineHeight:   1.6,
      color:        c.codeText,
      fontFamily:   "ui-monospace, 'Cascadia Code', 'Fira Code', monospace",
    }}>
      {children}
    </pre>
  )
}

function Blockquote({ children }: { children?: React.ReactNode }) {
  return (
    <blockquote style={{
      margin:       '0 0 20px',
      padding:      '16px 20px',
      background:   c.bgTint,
      borderLeft:   `4px solid ${c.purple}`,
      borderRadius: '0 10px 10px 0',
      fontStyle:    'italic',
      color:        c.textSub,
    }}>
      {children}
    </blockquote>
  )
}

function UnorderedList({ children }: { children?: React.ReactNode }) {
  return (
    <ul style={{
      margin:      '0 0 20px',
      paddingLeft: 24,
      color:       c.textSub,
      fontSize:    16,
      lineHeight:  1.75,
    }}>
      {children}
    </ul>
  )
}

function OrderedList({ children }: { children?: React.ReactNode }) {
  return (
    <ol style={{
      margin:      '0 0 20px',
      paddingLeft: 24,
      color:       c.textSub,
      fontSize:    16,
      lineHeight:  1.75,
    }}>
      {children}
    </ol>
  )
}

function Anchor({ href, children }: { href?: string; children?: React.ReactNode }) {
  return (
    <a
      href={href}
      style={{
        color:          c.purple,
        fontWeight:     600,
        textDecoration: 'underline',
        textDecorationColor: c.purpleRing,
        textUnderlineOffset: '2px',
      }}
    >
      {children}
    </a>
  )
}

/** Full component map passed to MDXRemote */
const mdxComponents = {
  InlineCTA,
  h2:         H2,
  h3:         H3,
  p:          Paragraph,
  code:       InlineCode,
  pre:        CodeBlock,
  blockquote: Blockquote,
  ul:         UnorderedList,
  ol:         OrderedList,
  a:          Anchor,
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function RelatedPostCard({ post }: { post: ReturnType<typeof getAllPosts>[number] }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      style={{
        display:        'block',
        padding:        '16px 18px',
        background:     '#fff',
        border:         `1px solid ${c.border}`,
        borderRadius:   12,
        textDecoration: 'none',
        color:          'inherit',
        transition:     'box-shadow 150ms',
      }}
    >
      {post.occasion && (
        <span style={{
          display:       'block',
          fontSize:      11,
          fontWeight:    700,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          color:         c.purple,
          marginBottom:  6,
        }}>
          {OCCASION_LABELS[post.occasion] ?? post.occasion}
        </span>
      )}
      <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, lineHeight: 1.4, color: c.text }}>
        {post.title}
      </p>
      <p style={{ margin: 0, fontSize: 12, color: c.muted }}>
        {post.readTime} min read
      </p>
    </Link>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BlogPostPage({ params }: { params: { slug: string } }) {
  const post = getPostBySlug(params.slug)
  if (!post) notFound()

  const related = getRelatedPosts(post.slug, post.occasion)

  return (
    <div style={{ fontFamily: font, background: c.bg, minHeight: '100vh' }}>
      {/* Responsive layout helper */}
      <style>{`
        .blog-layout {
          display: grid;
          grid-template-columns: 1fr 280px;
          gap: 48px;
          align-items: start;
          max-width: 1040px;
          margin: 0 auto;
          padding: 56px 24px 96px;
        }
        @media (max-width: 900px) {
          .blog-layout {
            grid-template-columns: 1fr;
            gap: 40px;
          }
        }
        .blog-aside {
          position: sticky;
          top: 80px;
        }
        @media (max-width: 900px) {
          .blog-aside {
            position: static;
          }
        }
      `}</style>

      {/* Nav */}
      <header style={{
        position:       'sticky',
        top:            0,
        zIndex:         50,
        background:     'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(12px)',
        borderBottom:   `1px solid ${c.border}`,
      }}>
        <div style={{
          maxWidth:   1100,
          margin:     '0 auto',
          padding:    '0 24px',
          height:     60,
          display:    'flex',
          alignItems: 'center',
          gap:        32,
        }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: c.purple }}>GiftHint</span>
          </Link>
          <nav style={{ display: 'flex', gap: 24, marginLeft: 'auto', alignItems: 'center' }}>
            <Link href="/blog" style={{ fontSize: 14, color: c.muted, textDecoration: 'none' }}>← Blog</Link>
            <Link
              href="/gifts"
              style={{
                fontSize:       14,
                fontWeight:     700,
                color:          '#fff',
                background:     c.purple,
                borderRadius:   8,
                padding:        '6px 16px',
                textDecoration: 'none',
              }}
            >
              Get started
            </Link>
          </nav>
        </div>
      </header>

      {/* Post header */}
      <section style={{
        background:   c.bgTint,
        borderBottom: `1px solid ${c.border}`,
        padding:      '52px 24px 44px',
      }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          {/* Breadcrumb */}
          <nav style={{ marginBottom: 20, fontSize: 13, color: c.muted }}>
            <Link href="/blog" style={{ color: c.purple, textDecoration: 'none', fontWeight: 600 }}>Blog</Link>
            {' '}/{' '}
            {post.occasion && (
              <>
                <Link
                  href={`/gifts/${post.occasion}`}
                  style={{ color: c.muted, textDecoration: 'none' }}
                >
                  {OCCASION_LABELS[post.occasion] ?? post.occasion}
                </Link>
                {' '}/{' '}
              </>
            )}
            <span>{post.title}</span>
          </nav>

          {/* Title */}
          <h1 style={{
            fontSize:   'clamp(1.75rem, 4vw, 2.5rem)',
            fontWeight: 800,
            lineHeight: 1.2,
            color:      c.text,
            margin:     '0 0 16px',
          }}>
            {post.title}
          </h1>

          {/* Meta */}
          <div style={{
            display:    'flex',
            flexWrap:   'wrap',
            alignItems: 'center',
            gap:        16,
            fontSize:   14,
            color:      c.muted,
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width:        32,
                height:       32,
                borderRadius: '50%',
                background:   c.purple,
                display:      'inline-flex',
                alignItems:   'center',
                justifyContent: 'center',
                fontSize:     14,
                color:        '#fff',
                fontWeight:   700,
                flexShrink:   0,
              }}>C</span>
              <span style={{ fontWeight: 600, color: c.textSub }}>Carlos</span>
            </span>
            <span aria-hidden>·</span>
            <time dateTime={post.date}>{formatDate(post.date)}</time>
            <span aria-hidden>·</span>
            <span>{post.readTime} min read</span>
            {post.occasion && (
              <>
                <span aria-hidden>·</span>
                <Link
                  href={`/gifts/${post.occasion}`}
                  style={{
                    fontSize:     12,
                    fontWeight:   700,
                    color:        c.purple,
                    background:   c.purpleDim,
                    border:       `1px solid ${c.purpleRing}`,
                    borderRadius: 6,
                    padding:      '3px 10px',
                    textDecoration: 'none',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  {OCCASION_LABELS[post.occasion]}
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Affiliate disclosure */}
      {post.hasAffiliateLinks && (
        <div style={{
          background:  '#FFFBEB',
          borderBottom: '1px solid rgba(217,119,6,0.2)',
          padding:     '10px 24px',
        }}>
          <p style={{
            maxWidth:  1040,
            margin:    '0 auto',
            fontSize:  13,
            color:     '#92400E',
          }}>
            <strong>Disclosure:</strong> Some links in this post may earn us a small commission if you make a purchase. This comes at no extra cost to you and helps us keep the blog going.
          </p>
        </div>
      )}

      {/* Main content grid */}
      <div className="blog-layout">
        {/* Article */}
        <article style={{ minWidth: 0 }}>
          <div style={{ maxWidth: 680 }}>
            <MDXRemote source={post.content} components={mdxComponents} />
          </div>

          {/* Author section */}
          <div style={{
            marginTop:    56,
            paddingTop:   32,
            borderTop:    `1px solid ${c.border}`,
            display:      'flex',
            gap:          20,
            alignItems:   'flex-start',
          }}>
            <div style={{
              width:          56,
              height:         56,
              borderRadius:   '50%',
              background:     `linear-gradient(135deg, ${c.purple} 0%, #8B5CF6 100%)`,
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              fontSize:       22,
              color:          '#fff',
              fontWeight:     800,
              flexShrink:     0,
            }}>
              C
            </div>
            <div>
              <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: c.text }}>
                Carlos — GiftHint founder
              </p>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: c.muted }}>
                Built GiftHint after one too many duplicate gifts and a spreadsheet that nobody bothered to update. Writing about smarter gifting, wishlist design, and the gap between how people actually shop and how gift registries were built.
              </p>
            </div>
          </div>

          {/* Email capture */}
          <div style={{
            marginTop:    48,
            padding:      '32px 28px',
            background:   `linear-gradient(135deg, #5B21B6 0%, ${c.purple} 50%, #8B5CF6 100%)`,
            borderRadius: 20,
          }}>
            <p style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, color: '#fff' }}>
              Gift ideas worth reading
            </p>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: 'rgba(255,255,255,0.75)' }}>
              Occasional posts on wishlist strategy, gift ideas, and what we&apos;re building. No fluff.
            </p>
            <EmailCapture />
          </div>
        </article>

        {/* Sidebar */}
        <aside className="blog-aside">
          {/* Related posts */}
          {related.length > 0 && (
            <div style={{
              background:   '#fff',
              border:       `1px solid ${c.border}`,
              borderRadius: 16,
              padding:      '20px 20px 20px',
              marginBottom: 24,
            }}>
              <p style={{
                margin:        '0 0 16px',
                fontSize:      12,
                fontWeight:    700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color:         c.muted,
              }}>
                Related posts
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {related.map((p) => (
                  <RelatedPostCard key={p.slug} post={p} />
                ))}
              </div>
            </div>
          )}

          {/* Sidebar CTA */}
          <div style={{
            background:   `linear-gradient(160deg, ${c.bgTint} 0%, ${c.bgTintDeep} 100%)`,
            border:       `1px solid ${c.purpleRing}`,
            borderRadius: 16,
            padding:      '22px 20px',
            textAlign:    'center',
          }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🎁</div>
            <p style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: c.text }}>
              Build your wishlist
            </p>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: c.muted, lineHeight: 1.5 }}>
              Save from any store. Share one link. No duplicate gifts.
            </p>
            <a
              href="/gifts"
              style={{
                display:        'inline-block',
                width:          '100%',
                padding:        '11px 0',
                background:     c.purple,
                color:          '#fff',
                borderRadius:   10,
                fontSize:       14,
                fontWeight:     700,
                textDecoration: 'none',
                textAlign:      'center',
              }}
            >
              Get started free →
            </a>
          </div>
        </aside>
      </div>
    </div>
  )
}
