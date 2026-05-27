/**
 * tests/dna-tags.test.ts — GiftHint
 *
 * Unit tests for the DNA tag library and its utility functions.
 *
 * Coverage:
 *   suggestTagsForItem()          — clothing/fashion item, electronics item,
 *                                   empty input, max-12 cap, generic always present
 *   validateTag()                 — valid tags, missing #, over-length, spaces,
 *                                   special characters
 *   generateAlternativeGuidance() — positive+negative combo, positives only,
 *                                   negatives only, fit notes only, empty tags,
 *                                   unrecognised tags → null
 *   buildSearchQueryFromItem()    — retailer brand stripped, noise words removed,
 *                                   positive tag keywords appended, 80-char cap,
 *                                   graceful fallback on empty title
 *
 * No network or DB access is required — all functions are pure utilities.
 *
 * Run with: npm test
 */

import {
  suggestTagsForItem,
  validateTag,
  validateTags,
  DNA_TAG_LIBRARY,
  ALL_DNA_TAGS,
  DNA_TAG_TOOLTIPS,
  searchTags,
  getTagCategory,
}                                from '@/lib/dna-tags'
import { generateAlternativeGuidance } from '@/lib/alternative-guidance'
import { buildSearchQueryFromItem }    from '@/lib/retailer-search-urls'
import type { WishlistItem }           from '@/types/wishlist'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal WishlistItem fixture. Only the fields used by the functions under test. */
function item(overrides: {
  title?:     string
  retailer?:  string | null
  dna_tags?:  string[] | null
  hint?:      string | null
}): WishlistItem {
  return {
    id:          'item-001',
    user_id:     'user-001',
    wishlist_id: 'list-001',
    title:       overrides.title    ?? 'Test Item',
    hint:        overrides.hint     ?? null,
    retailer:    overrides.retailer ?? null,
    dna_tags:    overrides.dna_tags ?? null,
    price:       null,
    currency:    'USD',
    image_url:   null,
    source_url:  'https://example.com/item',
    sort_order:  0,
    claimed_by:  null,
    created_at:  new Date().toISOString(),
  } as unknown as WishlistItem
}

// ─────────────────────────────────────────────────────────────────────────────
// suggestTagsForItem
// ─────────────────────────────────────────────────────────────────────────────

