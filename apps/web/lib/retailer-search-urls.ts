/**
 * lib/retailer-search-urls.ts — GiftHint
 *
 * Builds pre-filled search URLs for major retailers so gifters can find an
 * alternative gift when the exact item is out of stock or already claimed.
 *
 * Exports:
 *   buildSearchUrl(retailer, query)    — retailer-specific search page URL
 *   buildSearchQueryFromItem(item)     — constructs a search query from
 *                                        title + DNA tag keywords
 *   SUPPORTED_RETAILERS                — canonical retailer keys for UI lookup
 */

import type { WishlistItem } from '@/types/wishlist'

// ── Retailer registry ─────────────────────────────────────────────────────────

/**
 * All supported retailers. Each entry defines:
 *   match   — substrings to check against the normalised retailer string
 *   label   — human-readable name shown in the "Find on [Retailer]" CTA
 *   url()   — returns the full search URL for a given encoded query string
 */
interface RetailerEntry {
  match:  string[]
  label:  string
  url:    (encodedQuery: string) => string
}

const ASSOCIATES_TAG = process.env.NEXT_PUBLIC_AMAZON_ASSOCIATES_TAG ?? ''

const RETAILER_REGISTRY: RetailerEntry[] = [
  {
    match: ['amazon'],
    label: 'Amazon',
    url:   (q) => {
      const base = `https://www.amazon.com/s?k=${q}`
      return ASSOCIATES_TAG ? `${base}&tag=${ASSOCIATES_TAG}` : base
    },
  },
  {
    match: ['walmart'],
    label: 'Walmart',
    url:   (q) => `https://www.walmart.com/search?q=${q}`,
  },
  {
    match: ['target'],
    label: 'Target',
    url:   (q) => `https://www.target.com/s?searchTerm=${q}`,
  },
  {
    match: ['etsy'],
    label: 'Etsy',
    url:   (q) => `https://www.etsy.com/search?q=${q}`,
  },
  {
    match: ['nordstrom'],
    label: 'Nordstrom',
    url:   (q) => `https://www.nordstrom.com/sr?origin=keywordsearch&keyword=${q}`,
  },
  {
    match: ['sephora'],
    label: 'Sephora',
    url:   (q) => `https://www.sephora.com/search?keyword=${q}`,
  },
  {
    match: ['ulta'],
    label: 'Ulta Beauty',
    url:   (q) => `https://www.ulta.com/search?searchTerm=${q}`,
  },
  {
    match: ['asos'],
    label: 'ASOS',
    url:   (q) => `https://www.asos.com/search/?q=${q}`,
  },
  {
    match: ['ebay'],
    label: 'eBay',
    url:   (q) => `https://www.ebay.com/sch/i.html?_nkw=${q}`,
  },
  {
    match: ['wayfair'],
    label: 'Wayfair',
    url:   (q) => `https://www.wayfair.com/keyword.php?keyword=${q}`,
  },
  {
    match: ['ikea'],
    label: 'IKEA',
    url:   (q) => `https://www.ikea.com/us/en/search/?q=${q}`,
  },
  {
    match: ['zappos'],
    label: 'Zappos',
    url:   (q) => `https://www.zappos.com/search/term/${q}`,
  },
  {
    match: ['nike'],
    label: 'Nike',
    url:   (q) => `https://www.nike.com/w?q=${q}`,
  },
  {
    match: ['book', 'barnesnoble', 'barnes', 'noble', 'bookshop', 'waterstones'],
    label: 'Bookshop',
    url:   (q) => `https://bookshop.org/search?keywords=${q}`,
  },
]

/** Fallback when no specific retailer is matched. */
const GOOGLE_SHOPPING_FALLBACK: RetailerEntry = {
  match: [],
  label: 'Google Shopping',
  url:   (q) => `https://www.google.com/search?tbm=shop&q=${q}`,
}

// ── Retailer resolution ───────────────────────────────────────────────────────

/**
 * Finds the matching RetailerEntry for a given retailer string.
 * Matches on any substring of the normalised (lowercase, stripped) input.
 * Falls back to Google Shopping when nothing matches.
 */
