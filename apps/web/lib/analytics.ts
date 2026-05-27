/**
 * lib/analytics.ts — GiftHint client-side analytics helpers
 *
 * Fire-and-forget wrappers around internal tracking endpoints.
 *
 * RULES:
 *   1. Never await these calls at the call site — they must never block
 *      navigation or the affiliate link opening.
 *   2. Never throw — a tracking failure must be invisible to the user.
 *   3. No PII — we deliberately omit gifter name, email, IP, and user agent.
 *      The only identifiers stored are item IDs (UUIDs) which are pseudonymous.
 *
 * These functions are safe to import in 'use client' components.
 */

export type AffiliateNetwork = 'amazon_associates' | 'skimlinks' | 'unknown'

export interface BuyClickParams {
  itemId:              string
  wisherUserId:        string
  retailer:            string | null
  affiliateNetwork:    AffiliateNetwork
  gifterPageUsername:  string
}

/**
 * Fires a click tracking event to POST /api/track-click.
 *
 * - Uses keepalive:true so the request survives page navigation / tab close.
 * - Swallows all errors — analytics must never break the user flow.
 * - Never awaited by callers — call it and move on.
 */
export function trackBuyClick(params: BuyClickParams): void {
  try {
    fetch('/api/track-click', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        itemId:             params.itemId,
        wisherUserId:       params.wisherUserId,
        retailer:           params.retailer ?? 'unknown',
        affiliateNetwork:   params.affiliateNetwork,
        gifterPageUsername: params.gifterPageUsername,
      }),
      // keepalive ensures the request completes even if the user navigates
      // away immediately after clicking (which they almost always will)
      keepalive: true,
    }).catch(() => {
      // Silently swallow network errors
    })
  } catch {
    // Silently swallow synchronous errors (e.g. JSON.stringify failure)
  }
}

/**
 * Derives the affiliate network from a URL string.
 * Used by GiftCard to populate the affiliateNetwork field without importing
 * the heavier lib/affiliate.ts into every component bundle.
 */
export function inferAffiliateNetwork(url: string): AffiliateNetwork {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '')
    if (hostname.includes('amazon.')) return 'amazon_associates'
    // All other outbound links go through Skimlinks (if publisher ID is set)
    return 'skimlinks'
  } catch {
    return 'unknown'
  }
}
