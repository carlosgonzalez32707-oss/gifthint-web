/**
 * tests/claim-system.test.ts — GiftHint
 *
 * Unit tests for the claim/unclaim/coordination-panel system.
 * All Supabase interactions are mocked — no network or DB access required.
 *
 * Coverage:
 *   POST /api/claim              — success, race condition, missing fields, not found
 *   DELETE /api/claim/[itemId]   — success, name mismatch, anonymous guard, not claimed
 *   GET  /api/claims/[username]  — shape, anonymous masking, user-not-found
 *
 * Mock strategy:
 *   createServerClient() is replaced with a chainable Supabase mock whose
 *   terminal (.maybeSingle, await) resolves to whatever the test configures.
 *   fromSequence[n] is returned by the n-th call to supabase.from() so each
 *   test can express exactly what the DB returns at each step.
 *
 * Run with: npm test
 */

// ── Mock must be hoisted above all imports ─────────────────────────────────────
jest.mock('@/lib/supabase-server', () => ({
  createServerClient: jest.fn(),
}))

import { NextRequest }        from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { POST }               from '@/app/api/claim/route'
import { DELETE }             from '@/app/api/claim/[itemId]/route'
import { GET }                from '@/app/api/claims/[username]/route'

// ─────────────────────────────────────────────────────────────────────────────
// Chainable Supabase mock factory
// ─────────────────────────────────────────────────────────────────────────────

type DbRow    = Record<string, unknown>
type DbResult = { data: DbRow | DbRow[] | null; error: { message: string; code?: string } | null }

/**
 * Builds a chainable Supabase-like mock.
 *
 * fromSequence[n] is the value resolved by the n-th call to supabase.from().
 * If there are more calls than entries the last entry is reused.
 *
 * Chain methods (select, update, eq, …) all return `this` so they compose
 * naturally. Terminal methods (maybeSingle, single) resolve with the sequence
 * entry. The chain is also directly awaitable — `await chain` resolves to the
 * entry — covering routes that skip the terminal call (e.g. bare `.update().eq()`).
 */
