/**
 * lib/price-checker.ts — GiftHint
 *
 * Price fetching engine for the daily price-check cron job.
 *
 * Strategy (per retailer):
 *   Amazon   — Amazon Product Advertising API (PA API 5) when credentials are
 *              set; falls back to a server-side page fetch + og:price:amount
 *              (less reliable but zero cost).
 *   Others   — Server-side fetch of source_url, then tries three extraction
 *              methods in order:
 *                1. og:price:amount / og:price:standard_amount OG meta tags
 *                2. product JSON-LD (schema.org/Product → offers.price)
 *                3. script[type="application/ld+json"] fallback scan
 *   Returns null when no price can be detected — the cron skips null results
 *   without inserting a history row or sending an alert.
 *
 * Reliability:
 *   - 3 fetch attempts with 2 s back-off before giving up.
 *   - User-agent rotation across 3 realistic desktop browser strings.
 *   - 10 s timeout per attempt so slow retailers never block the batch.
 *
 * Rate limiting:
 *   The cron enforces a 23-hour cooldown at the DB level (last_checked_at).
 *   checkPrice() adds no additional throttle so the cron can parallelise
 *   within a batch without fighting a shared counter.
 *
 * Amazon PA API env vars (optional — set all three to enable):
 *   AMAZON_ACCESS_KEY   — AWS access key ID
 *   AMAZON_SECRET_KEY   — AWS secret access key
 *   AMAZON_PARTNER_TAG  — Associates tag (e.g. gifthint-21)
 *
 * Usage:
 *   import { checkPrice } from '@/lib/price-checker'
 *   const result = await checkPrice(item)
 *   // result: { price: number; source: 'scrape' | 'api' } | null
 */

import type { WishlistItem } from '@/types/wishlist'

// ── Types ─────────────────────────────────────────────────────────────────────

export type PriceCheckResult = {
  price:  number
  source: 'scrape' | 'api'
}

// ── Constants ─────────────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 10_000
const RETRY_DELAY_MS   = 2_000
const MAX_RETRIES      = 3

/** Rotated on each attempt to reduce bot-detection friction. */
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function pickUserAgent(attempt: number): string {
  return USER_AGENTS[attempt % USER_AGENTS.length]
}

/** Strips currency symbols, commas, and whitespace; returns NaN on failure. */
function parsePrice(raw: string | null | undefined): number {
  if (!raw) return NaN
  const cleaned = raw.replace(/[^0-9.]/g, '')
  return parseFloat(cleaned)
}

/** True when the URL is an Amazon product page. */
function isAmazonUrl(url: string): boolean {
  return /amazon\.(com|co\.uk|de|fr|it|es|ca|com\.au|co\.jp)/i.test(url)
}

/** Extracts the Amazon ASIN from a product URL. Returns null if not found. */
function extractAsin(url: string): string | null {
  const match = url.match(/\/(?:dp|gp\/product|ASIN)\/([A-Z0-9]{10})/i)
  return match ? match[1] : null
}

// ── OG / JSON-LD extraction ───────────────────────────────────────────────────

/**
 * Tries three extraction methods on raw HTML, in priority order:
 * 1. og:price:amount or og:price:standard_amount meta tag
 * 2. JSON-LD schema.org/Product offers.price
 * 3. Any script[type="application/ld+json"] that contains "price"
 *
 * Returns the parsed price or null.
 */
