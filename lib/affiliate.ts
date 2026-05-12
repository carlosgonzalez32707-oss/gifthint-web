/**
 * lib/affiliate.ts — GiftHint affiliate link rewriter
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  CRITICAL: THIS FILE MUST ONLY BE IMPORTED BY SERVER-SIDE CODE          ║
 * ║                                                                          ║
 * ║  Affiliate link rewriting MUST happen exclusively in Server Components  ║
 * ║  and Route Handlers — never inside the Chrome extension or any client   ║
 * ║  component (files with 'use client').                                   ║
 * ║                                                                          ║
 * ║  WHY: The Chrome Web Store Developer Program Policies §4.4 prohibit     ║
 * ║  extensions from injecting or rewriting affiliate/referral codes on     ║
 * ║  third-party pages. Doing so in the extension = immediate ban.          ║
 * ║                                                                          ║
 * ║  The safe model: the user's browser opens a URL that was ALREADY        ║
 * ║  rewritten on our server before the page was sent. The extension never  ║
 * ║  touches the affiliate tag — it only saves the clean original URL.      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Strategy by retailer:
 *   Amazon  → rewrite with Associates tag server-side (this file)
 *   Others  → set affiliate_url = source_url; Skimlinks JS on the gifter
 *              page rewrites those links client-side via its own compliant
 *              mechanism (the gifter page, not the extension).
 */

import type { WishlistItem } from '@/types/wishlist'

// ── Amazon domain detection ───────────────────────────────────────────────────
// Matches every Amazon storefront TLD we want to monetise.
// Add rows here as you expand to new markets.

const AMAZON_HOSTNAMES = new Set([
  'amazon.com',
  'amazon.co.uk',
  'amazon.ca',
  'amazon.com.au',
  'amazon.de',
  'amazon.fr',
  'amazon.es',
  'amazon.it',
  'amazon.co.jp',
  'amazon.in',
  'amazon.com.br',
  'amazon.com.mx',
  'amazon.nl',
  'amazon.se',
  'amazon.pl',
  'amazon.sg',
  'amazon.ae',
  'amazon.sa',
])

// Params that carry affiliate / tracking data — strip them all before
// adding our tag so we never double-tag or corrupt existing attribution.
const AMAZON_AFFILIATE_PARAMS = [
  'tag',          // Associates tag
  'linkCode',     // Associates link code
  'linkId',       // Associates link ID
  'ref',          // referrer / Associates ref
  'ref_',         // alternate ref variant
  'psc',          // product page shortcut (can include ref info)
]

// ── isAmazonUrl ───────────────────────────────────────────────────────────────

/**
 * Returns true if the URL belongs to any Amazon storefront.
 * Works on both bare hostnames (amazon.com) and subdomains (www.amazon.com).
 */
export function isAmazonUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    // Strip leading "www." so "www.amazon.com" matches "amazon.com"
    const bare = hostname.replace(/^www\./, '')
    return AMAZON_HOSTNAMES.has(bare)
  } catch {
    return false
  }
}

// ── rewriteAmazonUrl ──────────────────────────────────────────────────────────

/**
 * Rewrites a single Amazon product URL to include the Associates affiliate tag.
 *
 * Rules:
 *   - If the URL is not an Amazon URL, returns it unchanged.
 *   - Strips any existing affiliate params to avoid double-tagging.
 *   - Preserves the ASIN path (/dp/ASIN) and all other path segments.
 *   - Preserves non-affiliate query params (colour, size variant, etc.).
 *   - Adds `tag=<associatesTag>` as the sole affiliate parameter.
 *   - Forces HTTPS.
 *
 * @param url           The original product URL saved by the user.
 * @param associatesTag Your Amazon Associates tag, e.g. "gifthint-20".
 */
export function rewriteAmazonUrl(url: string, associatesTag: string): string {
  if (!isAmazonUrl(url)) return url

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    // Unparseable URL — return as-is rather than silently break
    return url
  }

  // Enforce HTTPS
  parsed.protocol = 'https:'

  // Strip all affiliate / tracking params
  for (const param of AMAZON_AFFILIATE_PARAMS) {
    parsed.searchParams.delete(param)
  }

  // Inject our Associates tag
  parsed.searchParams.set('tag', associatesTag)

  return parsed.toString()
}

// ── rewriteAmazonUrls ─────────────────────────────────────────────────────────

/**
 * Applies affiliate rewriting across an entire array of wishlist items.
 *
 * For each item:
 *   - Amazon URLs  → affiliate_url gets the rewritten Associates URL
 *   - Other URLs   → affiliate_url = source_url
 *                    (Skimlinks handles non-Amazon retailers via its own
 *                     compliant client-side JS on the gifter page)
 *
 * original_url is NEVER modified — it always holds the user's raw saved URL.
 *
 * @param items         Raw items from Supabase.
 * @param associatesTag Amazon Associates tag from environment variable.
 */
export function rewriteAmazonUrls(
  items:         WishlistItem[],
  associatesTag: string,
): WishlistItem[] {
  return items.map((item) => {
    const rewritten = isAmazonUrl(item.source_url)
      ? rewriteAmazonUrl(item.source_url, associatesTag)
      : item.source_url

    return {
      ...item,
      affiliate_url: rewritten,
      // original_url intentionally untouched
    }
  })
}
