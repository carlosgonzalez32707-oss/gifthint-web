/**
 * tests/digest.test.ts — GiftHint
 *
 * Unit tests for lib/digest.ts
 *
 * Coverage:
 *   getWeeklyDigestData()
 *     - Returns null when user has no wishlists
 *     - Returns null when totalViews === 0 (empty digest gate)
 *     - Aggregates page_views across multiple wishlists
 *     - Builds listSummaries sorted by views descending
 *     - Excludes wishlists with zero views from listSummaries
 *     - Identifies the top clicked item by click count
 *     - Prefers affiliate_url over source_url for topClickedItem.sourceUrl
 *     - Falls back to source_url when affiliate_url is null
 *     - Returns topClickedItem: null when there are no click events
 *     - Collects claimed items from the past 7 days
 *     - Returns empty claimedItems when nothing was claimed this week
 *     - Handles DB errors gracefully (proceeds with partial data)
 *
 *   weekOfLabel()
 *     - Returns a string containing the current year
 *     - Contains a range separator (–)
 *     - Has correct structure for a same-month week
 *
 * Mock strategy:
 *   createServerClient() is replaced with the same chainable mock used
 *   throughout the test suite. getWeeklyDigestData makes multiple .from()
 *   calls in sequence — fromSequence[n] controls what each one returns.
 *
 *   Call order inside getWeeklyDigestData:
 *     0: wishlists SELECT           (all lists for the user)
 *     1: page_views SELECT          (view rows for those list IDs, last 7d)
 *     2: click_events SELECT        (click rows for those list IDs, last 7d)
 *     3: wishlist_items SELECT .single()  (top clicked item metadata)
 *     4: wishlist_items SELECT      (claimed items, last 7d)
 */

jest.mock('@/lib/supabase-server', () => ({
  createServerClient: jest.fn(),
}))

import { createServerClient } from '@/lib/supabase-server'
import { getWeeklyDigestData, weekOfLabel } from '@/lib/digest'

// ─────────────────────────────────────────────────────────────────────────────
// Chainable Supabase mock
// ─────────────────────────────────────────────────────────────────────────────

type DbRow    = Record<string, unknown>
type DbResult = { data: DbRow | DbRow[] | null; error: { message: string } | null }