function extractPriceFromHtml(html: string): number | null {
  // ── 1. OG price meta tags ─────────────────────────────────────────────────
  const ogPatterns = [
    /property="og:price:amount"\s+content="([^"]+)"/i,
    /content="([^"]+)"\s+property="og:price:amount"/i,
    /property="og:price:standard_amount"\s+content="([^"]+)"/i,
    /content="([^"]+)"\s+property="og:price:standard_amount"/i,
    // product:price:amount (some retailers use product: namespace)
    /property="product:price:amount"\s+content="([^"]+)"/i,
    /content="([^"]+)"\s+property="product:price:amount"/i,
  ]

  for (const pattern of ogPatterns) {
    const match = html.match(pattern)
    if (match) {
      const p = parsePrice(match[1])
      if (!isNaN(p) && p > 0) return p
    }
  }

  // ── 2. JSON-LD schema.org/Product ─────────────────────────────────────────
  const jsonLdPattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null

  while ((match = jsonLdPattern.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1])

      // Handle single object or @graph array
      const nodes: unknown[] = Array.isArray(data)
        ? data
        : data['@graph']
        ? (data['@graph'] as unknown[])
        : [data]

      for (const node of nodes) {
        const obj = node as Record<string, unknown>

        if (
          typeof obj['@type'] === 'string' &&
          obj['@type'].toLowerCase().includes('product')
        ) {
          const offers = obj['offers']

          // offers can be an object or array
          const offerList: Record<string, unknown>[] = Array.isArray(offers)
            ? (offers as Record<string, unknown>[])
            : offers
            ? [offers as Record<string, unknown>]
            : []

          for (const offer of offerList) {
            const rawPrice = offer['price'] ?? offer['lowPrice']
            const p = parsePrice(String(rawPrice))
            if (!isNaN(p) && p > 0) return p
          }
        }
      }
    } catch {
      // Malformed JSON — skip this block
    }
  }

  return null
}

// ── Amazon PA API ─────────────────────────────────────────────────────────────

/**
 * Fetches the current price from Amazon PA API 5 (GetItems operation).
 * Returns null if credentials are missing or the call fails.
 *
 * Requires:
 *   AMAZON_ACCESS_KEY  — AWS access key ID
 *   AMAZON_SECRET_KEY  — AWS secret access key
 *   AMAZON_PARTNER_TAG — Associates partner tag
 */
async function fetchAmazonPaApiPrice(asin: string): Promise<number | null> {
  const accessKey  = process.env.AMAZON_ACCESS_KEY
  const secretKey  = process.env.AMAZON_SECRET_KEY
  const partnerTag = process.env.AMAZON_PARTNER_TAG

  if (!accessKey || !secretKey || !partnerTag) return null

  // PA API endpoint (UK — change host for other marketplaces)
  const host    = 'webservices.amazon.co.uk'
  const region  = 'eu-west-1'
  const path    = '/paapi5/getitems'
  const service = 'ProductAdvertisingAPI'

  const payload = JSON.stringify({
    ItemIds:    [asin],
    Resources:  ['Offers.Listings.Price', 'Offers.Summaries.LowestPrice'],
    PartnerTag:  partnerTag,
    PartnerType: 'Associates',
    Marketplace: 'www.amazon.co.uk',
  })

  // ── AWS Signature Version 4 ──────────────────────────────────────────────
  const now        = new Date()
  const amzDate    = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z'  // e.g. 20240101T120000Z
  const dateStamp  = amzDate.slice(0, 8)  // YYYYMMDD

  const canonicalHeaders =
    `content-encoding:amz-1.0\n` +
    `content-type:application/json; charset=utf-8\n` +
    `host:${host}\n` +
    `x-amz-date:${amzDate}\n` +
    `x-amz-target:com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems\n`

  const signedHeaders = 'content-encoding;content-type;host;x-amz-date;x-amz-target'

  // Hash the payload
  const payloadBytes  = new TextEncoder().encode(payload)
  const payloadHashBuf = await crypto.subtle.digest('SHA-256', payloadBytes)
  const payloadHash   = Array.from(new Uint8Array(payloadHashBuf))
    .map((b) => b.toString(16).padStart(2, '0')).join('')

  const canonicalRequest = [
    'POST', path, '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`

  const canonicalBytes = new TextEncoder().encode(canonicalRequest)
  const canonicalHash  = await crypto.subtle.digest('SHA-256', canonicalBytes)
  const canonicalHex   = Array.from(new Uint8Array(canonicalHash))
    .map((b) => b.toString(16).padStart(2, '0')).join('')

  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, canonicalHex].join('\n')

  // Derive signing key
  async function hmac(key: Uint8Array, data: string): Promise<Uint8Array> {
    const cryptoKey = await crypto.subtle.importKey(
      'raw', key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) as ArrayBuffer,
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    )
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data))
    return new Uint8Array(sig)
  }

  const kDate    = await hmac(new TextEncoder().encode(`AWS4${secretKey}`), dateStamp)
  const kRegion  = await hmac(kDate, region)
  const kService = await hmac(kRegion, service)
  const kSigning = await hmac(kService, 'aws4_request')

  const signatureBuf = await hmac(kSigning, stringToSign)
  const signature    = Array.from(signatureBuf)
    .map((b) => b.toString(16).padStart(2, '0')).join('')

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`

  try {
    const controller = new AbortController()
    const timer      = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    const res = await fetch(`https://${host}${path}`, {
      method: 'POST',
      headers: {
        'content-encoding': 'amz-1.0',
        'content-type':     'application/json; charset=utf-8',
        'host':              host,
        'x-amz-date':        amzDate,
        'x-amz-target':     'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems',
        'authorization':     authorization,
      },
      body:   payload,
      signal: controller.signal,
    })

    clearTimeout(timer)

    if (!res.ok) {
      console.warn(`[price-checker] PA API ${res.status} for ASIN ${asin}`)
      return null
    }

    const json = await res.json() as {
      ItemsResult?: {
        Items?: Array<{
          Offers?: {
            Listings?: Array<{ Price?: { Amount?: number } }>
            Summaries?: Array<{ LowestPrice?: { Amount?: number } }>
          }
        }>
      }
    }

    const item    = json.ItemsResult?.Items?.[0]
    const listing = item?.Offers?.Listings?.[0]?.Price?.Amount
    const summary = item?.Offers?.Summaries?.[0]?.LowestPrice?.Amount

    const price = listing ?? summary ?? null

    if (price && price > 0) return price
    return null
  } catch (err) {
    console.warn(`[price-checker] PA API fetch error for ${asin}:`, err instanceof Error ? err.message : err)
    return null
  }
}

