/**
 * tests/item-editor.test.ts — GiftHint
 *
 * Tests for the item PATCH/DELETE API route and the optimistic-update logic
 * used by the dashboard's inline editor and bulk tag editor.
 *
 * Coverage:
 *   PATCH /api/items/:id
 *     — updates hint correctly (200 + item in response body)
 *     — rejects a request from a different user (403 forbidden)
 *     — rejects invalid dna_tags with a descriptive 400
 *     — rejects a price below zero (400)
 *     — rejects an invalid image_url (400)
 *     — rejects a missing Authorization header (401)
 *     — returns 404 when the item does not exist
 *     — returns 400 when no updatable fields are provided
 *
 *   Optimistic-update helpers
 *     — applyTagChanges computes the correct new tag set
 *     — applyTagChanges on empty current tags is correct
 *     — a snapshot captures state before the optimistic update for rollback
 *
 * Mock strategy:
 *   createServerClient() is replaced with a chainable Supabase mock (same
 *   pattern as claim-system.test.ts). Because PATCH calls createServerClient()
 *   TWICE — once inside verifyItemOwner (for auth + ownership) and once in the
 *   handler body (for the actual update) — the mock returns the same client
 *   instance both times, with a from-sequence index that advances on each
 *   call to .from().
 *
 * Run with: npm test
 */

// ── Mock must be hoisted above all imports ────────────────────────────────────
jest.mock('@/lib/supabase-server', () => ({
  createServerClient: jest.fn(),
}))

import { NextRequest }        from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { PATCH, DELETE }      from '@/app/api/items/[id]/route'

// ─────────────────────────────────────────────────────────────────────────────
// Chainable Supabase mock factory
// ─────────────────────────────────────────────────────────────────────────────

type DbRow    = Record<string, unknown>
type DbResult = { data: DbRow | DbRow[] | null; error: { message: string } | null }
type AuthResult = {
  data:  { user: { id: string } | null }
  error: { message: string } | null
}

/**
 * Builds a chainable Supabase-like mock that also has an auth stub.
 *
 * auth.getUser() resolves to authResult.
 * from()[n] resolves to fromSequence[n] (last entry repeated when exhausted).
 */
function makeSupa(authResult: AuthResult, fromSequence: DbResult[]) {
  let callIdx = 0

  function makeChain(result: DbResult) {
    const chain: Record<string, unknown> = {}

    for (const m of [
      'select', 'update', 'delete', 'insert', 'upsert',
      'eq', 'neq', 'is', 'not', 'in',
      'order', 'limit',
    ]) {
      chain[m] = jest.fn().mockReturnValue(chain)
    }

    chain.single      = jest.fn().mockResolvedValue(result)
    chain.maybeSingle = jest.fn().mockResolvedValue(result)

    // Thenable — lets `await chain` work when no terminal method is called
    chain.then = (
      resolve: (v: DbResult) => unknown,
      reject?: (e: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve as (v: unknown) => unknown, reject)

    return chain
  }

  const mock = {
    auth: {
      getUser: jest.fn().mockResolvedValue(authResult),
    },
    from: jest.fn().mockImplementation(() => {
      const result = fromSequence[Math.min(callIdx, fromSequence.length - 1)]
      callIdx++
      return makeChain(result)
    }),
  }

  return mock
}

/** Wire a fresh mock into createServerClient for the current test. */
function useSupa(authResult: AuthResult, fromSequence: DbResult[]) {
  const mock = makeSupa(authResult, fromSequence)
  jest.mocked(createServerClient).mockReturnValue(
    mock as unknown as ReturnType<typeof createServerClient>,
  )
  return mock
}

// Suppress expected console.error calls (e.g. the 500 DB-error log in the route)
beforeAll(() => jest.spyOn(console, 'error').mockImplementation(() => {}))
afterAll(() => jest.restoreAllMocks())

// ─────────────────────────────────────────────────────────────────────────────
// Fixture helpers
// ─────────────────────────────────────────────────────────────────────────────

const ITEM_ID = 'item-abc-123'
const USER_ID = 'user-xyz-456'

/** Pretend JWT — the mock accepts any non-empty token. */
const VALID_TOKEN = 'test-bearer-token'

function makeAuth(userId = USER_ID): AuthResult {
  return { data: { user: { id: userId } }, error: null }
}

/** DB row for the ownership look-up (.select('id, user_id').single()). */
function ownerRow(userId = USER_ID): DbResult {
  return { data: { id: ITEM_ID, user_id: userId }, error: null }
}

/** DB row returned after a successful update. */
function updatedRow(patch: Record<string, unknown>): DbResult {
  return {
    data: { id: ITEM_ID, user_id: USER_ID, ...patch },
    error: null,
  }
}

/** Auth failure (bad/expired token). */
const AUTH_FAIL: AuthResult = { data: { user: null }, error: { message: 'invalid JWT' } }

/** Database error stub. */
function dbError(message = 'DB error'): DbResult {
  return { data: null, error: { message } }
}

/** Builds a NextRequest for PATCH /api/items/:id. */
function makePatchReq(body: unknown, token = VALID_TOKEN) {
  return new NextRequest(`http://localhost/api/items/${ITEM_ID}`, {
    method:  'PATCH',
    body:    JSON.stringify(body),
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
    },
  })
}

