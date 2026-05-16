/**
 * app/robots.ts — GiftHint
 *
 * Generates /robots.txt via Next.js MetadataRoute.Robots.
 *
 * Policy:
 *   Allow  — landing page (/), gifter pages (/list/)
 *   Disallow — /admin, /dashboard, /api (private, no crawl value)
 *
 * The sitemap URL is declared here so crawlers can discover all gifter pages.
 */

import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://gifthint.io'

  return {
    rules: [
      {
        userAgent: '*',
        allow:    ['/', '/list/'],
        disallow: ['/admin/', '/dashboard/', '/api/'],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