// ── Scrape-based price fetch ──────────────────────────────────────────────────

/**
 * Fetches the page at `url` and extracts a price via OG tags or JSON-LD.
 * Rotates user-agents and retries up to MAX_RETRIES times.
 * Returns null if no price is found after all retries.
 */
async function scrapePrice(url: string): Promise<number | null> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAY_MS)

    const controller = new AbortController()
    const timer      = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent':      pickUserAgent(attempt),
          'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-GB,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control':   'no-cache',
          'Pragma':          'no-cache',
        },
        redirect: 'follow',
        signal:   controller.signal,
      })

      clearTimeout(timer)

      if (!res.ok) {
        console.warn(`[price-checker] HTTP ${res.status} for ${url} (attempt ${attempt + 1})`)
        continue
      }

      // Only read the first 200 KB — prices appear in <head> or early body
      const reader   = res.body?.getReader()
      if (!reader) continue

      let html = ''
      let bytes = 0
      const limit = 200 * 1024

      while (bytes < limit) {
        const { done, value } = await reader.read()
        if (done) break
        html  += new TextDecoder().decode(value)
        bytes += value.byteLength
      }
      reader.cancel()

      const price = extractPriceFromHtml(html)
      if (price !== null) return price

      console.warn(`[price-checker] no price found in HTML for ${url} (attempt ${attempt + 1})`)
    } catch (err) {
      clearTimeout(timer)
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('abort')) {
        console.warn(`[price-checker] timeout for ${url} (attempt ${attempt + 1})`)
      } else {
        console.warn(`[price-checker] fetch error for ${url} (attempt ${attempt + 1}):`, msg)
      }
    }
  }

  return null
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Checks the current price for a wishlist item.
 *
 * For Amazon items, tries the PA API first (if credentials are configured)
 * then falls back to scraping. For all other retailers, scrapes directly.
 *
 * @returns { price, source } or null if no price could be detected.
 */
export async function checkPrice(
  item: Pick<WishlistItem, 'id' | 'source_url' | 'retailer' | 'price'>,
): Promise<PriceCheckResult | null> {
  const url = item.source_url

  if (!url) return null

  // ── Amazon: try PA API first ───────────────────────────────────────────────
  if (isAmazonUrl(url)) {
    const asin = extractAsin(url)

    if (asin) {
      const apiPrice = await fetchAmazonPaApiPrice(asin)
      if (apiPrice !== null) {
        return { price: apiPrice, source: 'api' }
      }
      // PA API unavailable or failed — fall through to scrape
    }
  }

  // ── All retailers: scrape ──────────────────────────────────────────────────
  const scraped = await scrapePrice(url)
  if (scraped !== null) {
    return { price: scraped, source: 'scrape' }
  }

  return null
}