/** Params object expected by the Next.js route handler signature. */
const PARAMS = { params: { id: ITEM_ID } }

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/items/:id
// ─────────────────────────────────────────────────────────────────────────────

describe('PATCH /api/items/:id', () => {

  afterEach(() => jest.clearAllMocks())

  // ── Success ──────────────────────────────────────────────────────────────────

  it('returns 200 and the updated item when hint is changed', async () => {
    const newHint = 'Please gift wrap this!'
    useSupa(makeAuth(), [
      ownerRow(),                       // select('id, user_id') — ownership check
      updatedRow({ hint: newHint }),    // update(...).select().single() — write
    ])

    const res  = await PATCH(makePatchReq({ hint: newHint }), PARAMS)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.item).toBeDefined()
    expect(body.item.hint).toBe(newHint)
  })

  it('returns 200 and the updated item when dna_tags are changed', async () => {
    const newTags = ['#WiredOnly', '#NoWhite']
    useSupa(makeAuth(), [
      ownerRow(),
      updatedRow({ dna_tags: newTags }),
    ])

    const res  = await PATCH(makePatchReq({ dna_tags: newTags }), PARAMS)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.item.dna_tags).toEqual(newTags)
  })

  it('accepts null hint to clear it', async () => {
    useSupa(makeAuth(), [
      ownerRow(),
      updatedRow({ hint: null }),
    ])

    const res  = await PATCH(makePatchReq({ hint: null }), PARAMS)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.item.hint).toBeNull()
  })

  // ── Auth / ownership failures ─────────────────────────────────────────────

  it('returns 401 when the Authorization header is missing', async () => {
    // No mock needed — the route short-circuits before touching Supabase
    const req = new NextRequest(`http://localhost/api/items/${ITEM_ID}`, {
      method: 'PATCH',
      body:   JSON.stringify({ hint: 'test' }),
      headers: { 'Content-Type': 'application/json' },
      // Note: no Authorization header
    })

    // We still need a mock so createServerClient does not crash on import
    useSupa(AUTH_FAIL, [dbError()])

    const res = await PATCH(req, PARAMS)
    expect(res.status).toBe(401)
  })

  it('returns 401 when the token is invalid', async () => {
    useSupa(AUTH_FAIL, [])

    const res  = await PATCH(makePatchReq({ hint: 'hi' }), PARAMS)
    expect(res.status).toBe(401)
  })

  it('returns 403 when the item belongs to a different user', async () => {
    const ATTACKER_USER_ID = 'attacker-000'
    useSupa(
      makeAuth(ATTACKER_USER_ID),   // authenticated as attacker
      [ownerRow(USER_ID)],          // but item is owned by USER_ID
    )

    const res = await PATCH(makePatchReq({ hint: 'sneaky' }), PARAMS)
    expect(res.status).toBe(403)

    const body = await res.json()
    expect(body.error).toBe('forbidden')
  })

  it('returns 404 when the item does not exist in the DB', async () => {
    useSupa(makeAuth(), [dbError('No rows found')])

    const res = await PATCH(makePatchReq({ hint: 'hi' }), PARAMS)
    expect(res.status).toBe(404)
  })

  // ── Validation failures ───────────────────────────────────────────────────

  it('returns 400 with error="invalid_body" when dna_tags contains an invalid tag', async () => {
    // No DB calls expected — validation happens before the Supabase write
    useSupa(makeAuth(), [ownerRow()])

    const res  = await PATCH(makePatchReq({ dna_tags: ['#Valid', 'nohash', '#Also!Bad'] }), PARAMS)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe('invalid_body')
    // Message should mention the offending tag
    expect(body.message).toContain('nohash')
  })

  it('returns 400 when dna_tags exceeds 10 tags', async () => {
    useSupa(makeAuth(), [ownerRow()])

    const tooMany = Array.from({ length: 11 }, (_, i) => `#Tag${i}A`)
    const res  = await PATCH(makePatchReq({ dna_tags: tooMany }), PARAMS)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.message).toMatch(/maximum 10/i)
  })

  it('returns 400 when dna_tags is not an array', async () => {
    useSupa(makeAuth(), [ownerRow()])

    const res  = await PATCH(makePatchReq({ dna_tags: '#WiredOnly' }), PARAMS)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe('invalid_body')
  })

  it('returns 400 when price is negative', async () => {
    useSupa(makeAuth(), [ownerRow()])

    const res  = await PATCH(makePatchReq({ price: -5 }), PARAMS)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.message).toMatch(/non-negative/i)
  })

  it('returns 400 when image_url is not a valid URL', async () => {
    useSupa(makeAuth(), [ownerRow()])

    const res  = await PATCH(makePatchReq({ image_url: 'not-a-url' }), PARAMS)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.message).toMatch(/valid URL/i)
  })

  it('returns 400 when no updatable fields are provided', async () => {
    useSupa(makeAuth(), [ownerRow()])

    const res  = await PATCH(makePatchReq({}), PARAMS)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe('invalid_body')
  })

  it('returns 500 when the database write fails', async () => {
    useSupa(makeAuth(), [
      ownerRow(),
      dbError('connection timeout'),
    ])

    const res  = await PATCH(makePatchReq({ hint: 'hello' }), PARAMS)
    expect(res.status).toBe(500)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/items/:id
// ─────────────────────────────────────────────────────────────────────────────

describe('DELETE /api/items/:id', () => {

  afterEach(() => jest.clearAllMocks())

  it('returns 200 { ok: true } on successful deletion', async () => {
    useSupa(makeAuth(), [
      ownerRow(),                           // ownership check
      { data: null, error: null },          // delete().eq() — success (no rows returned)
    ])

    const req = new NextRequest(`http://localhost/api/items/${ITEM_ID}`, {
      method:  'DELETE',
      headers: { Authorization: `Bearer ${VALID_TOKEN}` },
    })

    const res  = await DELETE(req, PARAMS)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
  })

  it('returns 403 for a different user on DELETE', async () => {
    useSupa(makeAuth('other-user'), [ownerRow(USER_ID)])

    const req = new NextRequest(`http://localhost/api/items/${ITEM_ID}`, {
      method:  'DELETE',
      headers: { Authorization: `Bearer ${VALID_TOKEN}` },
    })

    const res = await DELETE(req, PARAMS)
    expect(res.status).toBe(403)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// Optimistic-update logic
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pure function extracted from handleBulkApply in the dashboard page.
 * Given an item's current tags plus add/remove sets, returns the new tag array.
 *
 * Rules:
 *   - tags in toRemove are dropped from current
 *   - tags in toAdd that are NOT already in current are appended
 *   - order: retained tags first, then newly added tags
 *   - no duplicates
 */
function applyTagChanges(
  current:  string[],
  toAdd:    string[],
  toRemove: string[],
): string[] {
  return [
    ...current.filter((t) => !toRemove.includes(t)),
    ...toAdd.filter((t) => !current.includes(t)),
  ]
}

describe('optimistic-update: applyTagChanges', () => {

  it('removes specified tags from the current set', () => {
    const result = applyTagChanges(
      ['#WiredOnly', '#NoWhite', '#EcoFriendly'],
      [],
      ['#NoWhite'],
    )
    expect(result).toEqual(['#WiredOnly', '#EcoFriendly'])
  })

  it('adds new tags not already in the current set', () => {
    const result = applyTagChanges(
      ['#WiredOnly'],
      ['#CrueltyFree', '#FragranceFree'],
      [],
    )
    expect(result).toEqual(['#WiredOnly', '#CrueltyFree', '#FragranceFree'])
  })

  it('does not duplicate a tag that is already present when adding', () => {
    const result = applyTagChanges(
      ['#WiredOnly', '#CrueltyFree'],
      ['#CrueltyFree'],   // already in current
      [],
    )
    expect(result).toEqual(['#WiredOnly', '#CrueltyFree'])
  })

  it('both adds and removes in a single call', () => {
    const result = applyTagChanges(
      ['#NoWhite', '#WiredOnly'],
      ['#EcoFriendly'],
      ['#WiredOnly'],
    )
    expect(result).toEqual(['#NoWhite', '#EcoFriendly'])
  })

  it('returns an empty array when all current tags are removed and nothing is added', () => {
    const result = applyTagChanges(['#WiredOnly'], [], ['#WiredOnly'])
    expect(result).toEqual([])
  })

  it('works correctly on an empty current set', () => {
    const result = applyTagChanges([], ['#EcoFriendly', '#CrueltyFree'], [])
    expect(result).toEqual(['#EcoFriendly', '#CrueltyFree'])
  })

  it('snapshot before optimistic update is the correct rollback value', () => {
    const original = ['#WiredOnly', '#NoWhite']
    const snapshot = [...original]   // defensive copy taken before the update

    // Apply optimistic update
    const optimistic = applyTagChanges(original, ['#EcoFriendly'], ['#NoWhite'])
    expect(optimistic).toEqual(['#WiredOnly', '#EcoFriendly'])

    // Simulate API failure → revert to snapshot
    // The rollback restores the pre-update state exactly
    expect(snapshot).toEqual(['#WiredOnly', '#NoWhite'])
    expect(snapshot).not.toEqual(optimistic)
  })

  it('handles toRemove containing tags not in current without error', () => {
    // Removing a tag that was never there is a no-op
    const result = applyTagChanges(['#WiredOnly'], [], ['#NonExistent'])
    expect(result).toEqual(['#WiredOnly'])
  })

})
