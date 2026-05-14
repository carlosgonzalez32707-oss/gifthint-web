/**
 * tests/revenue-attribution.test.ts — GiftHint Phase 2
 *
 * Revenue attribution unit tests.
 *
 * Coverage areas:
 *   detectAmazonCategory  — 10 product titles across all commission tiers
 *   getCommissionRate     — every major category in the fee schedule
 *   estimateCommission    — correct calculation and null-safety
 *   auditAffiliateLinks   — mixed Amazon/Walmart/Etsy/unknown URL array
 *
 * Run with: npm test
 */

import {
  detectAmazonCategory,
  getCommissionRate,
  estimateCommission,
} from '@/lib/amazon-categories'
import { auditAffiliateLinks } from '@/lib/affiliate-audit'
import type { WishlistItem }   from '@/types/wishlist'

// ─────────────────────────────────────────────────────────────────────────────
// Shared fixture factory
// ─────────────────────────────────────────────────────────────────────────────

/** Builds a minimal WishlistItem. Fields not relevant to a test can be omitted. */
function makeItem(
  overrides: Partial<WishlistItem> & { source_url: string; id: string; title: string },
): WishlistItem {
  return {
    user_id:                'user-001',
    price:                  49.99,
    currency:               'USD',
    image_url:              null,
    original_url:           null,
    affiliate_url:          null,
    skimlinks_fallback_url: null,
    amazon_category:        null,
    estimated_commission:   null,
    retailer:               null,
    hint:                   null,
    dna_tags:               [],
    is_claimed:             false,
    claimed_by:             null,
    claimed_at:             null,
    claimed_anonymous:      false,
    sort_order:             0,
    created_at:             '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// detectAmazonCategory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generic Amazon product URL (no breadcrumb path segment) — all tests that
 * want to exercise title-based detection should use this.
 */
const GENERIC_AMAZON_URL = 'https://www.amazon.com/dp/B000EXAMPLE'

describe('detectAmazonCategory', () => {
  // ── Title-based detection (10 product samples) ────────────────────────────

  describe('title-based category detection', () => {
    const cases: [title: string, expectedCategory: string][] = [
      // 10 % — Luxury Beauty
      [
        'La Mer Moisturising Cream 60ml — Luxury Beauty Treatment',
        'Luxury Beauty',
      ],
      // 6 % — Headphones
      [
        'Sony WH-1000XM5 Wireless Noise-Cancelling Over-Ear Headphones',
        'Headphones',
      ],
      // 4.5 % — Kitchen
      [
        'Instant Pot Duo 7-in-1 Electric Pressure Cooker 6 Quart',
        'Kitchen',
      ],
      // 4.5 % — Books
      [
        'Atomic Habits: An Easy & Proven Way to Build Good Habits — Book',
        'Books',
      ],
      // 4 % — Jewelry
      [
        'Pandora Moments Sparkling Infinity Necklace Sterling Silver',
        'Jewelry',
      ],
      // 3 % — Toys & Games
      [
        'LEGO Creator 3-in-1 Exotic Parrot Toy Animal Building Set',
        'Toys & Games',
      ],
      // 3 % — Sports & Outdoors
      [
        'Manduka PRO Yoga Mat 6mm Thick Non-Slip Exercise Mat for Men & Women',
        'Sports & Outdoors',
      ],
      // 1 % — Electronics (broad fallback)
      [
        'Amazon Echo Dot (5th Gen) Smart Speaker with Alexa',
        'Electronics',
      ],
      // 1 % — Health & Personal Care
      [
        'Oral-B Pro 1000 Electric Toothbrush Rechargeable',
        'Health & Personal Care',
      ],
      // 0 % — Video Games
      [
        'Sony PlayStation 5 DualSense Wireless Gamepad for PS5',
        'Video Games',
      ],
    ]

    test.each(cases)('"%s" → %s', (title, expected) => {
      expect(detectAmazonCategory(title, GENERIC_AMAZON_URL)).toBe(expected)
    })
  })

  // ── URL path-based detection ───────────────────────────────────────────────

  describe('URL path-based detection overrides title', () => {
    test('headphones URL path → Headphones regardless of generic title', () => {
      const url = 'https://www.amazon.com/Headphones/dp/B09ABC1234'
      expect(detectAmazonCategory('Random product name', url)).toBe('Headphones')
    })

    test('luxury-beauty URL path → Luxury Beauty', () => {
      const url = 'https://www.amazon.com/Luxury-Beauty/dp/B08SKINCARE'
      expect(detectAmazonCategory('Some Product', url)).toBe('Luxury Beauty')
    })

    test('/Electronics/ path → Electronics', () => {
      const url = 'https://www.amazon.com/Electronics/dp/B0ELECTRIC'
      expect(detectAmazonCategory('Anything', url)).toBe('Electronics')
    })
  })

  // ── Edge cases ────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    test('empty title with generic URL → All Other Categories', () => {
      expect(detectAmazonCategory('', GENERIC_AMAZON_URL)).toBe('All Other Categories')
    })

    test('unrecognisable title with generic URL → All Other Categories', () => {
      expect(detectAmazonCategory('XQ-7700 Multiband Transponder Unit', GENERIC_AMAZON_URL)).toBe(
        'All Other Categories',
      )
    })

    test('malformed URL falls through to title detection', () => {
      // Malformed URL → URL detection throws → falls back to title keywords
      const result = detectAmazonCategory('Luxury Beauty Serum', 'not-a-url')
      expect(result).toBe('Luxury Beauty')
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getCommissionRate
// ─────────────────────────────────────────────────────────────────────────────

describe('getCommissionRate', () => {
  // Verify every tier in the fee schedule

  const rateTable: [category: string, expectedRate: number][] = [
    // 10 %
    ['Luxury Beauty',                  0.10],
    ['Amazon Explore',                 0.10],
    // 6 %
    ['Headphones',                     0.06],
    ['Musical Instruments',            0.06],
    ['Business & Industrial Supplies', 0.06],
    // 4.5 %
    ['Books',                          0.045],
    ['Kitchen',                        0.045],
    ['Automotive',                     0.045],
    // 4 %
    ['Amazon Fashion',                 0.04],
    ['Jewelry',                        0.04],
    ['All Other Categories',           0.04],
    // 3 %
    ['Furniture',                      0.03],
    ['Home',                           0.03],
    ['Home Improvement',               0.03],
    ['Lawn & Garden',                  0.03],
    ['Pet Products',                   0.03],
    ['Toys & Games',                   0.03],
    ['Sports & Outdoors',              0.03],
    ['Baby Products',                  0.03],
    ['Camera & Photo',                 0.03],
    ['Handmade',                       0.03],
    // 2.5 %
    ['Music',                          0.025],
    ['DVD & Blu-Ray',                  0.025],
    ['Software',                       0.025],
    ['PC',                             0.025],
    // 1 %
    ['Electronics',                    0.01],
    ['Health & Personal Care',         0.01],
    ['Grocery',                        0.01],
    ['Cell Phones',                    0.01],
    // 0 %
    ['Video Games',                    0.00],
    ['Gift Cards',                     0.00],
  ]

  test.each(rateTable)('%s → %p', (category, expected) => {
    expect(getCommissionRate(category)).toBe(expected)
  })

  test('unknown category string falls back to All Other Categories rate (0.04)', () => {
    expect(getCommissionRate('Obscure Widget Category')).toBe(0.04)
  })

  test('empty string falls back to 0.04', () => {
    expect(getCommissionRate('')).toBe(0.04)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// estimateCommission
// ─────────────────────────────────────────────────────────────────────────────

describe('estimateCommission', () => {
  test('$100 Electronics item → $1.00 (1% rate)', () => {
    // Electronics rate is 0.01 — the spec calls this out explicitly
    expect(estimateCommission(100, 'Electronics')).toBe(1.0)
  })

  test('$100 Luxury Beauty item → $10.00 (10% rate)', () => {
    expect(estimateCommission(100, 'Luxury Beauty')).toBe(10.0)
  })

  test('$29.99 Headphones item → $1.7994 (6% rate, 4dp precision)', () => {
    // 29.99 × 0.06 = 1.7994
    expect(estimateCommission(29.99, 'Headphones')).toBe(1.7994)
  })

  test('$49.99 Kitchen item → $2.2496 (4.5% rate)', () => {
    // 49.99 × 0.045 = 2.24955 → rounds to 2.2496 at 4dp
    expect(estimateCommission(49.99, 'Kitchen')).toBeCloseTo(2.2496, 4)
  })

  test('$59.99 Video Games item → $0.00 (0% rate)', () => {
    expect(estimateCommission(59.99, 'Video Games')).toBe(0)
  })

  test('null price → returns null', () => {
    expect(estimateCommission(null, 'Electronics')).toBeNull()
  })

  test('$0 price → $0 commission (not null)', () => {
    expect(estimateCommission(0, 'Books')).toBe(0)
  })

  test('unknown category uses 4% default', () => {
    // 100 × 0.04 = 4
    expect(estimateCommission(100, 'Mystery Category')).toBe(4)
  })

  test('floating-point result is capped at 4 decimal places', () => {
    // Result should never have more than 4dp so it's safe for DB storage
    const result = estimateCommission(33.33, 'Kitchen') // 33.33 × 0.045 = 1.49985
    const decimals = result?.toString().split('.')[1]?.length ?? 0
    expect(decimals).toBeLessThanOrEqual(4)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// auditAffiliateLinks
// ─────────────────────────────────────────────────────────────────────────────

describe('auditAffiliateLinks', () => {
  // ── Fixtures ──────────────────────────────────────────────────────────────

  const amazonItem = makeItem({
    id:         'item-amazon',
    title:      'Echo Show 8 Smart Display',
    source_url: 'https://www.amazon.com/dp/B0BC4XD9QC',
  })

  // walmart.com is in the Skimlinks eligible list
  const walmartItem = makeItem({
    id:         'item-walmart',
    title:      'iRobot Roomba i3 Robot Vacuum',
    source_url: 'https://www.walmart.com/ip/iRobot-Roomba/123456789',
  })

  // anthropologie.com is NOT in lib/skimlinks-eligible-retailers.ts → ineligible
  const ineligibleItem = makeItem({
    id:         'item-ineligible',
    title:      'Anthropologie Monogram Mug Collection',
    source_url: 'https://www.anthropologie.com/en-us/shop/mugs/12345',
  })

  const unknownItem = makeItem({
    id:         'item-unknown',
    title:      'Artisan Ceramic Mug',
    source_url: 'not-a-valid-url',
  })

  // ── Mixed array ───────────────────────────────────────────────────────────

  describe('mixed URL array categorisation', () => {
    let report: ReturnType<typeof auditAffiliateLinks>

    beforeEach(() => {
      report = auditAffiliateLinks([amazonItem, walmartItem, ineligibleItem, unknownItem])
    })

    test('total equals number of items passed in', () => {
      expect(report.total).toBe(4)
    })

    test('Amazon item is categorised as "amazon"', () => {
      const result = report.items.find((i) => i.itemId === 'item-amazon')
      expect(result?.category).toBe('amazon')
      expect(result?.domain).toBe('amazon.com')
    })

    test('Walmart item is categorised as "skimlinks_eligible"', () => {
      const result = report.items.find((i) => i.itemId === 'item-walmart')
      expect(result?.category).toBe('skimlinks_eligible')
      expect(result?.domain).toBe('walmart.com')
    })

    test('Anthropologie item is categorised as "skimlinks_ineligible"', () => {
      // anthropologie.com is not in the Skimlinks eligible retailer list
      const result = report.items.find((i) => i.itemId === 'item-ineligible')
      expect(result?.category).toBe('skimlinks_ineligible')
      expect(result?.domain).toBe('anthropologie.com')
    })

    test('malformed URL item is categorised as "unknown"', () => {
      const result = report.items.find((i) => i.itemId === 'item-unknown')
      expect(result?.category).toBe('unknown')
      expect(result?.domain).toBeNull()
    })

    test('amazon count = 1', () => {
      expect(report.amazon).toBe(1)
    })

    test('skimlinks_eligible count = 1', () => {
      expect(report.skimlinks_eligible).toBe(1)
    })

    test('ineligible count = 1 (Anthropologie)', () => {
      expect(report.ineligible).toBe(1)
    })

    test('unknown count = 1 (bad URL)', () => {
      expect(report.unknown).toBe(1)
    })

    test('coverage_pct = 50 (1 amazon + 1 skimlinks_eligible out of 4 total)', () => {
      // (1 amazon + 1 skimlinks_eligible) / 4 total × 100 = 50
      expect(report.coverage_pct).toBe(50)
    })

    test('items array length matches total', () => {
      expect(report.items).toHaveLength(report.total)
    })
  })

  // ── Edge cases ────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    test('empty array → all counts zero, coverage_pct = 0', () => {
      const report = auditAffiliateLinks([])
      expect(report.total).toBe(0)
      expect(report.amazon).toBe(0)
      expect(report.skimlinks_eligible).toBe(0)
      expect(report.ineligible).toBe(0)
      expect(report.unknown).toBe(0)
      expect(report.coverage_pct).toBe(0)
      expect(report.items).toHaveLength(0)
    })

    test('all-Amazon array → coverage_pct = 100', () => {
      const items = [
        makeItem({ id: 'a1', title: 'A', source_url: 'https://www.amazon.com/dp/B001' }),
        makeItem({ id: 'a2', title: 'B', source_url: 'https://www.amazon.co.uk/dp/B002' }),
        makeItem({ id: 'a3', title: 'C', source_url: 'https://amazon.de/dp/B003' }),
      ]
      expect(auditAffiliateLinks(items).coverage_pct).toBe(100)
    })

    test('all-ineligible array → coverage_pct = 0', () => {
      const items = [
        makeItem({ id: 'x1', title: 'X', source_url: 'https://obscureretailer.example/product/1' }),
        makeItem({ id: 'x2', title: 'Y', source_url: 'https://noname.store/item/2' }),
      ]
      expect(auditAffiliateLinks(items).coverage_pct).toBe(0)
    })

    test('www. prefix is stripped from domain', () => {
      const item = makeItem({
        id: 'www-test',
        title: 'Test',
        source_url: 'https://www.walmart.com/ip/product/999',
      })
      const report = auditAffiliateLinks([item])
      expect(report.items[0]?.domain).toBe('walmart.com')
    })

    test('single Amazon item → coverage_pct = 100', () => {
      const report = auditAffiliateLinks([amazonItem])
      expect(report.coverage_pct).toBe(100)
      expect(report.amazon).toBe(1)
    })
  })

  // ── Retailer-specific spot-checks ─────────────────────────────────────────

  describe('known eligible retailers', () => {
    const eligibleUrls: [retailer: string, url: string][] = [
      ['target.com',    'https://www.target.com/p/product/-/A-12345678'],
      ['sephora.com',   'https://www.sephora.com/product/moisturiser-P12345'],
      ['nike.com',      'https://www.nike.com/t/air-max-90/DR0293-001'],
      ['bestbuy.com',   'https://www.bestbuy.com/site/product/6412000.p'],
      ['wayfair.com',   'https://www.wayfair.com/furniture/pdp/sofa-W12345.html'],
    ]

    test.each(eligibleUrls)('%s is categorised as skimlinks_eligible', (retailer, url) => {
      const item = makeItem({ id: retailer, title: retailer, source_url: url })
      const report = auditAffiliateLinks([item])
      expect(report.items[0]?.category).toBe('skimlinks_eligible')
    })
  })
})
