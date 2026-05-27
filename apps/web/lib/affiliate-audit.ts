/**
 * lib/affiliate-audit.ts — GiftHint
 *
 * Server-side affiliate coverage auditor.
 *
 * Categorises every item in a wishlist into one of four buckets and returns
 * a summary report so the dashboard can show how well the catalogue is
 * monetised before any optimisation work.
 *
 * IMPORT RULE: Server-side only (same restriction as lib/affiliate.ts).
 * Never import this file into 'use client' components.
 *
 * Usage:
 *   const report = auditAffiliateLinks(items)
 *   // → { total, amazon, skimlinks_eligible, ineligible, unknown, coverage_pct }
 */

import type { WishlistItem }           from '@/types/wishlist'
import { isAmazonUrl }                 from '@/lib/affiliate'
import { SKIMLINKS_ELIGIBLE_DOMAINS }  from '@/lib/skimlinks-eligible-retailers'

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * Affiliate coverage category for a single item URL.
 *
 *  'amazon'               — handled by Amazon Associates (server-side rewrite)
 *  'skimlinks_eligible'   — Skimlinks covers this retailer; JS handles it
 *  'skimlinks_ineligible' — neither programme covers it; use fallback redirect
 *  'unknown'              — URL is malformed or unparseable
 */
export type AffiliateCategory =
  | 'amazon'
  | 'skimlinks_eligible'
  | 'skimlinks_ineligible'
  | 'unknown'

export interface ItemAuditResult {
  itemId:    string
  title:     string
  sourceUrl: string
  category:  AffiliateCategory
  /** Bare hostname (no www.), or null when the URL is unparseable */
  domain:    string | null
}

export interface AuditReport {
  /** Total items audited */
  total:               number
  /** Count of Amazon items (Associates) */
  amazon:              number
  /** Count of Skimlinks-eligible items */
  skimlinks_eligible:  number
  /** Count of items covered by neither programme */
  ineligible:          number
  /** Count of items with unparseable URLs */
  unknown:             number
  /**
   * Percentage of items with at least one affiliate programme coverage.
   * coverage = (amazon + skimlinks_eligible) / total × 100, rounded.
   * Returns 0 when total === 0.
   */
  coverage_pct:        number
  /** Per-item breakdown — useful for exporting to CSV or a detail table */
  items:               ItemAuditResult[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractBareDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

function categorise(url: string): { category: AffiliateCategory; domain: string | null } {
  const domain = extractBareDomain(url)

  if (!domain) {
    return { category: 'unknown', domain: null }
  }

  if (isAmazonUrl(url)) {
    return { category: 'amazon', domain }
  }

  if (SKIMLINKS_ELIGIBLE_DOMAINS.has(domain)) {
    return { category: 'skimlinks_eligible', domain }
  }

  return { category: 'skimlinks_ineligible', domain }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Categorises every item by affiliate coverage and returns a summary report.
 *
 * @param items  Raw WishlistItem rows from Supabase (source_url must be set).
 */
export function auditAffiliateLinks(items: WishlistItem[]): AuditReport {
  const results: ItemAuditResult[] = items.map((item) => {
    const { category, domain } = categorise(item.source_url)
    return {
      itemId:    item.id,
      title:     item.title,
      sourceUrl: item.source_url,
      category,
      domain,
    }
  })

  // Tally counts in a single pass
  let amazon             = 0
  let skimlinks_eligible = 0
  let ineligible         = 0
  let unknown            = 0

  for (const r of results) {
    if      (r.category === 'amazon')               amazon++
    else if (r.category === 'skimlinks_eligible')   skimlinks_eligible++
    else if (r.category === 'skimlinks_ineligible') ineligible++
    else                                            unknown++
  }

  const total       = results.length
  const covered     = amazon + skimlinks_eligible
  const coverage_pct = total === 0 ? 0 : Math.round((covered / total) * 100)

  return {
    total,
    amazon,
    skimlinks_eligible,
    ineligible,
    unknown,
    coverage_pct,
    items: results,
  }
}
