/**
 * tests/unsubscribe.test.ts — GiftHint
 *
 * Unit tests for GET /app/unsubscribe/route.ts
 *
 * Coverage:
 *   Token validation
 *     - Missing token → 404 HTML expired-link page
 *     - Empty / whitespace token → 404
 *     - Token not found in DB → 404
 *
 *   Happy path
 *     - Valid token → 200 HTML confirmation page
 *     - Response Content-Type is text/html
 *     - Response body mentions "unsubscribed" (user-facing confirmation)
 *     - RPC rotate_unsubscribe_token called with the correct user ID
 *
 *   Token rotation
 *     - When RPC errors, falls back to direct UPDATE with new UUID token
 *     - Fallback UPDATE sets email_digest_enabled=false
 *     - Fallback UPDATE rotates the token (new value, not the original)
 *
 *   DB update failure
 *     - If both RPC and fallback UPDATE fail → 500 HTML error page
 *     - Response body does not contain "unsubscribed" on error
 *
 *   Already-used token
 *     - Token not in DB (already rotated) → 404 expired-link page
 *
 * Mock strategy:
 *   createServerClient() is replaced with a chainable mock extended with
 *   .rpc() support. The unsubscribe handler calls:
 *     1. supabase.from('users').select(...).eq('unsubscribe_token', token).single()
 *     2. supabase.rpc('rotate_unsubscribe_token', { p_user_id })
 *        OR (on RPC failure):
 *        supabase.from('users').update({...}).eq('id', userId)
 *
 * crypto.randomUUID is mocked to return a stable replacement token so we
 * can assert the fallback UPDATE uses a new value.
 */

jest.mock('@/lib/supabase-server', () => ({
  createServerClient: jest.fn(),
}))

import { NextRequest }        from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { GET }                from '@/app/unsubscribe/route'

// ─────────────────────────────────────────────────────────────────────────────
// Chainable Supabase mock (with .rpc() support)
// ─────────────────────────────────────────────────────────────────────────────

type DbRow    = Record<string, unknown>
type DbResult = { data: DbRow | DbRow[] | null; error: { message: string; code?: string } | null }

interface SupaMock {
  from: jest.Mock
  rpc:  jest.Mock
}

function makeSupa(
  fromSequence: DbResult[],
  rpcResult:    DbResult = { data: null, error: null },
): SupaMock {
  let idx = 0

  function makeChain(result: DbResult) {
    const c: Record<string, unknown> = {}
    for (const m of [
      'select', 'update', 'insert', 'upsert',
      'eq', 'neq', 'is', 'not', 'in', 'order', 'limit',
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
    rpc: jest.fn().mockResolvedValue(rpcResult),
  }
}

function useSupa(fromSeq: DbResult[], rpcResult?: DbResult): SupaMock {
  const mock = makeSupa(fromSeq, rpcResult)
  jest.mocked(createServerClient).mockReturnValue(
    mock as unknown as ReturnType<typeof createServerClient>,
  )
  return mock
}

// ─────────────────────────────────────────────────────────────────────────────
// Request factory
// ─────────────────────────────────────────────────────────────────────────────

function makeReq(token?: string): NextRequest {
  const url = token !== undefined
    ? `http://localhost/unsubscribe?token=${encodeURIComponent(token)}`
    : 'http://localhost/unsubscribe'
  return new NextRequest(url)
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const VALID_TOKEN = 'abc123-valid-token-xyz'
const USER_ID     = 'user-uuid-9999'
const USER_ROW: DbRow = { id: USER_ID, email_digest_enabled: true }

// ─────────────────────────────────────────────────────────────────────────────
// Silence expected console.error calls
// ─────────────────────────────────────────────────────────────────────────────

beforeAll(() => jest.spyOn(console, 'error').mockImplementation(() => {}))
afterAll(()  => jest.restoreAllMocks())

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = 'https://gifthint.io'
})
afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL
})