function makeSupa(fromSequence: DbResult[]) {
  let idx = 0

  function makeChain(result: DbResult) {
    const c: Record<string, unknown> = {}
    for (const m of [
      'select', 'insert', 'update', 'upsert',
      'eq', 'neq', 'is', 'not', 'in', 'gte', 'lte', 'lt',
      'order', 'limit',
    ]) {
      c[m] = jest.fn().mockReturnValue(c)
    }
    c.maybeSingle = jest.fn().mockResolvedValue(result)
    c.single      = jest.fn().mockResolvedValue(result)
    c.then = (res: (v: DbResult) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(res as (v: unknown) => unknown, rej)
    return c
  }

  return {
    from: jest.fn().mockImplementation(() => {
      const r = fromSequence[Math.min(idx, fromSequence.length - 1)]
      idx++
      return makeChain(r)
    }),
  }
}

function useSupa(seq: DbResult[]) {
  const mock = makeSupa(seq)
  jest.mocked(createServerClient).mockReturnValue(
    mock as unknown as ReturnType<typeof createServerClient>,
  )
  return mock
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const USER_ID  = 'user-uuid-0001'
const LIST_A   = { id: 'list-uuid-aaaa', name: 'Birthday Wishlist', slug: 'birthday-2025' }
const LIST_B   = { id: 'list-uuid-bbbb', name: 'Christmas 2025',    slug: 'christmas-2025' }
const ITEM_ID  = 'item-uuid-1111'

const now      = new Date().toISOString()
const recently = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()

// Helper: N page-view rows all pointing to the given wishlist_id
function views(wishlistId: string, count: number): DbRow[] {
  return Array.from({ length: count }, () => ({ wishlist_id: wishlistId, viewed_at: now }))
}

// Helper: N click-event rows all pointing to the given item_id
function clicks(itemId: string, count: number): DbRow[] {
  return Array.from({ length: count }, () => ({ item_id: itemId, clicked_at: now }))
}

// ─────────────────────────────────────────────────────────────────────────────
// getWeeklyDigestData — empty / null guard
// ─────────────────────────────────────────────────────────────────────────────

describe('getWeeklyDigestData() — null / empty guards', () => {
  it('returns null when the user has no wishlists', async () => {
    useSupa([
      { data: [],   error: null },   // wishlists → empty
    ])
    const result = await getWeeklyDigestData(USER_ID)
    expect(result).toBeNull()
  })

  it('returns null when there are no page views in the last 7 days', async () => {
    useSupa([
      { data: [LIST_A],  error: null },   // wishlists
      { data: [],        error: null },   // page_views → 0 views
    ])
    const result = await getWeeklyDigestData(USER_ID)
    expect(result).toBeNull()
  })

  it('returns null when wishlists query returns an error', async () => {
    useSupa([
      { data: null, error: { message: 'permission denied' } },
    ])
    const result = await getWeeklyDigestData(USER_ID)
    expect(result).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getWeeklyDigestData — view aggregation
// ─────────────────────────────────────────────────────────────────────────────

describe('getWeeklyDigestData() — view aggregation', () => {
  it('sums page_views across all wishlists into totalViews', async () => {
    useSupa([
      { data: [LIST_A, LIST_B],                             error: null },   // wishlists
      { data: [...views(LIST_A.id, 10), ...views(LIST_B.id, 5)], error: null },   // page_views
      { data: [],                                           error: null },   // click_events
      { data: [],                                           error: null },   // claimed items
    ])

    const result = await getWeeklyDigestData(USER_ID)
    expect(result).not.toBeNull()
    expect(result!.totalViews).toBe(15)
  })

  it('counts views correctly for a single list', async () => {
    useSupa([
      { data: [LIST_A],          error: null },
      { data: views(LIST_A.id, 7), error: null },
      { data: [],                error: null },
      { data: [],                error: null },
    ])

    const result = await getWeeklyDigestData(USER_ID)
    expect(result!.totalViews).toBe(7)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getWeeklyDigestData — listSummaries
// ─────────────────────────────────────────────────────────────────────────────

describe('getWeeklyDigestData() — listSummaries', () => {
  it('returns listSummaries sorted by views descending', async () => {
    useSupa([
      { data: [LIST_A, LIST_B],                              error: null },
      { data: [...views(LIST_A.id, 3), ...views(LIST_B.id, 12)], error: null },
      { data: [],                                            error: null },
      { data: [],                                            error: null },
    ])

    const result = await getWeeklyDigestData(USER_ID)
    expect(result!.listSummaries[0].listName).toBe('Christmas 2025')
    expect(result!.listSummaries[0].views).toBe(12)
    expect(result!.listSummaries[1].listName).toBe('Birthday Wishlist')
    expect(result!.listSummaries[1].views).toBe(3)
  })

  it('excludes lists with zero views from listSummaries', async () => {
    useSupa([
      { data: [LIST_A, LIST_B],        error: null },
      { data: views(LIST_A.id, 5),     error: null },   // only LIST_A has views
      { data: [],                      error: null },
      { data: [],                      error: null },
    ])

    const result = await getWeeklyDigestData(USER_ID)
    expect(result!.listSummaries).toHaveLength(1)
    expect(result!.listSummaries[0].listName).toBe('Birthday Wishlist')
  })

  it('exposes the correct slug for each list', async () => {
    useSupa([
      { data: [LIST_A],                error: null },
      { data: views(LIST_A.id, 4),     error: null },
      { data: [],                      error: null },
      { data: [],                      error: null },
    ])

    const result = await getWeeklyDigestData(USER_ID)
    expect(result!.listSummaries[0].slug).toBe('birthday-2025')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getWeeklyDigestData — topClickedItem
// ─────────────────────────────────────────────────────────────────────────────

describe('getWeeklyDigestData() — topClickedItem', () => {
  const ITEM_META: DbRow = {
    title:         'Moleskine Notebook',
    image_url:     'https://cdn.example.com/notebook.jpg',
    source_url:    'https://www.amazon.com/dp/B00F9LM0AS',
    affiliate_url: 'https://www.amazon.com/dp/B00F9LM0AS?tag=gifthint-20',
  }

  const OTHER_ITEM_ID = 'item-uuid-2222'

  it('returns null when there are no click events this week', async () => {
    useSupa([
      { data: [LIST_A],            error: null },
      { data: views(LIST_A.id, 2), error: null },
      { data: [],                  error: null },   // no clicks
      { data: [],                  error: null },
    ])

    const result = await getWeeklyDigestData(USER_ID)
    expect(result!.topClickedItem).toBeNull()
  })

  it('returns the item with the most clicks as topClickedItem', async () => {
    useSupa([
      { data: [LIST_A],                                           error: null },
      { data: views(LIST_A.id, 5),                                error: null },
      { data: [...clicks(ITEM_ID, 8), ...clicks(OTHER_ITEM_ID, 3)], error: null },
      { data: ITEM_META,                                          error: null },   // .single() for top item
      { data: [],                                                 error: null },
    ])

    const result = await getWeeklyDigestData(USER_ID)
    expect(result!.topClickedItem).not.toBeNull()
    expect(result!.topClickedItem!.title).toBe('Moleskine Notebook')
    expect(result!.topClickedItem!.clicks).toBe(8)
  })

  it('prefers affiliate_url over source_url for the buy link', async () => {
    useSupa([
      { data: [LIST_A],            error: null },
      { data: views(LIST_A.id, 1), error: null },
      { data: clicks(ITEM_ID, 3),  error: null },
      { data: ITEM_META,           error: null },
      { data: [],                  error: null },
    ])

    const result = await getWeeklyDigestData(USER_ID)
    expect(result!.topClickedItem!.sourceUrl).toBe(
      'https://www.amazon.com/dp/B00F9LM0AS?tag=gifthint-20',
    )
  })

  it('falls back to source_url when affiliate_url is null', async () => {
    const itemNoAffiliate: DbRow = {
      ...ITEM_META,
      affiliate_url: null,
    }

    useSupa([
      { data: [LIST_A],            error: null },
      { data: views(LIST_A.id, 1), error: null },
      { data: clicks(ITEM_ID, 2),  error: null },
      { data: itemNoAffiliate,     error: null },
      { data: [],                  error: null },
    ])

    const result = await getWeeklyDigestData(USER_ID)
    expect(result!.topClickedItem!.sourceUrl).toBe('https://www.amazon.com/dp/B00F9LM0AS')
  })

  it('exposes imageUrl from the item metadata (may be null)', async () => {
    const itemNoImage: DbRow = { ...ITEM_META, image_url: null }

    useSupa([
      { data: [LIST_A],            error: null },
      { data: views(LIST_A.id, 1), error: null },
      { data: clicks(ITEM_ID, 1),  error: null },
      { data: itemNoImage,         error: null },
      { data: [],                  error: null },
    ])

    const result = await getWeeklyDigestData(USER_ID)
    expect(result!.topClickedItem!.imageUrl).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getWeeklyDigestData — claimedItems
// ─────────────────────────────────────────────────────────────────────────────

describe('getWeeklyDigestData() — claimedItems', () => {
  const CLAIMED: DbRow[] = [
    { title: 'Kindle Paperwhite', image_url: null,                                  claimed_at: recently },
    { title: 'Le Creuset Skillet', image_url: 'https://cdn.example.com/skillet.jpg', claimed_at: recently },
  ]

  it('returns empty claimedItems when nothing was claimed this week', async () => {
    useSupa([
      { data: [LIST_A],            error: null },
      { data: views(LIST_A.id, 3), error: null },
      { data: [],                  error: null },   // no clicks
      { data: [],                  error: null },   // no claimed items
    ])

    const result = await getWeeklyDigestData(USER_ID)
    expect(result!.claimedItems).toHaveLength(0)
  })

  it('returns the correct titles for claimed items', async () => {
    useSupa([
      { data: [LIST_A],            error: null },
      { data: views(LIST_A.id, 2), error: null },
      { data: [],                  error: null },
      { data: CLAIMED,             error: null },
    ])

    const result = await getWeeklyDigestData(USER_ID)
    expect(result!.claimedItems).toHaveLength(2)
    expect(result!.claimedItems[0].title).toBe('Kindle Paperwhite')
    expect(result!.claimedItems[1].title).toBe('Le Creuset Skillet')
  })

  it('maps imageUrl from image_url (null → null, string → string)', async () => {
    useSupa([
      { data: [LIST_A],            error: null },
      { data: views(LIST_A.id, 1), error: null },
      { data: [],                  error: null },
      { data: CLAIMED,             error: null },
    ])

    const result = await getWeeklyDigestData(USER_ID)
    expect(result!.claimedItems[0].imageUrl).toBeNull()
    expect(result!.claimedItems[1].imageUrl).toBe('https://cdn.example.com/skillet.jpg')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getWeeklyDigestData — DB error resilience
// ─────────────────────────────────────────────────────────────────────────────

describe('getWeeklyDigestData() — DB error resilience', () => {
  // console.error is called by the digest module on query failures
  beforeAll(() => jest.spyOn(console, 'error').mockImplementation(() => {}))
  afterAll(()  => jest.restoreAllMocks())

  it('continues and returns data when the click_events query errors', async () => {
    useSupa([
      { data: [LIST_A],            error: null },
      { data: views(LIST_A.id, 5), error: null },
      { data: null,                error: { message: 'click_events table missing' } },
      { data: [],                  error: null },   // claimed items still works
    ])

    const result = await getWeeklyDigestData(USER_ID)
    // Should still return data — totalViews is non-zero
    expect(result).not.toBeNull()
    expect(result!.totalViews).toBe(5)
    expect(result!.topClickedItem).toBeNull()   // no click data
  })

  it('continues and returns data when the claimed items query errors', async () => {
    useSupa([
      { data: [LIST_A],            error: null },
      { data: views(LIST_A.id, 3), error: null },
      { data: [],                  error: null },
      { data: null,                error: { message: 'claimed_at index missing' } },
    ])

    const result = await getWeeklyDigestData(USER_ID)
    expect(result).not.toBeNull()
    expect(result!.claimedItems).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// weekOfLabel()
// ─────────────────────────────────────────────────────────────────────────────

describe('weekOfLabel()', () => {
  it('returns a non-empty string', () => {
    expect(weekOfLabel()).toBeTruthy()
  })

  it('contains the current UTC year', () => {
    const year = new Date().getUTCFullYear().toString()
    expect(weekOfLabel()).toContain(year)
  })

  it('contains an en-dash range separator', () => {
    // Either "May 12–18, 2025" (same month) or "Apr 28 – May 4, 2025" (cross-month)
    expect(weekOfLabel()).toMatch(/–|–/)
  })

  it('has the format "[Month] [d]–[d], [yyyy]" for a same-month week', () => {
    // Pin the date to a known Monday mid-month so there is no month boundary
    const fakeNow = new Date('2025-05-15T12:00:00Z').getTime()
    jest.spyOn(Date, 'now').mockReturnValue(fakeNow)

    const label = weekOfLabel()
    // Expected: "May 9–15, 2025" (start is 6 days back from May 15)
    expect(label).toMatch(/^[A-Z][a-z]+ \d+–\d+, \d{4}$/)

    jest.spyOn(Date, 'now').mockRestore()
  })

  it('uses a cross-month format when the week spans two months', () => {
    // May 1 is a Thursday — week goes from Apr 28 to May 4
    const fakeNow = new Date('2025-05-01T12:00:00Z').getTime()
    jest.spyOn(Date, 'now').mockReturnValue(fakeNow)

    const label = weekOfLabel()
    // Should contain both month names when they differ
    expect(label).toMatch(/April.+May|May.+April/i)

    jest.spyOn(Date, 'now').mockRestore()
  })
})
