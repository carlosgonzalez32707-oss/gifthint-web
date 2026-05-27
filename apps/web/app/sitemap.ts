/**
 * app/sitemap.ts — GiftHint
 *
 * Dynamic sitemap served at /sitemap.xml by Next.js's built-in MetadataRoute
 * support. Crawled on each ISR cycle alongside the gifter pages it indexes.
 *
 * Included routes:
 *   / (landing page)                priority 1.0, weekly
 *   /gifts                          priority 0.9, monthly
 *   /gifts/[occasion]               priority 0.9, monthly — 7 occasion pages
 *   /blog/[slug]                    priority 0.7, monthly — published posts
 *   /list/[username]/[slug]         priority 0.8, daily   — all public wishlists
 *
 * Excluded routes:
 *   /admin, /dashboard, /api        not indexable; blocked in robots.ts
 *   /partners/[slug]                robots: noindex — UTM-style landing pages
 *   /r/[code]                       redirect-only handlers, no content
 *
 * Supabase query: joins wishlists → users so we can build the full URL path.
 * Only public wishlists with a non-null public_username are included.
 */

import type { MetadataRoute } from 'next'
import { createServerClient } from '@/lib/supabase-server'
import { OCCASION_SLUGS }     from '@/lib/occasion-seo'
import { getAllPosts }         from '@/lib/blog'

export const revalidate = 3600 // regenerate sitemap every hour

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://gifthint.io'

  // ── Static routes ─────────────────────────────────────────────────────────
  const occasionRoutes: MetadataRoute.Sitemap = [
    // Gift hub
    {
      url:             `${siteUrl}/gifts`,
      changeFrequency: 'monthly',
      priority:        0.9,
    },
    // Per-occasion landing pages
    ...OCCASION_SLUGS.map((slug) => ({
      url:             `${siteUrl}/gifts/${slug}`,
      changeFrequency: 'monthly' as const,
      priority:        0.9,
    })),
  ]

  // ── Blog posts ────────────────────────────────────────────────────────────
  // getAllPosts() reads from the filesystem — no DB call needed.
  const blogRoutes: MetadataRoute.Sitemap = getAllPosts().map((post) => ({
    url:             `${siteUrl}/blog/${post.slug}`,
    lastModified:    new Date(post.date),
    changeFrequency: 'monthly' as const,
    priority:        0.7,
  }))

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url:             `${siteUrl}/`,
      changeFrequency: 'weekly',
      priority:        1.0,
    },
    ...occasionRoutes,
    ...blogRoutes,
  ]

  // ── Dynamic gifter pages ──────────────────────────────────────────────────
  const supabase = createServerClient()

  // Join wishlists with their owner's public_username in one query.
  // !inner means rows with no matching user are dropped automatically.
  const { data: wishlists, error } = await supabase
    .from('wishlists')
    .select(`
      slug,
      created_at,
      users!inner (
        public_username
      )
    `)
    .eq('is_public', true)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[sitemap] Failed to fetch wishlists:', error.message)
    return staticRoutes
  }

  const gifterPages: MetadataRoute.Sitemap = (wishlists ?? [])
    .map((w) => {
      // Supabase returns the joined row as w.users (object, not array, due to !inner)
      const user = w.users as unknown as { public_username: string | null }
      if (!user?.public_username) return null

      return {
        url:             `${siteUrl}/list/${user.public_username}/${w.slug}`,
        lastModified:    new Date(w.created_at),
        changeFrequency: 'daily' as const,
        priority:        0.8,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

  return [...staticRoutes, ...gifterPages]
}
