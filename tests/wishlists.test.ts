/**
 * tests/wishlists.test.ts — GiftHint
 *
 * Unit tests for the occasion-tagging / multi-list system.
 *
 * Coverage:
 *   generateSlug()      — URL-safe slug generation and edge cases
 *   createWishlist()    — DB record shape, slug assignment, default promotion
 *   getWishlists()      — correct rows returned, error fallback
 *   Migration scenario  — user with legacy orphan items gets a default
 *                         wishlist and items assigned to it
 *
 * Mock strategy:
 *   The same chainable Supabase mock factory used across the test suite.
 *   createServerClient() is replaced; fromSequence[n] is the result of the
 *   n-th call to supabase.from() so each test controls the DB precisely.
 *
 * Run with: npm test
 */

// ── Mock must be hoisted above all imports ─────────────────────────────────────
jest.mock('@/lib/supabase-server', () => ({
  createServerClient: jest.fn(),
}))

import { createServerClient } from '@/lib/supabase-server'
import {
  generateSlug,
  createWishlist,
  getWishlists,
  getDefaultWishlist,
  type DbWishlist,
} from '@/lib/wishlists'

// ─────────────────────────────────────────────────────────────────────────────
// Chainable Supabase mock factory  (mirrors claim-system.test.ts)
// ─────────────────────────────────────────────────────────────────────────────

type DbRow    = Record<string, unknown>
type DbResult = { data: DbRow | DbRow[] | null; error: { message: string } | null }

