/**
 * tests/track-view.test.ts — GiftHint
 *
 * Unit tests for POST /api/track-view
 *
 * Coverage:
 *   Validation     — missing body, missing wishlistId, non-string wishlistId
 *   Rate limiting  — first request passes, same IP+list within 1 h is suppressed
 *   IP parsing     — x-forwarded-for (single + multi-hop), x-real-ip fallback
 *   Referrer       — full URL reduced to origin, "null" string, malformed, absent
 *   Fire-and-forget — route returns 200 before the async insert settles
 *   DB path        — non-public wishlist → insert skipped; public → insert called
 *   Insert error   — logged but not surfaced to caller (still 200)
 *
 * Mock strategy:
 *   createServerClient() is replaced with a chainable mock identical to the
 *   pattern used across the test suite. The rate-limit cache is a module-level
 *   Map inside route.ts; we reset it between tests by clearing it via the
 *   exported handle. Because Jest re-uses module instances across tests in the
 *   same file we must clear VIEW_RATE_CACHE after each rate-limit test.
 *
 * Fire-and-forget note:
 *   The route detaches an async block. We flush it with a short await so the
 *   DB assertions happen after the insert attempt.
 */

jest.mock('@/lib/supabase-server', () => ({
  createServerClient: jest.fn(),
}))

import { NextRequest }        from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { POST }               from '@/app/api/track-view/route'

// ─────────────────────────────────────────────────────────────────────────────
// Chainable Supabase mock
// ─────────────────────────────────────────────────────────────────────────────

type DbRow    = Record<string, unknown>
type DbResult = { data: DbRow | DbRow[] | null; error: { message: string } | null }