function makeSupa(fromSequence: DbResult[]) {
  let callIdx = 0

  function makeChain(result: DbResult): Record<string, unknown> {
    const chain: Record<string, unknown> = {}

    // All query-builder methods return the same chain so calls compose freely
    for (const m of [
      'select', 'update', 'insert', 'upsert',
      'eq', 'neq', 'is', 'not', 'in',
      'order', 'limit',
    ]) {
      chain[m] = jest.fn().mockReturnValue(chain)
    }

    // Terminal — explicit resolution
    chain.maybeSingle = jest.fn().mockResolvedValue(result)
    chain.single      = jest.fn().mockResolvedValue(result)

    // Thenable — lets `await chain` work without an explicit terminal call
    chain.then = (
      resolve: (v: DbResult) => unknown,
      reject?: (e: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve as (v: unknown) => unknown, reject)

    return chain
  }

  const mock = {
    from: jest.fn().mockImplementation(() => {
      const result = fromSequence[Math.min(callIdx, fromSequence.length - 1)]
      callIdx++
      return makeChain(result)
    }),
    // Realtime broadcast helpers used by POST /api/claim
    channel: jest.fn().mockReturnValue({
      send: jest.fn().mockResolvedValue({ error: null }),
    }),
    removeChannel: jest.fn().mockResolvedValue(undefined),
  }

  return mock
}

/** Wire a fresh mock into createServerClient for the current test. */
function useSupa(fromSequence: DbResult[]) {
  const mock = makeSupa(fromSequence)
  jest.mocked(createServerClient).mockReturnValue(
    mock as unknown as ReturnType<typeof createServerClient>,
  )
  return mock
}

// ─────────────────────────────────────────────────────────────────────────────
// Request helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeClaimReq(body: unknown) {
  return new NextRequest('http://localhost/api/claim', {
    method:  'POST',
    body:    JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeUnclaimReq(itemId: string, body: unknown) {
  return new NextRequest(`http://localhost/api/claim/${itemId}`, {
    method:  'DELETE',
    body:    JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeClaimsReq(username: string) {
  return new NextRequest(`http://localhost/api/claims/${username}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared fixtures
// ─────────────────────────────────────────────────────────────────────────────

const WISHER_ID = 'wisher-uuid-aaaaaa'
const ITEM_ID   = 'item-uuid-bbbbbb'
const CLAIMED_AT = '2025-12-01T10:00:00.000Z'

const UNCLAIMED_ITEM: DbRow = {
  id:               ITEM_ID,
  user_id:          WISHER_ID,
  title:            'Cozy Weighted Blanket',
  price:            49.99,
  currency:         'USD',
  image_url:        'https://cdn.example.com/blanket.jpg',
  is_claimed:       false,
  claimed_by:       null,
  claimed_at:       null,
  claimed_anonymous: false,
}

const NAMED_CLAIMED_ITEM: DbRow = {
  ...UNCLAIMED_ITEM,
  is_claimed:       true,
  claimed_by:       'Alice',
  claimed_at:       CLAIMED_AT,
  claimed_anonymous: false,
}

const ANON_CLAIMED_ITEM: DbRow = {
  ...UNCLAIMED_ITEM,
  is_claimed:       true,
  claimed_by:       null,
  claimed_at:       CLAIMED_AT,
  claimed_anonymous: true,
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/claim — claiming
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/claim — successful claim', () => {

  it('returns 200 and success=true when item is unclaimed', async () => {
    useSupa([{ data: NAMED_CLAIMED_ITEM, error: null }])

    const req = makeClaimReq({ itemId: ITEM_ID, claimedBy: 'Alice', anonymous: false })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.item.is_claimed).toBe(true)
  })

  it('stores claimed_by and claimed_at on a named claim', async () => {
    useSupa([{ data: NAMED_CLAIMED_ITEM, error: null }])

    const req = makeClaimReq({ itemId: ITEM_ID, claimedBy: 'Alice', anonymous: false })
    const res = await POST(req)
    const body = await res.json()

    expect(body.item.claimed_by).toBe('Alice')
    expect(body.item.claimed_at).toBe(CLAIMED_AT)
    expect(body.item.claimed_anonymous).toBe(false)
  })

  it('returns 400 missing_item_id when itemId is absent', async () => {
    useSupa([])

    const req = makeClaimReq({ claimedBy: 'Alice' })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe('missing_item_id')
  })

  it('returns 400 for empty string itemId', async () => {
    useSupa([])

    const req = makeClaimReq({ itemId: '', claimedBy: 'Alice' })
    const res = await POST(req)

    expect(res.status).toBe(400)
  })

  it('returns 404 not_found when item does not exist in DB', async () => {
    // Update matches 0 rows AND the fallback SELECT also returns null
    useSupa([
      { data: null, error: null },  // update → no row matched
      { data: null, error: null },  // fallback SELECT → item doesn't exist
    ])

    const req = makeClaimReq({ itemId: 'nonexistent-id', claimedBy: 'Bob' })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error).toBe('not_found')
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/claim — race condition
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/claim — race condition (double-claim protection)', () => {

  /**
   * Postgres guarantees that the atomic UPDATE … WHERE is_claimed = false
   * only modifies ONE row even when two requests arrive simultaneously.
   * The "losing" request sees updatedItem = null, then the fallback SELECT
   * confirms the item exists but is already claimed → 409 already_claimed.
   *
   * We simulate this by mocking the DB state the losing request observes.
   */
  it('returns 409 already_claimed when update matches 0 rows (losing race)', async () => {
    useSupa([
      { data: null,               error: null },  // update → no row updated (lost race)
      { data: NAMED_CLAIMED_ITEM, error: null },  // fallback SELECT → already claimed
    ])

    const req = makeClaimReq({ itemId: ITEM_ID, claimedBy: 'Bob', anonymous: false })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error).toBe('already_claimed')
  })

  it('winning request still returns 200', async () => {
    useSupa([{ data: NAMED_CLAIMED_ITEM, error: null }])

    const req = makeClaimReq({ itemId: ITEM_ID, claimedBy: 'Alice', anonymous: false })
    const res = await POST(req)

    expect(res.status).toBe(200)
  })

  it('concurrent simulation: exactly one winner and one loser', async () => {
    /**
     * Run two claim requests whose mocks reflect real DB race behaviour:
     * request A wins (DB update returns the item), request B loses
     * (update returns null → fallback shows already_claimed).
     *
     * We use separate mock instances to isolate the two concurrent calls.
     */
    const winnerMock = makeSupa([{ data: NAMED_CLAIMED_ITEM, error: null }])
    const loserMock  = makeSupa([
      { data: null,               error: null },
      { data: NAMED_CLAIMED_ITEM, error: null },
    ])

    const mockedCreate = jest.mocked(createServerClient)

    // Alternate mocks: first call → winner, second call → loser
    mockedCreate
      .mockReturnValueOnce(winnerMock as unknown as ReturnType<typeof createServerClient>)
      .mockReturnValueOnce(loserMock  as unknown as ReturnType<typeof createServerClient>)

    const [resA, resB] = await Promise.all([
      POST(makeClaimReq({ itemId: ITEM_ID, claimedBy: 'Alice', anonymous: false })),
      POST(makeClaimReq({ itemId: ITEM_ID, claimedBy: 'Bob',   anonymous: false })),
    ])

    const statuses = [resA.status, resB.status].sort()
    expect(statuses).toEqual([200, 409])

    const [bodyA, bodyB] = await Promise.all([resA.json(), resB.json()])
    const errors = [bodyA.error, bodyB.error].filter(Boolean)
    expect(errors).toEqual(['already_claimed'])
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/claim — anonymous claim
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/claim — anonymous claim', () => {

  it('stores claimed_anonymous=true and claimed_by=null', async () => {
    useSupa([{ data: ANON_CLAIMED_ITEM, error: null }])

    const req = makeClaimReq({ itemId: ITEM_ID, claimedBy: 'Alice', anonymous: true })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.item.claimed_anonymous).toBe(true)
    expect(body.item.claimed_by).toBeNull()
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/claim/[itemId] — unclaiming
// ─────────────────────────────────────────────────────────────────────────────

describe('DELETE /api/claim/[itemId] — unclaim', () => {

  it('returns 200 and success=true when name matches (case-insensitive)', async () => {
    useSupa([
      { data: NAMED_CLAIMED_ITEM, error: null },  // SELECT to look up item
      { data: null,               error: null },  // UPDATE to reset claim
    ])

    const req = makeUnclaimReq(ITEM_ID, { claimedBy: 'ALICE' }) // uppercase
    const res = await DELETE(req, { params: { itemId: ITEM_ID } })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
  })

  it('trims whitespace when comparing names', async () => {
    useSupa([
      { data: NAMED_CLAIMED_ITEM, error: null },
      { data: null,               error: null },
    ])

    const req = makeUnclaimReq(ITEM_ID, { claimedBy: '  Alice  ' })
    const res = await DELETE(req, { params: { itemId: ITEM_ID } })

    expect(res.status).toBe(200)
  })

  it('returns 403 name_mismatch when wrong name is supplied', async () => {
    useSupa([{ data: NAMED_CLAIMED_ITEM, error: null }])

    const req = makeUnclaimReq(ITEM_ID, { claimedBy: 'NotAlice' })
    const res = await DELETE(req, { params: { itemId: ITEM_ID } })
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.error).toBe('name_mismatch')
  })

  it('returns 403 name_mismatch for anonymous claims (no identity to verify)', async () => {
    useSupa([{ data: ANON_CLAIMED_ITEM, error: null }])

    // Even supplying a name cannot unclaim an anonymous claim
    const req = makeUnclaimReq(ITEM_ID, { claimedBy: 'Alice' })
    const res = await DELETE(req, { params: { itemId: ITEM_ID } })
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.error).toBe('name_mismatch')
  })

  it('returns 409 not_claimed when item is already unclaimed', async () => {
    useSupa([{ data: UNCLAIMED_ITEM, error: null }])

    const req = makeUnclaimReq(ITEM_ID, { claimedBy: 'Alice' })
    const res = await DELETE(req, { params: { itemId: ITEM_ID } })
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error).toBe('not_claimed')
  })

  it('returns 404 not_found for an unknown item ID', async () => {
    useSupa([{ data: null, error: null }])

    const req = makeUnclaimReq('nonexistent-id', { claimedBy: 'Alice' })
    const res = await DELETE(req, { params: { itemId: 'nonexistent-id' } })
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error).toBe('not_found')
  })

  it('returns 400 missing_fields when claimedBy is absent', async () => {
    useSupa([])

    const req = makeUnclaimReq(ITEM_ID, {})
    const res = await DELETE(req, { params: { itemId: ITEM_ID } })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe('missing_fields')
  })

  it('item returns to is_claimed=false after successful unclaim', async () => {
    /**
     * The route UPDATEs the row — we verify the right Supabase calls are made.
     * The "transition to false" is expressed by the fact that the UPDATE
     * is called with { is_claimed: false, claimed_by: null, … }.
     *
     * We inspect the mock's update call to confirm the payload.
     */
    const supa = makeSupa([
      { data: NAMED_CLAIMED_ITEM, error: null },
      { data: null,               error: null },
    ])
    jest.mocked(createServerClient).mockReturnValue(
      supa as unknown as ReturnType<typeof createServerClient>,
    )

    const req = makeUnclaimReq(ITEM_ID, { claimedBy: 'Alice' })
    await DELETE(req, { params: { itemId: ITEM_ID } })

    // The second from() call should be an update — find the update mock
    const secondChain = (supa.from.mock.results[1].value) as Record<string, jest.Mock>
    const updateCall  = secondChain.update.mock.calls[0][0] as Record<string, unknown>

    expect(updateCall.is_claimed).toBe(false)
    expect(updateCall.claimed_by).toBeNull()
    expect(updateCall.claimed_at).toBeNull()
    expect(updateCall.claimed_anonymous).toBe(false)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/claims/[username] — coordination panel endpoint
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/claims/[username] — coordination panel', () => {

  it('returns 200 with correctly shaped ClaimedItemDTO array', async () => {
    useSupa([
      { data: { id: WISHER_ID }, error: null },           // users lookup
      {
        data: [
          {
            id:               ITEM_ID,
            title:            'Cozy Weighted Blanket',
            image_url:        'https://cdn.example.com/blanket.jpg',
            claimed_by:       'Alice',
            claimed_anonymous: false,
            claimed_at:       CLAIMED_AT,
          },
        ],
        error: null,
      },
    ])

    const req = makeClaimsReq('alice-wishlist')
    const res = await GET(req, { params: { username: 'alice-wishlist' } })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(Array.isArray(body.items)).toBe(true)
    expect(body.items).toHaveLength(1)

    const item = body.items[0]
    expect(item.itemId).toBe(ITEM_ID)
    expect(item.title).toBe('Cozy Weighted Blanket')
    expect(item.imageUrl).toBe('https://cdn.example.com/blanket.jpg')
    expect(item.claimedBy).toBe('Alice')
    expect(item.claimedAt).toBe(CLAIMED_AT)
  })

  it('masks anonymous claims as "Someone"', async () => {
    useSupa([
      { data: { id: WISHER_ID }, error: null },
      {
        data: [
          {
            id:                ITEM_ID,
            title:             'Mystery Gift',
            image_url:         null,
            claimed_by:        null,          // ← no name stored
            claimed_anonymous: true,          // ← anonymous flag set
            claimed_at:        CLAIMED_AT,
          },
        ],
        error: null,
      },
    ])

    const req = makeClaimsReq('alice-wishlist')
    const res = await GET(req, { params: { username: 'alice-wishlist' } })
    const body = await res.json()

    expect(body.items[0].claimedBy).toBe('Someone')
  })

  it('masks null claimed_by (non-anonymous) as "Someone"', async () => {
    /**
     * Edge case: claimed_anonymous=false but claimed_by was null.
     * The public endpoint should still show "Someone" rather than exposing null.
     */
    useSupa([
      { data: { id: WISHER_ID }, error: null },
      {
        data: [
          {
            id:                ITEM_ID,
            title:             'Surprise Item',
            image_url:         null,
            claimed_by:        null,
            claimed_anonymous: false,  // ← not flagged anonymous but name is missing
            claimed_at:        CLAIMED_AT,
          },
        ],
        error: null,
      },
    ])

    const req = makeClaimsReq('alice-wishlist')
    const res = await GET(req, { params: { username: 'alice-wishlist' } })
    const body = await res.json()

    expect(body.items[0].claimedBy).toBe('Someone')
  })

  it('returns named claimant when claim is not anonymous', async () => {
    useSupa([
      { data: { id: WISHER_ID }, error: null },
      {
        data: [
          {
            id:                ITEM_ID,
            title:             'Named Claim',
            image_url:         null,
            claimed_by:        'Bob',
            claimed_anonymous: false,
            claimed_at:        CLAIMED_AT,
          },
        ],
        error: null,
      },
    ])

    const req = makeClaimsReq('alice-wishlist')
    const res = await GET(req, { params: { username: 'alice-wishlist' } })
    const body = await res.json()

    expect(body.items[0].claimedBy).toBe('Bob')
  })

  it('returns empty items array when no items have been claimed', async () => {
    useSupa([
      { data: { id: WISHER_ID }, error: null },
      { data: [],                error: null },
    ])

    const req = makeClaimsReq('alice-wishlist')
    const res = await GET(req, { params: { username: 'alice-wishlist' } })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.items).toHaveLength(0)
  })

  it('returns 404 user_not_found for an unknown username', async () => {
    useSupa([{ data: null, error: null }]) // users lookup returns nothing

    const req = makeClaimsReq('nobody')
    const res = await GET(req, { params: { username: 'nobody' } })
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error).toBe('user_not_found')
  })

  it('propagates multiple claimed items in response order', async () => {
    const item2Id = 'item-uuid-cccccc'
    const earlier = '2025-11-01T08:00:00.000Z'

    useSupa([
      { data: { id: WISHER_ID }, error: null },
      {
        data: [
          // DB already orders by claimed_at DESC; mock reflects that
          { id: ITEM_ID, title: 'Newer',  image_url: null, claimed_by: 'Alice', claimed_anonymous: false, claimed_at: CLAIMED_AT },
          { id: item2Id, title: 'Older',  image_url: null, claimed_by: 'Bob',   claimed_anonymous: false, claimed_at: earlier    },
        ],
        error: null,
      },
    ])

    const req = makeClaimsReq('alice-wishlist')
    const res = await GET(req, { params: { username: 'alice-wishlist' } })
    const body = await res.json()

    expect(body.items).toHaveLength(2)
    expect(body.items[0].title).toBe('Newer')
    expect(body.items[1].title).toBe('Older')
  })

})