describe('suggestTagsForItem', () => {

  it('returns [] when both title and retailer are empty strings', () => {
    expect(suggestTagsForItem('', '')).toEqual([])
  })

  it('returns clothing tags for a fashion item title', () => {
    const tags = suggestTagsForItem('Silk Midi Dress', 'zara')
    // Should include clothing-category tags
    const clothingTags = DNA_TAG_LIBRARY.clothing.tags as unknown as string[]
    const hasClothing = tags.some((t) => clothingTags.includes(t))
    expect(hasClothing).toBe(true)
  })

  it('returns electronics tags for a headphones title', () => {
    const tags = suggestTagsForItem('Sony WH-1000XM5 Wireless Headphones', 'sony')
    const electronicsTags = DNA_TAG_LIBRARY.electronics.tags as unknown as string[]
    const hasElectronics = tags.some((t) => electronicsTags.includes(t))
    expect(hasElectronics).toBe(true)
  })

  it('always includes at least one generic tag in the suggestions', () => {
    const tags = suggestTagsForItem('Silk Blouse', 'nordstrom')
    const genericTags = DNA_TAG_LIBRARY.generic.tags as unknown as string[]
    const hasGeneric = tags.some((t) => genericTags.includes(t))
    expect(hasGeneric).toBe(true)
  })

  it('caps suggestions at 12 even for a highly-matched item', () => {
    // An item that matches multiple high-density categories
    const tags = suggestTagsForItem(
      'Sony Wireless Bluetooth Headphone Speaker Laptop Keyboard Mouse Charger',
      'amazon electronics',
    )
    expect(tags.length).toBeLessThanOrEqual(12)
  })

  it('returns only generic tags when no category matches (unrecognised item)', () => {
    const tags = suggestTagsForItem('Widget Gizmo Doohickey', '')
    // Only generic tags are relevant when nothing matches
    const genericTags = DNA_TAG_LIBRARY.generic.tags as unknown as string[]
    expect(tags.every((t) => genericTags.includes(t))).toBe(true)
  })

  it('deduplicates tags that appear in multiple categories', () => {
    // #EcoFriendly and #NoPlastic appear in both home and generic
    const tags = suggestTagsForItem('Wooden Candle Holder', 'ikea')
    const unique = new Set(tags)
    expect(tags.length).toBe(unique.size)
  })

  it('returns books tags for a book retailer', () => {
    const tags = suggestTagsForItem('The Midnight Library', 'bookshop')
    const bookTags = DNA_TAG_LIBRARY.books.tags as unknown as string[]
    const hasBooks = tags.some((t) => bookTags.includes(t))
    expect(hasBooks).toBe(true)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// validateTag
// ─────────────────────────────────────────────────────────────────────────────

describe('validateTag', () => {

  it('accepts a valid tag with mixed case', () => {
    expect(validateTag('#NoSynthetics')).toBe(true)
  })

  it('accepts a single-character tag body', () => {
    expect(validateTag('#A')).toBe(true)
  })

  it('accepts a 19-character tag body (max length)', () => {
    // # + 19 chars = 20 total
    expect(validateTag('#ABCDEFGHIJ12345678A')).toBe(true)
  })

  it('rejects a tag without a leading #', () => {
    expect(validateTag('NoSynthetics')).toBe(false)
  })

  it('rejects a bare # with no body', () => {
    expect(validateTag('#')).toBe(false)
  })

  it('rejects a tag body of 20 characters (one over limit)', () => {
    // # + 20 chars = 21 total → invalid
    expect(validateTag('#ABCDEFGHIJ123456789A')).toBe(false)
  })

  it('rejects a tag containing spaces', () => {
    expect(validateTag('#tag with space')).toBe(false)
  })

  it('rejects a tag containing hyphens', () => {
    expect(validateTag('#tag-hyphen')).toBe(false)
  })

  it('rejects a tag containing underscores', () => {
    expect(validateTag('#tag_underscore')).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(validateTag('')).toBe(false)
  })

  it('rejects a tag with a special character in the body', () => {
    expect(validateTag('#Tag!')).toBe(false)
  })

  it('accepts every tag in ALL_DNA_TAGS', () => {
    for (const tag of ALL_DNA_TAGS) {
      expect(validateTag(tag)).toBe(true)
    }
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// validateTags (batch)
// ─────────────────────────────────────────────────────────────────────────────

describe('validateTags', () => {

  it('correctly partitions a mixed array into valid and invalid', () => {
    const { valid, invalid } = validateTags(['#WiredOnly', 'nohash', '#LongBatteryLife'])
    expect(valid).toEqual(['#WiredOnly', '#LongBatteryLife'])
    expect(invalid).toEqual(['nohash'])
  })

  it('returns all valid when every tag is valid', () => {
    const { valid, invalid } = validateTags(['#EcoFriendly', '#CrueltyFree'])
    expect(valid).toHaveLength(2)
    expect(invalid).toHaveLength(0)
  })

  it('returns all invalid when every tag is invalid', () => {
    const { valid, invalid } = validateTags(['bad', '', 'also bad'])
    expect(valid).toHaveLength(0)
    expect(invalid).toHaveLength(3)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// generateAlternativeGuidance
// ─────────────────────────────────────────────────────────────────────────────

describe('generateAlternativeGuidance', () => {

  it('combines a positive and a negative tag into a readable sentence', () => {
    const guidance = generateAlternativeGuidance(
      item({ dna_tags: ['#WiredOnly', '#NoWhite'] }),
    )
    // #WiredOnly → positive "must be wired"; #NoWhite → negative phrase "not white"
    // Template: "{Positive} — just not {negative phrase}"
    expect(guidance).not.toBeNull()
    expect(guidance).toContain('wired')
    expect(guidance).toContain('not white')
    expect(guidance).toMatch(/^Must be wired/)
  })

  it('handles positives only with "Something …" template', () => {
    const guidance = generateAlternativeGuidance(
      item({ dna_tags: ['#HardcoverOnly'] }),
    )
    expect(guidance).toBe('Something hardcover only')
  })

  it('handles negatives only with "Anything similar — just not …" template', () => {
    const guidance = generateAlternativeGuidance(
      item({ dna_tags: ['#NoSynthetics', '#NoPink'] }),
    )
    // #NoSynthetics phrase: "no synthetic fabrics"; #NoPink phrase: "not pink"
    // The phrases carry their own "no"/"not" prefix; the template prepends "just not"
    expect(guidance).toBe(
      'Anything similar — just not no synthetic fabrics and not pink',
    )
  })

  it('appends fit notes as a parenthetical when combined with other content', () => {
    const guidance = generateAlternativeGuidance(
      item({ dna_tags: ['#NaturalFabric', '#SizeUp'] }),
    )
    // #NaturalFabric → positive, #SizeUp → fitNote
    expect(guidance).toBe('Something natural fabric (order one size up)')
  })

  it('returns a capitalised fit-note sentence when fit notes are the only content', () => {
    const guidance = generateAlternativeGuidance(
      item({ dna_tags: ['#SizeUp'] }),
    )
    expect(guidance).toBe('Order one size up')
  })

  it('returns null when dna_tags is an empty array', () => {
    expect(generateAlternativeGuidance(item({ dna_tags: [] }))).toBeNull()
  })

  it('returns null when dna_tags is null', () => {
    expect(generateAlternativeGuidance(item({ dna_tags: null }))).toBeNull()
  })

  it('returns null when all tags are unrecognised', () => {
    // Tags not in TAG_PHRASES are silently skipped
    expect(
      generateAlternativeGuidance(item({ dna_tags: ['#FakeTag', '#AlsoFake'] })),
    ).toBeNull()
  })

  it('produces a string under 150 characters for a typical mix of 3 tags', () => {
    const guidance = generateAlternativeGuidance(
      item({ dna_tags: ['#EcoFriendly', '#CrueltyFree', '#FragranceFree'] }),
    )
    expect(guidance).not.toBeNull()
    expect((guidance as string).length).toBeLessThan(150)
  })

  it('joins multiple positive phrases with commas and "and"', () => {
    const guidance = generateAlternativeGuidance(
      item({ dna_tags: ['#EcoFriendly', '#CrueltyFree', '#FragranceFree'] }),
    )
    // All three are positives → "Something eco-friendly, cruelty-free and fragrance-free"
    expect(guidance).toBe('Something eco-friendly, cruelty-free and fragrance-free')
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// buildSearchQueryFromItem
// ─────────────────────────────────────────────────────────────────────────────

describe('buildSearchQueryFromItem', () => {

  it('strips the leading brand word when it matches the retailer', () => {
    const query = buildSearchQueryFromItem(
      item({ title: 'Sony WH-1000XM5 Wireless Headphones', retailer: 'sony' }),
    )
    // 'Sony' should be dropped because it matches retailer.slice(0, 4) = 'sony'
    expect(query.toLowerCase()).not.toMatch(/^sony/)
  })

  it('removes noise words and keeps meaningful words', () => {
    // 'The', 'Premium', 'New' are noise words; 'Cashmere', 'Scarf' are meaningful
    const query = buildSearchQueryFromItem(
      item({ title: 'The Premium New Cashmere Scarf', retailer: null }),
    )
    expect(query).toContain('Cashmere')
    expect(query).toContain('Scarf')
    expect(query.toLowerCase()).not.toContain('premium')
    // 'new ' (with trailing space) so we don't false-positive on "new" inside other words
    expect(query).not.toMatch(/\bnew\b/i)
  })

  it('appends positive tag keywords to the search query', () => {
    const query = buildSearchQueryFromItem(
      item({ title: 'Over-Ear Headphones', retailer: null, dna_tags: ['#WiredOnly'] }),
    )
    // #WiredOnly → TAG_SEARCH_TERMS: 'wired'
    expect(query).toContain('wired')
  })

  it('does NOT include keywords for negative tags', () => {
    const query = buildSearchQueryFromItem(
      item({ title: 'Headphones', retailer: null, dna_tags: ['#NoWhite'] }),
    )
    // #NoWhite has no entry in TAG_SEARCH_TERMS — negative tags are deliberately excluded
    expect(query).not.toContain('white')
  })

  it('keeps the result at 80 characters or fewer', () => {
    const query = buildSearchQueryFromItem(
      item({
        title:    'Sony Wireless Bluetooth Over-Ear Noise-Cancelling Studio Headphones Premium Black',
        retailer: 'sony',
        dna_tags: ['#WiredOnly', '#LongBatteryLife', '#AndroidOnly'],
      }),
    )
    expect(query.length).toBeLessThanOrEqual(80)
  })

  it('produces a sensible query for a book item', () => {
    const query = buildSearchQueryFromItem(
      item({ title: 'The Midnight Library', retailer: null, dna_tags: ['#HardcoverOnly'] }),
    )
    // 'The' is a noise word; 'Midnight' and 'Library' survive; 'hardcover' from tag
    expect(query).toContain('Midnight')
    expect(query).toContain('Library')
    expect(query).toContain('hardcover')
    expect(query.toLowerCase()).not.toContain('the ')
  })

  it('falls back to the raw title (up to 60 chars) when filtering leaves nothing', () => {
    // Title is entirely noise words
    const query = buildSearchQueryFromItem(
      item({ title: 'The New Best Set', retailer: null, dna_tags: null }),
    )
    // When titleWords is empty and no tags, fallback is rawTitle.slice(0, 60)
    expect(query.length).toBeGreaterThan(0)
  })

  it('handles null retailer without throwing', () => {
    expect(() =>
      buildSearchQueryFromItem(item({ title: 'Cashmere Scarf', retailer: null })),
    ).not.toThrow()
  })

  it('deduplicates overlapping tag keywords', () => {
    // #WirelessOnly and #WiredOnly both contribute to search terms — deduplicated
    const query = buildSearchQueryFromItem(
      item({
        title:    'Headphones',
        retailer: null,
        dna_tags: ['#WirelessOnly', '#LongBatteryLife'],
      }),
    )
    // Count occurrences of 'wireless' — should be exactly 1
    const count = (query.match(/wireless/gi) ?? []).length
    expect(count).toBe(1)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// DNA_TAG_TOOLTIPS
// ─────────────────────────────────────────────────────────────────────────────

describe('DNA_TAG_TOOLTIPS', () => {

  it('has a tooltip for #NoWhite that mentions colour', () => {
    expect(DNA_TAG_TOOLTIPS['#NoWhite']).toMatch(/colour/i)
  })

  it('has a tooltip for #WiredOnly that mentions wired', () => {
    expect(DNA_TAG_TOOLTIPS['#WiredOnly']).toMatch(/wired/i)
  })

  it('has a tooltip entry for every tag in ALL_DNA_TAGS', () => {
    const missingTooltips = ALL_DNA_TAGS.filter((tag) => !DNA_TAG_TOOLTIPS[tag])
    expect(missingTooltips).toEqual([])
  })

  it('keeps every tooltip under 100 characters for mobile readability', () => {
    for (const [tag, tooltip] of Object.entries(DNA_TAG_TOOLTIPS)) {
      expect(tooltip.length).toBeLessThanOrEqual(100),
        `Tooltip for ${tag} is too long: ${tooltip.length} chars`
    }
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// searchTags (autocomplete)
// ─────────────────────────────────────────────────────────────────────────────

describe('searchTags', () => {

  it('returns prefix matches before substring matches', () => {
    const results = searchTags('no')
    // All results should contain 'no' somewhere in the body
    expect(results.every((t) => t.toLowerCase().includes('no'))).toBe(true)
    // Tags that START with #No should appear before mid-string matches
    const firstNoPrefix = results.findIndex((t) => t.startsWith('#No'))
    const firstMidMatch = results.findIndex(
      (t) => !t.startsWith('#No') && t.toLowerCase().includes('no'),
    )
    if (firstNoPrefix !== -1 && firstMidMatch !== -1) {
      expect(firstNoPrefix).toBeLessThan(firstMidMatch)
    }
  })

  it('returns all tags (up to maxResults) when query is empty', () => {
    const results = searchTags('')
    expect(results.length).toBeLessThanOrEqual(8)
  })

  it('respects the custom maxResults cap', () => {
    const results = searchTags('', 3)
    expect(results.length).toBeLessThanOrEqual(3)
  })

  it('returns #EcoFriendly for the query "eco"', () => {
    const results = searchTags('eco')
    expect(results).toContain('#EcoFriendly')
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// getTagCategory
// ─────────────────────────────────────────────────────────────────────────────

describe('getTagCategory', () => {

  it('returns "clothing" for #NoSynthetics', () => {
    expect(getTagCategory('#NoSynthetics')).toBe('clothing')
  })

  it('returns "electronics" for #WiredOnly', () => {
    expect(getTagCategory('#WiredOnly')).toBe('electronics')
  })

  it('returns "books" for #HardcoverOnly', () => {
    expect(getTagCategory('#HardcoverOnly')).toBe('books')
  })

  it('returns null for an unrecognised tag', () => {
    expect(getTagCategory('#UnknownTag')).toBeNull()
  })

})
