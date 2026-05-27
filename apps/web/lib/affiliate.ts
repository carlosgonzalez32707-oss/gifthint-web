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

import type { WishlistItem }                           from '@/types/wishlist'
import { SKIMLINKS_ELIGIBLE_DOMAINS }                  from '@/lib/skimlinks-eligible-retailers'
import { detectAmazonCategory, estimateCommission }    from '@/lib/amazon-categories'

// ── shouldSkipSkimlinks ───────────────────────────────────────────────────────

/**
 * Returns true for URLs that Skimlinks should NOT rewrite.
 *
 * Currently: Amazon URLs only, because they are already monetised server-side
 * via the Associates tag. Double-rewriting would:
 *   1. Strip our Associates tag → lose that commission stream
 *   2. Potentially breach Amazon Associates ToS (no sub-affiliate layering)
 *
 * Usage in GiftCard: add data-skimlinks-excluded="true" to the anchor when
 * this returns true. Skimlinks respects that attribute universally.
 *
 * Extend this function if you ever add other programs that conflict with
 * Skimlinks (e.g. a direct Walmart affiliate deal).
 */
export function shouldSkipSkimlinks(url: string): boolean {
  return isAmazonUrl(url)
}

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
 *   - Amazon URLs              → affiliate_url = Associates-tagged URL
 *   - Skimlinks-eligible URLs  → affiliate_url = source_url
 *                                 (Skimlinks JS rewrites these client-side)
 *   - Skimlinks-ineligible URLs → affiliate_url = source_url
 *                                  skimlinks_fallback_url = manual redirect
 *                                  (forces traffic through Skimlinks even for
 *                                   unknown retailers — captures any commission
 *                                   Skimlinks may have that we don't know about)
 *
 * original_url is NEVER modified — it always holds the user's raw saved URL.
 *
 * @param items         Raw items from Supabase.
 * @param associatesTag Amazon Associates tag from environment variable.
 * @param skimPublisherId Skimlinks publisher ID (from SKIMLINKS_PUBLISHER_ID env).
 *                        If omitted, skimlinks_fallback_url is not set.
 */
export function rewriteAmazonUrls(
  items:            WishlistItem[],
  associatesTag:    string,
  skimPublisherId?: string,
): WishlistItem[] {
  return items.map((item) => {
    const url = item.source_url

    if (isAmazonUrl(url)) {
      // Detect category and calculate commission while we already have the item
      const category            = detectAmazonCategory(item.title, url)
      const estimated_commission = estimateCommission(item.price, category)

      return {
        ...item,
        affiliate_url:          rewriteAmazonUrl(url, associatesTag),
        skimlinks_fallback_url: null,   // Amazon is excluded from Skimlinks
        amazon_category:        category,
        estimated_commission,
      }
    }

    // Non-Amazon: Skimlinks JS handles eligible retailers automatically.
    // For ineligible retailers, set a manual fallback redirect so we still
    // route through Skimlinks and capture any coverage they may have.
    const fallback =
      skimPublisherId && shouldUseFallbackRedirect(url)
        ? addSkimlinksParam(url, skimPublisherId)
        : null

    return {
      ...item,
      affiliate_url:          url,
      skimlinks_fallback_url: fallback,
      amazon_category:        null,
      estimated_commission:   null,
    }
  })
}

// ── addSkimlinksParam ─────────────────────────────────────────────────────────

/**
 * Builds a Skimlinks redirect URL for any destination URL.
 *
 * Format: https://go.skimresources.com?id=[PUBLISHER_ID]XNW&url=[ENCODED_URL]
 *
 * Use this as a fallback for retailers not covered by Amazon Associates and
 * not auto-detected by Skimlinks' client-side JS. Routing through this URL
 * lets Skimlinks attempt affiliate attribution regardless of domain recognition.
 *
 * @param url          The destination product URL (will be URL-encoded).
 * @param publisherId  Your Skimlinks publisher ID (numeric string, e.g. "123456").
 */
export function addSkimlinksParam(url: string, publisherId: string): string {
  const encodedUrl = encodeURIComponent(url)
  return `https://go.skimresources.com?id=${publisherId}XNW&url=${encodedUrl}`
}

// ── shouldUseFallbackRedirect ─────────────────────────────────────────────────

/**
 * Returns true when a URL is not covered by Amazon Associates and is also
 * not in Skimlinks' known-eligible retailer list.
 *
 * When true, GiftCard should use skimlinks_fallback_url (the manual Skimlinks
 * redirect built by addSkimlinksParam) rather than the bare source_url.
 *
 * @param url  The original product URL.
 */
export function shouldUseFallbackRedirect(url: string): boolean {
  if (isAmazonUrl(url)) return false   // Amazon is handled by Associates

  try {
    const domain = new URL(url).hostname.replace(/^www\./, '').toLowerCase()
    return !SKIMLINKS_ELIGIBLE_DOMAINS.has(domain)
  } catch {
    return false   // Malformed URL — don't try to redirect
  }
}