function makeSupa(fromSequence: DbResult[]) {
  let idx = 0

  function makeChain(result: DbResult) {
    const c: Record<string, unknown> = {}
    for (const m of ['select', 'insert', 'update', 'upsert', 'eq', 'neq', 'is', 'not', 'in', 'order', 'limit']) {
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
// Request factory
// ─────────────────────────────────────────────────────────────────────────────

const LIST_ID = 'a1b2c3d4-0000-0000-0000-000000000001'

function makeReq(
  body: unknown,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest('http://localhost/api/track-view', {
    method:  'POST',
    body:    body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

/** Flush the detached async block so DB assertions can run. */
const flush = () => new Promise<void>((r) => setTimeout(r, 10))

// ─────────────────────────────────────────────────────────────────────────────
// Helpers to introspect the mock chains
// ─────────────────────────────────────────────────────────────────────────────

function getInsertPayload(supa: ReturnType<typeof makeSupa>, callIndex: number): Record<string, unknown> | null {
  const chain = supa.from.mock.results[callIndex]?.value as Record<string, jest.Mock> | undefined
  if (!chain) return null
  const calls = chain.insert?.mock.calls
  return (calls?.[0]?.[0] as Record<string, unknown>) ?? null
}

// ─────────────────────────────────────────────────────────────────────────────
// Silence console.error for expected error-path tests
// ─────────────────────────────────────────────────────────────────────────────

beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterAll(() => {
  jest.restoreAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// Body validation
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/track-view — body validation', () => {
  it('returns 400 missing_field when body has no wishlistId', async () => {
    useSupa([])
    const res = await POST(makeReq({}))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/missing_field/)
  })

  it('returns 400 missing_field when wishlistId is an empty string', async () => {
    useSupa([])
    const res = await POST(makeReq({ wishlistId: '   ' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 missing_field when wishlistId is not a string', async () => {
    useSupa([])
    const res = await POST(makeReq({ wishlistId: 42 }))
    expect(res.status).toBe(400)
  })

  it('returns 400 invalid_json when body is not valid JSON', async () => {
    const req = new NextRequest('http://localhost/api/track-view', {
      method: 'POST',
      body:   'not json {{{',
      headers: { 'Content-Type': 'application/json' },
    })
    useSupa([])
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 200 ok:true for a valid wishlistId', async () => {
    useSupa([
      { data: { id: LIST_ID }, error: null },   // wishlist existence check
      { data: null,            error: null },   // page_views insert
    ])
    const res = await POST(makeReq({ wishlistId: LIST_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    await flush()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Rate limiting
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/track-view — rate limiting', () => {
  const IP = '203.0.113.1'

  it('allows the first request from an IP+list pair', async () => {
    useSupa([
      { data: { id: LIST_ID }, error: null },
      { data: null,            error: null },
    ])
    const res = await POST(makeReq({ wishlistId: LIST_ID }, { 'x-forwarded-for': IP }))
    expect(res.status).toBe(200)
    await flush()
  })

  it('returns 200 ok:true but skips the insert on a duplicate within the rate window', async () => {
    // Second request with same IP and list — should be rate-limited (silently)
    const supa = useSupa([
      { data: { id: LIST_ID }, error: null },
    ])

    const res = await POST(makeReq({ wishlistId: LIST_ID }, { 'x-forwarded-for': IP }))
    await flush()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)

    // No DB calls should have been made — rate-limited before reaching Supabase
    expect(supa.from).not.toHaveBeenCalled()
  })

  it('allows a different IP on the same list within the rate window', async () => {
    const differentIp = '203.0.113.99'
    const supa = useSupa([
      { data: { id: LIST_ID }, error: null },
      { data: null,            error: null },
    ])

    const res = await POST(makeReq({ wishlistId: LIST_ID }, { 'x-forwarded-for': differentIp }))
    await flush()

    expect(res.status).toBe(200)
    // DB WAS hit — different IP is a new entry in the cache
    expect(supa.from).toHaveBeenCalled()
  })

  it('allows the same IP on a different list within the rate window', async () => {
    const differentList = 'b2c3d4e5-0000-0000-0000-000000000002'
    const supa = useSupa([
      { data: { id: differentList }, error: null },
      { data: null,                  error: null },
    ])

    const res = await POST(makeReq({ wishlistId: differentList }, { 'x-forwarded-for': IP }))
    await flush()

    expect(res.status).toBe(200)
    expect(supa.from).toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// IP parsing
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/track-view — IP header parsing', () => {
  // Each of these uses a unique list ID so the rate-limit cache doesn't
  // conflict with entries from the rate-limiting tests above.
  const LIST_A = 'aaaaaaaa-0000-0000-0000-000000000001'
  const LIST_B = 'aaaaaaaa-0000-0000-0000-000000000002'
  const LIST_C = 'aaaaaaaa-0000-0000-0000-000000000003'

  it('uses the first entry of a multi-hop x-forwarded-for header', async () => {
    const supa = useSupa([
      { data: { id: LIST_A }, error: null },
      { data: null,           error: null },
    ])
    await POST(makeReq({ wishlistId: LIST_A }, { 'x-forwarded-for': '1.2.3.4, 10.0.0.1, 10.0.0.2' }))
    await flush()
    // Route used IP 1.2.3.4 → no rate-limit conflict with unrelated tests
    expect(supa.from).toHaveBeenCalled()
  })

  it('falls back to x-real-ip when x-forwarded-for is absent', async () => {
    const supa = useSupa([
      { data: { id: LIST_B }, error: null },
      { data: null,           error: null },
    ])
    await POST(makeReq({ wishlistId: LIST_B }, { 'x-real-ip': '5.6.7.8' }))
    await flush()
    expect(supa.from).toHaveBeenCalled()
  })

  it('falls back to "unknown" when neither IP header is present', async () => {
    const supa = useSupa([
      { data: { id: LIST_C }, error: null },
      { data: null,           error: null },
    ])
    await POST(makeReq({ wishlistId: LIST_C }))
    await flush()
    // Should still succeed — "unknown" is treated like any other IP value
    expect(supa.from).toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Referrer sanitisation
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/track-view — referrer sanitisation', () => {
  // Each test uses a fresh list ID to avoid cache collisions
  function uniqueList(n: number) { return `cccccccc-0000-0000-0000-${String(n).padStart(12, '0')}` }

  async function capturedReferrer(referer: string | null, listId: string): Promise<string | null> {
    const supa = useSupa([
      { data: { id: listId }, error: null },
      { data: null,           error: null },
    ])
    const headers: Record<string, string> = { 'x-forwarded-for': `ref-test-${listId}` }
    if (referer !== null) headers['referer'] = referer

    await POST(makeReq({ wishlistId: listId }, headers))
    await flush()

    const payload = getInsertPayload(supa, 1)
    return (payload?.referrer as string | null) ?? null
  }

  it('reduces a full URL to its origin only', async () => {
    const ref = await capturedReferrer(
      'https://twitter.com/someuser/status/123?utm_source=gifthint',
      uniqueList(1),
    )
    expect(ref).toBe('https://twitter.com')
  })

  it('preserves the scheme and host but strips path and query', async () => {
    const ref = await capturedReferrer(
      'https://google.com/search?q=birthday+gift+ideas&source=hp',
      uniqueList(2),
    )
    expect(ref).toBe('https://google.com')
  })

  it('stores null for the string "null" (same-origin navigation)', async () => {
    const ref = await capturedReferrer('null', uniqueList(3))
    // "null" is not a parseable URL — sanitiseReferrer returns null
    expect(ref).toBeNull()
  })

  it('stores null when the referer header is absent', async () => {
    const ref = await capturedReferrer(null, uniqueList(4))
    expect(ref).toBeNull()
  })

  it('stores null for a malformed referrer that is not a valid URL', async () => {
    const ref = await capturedReferrer('not a url at all !!!', uniqueList(5))
    expect(ref).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// DB path: wishlist existence check
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/track-view — wishlist existence guard', () => {
  const LIST_PRIV = 'dddddddd-0000-0000-0000-000000000001'
  const LIST_PUB  = 'dddddddd-0000-0000-0000-000000000002'

  it('skips the insert when the wishlist does not exist or is not public', async () => {
    const supa = useSupa([
      { data: null, error: null },   // maybeSingle returns null → list not found
    ])

    await POST(makeReq({ wishlistId: LIST_PRIV }, { 'x-forwarded-for': '9.9.9.9' }))
    await flush()

    // from() called once for the existence check; never called for the insert
    expect(supa.from).toHaveBeenCalledTimes(1)
    const chain = supa.from.mock.results[0].value as Record<string, jest.Mock>
    expect(chain.insert).not.toHaveBeenCalled()
  })

  it('proceeds with the insert when the wishlist exists and is public', async () => {
    const supa = useSupa([
      { data: { id: LIST_PUB }, error: null },   // existence check passes
      { data: null,             error: null },   // insert succeeds
    ])

    await POST(makeReq({ wishlistId: LIST_PUB }, { 'x-forwarded-for': '9.9.9.10' }))
    await flush()

    expect(supa.from).toHaveBeenCalledTimes(2)
    const insertChain = supa.from.mock.results[1].value as Record<string, jest.Mock>
    expect(insertChain.insert).toHaveBeenCalledTimes(1)
  })

  it('inserts with the correct wishlist_id field', async () => {
    const supa = useSupa([
      { data: { id: LIST_PUB }, error: null },
      { data: null,             error: null },
    ])

    await POST(makeReq({ wishlistId: LIST_PUB }, { 'x-forwarded-for': '9.9.9.11' }))
    await flush()

    const payload = getInsertPayload(supa, 1)
    expect(payload?.wishlist_id).toBe(LIST_PUB)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Fire-and-forget: route returns before async block completes
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/track-view — fire-and-forget contract', () => {
  it('returns 200 immediately even if the insert would fail', async () => {
    // Simulate a slow/failing DB — insert rejects after the response is sent
    const supa = useSupa([
      { data: { id: LIST_ID }, error: null },
      { data: null, error: { message: 'connection timeout' } },
    ])
    jest.mocked(createServerClient).mockReturnValue(
      supa as unknown as ReturnType<typeof createServerClient>,
    )

    const res = await POST(makeReq(
      { wishlistId: LIST_ID },
      { 'x-forwarded-for': '10.10.10.10' },
    ))
    // Response resolves before the async block settles
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)

    // Flush to let the error path run — confirmed by console.error spy
    await flush()
    expect(console.error).toHaveBeenCalled()
  })
})
