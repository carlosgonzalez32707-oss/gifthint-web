/**
 * tests/affiliate.test.ts — GiftHint
 *
 * Unit tests for lib/affiliate.ts.
 * Run with: npm test
 *
 * Coverage areas:
 *   isAmazonUrl        — domain detection across all 18 storefronts
 *   rewriteAmazonUrl   — tag injection, param stripping, HTTPS coercion,
 *                        non-Amazon pass-through
 *   rewriteAmazonUrls  — batch processing, non-Amazon items untouched
 *   shouldSkipSkimlinks — delegates to isAmazonUrl
 */

import {
  isAmazonUrl,
  rewriteAmazonUrl,
  rewriteAmazonUrls,
  shouldSkipSkimlinks,
} from '@/lib/affiliate'
import type { WishlistItem } from '@/types/wishlist'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const TAG = 'gifthint-20'

/** Build a minimal WishlistItem. Only fields used by affiliate.ts are required. */
function makeItem(overrides: Partial<WishlistItem> & { source_url: string }): WishlistItem {
  return {
    id:                     'test-id-001',
    user_id:                'user-id-001',
    title:                  'Test Product',
    price:                  29.99,
    currency:               'USD',
    image_url:              null,
    original_url:           null,
    affiliate_url:          null,
    skimlinks_fallback_url: null,
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
// isAmazonUrl
// ─────────────────────────────────────────────────────────────────────────────

describe('isAmazonUrl', () => {
  describe('returns true for Amazon storefronts', () => {
    const AMAZON_URLS: [string, string][] = [
      ['amazon.com',    'https://www.amazon.com/dp/B08N5WRWNW'],
      ['amazon.co.uk',  'https://www.amazon.co.uk/dp/B09G9HDLVS'],
      ['amazon.ca',     'https://amazon.ca/dp/B08J6F3S67'],
      ['amazon.com.au', 'https://www.amazon.com.au/dp/B07XJ8C8F5'],
      ['amazon.de',     'https://www.amazon.de/dp/B082M8JBTB'],
      ['amazon.fr',     'https://www.amazon.fr/dp/B08C1W5N87'],
      ['amazon.es',     'https://www.amazon.es/dp/B08N5KWB9H'],
      ['amazon.it',     'https://www.amazon.it/dp/B08HHHV3YT'],
      ['amazon.co.jp',  'https://www.amazon.co.jp/dp/B07YWGNJWM'],
      ['amazon.in',     'https://www.amazon.in/dp/B08S4Q5X9S'],
      ['amazon.com.br', 'https://www.amazon.com.br/dp/B083LVRQXR'],
      ['amazon.com.mx', 'https://www.amazon.com.mx/dp/B0872GRV8F'],
      ['amazon.nl',     'https://www.amazon.nl/dp/B07Z4T5Z9H'],
      ['amazon.se',     'https://www.amazon.se/dp/B08L5TNJHG'],
      ['amazon.pl',     'https://www.amazon.pl/dp/B09BBBVBQR'],
      ['amazon.sg',     'https://www.amazon.sg/dp/B08JJ31CTT'],
      ['amazon.ae',     'https://www.amazon.ae/dp/B07Q9MW7TN'],
      ['amazon.sa',     'https://www.amazon.sa/dp/B09DDCYY7Z'],
    ]

    test.each(AMAZON_URLS)('%s', (_label, url) => {
      expect(isAmazonUrl(url)).toBe(true)
    })
  })

  describe('returns true regardless of www. prefix', () => {
    it('matches with www.', () => {
      expect(isAmazonUrl('https://www.amazon.com/dp/B08N5WRWNW')).toBe(true)
    })

    it('matches without www.', () => {
      expect(isAmazonUrl('https://amazon.com/dp/B08N5WRWNW')).toBe(true)
    })
  })

  describe('returns false for non-Amazon URLs', () => {
    const NON_AMAZON_URLS: [string, string][] = [
      ['etsy',      'https://www.etsy.com/listing/123456'],
      ['walmart',   'https://www.walmart.com/ip/123456'],
      ['target',    'https://www.target.com/p/-/A-12345'],
      ['sephora',   'https://www.sephora.com/product/12345'],
      ['ebay',      'https://www.ebay.com/itm/123456'],
      ['look-alike','https://www.notamazon.com/dp/B08N5WRWNW'],
      ['subdomain', 'https://images.amazon.com.evil.com/dp/B08N5WRWNW'], // evil subdomain
    ]

    test.each(NON_AMAZON_URLS)('%s', (_label, url) => {
      expect(isAmazonUrl(url)).toBe(false)
    })
  })

  it('returns false for empty string', () => {
    expect(isAmazonUrl('')).toBe(false)
  })

  it('returns false for malformed URL', () => {
    expect(isAmazonUrl('not a url')).toBe(false)
  })

  it('returns false for bare domain without protocol', () => {
    // URL() constructor requires a protocol — bare domain is unparseable
    expect(isAmazonUrl('amazon.com/dp/B08N5WRWNW')).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// rewriteAmazonUrl
// ─────────────────────────────────────────────────────────────────────────────

describe('rewriteAmazonUrl', () => {
  describe('injects Associates tag', () => {
    it('adds tag param to a clean Amazon URL', () => {
      const url = 'https://www.amazon.com/dp/B08N5WRWNW'
      const result = rewriteAmazonUrl(url, TAG)

      expect(result).toContain(`tag=${TAG}`)
    })

    it('preserves the ASIN path', () => {
      const url = 'https://www.amazon.com/dp/B08N5WRWNW'
      const result = rewriteAmazonUrl(url, TAG)

      expect(result).toContain('/dp/B08N5WRWNW')
    })

    it('enforces HTTPS even when given HTTP', () => {
      const url = 'http://www.amazon.com/dp/B08N5WRWNW'
      const result = rewriteAmazonUrl(url, TAG)

      expect(result.startsWith('https://')).toBe(true)
    })
  })

  describe('strips existing affiliate params', () => {
    it('replaces an existing tag= param (does not append a second one)', () => {
      const url = 'https://www.amazon.com/dp/B08N5WRWNW?tag=someone-else-21'
      const result = rewriteAmazonUrl(url, TAG)

      // Must contain our tag exactly once
      expect(result.match(/tag=/g)?.length).toBe(1)
      expect(result).toContain(`tag=${TAG}`)
      // Must NOT contain the old tag
      expect(result).not.toContain('someone-else-21')
    })

    it('removes linkCode param', () => {
      const url = 'https://www.amazon.com/dp/B08N5WRWNW?tag=old-20&linkCode=ogi'
      const result = rewriteAmazonUrl(url, TAG)

      expect(result).not.toContain('linkCode')
    })

    it('removes linkId param', () => {
      const url = 'https://www.amazon.com/dp/B08N5WRWNW?tag=old-20&linkId=abc123'
      const result = rewriteAmazonUrl(url, TAG)

      expect(result).not.toContain('linkId')
    })

    it('removes ref param', () => {
      const url = 'https://www.amazon.com/dp/B08N5WRWNW?ref=sr_1_1'
      const result = rewriteAmazonUrl(url, TAG)

      expect(result).not.toContain('ref=')
    })

    it('removes ref_ param', () => {
      const url = 'https://www.amazon.com/dp/B08N5WRWNW?ref_=some_ref'
      const result = rewriteAmazonUrl(url, TAG)

      expect(result).not.toContain('ref_=')
    })

    it('removes psc param', () => {
      const url = 'https://www.amazon.com/dp/B08N5WRWNW?psc=1'
      const result = rewriteAmazonUrl(url, TAG)

      expect(result).not.toContain('psc=')
    })

    it('removes multiple affiliate params simultaneously', () => {
      const url = 'https://www.amazon.com/dp/B08N5WRWNW?tag=old-20&linkCode=ogi&linkId=xyz&ref=sr_1_3&psc=1'
      const result = rewriteAmazonUrl(url, TAG)

      expect(result).toContain(`tag=${TAG}`)
      expect(result).not.toContain('old-20')
      expect(result).not.toContain('linkCode')
      expect(result).not.toContain('linkId')
      expect(result).not.toContain('psc')
    })
  })

  describe('preserves non-affiliate query params', () => {
    it('keeps color/size variant params', () => {
      const url = 'https://www.amazon.com/dp/B08N5WRWNW?th=1&psc=1&color=blue'
      const result = rewriteAmazonUrl(url, TAG)

      // th=1 is a product variant param (not in affiliate strip list)
      expect(result).toContain('th=1')
      expect(result).toContain('color=blue')
    })
  })

  describe('handles international storefronts', () => {
    it('rewrites amazon.co.uk URL with correct tag', () => {
      const url = 'https://www.amazon.co.uk/dp/B09G9HDLVS'
      const result = rewriteAmazonUrl(url, TAG)

      expect(result).toContain('amazon.co.uk')
      expect(result).toContain(`tag=${TAG}`)
    })

    it('rewrites amazon.ca URL', () => {
      const url = 'https://amazon.ca/dp/B08J6F3S67'
      const result = rewriteAmazonUrl(url, TAG)

      expect(result).toContain('amazon.ca')
      expect(result).toContain(`tag=${TAG}`)
    })

    it('rewrites amazon.com.au URL', () => {
      const url = 'https://www.amazon.com.au/dp/B07XJ8C8F5'
      const result = rewriteAmazonUrl(url, TAG)

      expect(result).toContain('amazon.com.au')
      expect(result).toContain(`tag=${TAG}`)
    })
  })

  describe('pass-through for non-Amazon URLs', () => {
    const NON_AMAZON_URLS = [
      'https://www.etsy.com/listing/123456',
      'https://www.walmart.com/ip/123456',
      'https://www.target.com/p/-/A-12345',
    ]

    test.each(NON_AMAZON_URLS)('%s — returned unchanged', (url) => {
      expect(rewriteAmazonUrl(url, TAG)).toBe(url)
    })

    it('does NOT inject tag into non-Amazon URL', () => {
      const url = 'https://www.etsy.com/listing/123456'
      expect(rewriteAmazonUrl(url, TAG)).not.toContain('tag=')
    })
  })

  it('handles malformed URL gracefully (returns as-is)', () => {
    // isAmazonUrl returns false for unparseable strings, so rewriteAmazonUrl
    // returns the original string without throwing.
    const bad = 'not a valid url'
    expect(rewriteAmazonUrl(bad, TAG)).toBe(bad)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// rewriteAmazonUrls (batch)
// ─────────────────────────────────────────────────────────────────────────────

describe('rewriteAmazonUrls', () => {
  it('rewrites Amazon items and sets affiliate_url', () => {
    const items = [
      makeItem({ source_url: 'https://www.amazon.com/dp/B08N5WRWNW' }),
    ]
    const result = rewriteAmazonUrls(items, TAG)

    expect(result[0].affiliate_url).toContain(`tag=${TAG}`)
  })

  it('sets affiliate_url = source_url for non-Amazon items', () => {
    const etsy = 'https://www.etsy.com/listing/123456'
    const items = [makeItem({ source_url: etsy })]
    const result = rewriteAmazonUrls(items, TAG)

    expect(result[0].affiliate_url).toBe(etsy)
  })

  it('does NOT modify original source_url on Amazon items', () => {
    const original = 'https://www.amazon.com/dp/B08N5WRWNW'
    const items = [makeItem({ source_url: original })]
    const result = rewriteAmazonUrls(items, TAG)

    // source_url must remain the clean original
    expect(result[0].source_url).toBe(original)
  })

  it('handles a mixed array of Amazon and non-Amazon items', () => {
    const items = [
      makeItem({ id: 'a1', source_url: 'https://www.amazon.com/dp/ASIN0001' }),
      makeItem({ id: 'a2', source_url: 'https://www.etsy.com/listing/111111' }),
      makeItem({ id: 'a3', source_url: 'https://www.amazon.co.uk/dp/ASIN0002' }),
      makeItem({ id: 'a4', source_url: 'https://www.walmart.com/ip/999999'  }),
    ]
    const result = rewriteAmazonUrls(items, TAG)

    expect(result[0].affiliate_url).toContain(`tag=${TAG}`)               // Amazon .com
    expect(result[1].affiliate_url).toBe(items[1].source_url)             // Etsy unchanged
    expect(result[2].affiliate_url).toContain(`tag=${TAG}`)               // Amazon .co.uk
    expect(result[3].affiliate_url).toBe(items[3].source_url)             // Walmart unchanged
  })

  it('returns an empty array when given an empty array', () => {
    expect(rewriteAmazonUrls([], TAG)).toEqual([])
  })

  it('strips an existing tag from an Amazon URL in a batch', () => {
    const items = [
      makeItem({
        source_url: 'https://www.amazon.com/dp/B08N5WRWNW?tag=old-affiliate-21',
      }),
    ]
    const result = rewriteAmazonUrls(items, TAG)

    expect(result[0].affiliate_url).not.toContain('old-affiliate-21')
    expect(result[0].affiliate_url).toContain(`tag=${TAG}`)
  })

  it('preserves all other item properties', () => {
    const item = makeItem({
      source_url:  'https://www.amazon.com/dp/B08N5WRWNW',
      title:       'Fancy Widget',
      price:       49.99,
      currency:    'USD',
      is_claimed:  true,
      claimed_by:  'Alice',
    })
    const [result] = rewriteAmazonUrls([item], TAG)

    expect(result.title).toBe('Fancy Widget')
    expect(result.price).toBe(49.99)
    expect(result.is_claimed).toBe(true)
    expect(result.claimed_by).toBe('Alice')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// shouldSkipSkimlinks
// ─────────────────────────────────────────────────────────────────────────────

describe('shouldSkipSkimlinks', () => {
  it('returns true for amazon.com — Skimlinks must not touch it', () => {
    expect(shouldSkipSkimlinks('https://www.amazon.com/dp/B08N5WRWNW')).toBe(true)
  })

  it('returns true for every Amazon storefront', () => {
    const amazonUrls = [
      'https://www.amazon.co.uk/dp/B09G9HDLVS',
      'https://amazon.ca/dp/B08J6F3S67',
      'https://www.amazon.de/dp/B082M8JBTB',
      'https://www.amazon.co.jp/dp/B07YWGNJWM',
    ]
    for (const url of amazonUrls) {
      expect(shouldSkipSkimlinks(url)).toBe(true)
    }
  })

  it('returns false for Etsy — Skimlinks should rewrite it', () => {
    expect(shouldSkipSkimlinks('https://www.etsy.com/listing/123456')).toBe(false)
  })

  it('returns false for Walmart', () => {
    expect(shouldSkipSkimlinks('https://www.walmart.com/ip/123456')).toBe(false)
  })

  it('returns false for Target', () => {
    expect(shouldSkipSkimlinks('https://www.target.com/p/-/A-12345')).toBe(false)
  })

  it('returns false for Sephora', () => {
    expect(shouldSkipSkimlinks('https://www.sephora.com/product/12345')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(shouldSkipSkimlinks('')).toBe(false)
  })
})
