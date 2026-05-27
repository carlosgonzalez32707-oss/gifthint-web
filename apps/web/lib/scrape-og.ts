/**
 * lib/scrape-og.ts — GiftHint
 *
 * Server-side Open Graph scraper used by:
 *   - app/save/page.tsx  (Server Component — called when source=ios_share)
 *   - app/api/scrape-og/route.ts  (standalone API endpoint)
 *
 * Design constraints
 * ──────────────────
 *   • Zero external dependencies — pure fetch + regex, no cheerio/htmlparser2
 *   • Reads at most 64 KB of the response body, stops early after </head>
 *   • AbortController timeout: 5 seconds
 *   • Handles both attribute orders on <meta> tags:
 *       <meta property="og:title" content="…">   ← canonical order
 *       <meta content="…" property="og:title">   ← reversed (seen in the wild)
 *   • JSON-LD price fallback when OG price tags are absent
 *   • Safe to import in Next.js Server Components and Route Handlers
 */

// ── Constants ──────────────────────────────────────────────────────────────────

const MAX_BYTES  = 64 * 1024  // 64 KB — covers <head> on virtually all pages
const TIMEOUT_MS = 5_000       // 5 seconds

// ── Types ──────────────────────────────────────────────────────────────────────

export interface OGData {
  title:    string
  image:    string
  price:    string
  currency: string
  url:      string
}

// ── HTML parsing helpers ───────────────────────────────────────────────────────

/**
 * Extract the `content` attribute from a <meta> tag identified by `prop`.
 * Matches both `property="prop"` and `name="prop"` in either attribute order.
 */
function extractMeta(html: string, prop: string): string {
  const escaped = prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  for (const attr of ['property', 'name']) {
    // Two patterns cover both attribute orders
    const patterns = [
      // attr before content
      new RegExp(
        `<meta[^>]+${attr}=["']${escaped}["'][^>]+content=["']([^"']*?)["'][^>]*>`,
        'i',
      ),
      // content before attr
      new RegExp(
        `<meta[^>]+content=["']([^"']*?)["'][^>]+${attr}=["']${escaped}["'][^>]*>`,
        'i',
      ),
    ]

    for (const pattern of patterns) {
      const m = html.match(pattern)
      if (m?.[1]) return m[1]
    }
  }

  return ''
}

/**
 * Extract <title> tag content as og:title fallback.
 * Decodes the most common HTML entities.
 */
function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i)
  if (!m?.[1]) return ''
  return m[1]
    .trim()
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
}

/**
 * Extract price from JSON-LD <script type="application/ld+json"> blocks.
 * Returns the first price value found across all LD blocks on the page.
 */
function extractJsonLdPrice(html: string): string {
  const pattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null

  while ((m = pattern.exec(html)) !== null) {
    try {
      const root  = JSON.parse(m[1])
      const items: unknown[] = Array.isArray(root) ? root : [root]

      for (const item of items) {
        if (typeof item !== 'object' || item === null) continue
        const record  = item as Record<string, unknown>
        const offers  = record['offers']
        if (!offers) continue

        const offer = Array.isArray(offers) ? offers[0] : offers
        if (typeof offer === 'object' && offer !== null) {
          const price = (offer as Record<string, unknown>)['price']
          if (price !== undefined && price !== null && price !== '') {
            return String(price)
          }
        }
      }
    } catch {
      // Ignore malformed JSON-LD
    }
  }

  return ''
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Fetch `url` and extract Open Graph product data.
 *
 * - Reads at most {@link MAX_BYTES} bytes from the response body.
 * - Aborts the request after {@link TIMEOUT_MS} ms.
 * - Falls back to `<title>` when `og:title` is absent.
 * - Falls back to JSON-LD `offers.price` when `og:price:amount` is absent.
 *
 * @throws {Error} on network failure, timeout, or non-2xx HTTP status.
 */
export async function scrapeOG(url: string): Promise<OGData> {
  const controller = new AbortController()
  const timer      = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let html = ''

  try {
    const res = await fetch(url, {
      signal:  controller.signal,
      headers: {
        // Polite UA; some retailers block bare Node.js agents
        'User-Agent': 'Mozilla/5.0 (compatible; GiftHintBot/1.0; +https://gifthint.io)',
        'Accept':     'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    })

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching ${url}`)
    }

    const reader = res.body?.getReader()
    if (!reader) throw new Error('No response body')

    const decoder  = new TextDecoder()
    let bytesRead  = 0

    while (bytesRead < MAX_BYTES) {
      const { done, value } = await reader.read()
      if (done || !value) break

      html      += decoder.decode(value, { stream: true })
      bytesRead += value.byteLength

      // Stop once we've passed </head> — OG tags always live there
      const headEnd = html.indexOf('</head>')
      if (headEnd !== -1) {
        html = html.slice(0, headEnd + 7)
        reader.cancel()
        break
      }
    }
  } finally {
    clearTimeout(timer)
  }

  return {
    title:    (extractMeta(html, 'og:title') || extractTitle(html)).slice(0, 300),
    image:    extractMeta(html, 'og:image').slice(0, 500),
    price:    (
                extractMeta(html, 'og:price:amount') ||
                extractMeta(html, 'product:price:amount') ||
                extractJsonLdPrice(html)
              ),
    currency: (
                extractMeta(html, 'og:price:currency') ||
                extractMeta(html, 'product:price:currency') ||
                ''
              ),
    url:      extractMeta(html, 'og:url') || url,
  }
}