// ─────────────────────────────────────────────────────────────────────────────
// Token validation
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /unsubscribe — token validation', () => {
  it('returns 404 HTML when no token query param is provided', async () => {
    useSupa([])
    const res = await GET(makeReq())
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toMatch(/text\/html/)
  })

  it('returns 404 when token is an empty string', async () => {
    useSupa([])
    const res = await GET(makeReq(''))
    expect(res.status).toBe(404)
  })

  it('returns 404 when token is only whitespace', async () => {
    useSupa([])
    const res = await GET(makeReq('   '))
    expect(res.status).toBe(404)
  })

  it('returns 404 when the token does not match any user', async () => {
    useSupa([
      { data: null, error: null },   // .single() returns null — token not found
    ])
    const res = await GET(makeReq('unknown-token'))
    expect(res.status).toBe(404)
  })

  it('returns 404 when the DB lookup errors', async () => {
    useSupa([
      { data: null, error: { message: 'connection refused' } },
    ])
    const res = await GET(makeReq(VALID_TOKEN))
    expect(res.status).toBe(404)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Happy path — RPC succeeds
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /unsubscribe — happy path (RPC succeeds)', () => {
  it('returns 200 for a valid token', async () => {
    useSupa(
      [{ data: USER_ROW, error: null }],
      { data: null, error: null },   // RPC success
    )
    const res = await GET(makeReq(VALID_TOKEN))
    expect(res.status).toBe(200)
  })

  it('response Content-Type is text/html', async () => {
    useSupa(
      [{ data: USER_ROW, error: null }],
      { data: null, error: null },
    )
    const res = await GET(makeReq(VALID_TOKEN))
    expect(res.headers.get('content-type')).toMatch(/text\/html/)
  })

  it('response body contains "unsubscribed" confirmation text', async () => {
    useSupa(
      [{ data: USER_ROW, error: null }],
      { data: null, error: null },
    )
    const res  = await GET(makeReq(VALID_TOKEN))
    const html = await res.text()
    expect(html.toLowerCase()).toContain('unsubscribed')
  })

  it('calls the rotate_unsubscribe_token RPC with the correct user ID', async () => {
    const supa = useSupa(
      [{ data: USER_ROW, error: null }],
      { data: null, error: null },
    )
    await GET(makeReq(VALID_TOKEN))
    expect(supa.rpc).toHaveBeenCalledWith('rotate_unsubscribe_token', { p_user_id: USER_ID })
  })

  it('response page contains a dashboard link for re-subscribing', async () => {
    useSupa(
      [{ data: USER_ROW, error: null }],
      { data: null, error: null },
    )
    const html = await (await GET(makeReq(VALID_TOKEN))).text()
    expect(html).toContain('/dashboard')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Token rotation fallback — RPC unavailable
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /unsubscribe — fallback UPDATE when RPC errors', () => {
  const REPLACEMENT_TOKEN = 'new-rotated-uuid-0000'

  beforeEach(() => {
    jest.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      REPLACEMENT_TOKEN as ReturnType<typeof crypto.randomUUID>,
    )
  })
  afterEach(() => {
    jest.spyOn(globalThis.crypto, 'randomUUID').mockRestore()
  })

  it('returns 200 even when the RPC fails (falls back to direct UPDATE)', async () => {
    useSupa(
      [
        { data: USER_ROW, error: null },   // token lookup
        { data: null,     error: null },   // fallback UPDATE succeeds
      ],
      { data: null, error: { message: 'function not found' } },   // RPC error
    )
    const res = await GET(makeReq(VALID_TOKEN))
    expect(res.status).toBe(200)
  })

  it('fallback UPDATE sets email_digest_enabled=false', async () => {
    const supa = useSupa(
      [
        { data: USER_ROW, error: null },
        { data: null,     error: null },
      ],
      { data: null, error: { message: 'rpc error' } },
    )

    await GET(makeReq(VALID_TOKEN))

    // The second from() call is the fallback UPDATE
    const updateChain = supa.from.mock.results[1]?.value as Record<string, jest.Mock>
    const updatePayload = updateChain?.update?.mock.calls[0]?.[0] as Record<string, unknown>
    expect(updatePayload?.email_digest_enabled).toBe(false)
  })

  it('fallback UPDATE rotates the token to a new UUID', async () => {
    const supa = useSupa(
      [
        { data: USER_ROW, error: null },
        { data: null,     error: null },
      ],
      { data: null, error: { message: 'rpc error' } },
    )

    await GET(makeReq(VALID_TOKEN))

    const updateChain   = supa.from.mock.results[1]?.value as Record<string, jest.Mock>
    const updatePayload = updateChain?.update?.mock.calls[0]?.[0] as Record<string, unknown>
    // The new token is the mocked UUID, NOT the original VALID_TOKEN
    expect(updatePayload?.unsubscribe_token).toBe(REPLACEMENT_TOKEN)
    expect(updatePayload?.unsubscribe_token).not.toBe(VALID_TOKEN)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// DB update failure — both RPC and fallback fail
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /unsubscribe — DB update failure', () => {
  it('returns 500 HTML error page when both RPC and fallback UPDATE fail', async () => {
    useSupa(
      [
        { data: USER_ROW, error: null },
        { data: null,     error: { message: 'write failed' } },   // fallback UPDATE also fails
      ],
      { data: null, error: { message: 'rpc not found' } },
    )

    const res = await GET(makeReq(VALID_TOKEN))
    expect(res.status).toBe(500)
    expect(res.headers.get('content-type')).toMatch(/text\/html/)
  })

  it('error page does not contain "unsubscribed" confirmation', async () => {
    useSupa(
      [
        { data: USER_ROW, error: null },
        { data: null,     error: { message: 'write failed' } },
      ],
      { data: null, error: { message: 'rpc not found' } },
    )

    const html = await (await GET(makeReq(VALID_TOKEN))).text()
    expect(html.toLowerCase()).not.toContain("you've been unsubscribed")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Already-used token (replay prevention)
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /unsubscribe — already-used token', () => {
  it('returns 404 when the token has already been rotated (not found in DB)', async () => {
    // After a successful unsubscribe the old token is rotated out of the DB.
    // A second click of the same link finds nothing → expired-link page.
    useSupa([
      { data: null, error: null },   // .single() → no match
    ])

    const res = await GET(makeReq('previously-valid-now-rotated'))
    expect(res.status).toBe(404)
    const html = await res.text()
    expect(html.toLowerCase()).toContain('expired')
  })
})
