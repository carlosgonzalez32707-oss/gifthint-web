/**
 * lib/blog.ts — GiftHint blog utilities
 *
 * Reads MDX files from content/blog/*.mdx using gray-matter for frontmatter
 * parsing. Pure filesystem utilities — no React, safe to import anywhere on
 * the server side (Server Components, Route Handlers, generateStaticParams).
 *
 * Requires: npm install next-mdx-remote gray-matter
 *
 * Frontmatter schema:
 *   title:             string   — post title (required)
 *   date:              string   — ISO date "YYYY-MM-DD" (required)
 *   excerpt:           string   — short description for cards and <meta> (required)
 *   occasion:          string | null — matches occasion_themes.ts keys, or null
 *   readTime:          number   — minutes; auto-computed if omitted (200 wpm)
 *   published:         boolean  — false to hide from index (default true)
 *   hasAffiliateLinks: boolean  — true shows FTC disclosure (default false)
 *
 * Exports:
 *   getAllPosts()         → PostMeta[]  sorted newest-first, published only
 *   getPostBySlug(slug)  → Post | null
 *   PostMeta, Post, PostFrontmatter  (types)
 */

import fs   from 'fs'
import path from 'path'
import matter from 'gray-matter'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PostFrontmatter {
  title:             string
  date:              string
  excerpt:           string
  occasion:          string | null
  readTime:          number
  published:         boolean
  hasAffiliateLinks: boolean
}

/** Frontmatter + slug — used for index listings */
export interface PostMeta extends PostFrontmatter {
  slug: string
}

/** Full post — includes raw MDX content for rendering */
export interface Post extends PostMeta {
  /** Raw MDX string (frontmatter stripped by gray-matter) */
  content: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CONTENT_DIR = path.join(process.cwd(), 'content/blog')

/** Average adult reading speed in words per minute */
const WPM = 200

// ── Private helpers ───────────────────────────────────────────────────────────

function wordsToMinutes(content: string): number {
  const wordCount = content.trim().split(/\s+/).length
  return Math.max(1, Math.round(wordCount / WPM))
}

function parseFrontmatter(
  slug:     string,
  data:     Record<string, unknown>,
  content:  string,
): PostMeta {
  return {
    slug,
    title:             typeof data.title === 'string'   ? data.title             : slug,
    date:              typeof data.date  === 'string'   ? data.date              : new Date().toISOString().slice(0, 10),
    excerpt:           typeof data.excerpt === 'string' ? data.excerpt           : '',
    occasion:          typeof data.occasion === 'string' && data.occasion ? data.occasion : null,
    readTime:          typeof data.readTime === 'number' ? data.readTime         : wordsToMinutes(content),
    published:         data.published !== false,   // default true
    hasAffiliateLinks: data.hasAffiliateLinks === true,
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns all published posts sorted newest-first.
 * Returns [] if the content/blog directory doesn't exist yet.
 */
export function getAllPosts(): PostMeta[] {
  if (!fs.existsSync(CONTENT_DIR)) return []

  const files = fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith('.mdx'))

  return files
    .map((filename): PostMeta | null => {
      const slug    = filename.replace(/\.mdx$/, '')
      const raw     = fs.readFileSync(path.join(CONTENT_DIR, filename), 'utf-8')
      const { data, content } = matter(raw)
      const meta    = parseFrontmatter(slug, data as Record<string, unknown>, content)
      return meta.published ? meta : null
    })
    .filter((p): p is PostMeta => p !== null)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

/**
 * Returns a single post with its raw MDX content, or null if not found /
 * not published.
 */
export function getPostBySlug(slug: string): Post | null {
  const filepath = path.join(CONTENT_DIR, `${slug}.mdx`)
  if (!fs.existsSync(filepath)) return null

  const raw               = fs.readFileSync(filepath, 'utf-8')
  const { data, content } = matter(raw)
  const meta              = parseFrontmatter(slug, data as Record<string, unknown>, content)

  if (!meta.published) return null

  return { ...meta, content }
}

/**
 * Returns posts that share the same occasion tag, excluding the current slug.
 * Used for the related posts sidebar.
 */
export function getRelatedPosts(currentSlug: string, occasion: string | null): PostMeta[] {
  const all = getAllPosts()
  if (!occasion) return all.filter((p) => p.slug !== currentSlug).slice(0, 3)
  const related = all.filter((p) => p.slug !== currentSlug && p.occasion === occasion)
  // Pad with any posts if not enough related ones
  const rest = all.filter((p) => p.slug !== currentSlug && p.occasion !== occasion)
  return [...related, ...rest].slice(0, 3)
}