function resolveRetailer(retailer: string): RetailerEntry {
  const normalised = retailer.toLowerCase().replace(/[^a-z0-9]/g, '')
  for (const entry of RETAILER_REGISTRY) {
    if (entry.match.some((m) => normalised.includes(m.replace(/[^a-z0-9]/g, '')))) {
      return entry
    }
  }
  return GOOGLE_SHOPPING_FALLBACK
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Canonical list of retailer labels used by the UI (for display, not matching).
 * Includes the fallback so callers can render "Find on Google Shopping" too.
 */
export const SUPPORTED_RETAILERS: string[] = [
  ...RETAILER_REGISTRY.map((r) => r.label),
  GOOGLE_SHOPPING_FALLBACK.label,
]

/**
 * Returns the human-readable retailer label for a retailer string.
 * Safe to call with null — returns 'Google Shopping'.
 *
 * Example:
 *   getRetailerLabel('amazon.com')  → 'Amazon'
 *   getRetailerLabel('nordstrom')   → 'Nordstrom'
 *   getRetailerLabel(null)          → 'Google Shopping'
 */
export function getRetailerLabel(retailer: string | null): string {
  if (!retailer) return GOOGLE_SHOPPING_FALLBACK.label
  return resolveRetailer(retailer).label
}

/**
 * Returns a pre-filled search URL for the given retailer and search query.
 *
 * The query string is URL-encoded internally — pass the raw (unencoded) string.
 * Falls back to Google Shopping when the retailer is not recognised.
 *
 * @param retailer    Raw retailer string from the wishlist item (e.g. "amazon", "etsy.com")
 * @param searchQuery Plain-text search query (will be URL-encoded)
 *
 * @example
 *   buildSearchUrl('amazon', 'wireless headphones')
 *   // → 'https://www.amazon.com/s?k=wireless+headphones&tag=gifthint-20'
 *
 *   buildSearchUrl('etsy', 'vintage ceramic mug')
 *   // → 'https://www.etsy.com/search?q=vintage+ceramic+mug'
 *
 *   buildSearchUrl('unknown-shop', 'silk scarf')
 *   // → 'https://www.google.com/search?tbm=shop&q=silk+scarf'
 */
export function buildSearchUrl(retailer: string | null, searchQuery: string): string {
  const entry    = retailer ? resolveRetailer(retailer) : GOOGLE_SHOPPING_FALLBACK
  const encoded  = encodeURIComponent(searchQuery.trim()).replace(/%20/g, '+')
  return entry.url(encoded)
}

// ── Search query construction ─────────────────────────────────────────────────

/**
 * DNA tags that translate into positive search keywords.
 * Negative tags (e.g. #NoPink) are deliberately excluded — you can't search
 * "not pink" on most retailers and it clutters the query.
 */
const TAG_SEARCH_TERMS: Readonly<Record<string, string>> = {
  // Clothing
  '#NaturalFabric':      'cotton linen wool',
  '#DarkColours':        'black navy dark',
  '#LightColours':       'white cream light',
  // Electronics
  '#WiredOnly':          'wired',
  '#WirelessOnly':       'wireless',
  '#LongBatteryLife':    'long battery',
  '#AndroidOnly':        'android',
  '#iOSOnly':            'ios',
  // Books
  '#HardcoverOnly':      'hardcover',
  '#PaperbackOK':        'paperback',
  '#FirstEdition':       'first edition',
  '#IllustratedEdition': 'illustrated',
  '#LargePrint':         'large print',
  '#AudiobookOK':        'audiobook',
  // Beauty
  '#FragranceFree':      'fragrance free unscented',
  '#CrueltyFree':        'cruelty free vegan',
  '#VeganFormula':       'vegan',
  '#SPFRequired':        'spf sunscreen',
  '#HypoallergenicOnly': 'hypoallergenic sensitive',
  '#NaturalIngredients': 'natural organic',
  // Shoes
  '#NarrowFit':          'narrow width',
  '#WideFit':            'wide width',
  '#NaturalSole':        'leather sole',
  '#HeelsOnly':          'heels',
  '#VeganLeather':       'vegan leather faux',
  // Home
  '#MinimalistStyle':    'minimalist modern',
  '#NeutralColours':     'neutral beige white',
  '#VintageStyle':       'vintage retro',
  '#WoodOnly':           'wood wooden',
  '#HandmadePreferred':  'handmade artisan',
  '#EcoFriendly':        'eco sustainable',
  '#RecycledMaterials':  'recycled upcycled',
}

/**
 * Noise words stripped from item titles before building the search query.
 * These add clutter but no signal for finding an alternative.
 */
const NOISE_WORDS = new Set([
  'the','a','an','and','or','of','in','on','for','to','with','by',
  'from','at','is','as','it','its','this','that','these','those',
  'new','best','top','premium','official','original','genuine','authentic',
  'luxury','pro','plus','max','mini','lite','edition','version','series',
  'pack','set','kit','bundle','collection','box',
])

/**
 * Builds a search query from a wishlist item.
 *
 * Strategy:
 *   1. Strip leading brand/retailer name from the title (first word if it
 *      matches the retailer string).
 *   2. Remove noise words and keep the first 5 meaningful words.
 *   3. Append positive DNA tag search keywords (deduplicated).
 *   4. Trim to 80 characters so the URL stays reasonable.
 *
 * @example
 *   item = { title: 'Sony WH-1000XM5 Wireless Headphones', retailer: 'sony', dna_tags: ['#WiredOnly'] }
 *   → 'WH-1000XM5 Headphones wired'
 *
 *   item = { title: 'The Midnight Library – Matt Haig', dna_tags: ['#HardcoverOnly'] }
 *   → 'Midnight Library Matt Haig hardcover'
 */
export function buildSearchQueryFromItem(item: WishlistItem): string {
  const rawTitle  = item.title ?? ''
  const retailer  = (item.retailer ?? '').toLowerCase()

  // Split title into words, filter noise
  const titleWords = rawTitle
    .replace(/[–—\-|/]/g, ' ')       // em-dash, pipes → spaces
    .replace(/[^\w\s]/g, ' ')         // strip remaining punctuation
    .split(/\s+/)
    .filter(Boolean)
    .filter((w, i) => {
      // Drop first word if it looks like the brand/retailer name
      if (i === 0 && retailer && w.toLowerCase().startsWith(retailer.slice(0, 4))) {
        return false
      }
      return !NOISE_WORDS.has(w.toLowerCase())
    })
    .slice(0, 5)

  // Collect positive tag keywords
  const tagKeywords: string[] = []
  const seenKeywords = new Set<string>()

  for (const tag of (item.dna_tags ?? [])) {
    const keywords = TAG_SEARCH_TERMS[tag]
    if (!keywords) continue
    for (const kw of keywords.split(' ')) {
      if (!seenKeywords.has(kw)) {
        seenKeywords.add(kw)
        tagKeywords.push(kw)
      }
    }
  }

  const query = [...titleWords, ...tagKeywords].join(' ').slice(0, 80)
  return query || rawTitle.slice(0, 60)
}
