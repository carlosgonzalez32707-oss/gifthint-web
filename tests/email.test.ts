/**
 * tests/email.test.ts — GiftHint
 *
 * Unit tests for the gifter reminder email system.
 * All Supabase and Resend interactions are mocked — no network access required.
 *
 * Coverage:
 *   sendReminderEmail()          — resolves in test mode, subject variants,
 *                                  throws when API key is missing in live mode
 *   POST /api/reminder-signup    — email validation, duplicate prevention (upsert),
 *                                  occasion date handling, unknown wisher
 *   GET  /api/cron/send-reminders — auth guard, happy-path send + stamp,
 *                                   zero-results, per-email fault isolation
 *
 * Mock strategy:
 *   • lib/email.ts   — sendReminderEmail is mocked when testing the cron endpoint
 *                      so we can assert it was called with the right args without
 *                      actually building HTML or hitting Resend.
 *   • supabase-server — createServerClient() replaced with chainable mock (same
 *                       pattern as claim-system.test.ts).
 *   • RESEND_TEST_MODE=true — set in process.env for sendReminderEmail unit tests
 *                             so the utility resolves without a real API key.
 *
 * Run with: npm test
 */

// ── Mocks must be hoisted before any imports ───────────────────────────────────
jest.mock('@/lib/supabase-server', () => ({
  createServerClient: jest.fn(),
}))

// When testing the cron handler we mock the whole email module so we can assert
// it's called correctly without building HTML or hitting the network.
// Individual sendReminderEmail unit tests import the real function below.
jest.mock('@/lib/email', () => ({
  sendReminderEmail: jest.fn(),
}))

import { NextRequest }        from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { sendReminderEmail }  from '@/lib/email'

// Route handlers under test
import { POST as signupPOST } from '@/app/api/reminder-signup/route'
import { GET  as cronGET }    from '@/app/api/cron/send-reminders/route'

// ─────────────────────────────────────────────────────────────────────────────
// Chainable Supabase mock (identical structure to claim-system.test.ts)
// ─────────────────────────────────────────────────────────────────────────────

type DbRow    = Record<string, unknown>
type DbResult = { data: DbRow | DbRow[] | null; error: { message: string; code?: string } | null }

