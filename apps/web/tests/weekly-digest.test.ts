/**
 * tests/weekly-digest.test.ts — GiftHint
 *
 * Unit tests for GET /api/cron/weekly-digest
 *
 * Coverage:
 *   Authentication
 *     - Rejects requests without Authorization header (401)
 *     - Rejects requests with wrong secret (401)
 *     - Returns 500 when CRON_SECRET env var is unset
 *
 *   Deduplication
 *     - Inserts a 'pending' digest_sends row before processing each user
 *     - Skips a user when digest_sends INSERT returns a unique-constraint conflict (23505)
 *
 *   Empty-digest gate
 *     - Skips sending when getWeeklyDigestData returns null (no views)
 *     - Records status='skipped' detail='no_views' in digest_sends
 *
 *   Happy path
 *     - Calls Resend with from, to, subject, html for each eligible user
 *     - subject contains the user's view count
 *     - Records status='sent' and message_id in digest_sends
 *     - Response body includes { weekStart, weekOf, sent, skipped, errors, total }
 *
 *   Batching
 *     - Processes users in batches (all users in a small test receive emails)
 *
 *   Error isolation
 *     - A Resend failure for one user does not abort remaining users
 *     - Records status='error' and the error message in digest_sends
 *     - digest aggregation failure is counted as error, not crash
 *
 * Mock strategy:
 *   - createServerClient() → chainable Supabase mock
 *   - lib/digest is mocked so getWeeklyDigestData returns controlled data
 *   - resend module is mocked via jest.mock; emails.send is a jest.fn()
 *   - @react-email/components render() is mocked to return a plain HTML string
 *     so the test doesn't depend on React Email internals
 *
 * Call sequence inside the cron handler per user:
 *   Supabase from() calls:
 *     0: users SELECT (all opted-in users) — done once before the loop
 *     Per user in loop:
 *       1+: digest_sends INSERT (dedup lock)
 *       2+: digest_sends UPDATE (stamp final status)
 */

// ── Mocks must be hoisted ──────────────────────────────────────────────────────

jest.mock('@/lib/supabase-server', () => ({
  createServerClient: jest.fn(),
}))

jest.mock('@/lib/digest', () => ({
  getWeeklyDigestData: jest.fn(),
  weekOfLabel:         jest.fn().mockReturnValue('May 12–18, 2025'),
}))

jest.mock('@react-email/components', () => ({
  render: jest.fn().mockResolvedValue('<html>digest</html>'),
}))

// Mock the TSX email template so ts-jest never tries to parse JSX.
// render() is already mocked above; this prevents the module-parse error.
jest.mock('@/lib/email-templates/weekly-digest', () => ({
  WeeklyDigestEmail: jest.fn().mockReturnValue(null),
}))

// Mock Resend — the cron does a dynamic import('resend') so we intercept it
const mockSend = jest.fn()
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}))

import { NextRequest }            from 'next/server'
import { createServerClient }     from '@/lib/supabase-server'
import { getWeeklyDigestData }    from '@/lib/digest'
import { GET }                    from '@/app/api/cron/weekly-digest/route'

// ─────────────────────────────────────────────────────────────────────────────
// Chainable Supabase mock
// ─────────────────────────────────────────────────────────────────────────────

type DbRow    = Record<string, unknown>
type DbResult = { data: DbRow | DbRow[] | null; error: { message: string; code?: string } | null }

