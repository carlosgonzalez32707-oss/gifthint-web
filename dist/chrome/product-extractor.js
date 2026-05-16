/**
 * extension/product-extractor.js — GiftHint Chrome Extension
 *
 * Extracts product data (title, price, image, retailer) from the current
 * page DOM. Injected as a content script via activeTab.
 *
 * Edge cases handled (Task 2):
 *   - Price not found       → price = null  (shown as "Price unavailable" in UI)
 *   - Image not found       → image_url = null (emoji fallback in UI)
 *   - Title > 200 chars     → truncated to 200 chars max
 *   - Non-product page      → returns { isProductPage: false }, button hidden
 *
 * Returns a plain JS object (serialisable via postMessage / sendResponse):
 *   {
 *     isProductPage: boolean,
 *     title:         string,
 *     price:         number | null,
 *     currency:      string,
 *     image_url:     string | null,
 *     source_url:    string,
 *     retailer:      string | null,
 *   }
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const TITLE_MAX_LEN = 200

// ── isProductPage ─────────────────────────────────────────────────────────────

/**
 * Strict product-page detection.
 * Returns true only if the page looks like a single-item product detail page,
 * not a search results, category, cart, or home page.
 *
 * Signals used (all must be satisfied):
 *   1. URL path contains a known product-page pattern (/dp/, /product/, /item/, /p/)
 *   2. At least one price-like element is present in the DOM
 *   3. An "add to cart" or "buy" CTA exists, OR OG type = 'product'
 */
function isProductPage() {
  const url      = window.location.href
  const pathname = window.location.pathname

  // ── 1. URL heuristic ─────────────────────────────────────────────────────
  const urlPatterns = [
    /\/dp\//i,           // Amazon
    /\/product\//i,      // generic
    /\/products\//i,     // Shopify
    /\/item\//i,         // Walmart, eBay
    /\/listing\//i,      // Etsy
    /\/p\//i,            // Target, Sephora
    /\/gp\/product\//i,  // Amazon alternate
    /\/ip\//i,           // Walmart alternate
    /\/buy\//i,          // Chewy, etc.
  ]
  const urlMatch = urlPatterns.some((re) => re.test(pathname))
  if (!urlMatch) return false

  // ── 2. OG type override (most reliable) ──────────────────────────────────
  const ogType = document.querySelector('meta[property="og:type"]')?.content?.toLowerCase()
  if (ogType === 'product') return true

  // ── 3. Price element present ──────────────────────────────────────────────
  const priceSelectors = [
    '[itemprop="price"]',
    '[class*="price"]',
    '[id*="price"]',
    '[data-testid*="price"]',
    '.a-price',           // Amazon
    '.product-price',     // generic
    '#priceblock_ourprice', // Amazon legacy
  ]
  const hasPrice = priceSelectors.some((sel) => document.querySelector(sel) !== null)
  if (!hasPrice) return false

  // ── 4. Add-to-cart CTA present ────────────────────────────────────────────
  const cartSelectors = [
    '[id*="add-to-cart"]',
    '[class*="add-to-cart"]',
    '[data-testid*="add-to-cart"]',
    'button[name="add"]',         // Shopify
    '#buy-now-button',            // Amazon
    '#add-to-cart-button',        // Amazon
    '[class*="addToCart"]',
  ]
  const hasCartCTA = cartSelectors.some((sel) => document.querySelector(sel) !== null)

  return hasCartCTA
}

// ── extractTitle ──────────────────────────────────────────────────────────────

function extractTitle() {
  // Priority order: OG > product schema > h1 > document title
  const candidates = [
    document.querySelector('meta[property="og:title"]')?.content,
    document.querySelector('[itemprop="name"]')?.textContent,
    document.querySelector('h1')?.textContent,
    document.title,
  ]

  const raw = candidates.find((c) => c && c.trim().length > 0) ?? 'Unknown product'
  const trimmed = raw.trim().replace(/\s+/g, ' ')

  // Enforce 200-char cap to prevent oversized DB inserts
  return trimmed.length > TITLE_MAX_LEN
    ? trimmed.slice(0, TITLE_MAX_LEN - 1) + '…'
    : trimmed
}

