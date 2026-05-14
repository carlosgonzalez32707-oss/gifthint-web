/**
 * lib/skimlinks-eligible-retailers.ts — GiftHint
 *
 * Canonical list of retailer domains that Skimlinks covers with affiliate
 * commission. Used by the affiliate audit and fallback-redirect logic.
 *
 * Sources:
 *  - Skimlinks Publisher Hub merchant directory (top EPC / approval rate)
 *  - GiftHint's target category mix: fashion, beauty, home, electronics,
 *    sporting goods, pets, books
 *
 * Maintenance:
 *  - Add a domain here when you confirm a new merchant in the Skimlinks hub.
 *  - Remove a domain if a merchant leaves the Skimlinks network.
 *  - Domains are bare (no www.) and lowercase — match with
 *    `hostname.replace(/^www\./, '').toLowerCase()`.
 */

// ── Top-50 Skimlinks-eligible retailer domains ────────────────────────────────

export const SKIMLINKS_ELIGIBLE_RETAILER_DOMAINS: readonly string[] = [
  // Fashion & Apparel
  'asos.com',
  'zara.com',
  'hm.com',
  'uniqlo.com',
  'nordstrom.com',
  'macys.com',
  'bloomingdales.com',
  'saksfifthavenue.com',
  'neimanmarcus.com',
  'ralphlauren.com',
  'tommyhilfiger.com',
  'calvinklein.com',
  'coach.com',
  'katespade.com',
  'michaelkors.com',
  'toryburch.com',
  'forever21.com',
  'express.com',

  // Footwear & Sportswear
  'nike.com',
  'adidas.com',
  'puma.com',
  'underarmour.com',
  'reebok.com',
  'newbalance.com',
  'vans.com',
  'converse.com',
  'skechers.com',

  // Beauty & Personal Care
  'sephora.com',
  'ulta.com',
  'glossier.com',
  'kiehls.com',

  // General Retail
  'walmart.com',
  'target.com',
  'etsy.com',
  'ebay.com',
  'costco.com',
  'samsclub.com',

  // Electronics & Tech
  'bestbuy.com',
  'apple.com',
  'dell.com',
  'hp.com',
  'lenovo.com',
  'newegg.com',

  // Home & Furniture
  'ikea.com',
  'wayfair.com',
  'crateandbarrel.com',
  'westelm.com',
  'potterybarn.com',

  // Sporting Goods & Outdoor
  'rei.com',
  'dickssportinggoods.com',

  // Pets
  'chewy.com',
  'petsmart.com',
] as const

/**
 * Set version for O(1) membership checks.
 * Import this in hot paths (audit, rewriting) instead of the array.
 */
export const SKIMLINKS_ELIGIBLE_DOMAINS: ReadonlySet<string> = new Set(
  SKIMLINKS_ELIGIBLE_RETAILER_DOMAINS,
)