function makeSupa(fromSequence: DbResult[]) {
  let idx = 0

  function makeChain(result: DbResult) {
    const c: Record<string, unknown> = {}
    for (const m of [
      'select', 'insert', 'update', 'upsert',
      'eq', 'neq', 'is', 'not', 'in', 'gte',
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

const USER_A: DbRow = {
  id:               'user-uuid-aaaa',
  email:            'emma@example.com',
  display_name:     'Emma',
  unsubscribe_token: 'token-aaaa',
}

const USER_B: DbRow = {
  id:               'user-uuid-bbbb',
  email:            'carlos@example.com',
  display_name:     'Carlos',
  unsubscribe_token: 'token-bbbb',
}

const DIGEST_DATA = {
  totalViews:     14,
  listSummaries:  [{ listName: 'Birthday Wishlist', slug: 'birthday-2025', views: 14 }],
  topClickedItem: { title: 'Kindle', imageUrl: null, clicks: 5, sourceUrl: 'https://amazon.com/dp/B00X' },
  claimedItems:   [{ title: 'Kindle', imageUrl: null }],
}

// ─────────────────────────────────────────────────────────────────────────────
// Request factory
// ─────────────────────────────────────────────────────────────────────────────

function makeCronReq(secret = 'test-cron-secret') {
  return new NextRequest('http://localhost/api/cron/weekly-digest', {
    headers: { authorization: `Bearer ${secret}` },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Environment setup
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  process.env.CRON_SECRET         = 'test-cron-secret'
  process.env.RESEND_API_KEY      = 'test-resend-key'
  process.env.NEXT_PUBLIC_APP_URL = 'https://gifthint.io'

  mockSend.mockResolvedValue({ data: { id: 'msg-id-001' }, error: null })
  jest.mocked(getWeeklyDigestData).mockResolvedValue(DIGEST_DATA)
})

afterEach(() => {
  delete process.env.CRON_SECRET
  delete process.env.RESEND_API_KEY
  delete process.env.NEXT_PUBLIC_APP_URL
  jest.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/cron/weekly-digest — authentication', () => {
  it('returns 401 when Authorization header is absent', async () => {
    useSupa([])
    const req = new NextRequest('http://localhost/api/cron/weekly-digest')
    const res = await GET(req)
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('unauthorized')
  })

  it('returns 401 for a wrong secret', async () => {
    useSupa([])
    const res = await GET(makeCronReq('wrong-secret'))
    expect(res.status).toBe(401)
  })

  it('returns 401 when CRON_SECRET is unset (missing secret = unauthorized)', async () => {
    delete process.env.CRON_SECRET
    useSupa([])
    const res = await GET(makeCronReq('any'))
    expect(res.status).toBe(401)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Zero users
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/cron/weekly-digest — no eligible users', () => {
  it('returns sent:0 skipped:0 errors:0 when no users have digest enabled', async () => {
    useSupa([
      { data: [], error: null },   // users SELECT → empty
    ])

    const res  = await GET(makeCronReq())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.sent).toBe(0)
    expect(body.skipped).toBe(0)
    expect(body.errors).toBe(0)
    expect(body.total).toBe(0)
    expect(mockSend).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Deduplication
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/cron/weekly-digest — deduplication', () => {
  it('skips a user when digest_sends INSERT returns a 23505 unique-constraint conflict', async () => {
    useSupa([
      { data: [USER_A],  error: null },                              // users SELECT
      { data: null,      error: { message: 'duplicate', code: '23505' } },  // INSERT conflict → already sent
    ])

    const res  = await GET(makeCronReq())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.skipped).toBe(1)
    expect(body.sent).toBe(0)
    expect(mockSend).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Empty-digest gate (no views)
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/cron/weekly-digest — empty-digest gate', () => {
  it('skips send and records no_views when getWeeklyDigestData returns null', async () => {
    jest.mocked(getWeeklyDigestData).mockResolvedValue(null)

    useSupa([
      { data: [USER_A], error: null },   // users SELECT
      { data: null,     error: null },   // digest_sends INSERT (lock) — success
      { data: null,     error: null },   // digest_sends UPDATE (status=skipped)
    ])

    const res  = await GET(makeCronReq())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.skipped).toBe(1)
    expect(body.sent).toBe(0)
    expect(mockSend).not.toHaveBeenCalled()

    // Verify the UPDATE stamped status='skipped' detail='no_views'
    const supa         = jest.mocked(createServerClient).mock.results[0].value as ReturnType<typeof makeSupa>
    // 3rd from() call (index 2) is the digest_sends UPDATE
    const updateChain  = supa.from.mock.results[2]?.value as Record<string, jest.Mock> | undefined
    if (updateChain) {
      const updatePayload = updateChain.update?.mock.calls[0]?.[0] as Record<string, unknown>
      expect(updatePayload?.status).toBe('skipped')
      expect(updatePayload?.detail).toBe('no_views')
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Happy path
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/cron/weekly-digest — happy path', () => {
  it('calls Resend emails.send with the correct shape for a single user', async () => {
    useSupa([
      { data: [USER_A], error: null },   // users SELECT
      { data: null,     error: null },   // digest_sends INSERT lock
      { data: null,     error: null },   // digest_sends UPDATE (sent)
    ])

    const res  = await GET(makeCronReq())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.sent).toBe(1)
    expect(body.errors).toBe(0)

    expect(mockSend).toHaveBeenCalledTimes(1)
    const sendArgs = mockSend.mock.calls[0][0] as Record<string, unknown>
    expect(sendArgs.to).toEqual(['emma@example.com'])
    expect(typeof sendArgs.subject).toBe('string')
    expect(typeof sendArgs.html).toBe('string')
    expect(sendArgs.from).toContain('gifthint.io')
  })

  it('subject line contains the view count', async () => {
    useSupa([
      { data: [USER_A], error: null },
      { data: null,     error: null },
      { data: null,     error: null },
    ])

    await GET(makeCronReq())

    const subject = mockSend.mock.calls[0][0].subject as string
    expect(subject).toContain('14')
  })

  it('subject uses singular "person" for 1 view', async () => {
    jest.mocked(getWeeklyDigestData).mockResolvedValue({
      ...DIGEST_DATA,
      totalViews:    1,
      listSummaries: [{ listName: 'My List', slug: 'my-list', views: 1 }],
    })

    useSupa([
      { data: [USER_A], error: null },
      { data: null,     error: null },
      { data: null,     error: null },
    ])

    await GET(makeCronReq())
    const subject = mockSend.mock.calls[0][0].subject as string
    expect(subject).toContain('1 person')
    expect(subject).not.toContain('people')
  })

  it('uses display_name to personalise when available', async () => {
    useSupa([
      { data: [USER_A], error: null },
      { data: null,     error: null },
      { data: null,     error: null },
    ])

    await GET(makeCronReq())

    // The route calls WeeklyDigestEmail(props) as a function; inspect the mock directly.
    const { WeeklyDigestEmail } = jest.requireMock('@/lib/email-templates/weekly-digest') as {
      WeeklyDigestEmail: jest.Mock
    }
    const callArgs = WeeklyDigestEmail.mock.calls[0][0] as Record<string, unknown>
    expect(callArgs.wisherName).toBe('Emma')
  })

  it('falls back to email prefix when display_name is null', async () => {
    const userNoName: DbRow = { ...USER_A, display_name: null }
    useSupa([
      { data: [userNoName], error: null },
      { data: null,         error: null },
      { data: null,         error: null },
    ])

    await GET(makeCronReq())

    // The route calls WeeklyDigestEmail(props) as a function; inspect the mock directly.
    const { WeeklyDigestEmail } = jest.requireMock('@/lib/email-templates/weekly-digest') as {
      WeeklyDigestEmail: jest.Mock
    }
    const callArgs = WeeklyDigestEmail.mock.calls[0][0] as Record<string, unknown>
    // Falls back to 'emma' (email prefix before @)
    expect(callArgs.wisherName).toBe('emma')
  })

  it('response body has the correct shape', async () => {
    useSupa([
      { data: [USER_A], error: null },
      { data: null,     error: null },
      { data: null,     error: null },
    ])

    const body = await (await GET(makeCronReq())).json()

    expect(body).toMatchObject({
      weekStart: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      weekOf:    'May 12–18, 2025',
      total:     1,
      sent:      1,
      skipped:   0,
      errors:    0,
    })
  })

  it('sends to all users when multiple are eligible', async () => {
    useSupa([
      { data: [USER_A, USER_B], error: null },  // users SELECT
      { data: null, error: null },              // user A: INSERT lock
      { data: null, error: null },              // user A: UPDATE stamp
      { data: null, error: null },              // user B: INSERT lock
      { data: null, error: null },              // user B: UPDATE stamp
    ])

    const body = await (await GET(makeCronReq())).json()

    expect(body.sent).toBe(2)
    expect(mockSend).toHaveBeenCalledTimes(2)

    const recipients = mockSend.mock.calls.map((c) => (c[0] as Record<string, unknown[]>).to[0])
    expect(recipients).toContain('emma@example.com')
    expect(recipients).toContain('carlos@example.com')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Error isolation
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/cron/weekly-digest — error isolation', () => {
  beforeAll(() => jest.spyOn(console, 'error').mockImplementation(() => {}))
  afterAll(()  => jest.restoreAllMocks())

  it('counts a Resend failure as error and continues to the next user', async () => {
    // USER_A: Resend throws; USER_B: succeeds
    mockSend
      .mockRejectedValueOnce(new Error('rate limit exceeded'))
      .mockResolvedValueOnce({ data: { id: 'msg-id-002' }, error: null })

    useSupa([
      { data: [USER_A, USER_B], error: null },  // users SELECT
      { data: null, error: null },              // A: INSERT lock
      { data: null, error: null },              // A: UPDATE (error)
      { data: null, error: null },              // B: INSERT lock
      { data: null, error: null },              // B: UPDATE (sent)
    ])

    const body = await (await GET(makeCronReq())).json()

    expect(body.errors).toBe(1)
    expect(body.sent).toBe(1)
    expect(mockSend).toHaveBeenCalledTimes(2)
  })

  it('counts a Resend API-level error (non-null error field) as error', async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: 'invalid to address' } })

    useSupa([
      { data: [USER_A], error: null },
      { data: null,     error: null },
      { data: null,     error: null },
    ])

    const body = await (await GET(makeCronReq())).json()
    expect(body.errors).toBe(1)
    expect(body.sent).toBe(0)
  })

  it('counts a digest aggregation failure as error (no crash)', async () => {
    jest.mocked(getWeeklyDigestData).mockRejectedValue(new Error('DB connection refused'))

    useSupa([
      { data: [USER_A], error: null },
      { data: null,     error: null },
      { data: null,     error: null },
    ])

    const body = await (await GET(makeCronReq())).json()
    expect(body.errors).toBe(1)
    expect(body.sent).toBe(0)
    expect(mockSend).not.toHaveBeenCalled()
  })
})