// ── extractPrice ──────────────────────────────────────────────────────────────

/**
 * Returns { price: number | null, currency: string }.
 * Never throws — returns null on any parse failure.
 */
function extractPrice() {
  try {
    // 1. JSON-LD schema
    const scripts = document.querySelectorAll('script[type="application/ld+json"]')
    for (const script of scripts) {
      try {
        const schema = JSON.parse(script.textContent)
        const offer  = schema?.offers ?? (Array.isArray(schema) ? schema[0]?.offers : null)
        if (offer?.price != null) {
          return {
            price:    parseFloat(offer.price),
            currency: offer.priceCurrency ?? 'USD',
          }
        }
      } catch { /* malformed JSON — skip */ }
    }

    // 2. Meta tags
    const metaPrice = document.querySelector('meta[property="product:price:amount"]')?.content
      ?? document.querySelector('meta[itemprop="price"]')?.content
    if (metaPrice) {
      const parsed = parseFloat(metaPrice.replace(/[^0-9.]/g, ''))
      if (!isNaN(parsed)) {
        const currency = document.querySelector('meta[property="product:price:currency"]')?.content ?? 'USD'
        return { price: parsed, currency }
      }
    }

    // 3. DOM element — look for a price pattern like "$29.99" or "£14.99"
    const priceSelectors = [
      '[itemprop="price"]',
      '.a-price .a-offscreen',
      '#priceblock_ourprice',
      '.product-price',
      '[data-testid*="price"]',
      '[class*="price"]',
    ]
    for (const sel of priceSelectors) {
      const el = document.querySelector(sel)
      if (!el) continue
      const raw = el.getAttribute('content') ?? el.textContent ?? ''
      const match = raw.match(/[\d,]+\.?\d*/)
      if (match) {
        const parsed = parseFloat(match[0].replace(/,/g, ''))
        if (!isNaN(parsed) && parsed > 0 && parsed < 100_000) {
          return { price: parsed, currency: 'USD' }
        }
      }
    }
  } catch { /* silently swallow */ }

  // Price not found — save with null; UI shows "Price unavailable"
  return { price: null, currency: 'USD' }
}

// ── extractImage ──────────────────────────────────────────────────────────────

/**
 * Returns the best available product image URL, or null if none found.
 */
function extractImage() {
  try {
    const candidates = [
      document.querySelector('meta[property="og:image"]')?.content,
      document.querySelector('[itemprop="image"]')?.src
        ?? document.querySelector('[itemprop="image"]')?.content,
      document.querySelector('#landingImage')?.src,           // Amazon
      document.querySelector('.product-featured-image')?.src, // Shopify
      document.querySelector('[data-testid*="image"] img')?.src,
      document.querySelector('.gallery-image')?.src,
    ]

    const url = candidates.find((c) => {
      if (!c || typeof c !== 'string') return false
      try { new URL(c); return true } catch { return false }
    }) ?? null

    return url
  } catch {
    return null
  }
}

// ── extractRetailer ───────────────────────────────────────────────────────────

function extractRetailer() {
  try {
    const { hostname } = new URL(window.location.href)
    // Strip www. and return the domain without TLD e.g. "amazon", "etsy"
    const bare = hostname.replace(/^www\./, '').split('.')[0]
    return bare || null
  } catch {
    return null
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

function extractProductData() {
  if (!isProductPage()) {
    return { isProductPage: false }
  }

  const { price, currency } = extractPrice()

  return {
    isProductPage: true,
    title:         extractTitle(),
    price,
    currency,
    image_url:     extractImage(),
    source_url:    window.location.href,
    retailer:      extractRetailer(),
  }
}

// Content scripts run in an IIFE — message background script with the result
;(() => {
  const data = extractProductData()
  // Respond to the runtime message from popup.js / background.js
  // (The caller uses chrome.tabs.sendMessage and awaits this response)
  window.__gifthintProductData = data
})()