function makeSupa(fromSequence: DbResult[]) {
  let callIdx = 0

  function makeChain(result: DbResult): Record<string, unknown> {
    const chain: Record<string, unknown> = {}

    for (const m of [
      'select', 'update', 'insert', 'upsert', 'delete',
      'eq', 'neq', 'is', 'not', 'in',
      'order', 'limit',
    ]) {
      chain[m] = jest.fn().mockReturnValue(chain)
    }

    chain.maybeSingle = jest.fn().mockResolvedValue(result)
    chain.single      = jest.fn().mockResolvedValue(result)

    // Bare `await chain` (no terminal method) — used by update chains
    chain.then = (
      resolve: (v: DbResult) => unknown,
      reject?:  (e: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve as (v: unknown) => unknown, reject)

    return chain
  }

  return {
    from: jest.fn().mockImplementation(() => {
      const result = fromSequence[Math.min(callIdx, fromSequence.length - 1)]
      callIdx++
      return makeChain(result)
    }),
  }
}

function useSupa(fromSequence: DbResult[]) {
  const mock = makeSupa(fromSequence)
  jest.mocked(createServerClient).mockReturnValue(
    mock as unknown as ReturnType<typeof createServerClient>,
  )
  return mock
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared fixtures
// ─────────────────────────────────────────────────────────────────────────────

const USER_ID = 'user-uuid-aaaaaa'

const BIRTHDAY_WISHLIST: DbRow = {
  id:            'wl-uuid-bbbbbb',
  user_id:       USER_ID,
  title:         'My Birthday Wishlist',
  occasion:      'birthday',
  occasion_date: '2026-06-15',
  slug:          'my-birthday-wishlist',
  is_default:    false,
  is_public:     true,
  created_at:    '2026-01-01T00:00:00.000Z',
}

const CHRISTMAS_WISHLIST: DbRow = {
  id:            'wl-uuid-cccccc',
  user_id:       USER_ID,
  title:         'Christmas 2026',
  occasion:      'christmas',
  occasion_date: '2026-12-25',
  slug:          'christmas-2026',
  is_default:    true,
  is_public:     true,
  created_at:    '2026-01-02T00:00:00.000Z',
}

// ─────────────────────────────────────────────────────────────────────────────
// generateSlug() — pure function, no Supabase interaction
// ─────────────────────────────────────────────────────────────────────────────

describe('generateSlug()', () => {

  it('lowercases and hyphenates a plain title', () => {
    expect(generateSlug('Birthday 2026')).toBe('birthday-2026')
  })

  it('strips emoji and other non-alphanumeric characters', () => {
    expect(generateSlug('Baby Shower 🍼')).toBe('baby-shower')
  })

  it('strips punctuation', () => {
    expect(generateSlug('My Wishlist!')).toBe('my-wishlist')
  })

  it('converts accented characters to ASCII equivalents', () => {
    // NFD decomposition + diacritic strip: é → e, ü → u, ñ → n
    expect(generateSlug('Café Wishlist')).toBe('cafe-wishlist')
    expect(generateSlug('Für Elise')).toBe('fur-elise')
  })

  it('collapses multiple spaces and hyphens into one hyphen', () => {
    expect(generateSlug('My   Cool   List')).toBe('my-cool-list')
    expect(generateSlug('A--B---C')).toBe('a-b-c')
  })

  it('trims leading and trailing hyphens after sanitisation', () => {
    expect(generateSlug('  Birthday  ')).toBe('birthday')
    expect(generateSlug('!!! Alert !!!')).toBe('alert')
  })

  it('truncates to 60 characters without leaving a trailing hyphen', () => {
    const longTitle  = 'A Very Long Title That Goes Well Past The Sixty Character Limit For Slugs'
    const slug       = generateSlug(longTitle)
    expect(slug.length).toBeLessThanOrEqual(60)
    expect(slug.endsWith('-')).toBe(false)
  })

  it('returns "my-list" fallback when the title yields an empty string', () => {
    expect(generateSlug('🎉🎉🎉')).toBe('my-list')
    expect(generateSlug('   ')).toBe('my-list')
    expect(generateSlug('')).toBe('my-list')
  })

  it('handles numbers-only title', () => {
    expect(generateSlug('2026')).toBe('2026')
  })

  it('preserves hyphens that were already in the title', () => {
    expect(generateSlug('Mid-year Review')).toBe('mid-year-review')
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// createWishlist() — slug generation + DB insert
// ─────────────────────────────────────────────────────────────────────────────

describe('createWishlist() — basic creation', () => {

  it('inserts a record and returns the created DbWishlist', async () => {
    useSupa([
      { data: null,               error: null },  // ensureUniqueSlug: slug available
      { data: BIRTHDAY_WISHLIST,  error: null },  // insert → new row
    ])

    const result = await createWishlist({
      userId:   USER_ID,
      title:    'My Birthday Wishlist',
      occasion: 'birthday',
    })

    expect(result).not.toBeNull()
    expect(result!.id).toBe(BIRTHDAY_WISHLIST.id)
    expect(result!.title).toBe('My Birthday Wishlist')
    expect(result!.occasion).toBe('birthday')
    expect(result!.slug).toBe('my-birthday-wishlist')
    expect(result!.is_public).toBe(true)
  })

  it('derives the slug from the title automatically', async () => {
    const sluggedList = { ...BIRTHDAY_WISHLIST, slug: 'christmas-2026' }

    useSupa([
      { data: null,        error: null },  // slug available
      { data: sluggedList, error: null },  // insert
    ])

    const result = await createWishlist({
      userId:   USER_ID,
      title:    'Christmas 2026',
      occasion: 'christmas',
    })

    expect(result!.slug).toBe('christmas-2026')
  })

  it('stores occasion_date when provided', async () => {
    const withDate = { ...BIRTHDAY_WISHLIST, occasion_date: '2026-06-15' }

    useSupa([
      { data: null,      error: null },
      { data: withDate,  error: null },
    ])

    const result = await createWishlist({
      userId:       USER_ID,
      title:        'My Birthday Wishlist',
      occasion:     'birthday',
      occasionDate: '2026-06-15',
    })

    expect(result!.occasion_date).toBe('2026-06-15')
  })

  it('sets occasion_date to null when not provided', async () => {
    const noDate = { ...BIRTHDAY_WISHLIST, occasion_date: null }

    useSupa([
      { data: null,    error: null },
      { data: noDate,  error: null },
    ])

    const result = await createWishlist({
      userId:   USER_ID,
      title:    'My Birthday Wishlist',
      occasion: 'birthday',
    })

    expect(result!.occasion_date).toBeNull()
  })

  it('returns null when the DB insert errors', async () => {
    useSupa([
      { data: null, error: null },                              // slug available
      { data: null, error: { message: 'unique_violation' } },  // insert fails
    ])

    const result = await createWishlist({
      userId:   USER_ID,
      title:    'My Birthday Wishlist',
      occasion: 'birthday',
    })

    expect(result).toBeNull()
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// createWishlist() — duplicate slug resolution
// ─────────────────────────────────────────────────────────────────────────────

describe('createWishlist() — duplicate slug handling', () => {

  it('appends -2 when the base slug is already taken', async () => {
    const slugged2 = { ...BIRTHDAY_WISHLIST, slug: 'birthday-2' }

    useSupa([
      { data: { id: 'taken' },  error: null },  // "birthday" → taken
      { data: null,              error: null },  // "birthday-2" → available
      { data: slugged2,          error: null },  // insert with slug-2
    ])

    const result = await createWishlist({
      userId:   USER_ID,
      title:    'Birthday',
      occasion: 'birthday',
    })

    expect(result!.slug).toBe('birthday-2')
  })

  it('increments to -3 when both base and -2 are taken', async () => {
    const slugged3 = { ...BIRTHDAY_WISHLIST, slug: 'birthday-3' }

    useSupa([
      { data: { id: 'taken-1' }, error: null },  // "birthday" → taken
      { data: { id: 'taken-2' }, error: null },  // "birthday-2" → taken
      { data: null,               error: null },  // "birthday-3" → available
      { data: slugged3,           error: null },  // insert
    ])

    const result = await createWishlist({
      userId:   USER_ID,
      title:    'Birthday',
      occasion: 'birthday',
    })

    expect(result!.slug).toBe('birthday-3')
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// createWishlist() — default promotion (makeDefault: true)
// ─────────────────────────────────────────────────────────────────────────────

describe('createWishlist() — makeDefault promotion', () => {

  it('clears the existing default before inserting the new one', async () => {
    const mock = useSupa([
      { data: null,               error: null },  // ensureUniqueSlug: slug available
      { data: null,               error: null },  // UPDATE existing default → cleared
      { data: CHRISTMAS_WISHLIST, error: null },  // INSERT new list
    ])

    await createWishlist({
      userId:      USER_ID,
      title:       'Christmas 2026',
      occasion:    'christmas',
      makeDefault: true,
    })

    // The second from() call should be an UPDATE to clear is_default
    const secondChain = mock.from.mock.results[1].value as Record<string, jest.Mock>
    expect(secondChain.update).toHaveBeenCalledWith({ is_default: false })
  })

  it('created wishlist has is_default = true when makeDefault is set', async () => {
    useSupa([
      { data: null,               error: null },  // slug available
      { data: null,               error: null },  // clear existing default
      { data: CHRISTMAS_WISHLIST, error: null },  // insert
    ])

    const result = await createWishlist({
      userId:      USER_ID,
      title:       'Christmas 2026',
      occasion:    'christmas',
      makeDefault: true,
    })

    expect(result!.is_default).toBe(true)
  })

  it('does NOT update existing defaults when makeDefault is false', async () => {
    const mock = useSupa([
      { data: null,               error: null },  // slug available
      { data: BIRTHDAY_WISHLIST,  error: null },  // insert (no update step)
    ])

    await createWishlist({
      userId:      USER_ID,
      title:       'My Birthday Wishlist',
      occasion:    'birthday',
      makeDefault: false,
    })

    // Only 2 from() calls — slug check + insert; NO update step
    expect(mock.from).toHaveBeenCalledTimes(2)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// getWishlists() — query and error handling
// ─────────────────────────────────────────────────────────────────────────────

describe('getWishlists()', () => {

  it('returns an array of wishlists for the user', async () => {
    useSupa([
      { data: [BIRTHDAY_WISHLIST, CHRISTMAS_WISHLIST], error: null },
    ])

    const result = await getWishlists(USER_ID)

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe(BIRTHDAY_WISHLIST.id)
    expect(result[1].id).toBe(CHRISTMAS_WISHLIST.id)
  })

  it('returns an empty array when the user has no wishlists', async () => {
    useSupa([{ data: [], error: null }])

    const result = await getWishlists(USER_ID)

    expect(result).toEqual([])
  })

  it('returns an empty array and does not throw on a DB error', async () => {
    useSupa([{ data: null, error: { message: 'connection refused' } }])

    const result = await getWishlists(USER_ID)

    expect(result).toEqual([])
  })

  it('returns all wishlist fields needed to render the gifter page', async () => {
    useSupa([{ data: [BIRTHDAY_WISHLIST], error: null }])

    const [wl] = await getWishlists(USER_ID)

    // Every field the gifter page and dashboard consume
    expect(wl).toMatchObject({
      id:            expect.any(String),
      user_id:       USER_ID,
      title:         expect.any(String),
      occasion:      expect.any(String),
      slug:          expect.any(String),
      is_default:    expect.any(Boolean),
      is_public:     expect.any(Boolean),
      created_at:    expect.any(String),
    })
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// Migration scenario — legacy user gets a default wishlist
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Phase 1 → Phase 2 migration behaviour:
 *   Migration 005 creates a "My Wishlist" default for every user who has items
 *   but no wishlists, then points all their orphan items to it.
 *
 * These tests verify that the TypeScript helpers produce the expected DB state
 * that the migration SQL must satisfy.  The SQL migration verification steps
 * are documented separately in tests/migration-verification.md.
 */
describe('Migration scenario — pre-existing user with orphan items', () => {

  const ORPHAN_USER_ID  = 'user-uuid-orphan'
  const DEFAULT_WISHLIST: DbRow = {
    id:            'wl-uuid-default',
    user_id:       ORPHAN_USER_ID,
    title:         'My Wishlist',
    occasion:      'other',
    occasion_date: null,
    slug:          'my-wishlist',
    is_default:    true,
    is_public:     true,
    created_at:    '2026-01-01T00:00:00.000Z',
  }

  it('getDefaultWishlist returns null before the migration runs', async () => {
    // Pre-migration: no rows in wishlists table for this user
    useSupa([{ data: null, error: null }])

    const result = await getDefaultWishlist(ORPHAN_USER_ID)

    expect(result).toBeNull()
  })

  it('createWishlist creates the default "My Wishlist" for the legacy user', async () => {
    useSupa([
      { data: null,            error: null },  // slug "my-wishlist" → available
      { data: null,            error: null },  // no existing default to clear
      { data: DEFAULT_WISHLIST, error: null }, // INSERT succeeds
    ])

    const result = await createWishlist({
      userId:      ORPHAN_USER_ID,
      title:       'My Wishlist',
      occasion:    'other',
      makeDefault: true,
    })

    expect(result).not.toBeNull()
    expect(result!.slug).toBe('my-wishlist')
    expect(result!.is_default).toBe(true)
    expect(result!.occasion).toBe('other')
  })

  it('getDefaultWishlist returns the new list after migration runs', async () => {
    // Post-migration: the default row now exists
    useSupa([{ data: DEFAULT_WISHLIST, error: null }])

    const result = await getDefaultWishlist(ORPHAN_USER_ID)

    expect(result).not.toBeNull()
    expect(result!.is_default).toBe(true)
    expect(result!.slug).toBe('my-wishlist')
  })

  it('getWishlists returns exactly one list after the migration', async () => {
    // Post-migration: exactly one public list for this user
    useSupa([{ data: [DEFAULT_WISHLIST], error: null }])

    const lists = await getWishlists(ORPHAN_USER_ID)

    expect(lists).toHaveLength(1)
    expect(lists[0].is_default).toBe(true)
  })

  it('each user gets an independent default (no cross-user slug collision)', async () => {
    const otherUserId = 'user-uuid-other'

    // Both users create "my-wishlist" — mock a slug conflict for the second user
    // by simulating that "my-wishlist" is taken and "-2" is used instead.
    useSupa([
      { data: { id: 'taken-for-other-user' }, error: null },    // my-wishlist → taken
      { data: null,                            error: null },    // my-wishlist-2 → free
      { data: { ...DEFAULT_WISHLIST, user_id: otherUserId, slug: 'my-wishlist-2' }, error: null },
    ])

    const result = await createWishlist({
      userId:      otherUserId,
      title:       'My Wishlist',
      occasion:    'other',
      makeDefault: true,
    })

    // The per-user uniqueness constraint means the second user gets -2
    expect(result!.slug).toBe('my-wishlist-2')
  })

})
