/**
 * app/sitemap.ts — GiftHint
 *
 * Dynamic sitemap served at /sitemap.xml by Next.js's built-in MetadataRoute
 * support. Crawled on each ISR cycle alongside the gifter pages it indexes.
 *
 * Included routes:
 *   / (landing page)                priority 1.0, weekly
 *   /list/[username]/[slug]         priority 0.8, daily — all public wishlists
 *
 * Excluded routes:
 *   /admin, /dashboard, /api — not indexable; also blocked in robots.ts
 *
 * Supabase query: joins wishlists → users so we can build the full URL path.
 * Only public wishlists with a non-null public_username are included.
 */

import type { MetadataRoute } from 'next'
import { createServerClient } from '@/lib/supabase-server'

export const revalidate = 3600 // regenerate sitemap every hour

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://gifthint.io'

  // ── Static routes ─────────────────────────────────────────────────────────
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url:             `${siteUrl}/`,
      changeFrequency: 'weekly',
      priority:        1.0,
    },
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