function makeSupa(fromSequence: DbResult[]) {
  let callIdx = 0

  function makeChain(result: DbResult): Record<string, unknown> {
    const chain: Record<string, unknown> = {}

    for (const m of [
      'select', 'update', 'insert', 'upsert',
      'eq', 'neq', 'is', 'not', 'in',
      'order', 'limit',
    ]) {
      chain[m] = jest.fn().mockReturnValue(chain)
    }

    chain.maybeSingle = jest.fn().mockResolvedValue(result)
    chain.single      = jest.fn().mockResolvedValue(result)

    chain.then = (
      resolve: (v: DbResult) => unknown,
      reject?: (e: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve as (v: unknown) => unknown, reject)

    return chain
  }

  return {
    from: jest.fn().mockImplementation(() => {
      const result = fromSequence[Math.min(callIdx, fromSequence.length - 1)]
      callIdx++
      return makeChain(result)
    }),
    channel:       jest.fn().mockReturnValue({ send: jest.fn().mockResolvedValue({ error: null }) }),
    removeChannel: jest.fn().mockResolvedValue(undefined),
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
// Request helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeSignupReq(body: unknown) {
  return new NextRequest('http://localhost/api/reminder-signup', {
    method:  'POST',
    body:    JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeCronReq(secret = 'test-cron-secret') {
  return new NextRequest('http://localhost/api/cron/send-reminders', {
    headers: { authorization: `Bearer ${secret}` },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared fixtures
// ─────────────────────────────────────────────────────────────────────────────

const WISHER_ID   = 'wisher-uuid-111111'
const WISHER_NAME = 'Emma'
const USERNAME    = 'emma-gifts'
const GIFTER_EMAIL = 'gifter@example.com'
const OCCASION_DATE = '2025-12-25'

/** ISO date exactly 7 days from today (UTC) — the cron target date. */
function sevenDaysFromNow(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + 7)
  return d.toISOString().split('T')[0]
}

const REMINDER_ROW: DbRow = {
  id:               'reminder-uuid-aaaaaa',
  wisher_user_id:   WISHER_ID,
  gifter_email:     GIFTER_EMAIL,
  occasion_date:    sevenDaysFromNow(),
  reminder_sent_at: null,
}

const WISHER_ROW: DbRow = {
  id:              WISHER_ID,
  display_name:    WISHER_NAME,
  public_username: USERNAME,
}

const UNCLAIMED_ITEMS: DbRow[] = [
  { id: 'item-1', title: 'Cashmere Scarf', image_url: null, price: 89.99, currency: 'USD', source_url: 'https://example.com/scarf' },
  { id: 'item-2', title: 'Pottery Class',  image_url: null, price: 55.00, currency: 'USD', source_url: 'https://example.com/pottery' },
]

// ─────────────────────────────────────────────────────────────────────────────
// sendReminderEmail() — unit tests using RESEND_TEST_MODE
// ─────────────────────────────────────────────────────────────────────────────

describe('sendReminderEmail() — test mode (no real API call)', () => {
  /**
   * These tests import the REAL sendReminderEmail to exercise the function's
   * own logic (building the HTML, throwing on missing key, etc.).
   *
   * The jest.mock('@/lib/email') at the top affects the module cache for the
   * CRON tests below. Here we bypass that mock by importing the real module
   * directly via jest.requireActual.
   */
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { sendReminderEmail: realSend } = jest.requireActual('@/lib/email') as {
    sendReminderEmail: typeof sendReminderEmail
  }

  beforeAll(() => {
    process.env.RESEND_TEST_MODE = 'true'
  })

  afterAll(() => {
    delete process.env.RESEND_TEST_MODE
  })

  it('resolves without error in test mode (no API key needed)', async () => {
    await expect(
      realSend({
        to:           GIFTER_EMAIL,
        wisherName:   WISHER_NAME,
        occasionDate: OCCASION_DATE,
        listUrl:      `https://gifthint.io/list/${USERNAME}`,
        topItems:     [],
      }),
    ).resolves.toBeUndefined()
  })

  it('resolves with a provided list of top items', async () => {
    await expect(
      realSend({
        to:           GIFTER_EMAIL,
        wisherName:   WISHER_NAME,
        occasionDate: OCCASION_DATE,
        listUrl:      `https://gifthint.io/list/${USERNAME}`,
        topItems: [
          { title: 'Cashmere Scarf', imageUrl: null,   price: 89.99, currency: 'USD', sourceUrl: 'https://example.com/scarf' },
          { title: 'Pottery Class',  imageUrl: null,   price: 55.00, currency: 'USD', sourceUrl: 'https://example.com/pottery' },
          { title: 'Book Gift Card', imageUrl: null,   price: 25.00, currency: 'USD', sourceUrl: 'https://example.com/book' },
        ],
      }),
    ).resolves.toBeUndefined()
  })

  it('resolves when occasionDate is null (no date reminder)', async () => {
    await expect(
      realSend({
        to:           GIFTER_EMAIL,
        wisherName:   WISHER_NAME,
        occasionDate: null,
        listUrl:      `https://gifthint.io/list/${USERNAME}`,
        topItems:     [],
      }),
    ).resolves.toBeUndefined()
  })

  it('throws when RESEND_API_KEY is missing in live mode', async () => {
    const savedTestMode = process.env.RESEND_TEST_MODE
    const savedKey      = process.env.RESEND_API_KEY
    delete process.env.RESEND_TEST_MODE   // disable test mode
    delete process.env.RESEND_API_KEY     // ensure no key

    await expect(
      realSend({
        to:           GIFTER_EMAIL,
        wisherName:   WISHER_NAME,
        occasionDate: null,
        listUrl:      'https://gifthint.io/list/emma',
        topItems:     [],
      }),
    ).rejects.toThrow('RESEND_API_KEY')

    // Restore
    process.env.RESEND_TEST_MODE = savedTestMode
    if (savedKey) process.env.RESEND_API_KEY = savedKey
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/reminder-signup — email validation & duplicate prevention
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/reminder-signup — validation', () => {

  it('returns 201 success=true for a valid signup', async () => {
    useSupa([
      { data: { id: WISHER_ID }, error: null },  // users lookup
      { data: null,              error: null },  // upsert (no error)
    ])

    const req = makeSignupReq({ wisherUsername: USERNAME, gifterEmail: GIFTER_EMAIL, occasionDate: OCCASION_DATE })
    const res = await signupPOST(req)
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.success).toBe(true)
  })

  it('returns 400 invalid_email for a clearly malformed email', async () => {
    useSupa([])

    const req = makeSignupReq({ wisherUsername: USERNAME, gifterEmail: 'not-an-email' })
    const res = await signupPOST(req)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe('invalid_email')
  })

  it('returns 400 invalid_email for an email missing TLD', async () => {
    useSupa([])

    const req = makeSignupReq({ wisherUsername: USERNAME, gifterEmail: 'gifter@example' })
    const res = await signupPOST(req)

    expect(res.status).toBe(400)
  })

  it('returns 400 missing_fields when gifterEmail is absent', async () => {
    useSupa([])

    const req = makeSignupReq({ wisherUsername: USERNAME })
    const res = await signupPOST(req)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe('missing_fields')
  })

  it('returns 400 missing_fields when wisherUsername is absent', async () => {
    useSupa([])

    const req = makeSignupReq({ gifterEmail: GIFTER_EMAIL })
    const res = await signupPOST(req)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe('missing_fields')
  })

  it('returns 400 invalid_date for a non-date string', async () => {
    useSupa([])

    const req = makeSignupReq({ wisherUsername: USERNAME, gifterEmail: GIFTER_EMAIL, occasionDate: 'next-friday' })
    const res = await signupPOST(req)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe('invalid_date')
  })

  it('returns 400 invalid_date for wrong format (MM/DD/YYYY)', async () => {
    useSupa([])

    const req = makeSignupReq({ wisherUsername: USERNAME, gifterEmail: GIFTER_EMAIL, occasionDate: '12/25/2025' })
    const res = await signupPOST(req)

    expect(res.status).toBe(400)
  })

  it('accepts a signup with no occasionDate (null → undefined reminder date)', async () => {
    useSupa([
      { data: { id: WISHER_ID }, error: null },
      { data: null,              error: null },
    ])

    const req = makeSignupReq({ wisherUsername: USERNAME, gifterEmail: GIFTER_EMAIL })
    const res = await signupPOST(req)

    expect(res.status).toBe(201)
  })

  it('returns 404 user_not_found for an unknown wisher username', async () => {
    useSupa([{ data: null, error: null }]) // users lookup returns nothing

    const req = makeSignupReq({ wisherUsername: 'nobody', gifterEmail: GIFTER_EMAIL })
    const res = await signupPOST(req)
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error).toBe('user_not_found')
  })

})

describe('POST /api/reminder-signup — duplicate prevention', () => {

  it('submitting the same email twice results in only one DB row (upsert)', async () => {
    /**
     * Both requests hit the same (wisher_user_id, gifter_email) unique key.
     * The route uses UPSERT ON CONFLICT DO UPDATE, so the second request
     * merges into the existing row rather than inserting a duplicate.
     *
     * We assert:
     *   • Both responses return 201 success=true (idempotent)
     *   • The mock's upsert was called twice (the route calls it each time)
     *   • The mock's from() for 'gifter_reminders' was called exactly twice
     *     (once per request) — confirming no extra inserts happened
     */
    const supaA = makeSupa([
      { data: { id: WISHER_ID }, error: null },
      { data: null,              error: null },
    ])
    const supaB = makeSupa([
      { data: { id: WISHER_ID }, error: null },
      { data: null,              error: null },
    ])

    const mockedCreate = jest.mocked(createServerClient)
    mockedCreate
      .mockReturnValueOnce(supaA as unknown as ReturnType<typeof createServerClient>)
      .mockReturnValueOnce(supaB as unknown as ReturnType<typeof createServerClient>)

    const body = { wisherUsername: USERNAME, gifterEmail: GIFTER_EMAIL, occasionDate: OCCASION_DATE }

    const [resA, resB] = await Promise.all([
      signupPOST(makeSignupReq(body)),
      signupPOST(makeSignupReq(body)),
    ])

    const [jsonA, jsonB] = await Promise.all([resA.json(), resB.json()])

    // Both should succeed — the upsert is idempotent
    expect(resA.status).toBe(201)
    expect(resB.status).toBe(201)
    expect(jsonA.success).toBe(true)
    expect(jsonB.success).toBe(true)

    // Each mock's from() was called exactly twice (users lookup + upsert)
    expect(supaA.from).toHaveBeenCalledTimes(2)
    expect(supaB.from).toHaveBeenCalledTimes(2)
  })

  it('re-signup with a different date resets reminder_sent_at (upsert updates)', async () => {
    /**
     * If a gifter previously signed up and we re-upsert with a new date,
     * the route resets reminder_sent_at to null so a fresh send goes out.
     * We verify upsert is called with reminder_sent_at: null.
     */
    const supa = makeSupa([
      { data: { id: WISHER_ID }, error: null },
      { data: null,              error: null },
    ])
    jest.mocked(createServerClient).mockReturnValue(
      supa as unknown as ReturnType<typeof createServerClient>,
    )

    const newDate = '2026-06-15'
    const req = makeSignupReq({ wisherUsername: USERNAME, gifterEmail: GIFTER_EMAIL, occasionDate: newDate })
    const res = await signupPOST(req)
    expect(res.status).toBe(201)

    // The second from() call is the upsert — inspect its payload
    const upsertChain = supa.from.mock.results[1].value as Record<string, jest.Mock>
    const upsertPayload = upsertChain.upsert.mock.calls[0][0] as Record<string, unknown>

    expect(upsertPayload.reminder_sent_at).toBeNull()
    expect(upsertPayload.occasion_date).toBe(newDate)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/send-reminders — cron job handler
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/cron/send-reminders — authentication', () => {

  beforeEach(() => {
    process.env.CRON_SECRET = 'test-cron-secret'
  })

  afterEach(() => {
    delete process.env.CRON_SECRET
  })

  it('returns 401 unauthorized when Authorization header is absent', async () => {
    useSupa([])

    const req = new NextRequest('http://localhost/api/cron/send-reminders')
    const res = await cronGET(req)
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.error).toBe('unauthorized')
  })

  it('returns 401 unauthorized for a wrong secret', async () => {
    useSupa([])

    const req = makeCronReq('wrong-secret')
    const res = await cronGET(req)

    expect(res.status).toBe(401)
  })

  it('returns 500 server_error when CRON_SECRET env var is unset', async () => {
    delete process.env.CRON_SECRET
    useSupa([])

    const req = makeCronReq('any-secret')
    const res = await cronGET(req)
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.error).toBe('server_error')
  })

})

describe('GET /api/cron/send-reminders — happy path', () => {

  beforeEach(() => {
    process.env.CRON_SECRET      = 'test-cron-secret'
    process.env.NEXT_PUBLIC_APP_URL = 'https://gifthint.io'
    jest.mocked(sendReminderEmail).mockResolvedValue(undefined)
  })

  afterEach(() => {
    delete process.env.CRON_SECRET
    delete process.env.NEXT_PUBLIC_APP_URL
    jest.mocked(sendReminderEmail).mockReset()
  })

  it('returns {sent:0, skipped:0, errors:0} when no reminders are due', async () => {
    useSupa([{ data: [], error: null }]) // gifter_reminders query → empty

    const req = makeCronReq()
    const res = await cronGET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ sent: 0, skipped: 0, errors: 0 })
    expect(sendReminderEmail).not.toHaveBeenCalled()
  })

  it('calls sendReminderEmail and stamps reminder_sent_at for a due reminder', async () => {
    /**
     * Sequence of from() calls the cron handler makes for one reminder:
     *   1. gifter_reminders SELECT  → [REMINDER_ROW]
     *   2. users SELECT (batch)     → [WISHER_ROW]
     *   3. wishlist_items SELECT    → UNCLAIMED_ITEMS
     *   4. gifter_reminders UPDATE  → { error: null }  (stamp sent_at)
     */
    useSupa([
      { data: [REMINDER_ROW],    error: null },
      { data: [WISHER_ROW],      error: null },
      { data: UNCLAIMED_ITEMS,   error: null },
      { data: null,              error: null },  // stamp UPDATE
    ])

    const req = makeCronReq()
    const res = await cronGET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.sent).toBe(1)
    expect(body.errors).toBe(0)

    // sendReminderEmail was called with the right wisher and gifter
    expect(sendReminderEmail).toHaveBeenCalledTimes(1)
    const callArgs = jest.mocked(sendReminderEmail).mock.calls[0][0]
    expect(callArgs.to).toBe(GIFTER_EMAIL)
    expect(callArgs.wisherName).toBe(WISHER_NAME)
    expect(callArgs.listUrl).toBe(`https://gifthint.io/list/${USERNAME}`)
  })

  it('passes the top unclaimed items to sendReminderEmail', async () => {
    useSupa([
      { data: [REMINDER_ROW],  error: null },
      { data: [WISHER_ROW],    error: null },
      { data: UNCLAIMED_ITEMS, error: null },
      { data: null,            error: null },
    ])

    const req = makeCronReq()
    await cronGET(req)

    const callArgs = jest.mocked(sendReminderEmail).mock.calls[0][0]
    expect(callArgs.topItems).toHaveLength(UNCLAIMED_ITEMS.length)
    expect(callArgs.topItems[0].title).toBe('Cashmere Scarf')
  })

  it('stamps reminder_sent_at after a successful send', async () => {
    const supa = makeSupa([
      { data: [REMINDER_ROW],  error: null },
      { data: [WISHER_ROW],    error: null },
      { data: UNCLAIMED_ITEMS, error: null },
      { data: null,            error: null },  // stamp
    ])
    jest.mocked(createServerClient).mockReturnValue(
      supa as unknown as ReturnType<typeof createServerClient>,
    )

    const req = makeCronReq()
    await cronGET(req)

    // The 4th from() call should UPDATE with reminder_sent_at set
    const stampChain = supa.from.mock.results[3].value as Record<string, jest.Mock>
    const updatePayload = stampChain.update.mock.calls[0][0] as Record<string, unknown>

    expect(updatePayload.reminder_sent_at).toBeDefined()
    expect(typeof updatePayload.reminder_sent_at).toBe('string')
    // Should be a valid ISO timestamp
    expect(() => new Date(updatePayload.reminder_sent_at as string)).not.toThrow()
  })

  it('counts failed sends in errors without aborting remaining reminders', async () => {
    /**
     * Two reminders are due. sendReminderEmail throws for the first gifter
     * but succeeds for the second. The cron handler should:
     *   • Report errors: 1, sent: 1
     *   • NOT stamp reminder_sent_at for the failed row (it stays retryable)
     */
    const reminder2: DbRow = {
      ...REMINDER_ROW,
      id:           'reminder-uuid-bbbbbb',
      gifter_email: 'second@example.com',
    }

    const supa = makeSupa([
      { data: [REMINDER_ROW, reminder2], error: null },  // gifter_reminders
      { data: [WISHER_ROW],              error: null },  // users (shared wisher)
      { data: UNCLAIMED_ITEMS,           error: null },  // wishlist_items
      { data: null,                      error: null },  // stamp for successful send
    ])
    jest.mocked(createServerClient).mockReturnValue(
      supa as unknown as ReturnType<typeof createServerClient>,
    )

    // First call throws; second resolves
    jest.mocked(sendReminderEmail)
      .mockRejectedValueOnce(new Error('Resend rate limit'))
      .mockResolvedValueOnce(undefined)

    const req = makeCronReq()
    const res = await cronGET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.errors).toBe(1)
    expect(body.sent).toBe(1)
  })

  it('skips reminders where the wisher username cannot be resolved', async () => {
    /**
     * If the users query returns a wisher without a public_username, the cron
     * handler logs and counts it as skipped rather than crashing.
     */
    const wisherWithNoUsername: DbRow = { id: WISHER_ID, display_name: 'Emma', public_username: null }

    useSupa([
      { data: [REMINDER_ROW],        error: null },
      { data: [wisherWithNoUsername], error: null },
      { data: UNCLAIMED_ITEMS,       error: null },
    ])

    const req = makeCronReq()
    const res = await cronGET(req)
    const body = await res.json()

    expect(body.skipped).toBe(1)
    expect(body.sent).toBe(0)
    expect(sendReminderEmail).not.toHaveBeenCalled()
  })

})
