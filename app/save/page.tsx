/**
 * app/save/page.tsx — GiftHint
 *
 * Server Component wrapper for the save page.
 *
 * Reads product data from query parameters (set by the bookmarklet or the
 * iOS Shortcuts script) and, when source=ios_share, enhances the data with
 * a server-side OG scrape before passing everything to the <SaveUI> client
 * island.
 *
 * QUERY PARAMETERS
 * ────────────────
 *   url       string — canonical product URL (required)
 *   title     string — product title
 *   image     string — product image URL
 *   price     string — numeric price as string (e.g. "49.99")
 *   currency  string — ISO 4217 code (e.g. "USD")
 *   source    string — "ios_share" triggers server-side OG enhancement
 *
 * SERVER-SIDE SCRAPING STRATEGY
 * ─────────────────────────────
 *   Bookmarklet:    JS already extracted OG data client-side from the live
 *                   page, so no server-side scrape is needed.
 *
 *   iOS Shortcuts:  The "Run JavaScript on Webpage" action runs in a
 *                   restricted WKWebView context and may miss JS-rendered
 *                   meta tags. We scrape server-side as a supplement:
 *                   - Client-extracted values take precedence (they came
 *                     from the live page).
 *                   - Server-scraped values fill any gaps.
 *                   - If both fail, scrapeFailed=true shows a manual form.
 *
 * SUPABASE SETUP
 * ──────────────
 *   Auth → URL Configuration → Redirect URLs must include:
 *     https://gifthint.io/save*
 *
 * AFFILIATE NOTE
 * ──────────────
 *   source_url is stored; affiliate_url is set at render time via
 *   lib/affiliate.ts. No revenue is lost.
 */

import type { Metadata }  from 'next'
import { scrapeOG }       from '@/lib/scrape-og'
import { SaveUI }         from './SaveUI'

// ── Metadata ───────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title:  'Save to GiftHint',
  robots: { index: false, follow: false },
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface SearchParams {
  url?:      string
  title?:    string
  image?:    string
  price?:    string
  currency?: string
  source?:   string
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function SavePage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const rawUrl = (searchParams.url ?? '').slice(0, 2048)
  const source = searchParams.source ?? ''

  // Start with whatever the client (bookmarklet / Shortcuts script) sent
  let data = {
    url:          rawUrl,
    title:        (searchParams.title    ?? '').slice(0, 300),
    image:        (searchParams.image    ?? '').slice(0, 500),
    price:        (searchParams.price    ?? '').slice(0,  30),
    currency:     (searchParams.currency ?? '').slice(0,   3),
    scrapeFailed: false,
  }

  // For iOS Share Sheet: enhance with server-side OG scraping.
  // Prefer client-extracted values (non-empty) over server-scraped fallbacks.
  if (source === 'ios_share' && rawUrl) {
    // Basic URL validation before fetching
    let validUrl = false
    try {
      const parsed = new URL(rawUrl)
      validUrl = parsed.protocol === 'http:' || parsed.protocol === 'https:'
    } catch {
      // leave validUrl = false
    }

    if (validUrl) {
      try {
        const scraped = await scrapeOG(rawUrl)
        data = {
          url:          rawUrl,
          title:        data.title    || scraped.title,
          image:        data.image    || scraped.image,
          price:        data.price    || scraped.price,
          currency:     data.currency || scraped.currency,
          scrapeFailed: false,
        }
      } catch {
        // Scrape timed out or returned an error.
        // If client-side data is also empty, surface the manual entry form.
        data.scrapeFailed = !data.title
      }
    }
  }

  return <SaveUI {...data} />
}
