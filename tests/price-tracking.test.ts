/**
 * tests/price-tracking.test.ts — GiftHint
 *
 * Coverage:
 *
 *   checkPrice() — lib/price-checker.ts
 *     - Returns a numeric price parsed from og:price:amount meta tag
 *     - Returns a numeric price parsed from JSON-LD Product schema
 *     - Returns null when the page contains no price signals
 *     - Returns null when source_url is absent
 *
 *   send-price-alerts cron — app/api/cron/send-price-alerts/route.ts
 *     - Auth: rejects without correct CRON_SECRET (401)
 *     - Happy path: 10% price drop meets default threshold → email sent
 *     - Deduplication: item already alerted within 7 days → no second email
 *     - Custom threshold: 5% drop on item requiring 10% drop → no alert
 *     - Batch grouping: two qualifying drops for same user → one email, two DB records
 *     - Respects price_alerts_enabled=false on user → skips that user
 *
 *   Unsubscribe — app/unsubscribe/route.ts with ?type=price_alerts
 *     - Sets price_alerts_enabled=false (not email_digest_enabled)
 *     - Rotates the unsubscribe token
 *     - Returns 200 HTML with price-alert-specific copy
 *
 * Mock strategy:
 *   - createServerClient() → chainable Supabase mock (from-sequence indexed)
 *   - global.fetch mocked for checkPrice() scrape path (non-Amazon URL avoids PA API)
 *   - resend dynamic import mocked via jest.mock('resend', ...)
 *   - @react-email/components render() mocked to avoid JSX/TSX compilation
 *   - @/lib/email-templates/price-drop mocked so PriceDropEmail is a no-op
 *   - RESEND_TEST_MODE not set so buildResend() falls through to the mocked Resend
 *   - jest.useFakeTimers() used for checkPrice() retry-sleep test only
 *
 * DB call sequence inside send-price-alerts handler:
 *   [0] wishlist_items SELECT  (eligible items)
 *   [1] price_drop_alerts SELECT  (7-day dedup check)
 *   [2] users SELECT  (wishers + price_alerts_enabled)
 *   [3] price_history SELECT  (rows for drop comparison + sparkline)
 *   [4+] price_drop_alerts INSERT  (one per qualifying drop, after email sent)
 */

// ── Hoisted mocks ──────────────────────────────────────────────────────────────

jest.mock('@/lib/supabase-server', () => ({
  createServerClient: jest.fn(),
}))

jest.mock('@react-email/components', () => ({
  render: jest.fn().mockResolvedValue('<html>price-drop-email</html>'),
}))

jest.mock('@/lib/email-templates/price-drop', () => ({
  PriceDropEmail: jest.fn().mockReturnValue(null),
}))

// `mockSend` prefix bypasses Jest's hoisting guard so the variable is accessible
// inside the factory even though jest.mock() is hoisted above the declaration.
const mockSend = jest.fn()
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}))

// ── Imports ────────────────────────────────────────────────────────────────────

import React                    from 'react'  // needed for createElement in the cron
import { NextRequest }          from 'next/server'
import { createServerClient }   from '@/lib/supabase-server'
import { checkPrice }           from '@/lib/price-checker'
import { GET as sendAlerts }    from '@/app/api/cron/send-price-alerts/route'
import { GET as unsubscribe }   from '@/app/unsubscribe/route'

// ─────────────────────────────────────────────────────────────────────────────
// Supabase mock helpers
// ─────────────────────────────────────────────────────────────────────────────

type DbRow    = Record<string, unknown>
type DbResult = { data: DbRow | DbRow[] | null; error: { message: string; code?: string } | null }
type AuthResult = {
  data:  { user: { id: string } | null }
  error: { message: string } | null
}

/**
 * Builds a chainable Supabase mock.
 * Each call to .from() advances the fromSequence index (last entry repeats).
 * auth.getUser() resolves with authResult.
 */
function makeSupa(fromSequence: DbResult[], authResult?: AuthResult) {
  let idx = 0

  function makeChain(result: DbResult) {
    const c: Record<string, unknown> = {}
    for (const m of [
      'select', 'insert', 'update', 'upsert', 'delete',
      'eq', 'neq', 'is', 'not', 'in', 'gte', 'lt',
      'order', 'limit', 'single', 'maybeSingle',
    ]) {
      c[m] = jest.fn().mockReturnValue(c)
    }
    c.single      = jest.fn().mockResolvedValue(result)
    c.maybeSingle = jest.fn().mockResolvedValue(result)
    c.then = (
      resolve: (v: DbResult) => unknown,
      reject?: (e: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve as (v: unknown) => unknown, reject)
    return c
  }

  const mock = {
    auth: {
      getUser: jest.fn().mockResolvedValue(
        authResult ?? { data: { user: null }, error: { message: 'no auth' } },
      ),
    },
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    from: jest.fn().mockImplementation(() => {
      const r = fromSequence[Math.min(idx, fromSequence.length - 1)]
      idx++
      return makeChain(r)
    }),
  }

  return mock
}

function useSupa(fromSequence: DbResult[], authResult?: AuthResult) {
  const mock = makeSupa(fromSequence, authResult)
  jest.mocked(createServerClient).mockReturnValue(
    mock as unknown as ReturnType<typeof createServerClient>,
  )
  return mock
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch mock helpers (for checkPrice scraper)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a mock fetch Response whose body ReadableStream yields one chunk
 * containing the given HTML, then signals done.
 */
function makeStreamResponse(html: string) {
  const encoded = new TextEncoder().encode(html)
  let yielded = false
  return {
    ok:     true,
    status: 200,
    body: {
      getReader: () => ({
        read: jest.fn().mockImplementation(() => {
          if (!yielded) {
            yielded = true
            return Promise.resolve({ done: false, value: encoded })
          }
          return Promise.resolve({ done: true, value: undefined })
        }),
        cancel: jest.fn(),
      }),
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const ITEM_ID_1 = 'item-uuid-0001'
const ITEM_ID_2 = 'item-uuid-0002'
const USER_ID   = 'user-uuid-aaaa'
const CRON_SECRET = 'test-cron-secret'

const BASE_ITEM: DbRow = {
  id:                    ITEM_ID_1,
  title:                 'Moleskine Notebook',
  source_url:            'https://example.com/notebook',
  affiliate_url:         null,
  image_url:             null,
  price:                 90,           // current price after drop
  currency:              'GBP',
  lowest_price:          90,
  price_alert_threshold: 90,           // default: alert at ≥10% off
  user_id:               USER_ID,
}

const BASE_WISHER: DbRow = {
  id:                   USER_ID,
  email:                'wisher@example.com',
  display_name:         'Emma',
  public_username:      'emma42',
  unsubscribe_token:    'unsub-token-xyz',
  price_alerts_enabled: true,
}

// Price history: DESC order (most recent first), as returned by the DB query.
// rows[0] = today's price (90), rows[1] = yesterday's price (100) → 10% drop.
const HISTORY_ROWS_ITEM1: DbRow[] = [
  { item_id: ITEM_ID_1, price: 90,  checked_at: '2026-05-17T06:00:00Z' },
  { item_id: ITEM_ID_1, price: 100, checked_at: '2026-05-16T06:00:00Z' },
]

function makeCronReq(secret = CRON_SECRET) {
  return new NextRequest('http://localhost/api/cron/send-price-alerts', {
    headers: { authorization: `Bearer ${secret}` },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Suppress expected console noise
// ─────────────────────────────────────────────────────────────────────────────

beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  jest.spyOn(console, 'log').mockImplementation(() => {})
})
afterAll(() => jest.restoreAllMocks())

beforeEach(() => {
  jest.clearAllMocks()
  delete process.env.AMAZON_ACCESS_KEY
  delete process.env.AMAZON_SECRET_KEY
  delete process.env.AMAZON_PARTNER_TAG
  process.env.CRON_SECRET    = CRON_SECRET
  process.env.RESEND_API_KEY = 'test-resend-key'
  mockSend.mockResolvedValue({ data: { id: 'msg-abc' }, error: null })
})

// ─────────────────────────────────────────────────────────────────────────────
// 1. checkPrice() — OG meta tag
// ─────────────────────────────────────────────────────────────────────────────

describe('checkPrice() — scraper', () => {
  it('returns numeric price from og:price:amount meta tag', async () => {
    const html = `
      <html>
        <head>
          <meta property="og:price:amount" content="29.99" />
          <meta property="og:price:currency" content="GBP" />
        </head>
        <body><h1>Notebook</h1></body>
      </html>
    `
    global.fetch = jest.fn().mockResolvedValue(makeStreamResponse(html))

    const result = await checkPrice({
      id:         'x1',
      source_url: 'https://shop.example.com/product',
      retailer:   'example',
      price:      null,
    })

    expect(result).not.toBeNull()
    expect(result?.price).toBe(29.99)
    expect(result?.source).toBe('scrape')
  })

  it('returns numeric price from JSON-LD Product schema', async () => {
    const ld = JSON.stringify({
      '@type': 'Product',
      name:    'Fancy Mug',
      offers:  { '@type': 'Offer', price: '14.99', priceCurrency: 'GBP' },
    })
    const html = `
      <html>
        <head>
          <script type="application/ld+json">${ld}</script>
        </head>
        <body>Mug page</body>
      </html>
    `
    global.fetch = jest.fn().mockResolvedValue(makeStreamResponse(html))

    const result = await checkPrice({
      id:         'x2',
      source_url: 'https://shop.example.com/mug',
      retailer:   'example',
      price:      null,
    })

    expect(result).not.toBeNull()
    expect(result?.price).toBe(14.99)
    expect(result?.source).toBe('scrape')
  })

  it('returns null when the page contains no price signals', async () => {
    // Plain HTML — no OG tags, no JSON-LD. All 3 retry attempts will fail.
    const html = '<html><body><h1>Just a page, no price here</h1></body></html>'
    global.fetch = jest.fn().mockResolvedValue(makeStreamResponse(html))

    jest.useFakeTimers()
    const promise = checkPrice({
      id:         'x3',
      source_url: 'https://shop.example.com/no-price',
      retailer:   'example',
      price:      null,
    })

    // Advance past the 2×2000 ms inter-retry sleeps and the 10 s fetch timeout timers.
    await jest.runAllTimersAsync()
    const result = await promise
    jest.useRealTimers()

    expect(result).toBeNull()
    // fetch should have been called MAX_RETRIES (3) times
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(3)
  })

  it('returns null when source_url is absent', async () => {
    const result = await checkPrice({
      id:         'x4',
      source_url: '',     // falsy → immediate null
      retailer:   null,
      price:      null,
    })
    expect(result).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. send-price-alerts cron — authentication
// ─────────────────────────────────────────────────────────────────────────────

describe('send-price-alerts — auth', () => {
  it('rejects requests without the correct CRON_SECRET (401)', async () => {
    const req = makeCronReq('wrong-secret')
    const res = await sendAlerts(req)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('unauthorized')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Happy path: 10% drop meets default threshold → email sent
// ─────────────────────────────────────────────────────────────────────────────

describe('send-price-alerts — happy path', () => {
  it('sends one email when current price is 10% below previous price', async () => {
    useSupa([
      // [0] wishlist_items — one eligible item, current price 90 (was 100)
      { data: [BASE_ITEM], error: null },
      // [1] price_drop_alerts — no recent alerts for this item
      { data: [], error: null },
      // [2] users — one wisher with alerts enabled
      { data: [BASE_WISHER], error: null },
      // [3] price_history — DESC: today=90, yesterday=100
      { data: HISTORY_ROWS_ITEM1, error: null },
      // [4] price_drop_alerts INSERT — success
      { data: null, error: null },
    ])

    const res = await sendAlerts(makeCronReq())
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.usersAlerted).toBe(1)
    expect(body.itemsAlerting).toBe(1)
    expect(body.errors).toBe(0)

    // Resend was called exactly once, addressed to the wisher's email
    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to:   BASE_WISHER.email,
        from: expect.stringContaining('gifthint.io'),
      }),
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Deduplication: item already alerted within 7 days → no second email
// ─────────────────────────────────────────────────────────────────────────────

describe('send-price-alerts — deduplication', () => {
  it('skips the item and sends no email when an alert was sent within 7 days', async () => {
    useSupa([
      // [0] wishlist_items — item has dropped 10%
      { data: [BASE_ITEM], error: null },
      // [1] price_drop_alerts — alert already exists for this item within 7 days
      { data: [{ item_id: ITEM_ID_1 }], error: null },
      // [2] users
      { data: [BASE_WISHER], error: null },
      // [3] price_history
      { data: HISTORY_ROWS_ITEM1, error: null },
    ])

    const res = await sendAlerts(makeCronReq())
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.usersAlerted).toBe(0)
    expect(body.skipped).toBeGreaterThanOrEqual(1)
    expect(mockSend).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. Custom threshold: 5% drop on item requiring ≥10% → no alert
// ─────────────────────────────────────────────────────────────────────────────

describe('send-price-alerts — custom threshold', () => {
  it('does not alert when drop percentage is below the item threshold', async () => {
    // Item requires ≥10% off (threshold=90). Price dropped only 5%: 100→95.
    const itemWith5PctDrop: DbRow = {
      ...BASE_ITEM,
      price:                 95,   // current
      price_alert_threshold: 90,   // needs newPrice ≤ 100 × 0.90 = 90 → 95 > 90 → skip
    }
    const historySmallDrop: DbRow[] = [
      { item_id: ITEM_ID_1, price: 95,  checked_at: '2026-05-17T06:00:00Z' },
      { item_id: ITEM_ID_1, price: 100, checked_at: '2026-05-16T06:00:00Z' },
    ]

    useSupa([
      { data: [itemWith5PctDrop], error: null },   // [0] items
      { data: [],                 error: null },   // [1] no recent alerts
      { data: [BASE_WISHER],      error: null },   // [2] wisher
      { data: historySmallDrop,   error: null },   // [3] history
    ])

    const res = await sendAlerts(makeCronReq())
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.usersAlerted).toBe(0)
    expect(body.skipped).toBeGreaterThanOrEqual(1)
    expect(mockSend).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. Batch grouping: two dropped items for the same user → ONE email
// ─────────────────────────────────────────────────────────────────────────────

describe('send-price-alerts — batch grouping', () => {
  it('sends exactly one email for two qualifying items belonging to the same user', async () => {
    const item2: DbRow = {
      ...BASE_ITEM,
      id:          ITEM_ID_2,
      title:       'Fancy Pen',
      source_url:  'https://example.com/pen',
      price:       45,
      lowest_price: 45,
      user_id:     USER_ID,   // same user!
    }

    // History for both items in DESC order (mixed, as the DB would return them)
    const historyBoth: DbRow[] = [
      { item_id: ITEM_ID_1, price: 90,  checked_at: '2026-05-17T06:00:00Z' },
      { item_id: ITEM_ID_2, price: 45,  checked_at: '2026-05-17T06:00:00Z' },
      { item_id: ITEM_ID_1, price: 100, checked_at: '2026-05-16T06:00:00Z' },
      { item_id: ITEM_ID_2, price: 50,  checked_at: '2026-05-16T06:00:00Z' },
    ]

    useSupa([
      { data: [BASE_ITEM, item2], error: null },   // [0] two items
      { data: [],                 error: null },   // [1] no recent alerts
      { data: [BASE_WISHER],      error: null },   // [2] one wisher
      { data: historyBoth,        error: null },   // [3] history for both
      { data: null,               error: null },   // [4] first INSERT
      { data: null,               error: null },   // [5] second INSERT
    ])

    const res = await sendAlerts(makeCronReq())
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.usersAlerted).toBe(1)       // one user
    expect(body.itemsAlerting).toBe(2)      // two items recorded
    expect(mockSend).toHaveBeenCalledTimes(1) // but only ONE email
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. Respects price_alerts_enabled=false on the user record
// ─────────────────────────────────────────────────────────────────────────────

describe('send-price-alerts — user opt-out', () => {
  it('skips items when the wisher has price_alerts_enabled=false', async () => {
    const optedOutWisher: DbRow = { ...BASE_WISHER, price_alerts_enabled: false }

    useSupa([
      { data: [BASE_ITEM],       error: null },
      { data: [],                error: null },
      { data: [optedOutWisher],  error: null },
      { data: HISTORY_ROWS_ITEM1, error: null },
    ])

    const res = await sendAlerts(makeCronReq())
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.usersAlerted).toBe(0)
    expect(mockSend).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 8. Unsubscribe route — ?type=price_alerts
// ─────────────────────────────────────────────────────────────────────────────

describe('unsubscribe — price_alerts type', () => {
  const VALID_TOKEN = 'unsub-token-xyz'
  const EXISTING_USER: DbRow = {
    id:                   USER_ID,
    email_digest_enabled:  true,
    price_alerts_enabled:  true,
  }

  function makeUnsubReq(token: string, type = 'price_alerts') {
    return new NextRequest(
      `http://localhost/unsubscribe?token=${token}&type=${type}`,
    )
  }

  it('sets price_alerts_enabled=false on the user record', async () => {
    const mock = useSupa([
      // [0] users SELECT (lookup by token)
      { data: EXISTING_USER, error: null },
      // [1] users UPDATE (set price_alerts_enabled=false + rotate token)
      { data: null, error: null },
    ])

    const res = await unsubscribe(makeUnsubReq(VALID_TOKEN, 'price_alerts'))
    expect(res.status).toBe(200)

    // Second from() call should be an UPDATE
    const updateCall = mock.from.mock.results[1].value
    expect(updateCall.update).toHaveBeenCalledWith(
      expect.objectContaining({ price_alerts_enabled: false }),
    )
    // Must NOT touch email_digest_enabled
    const updateArg = (updateCall.update as jest.Mock).mock.calls[0][0]
    expect(updateArg).not.toHaveProperty('email_digest_enabled')
  })

  it('rotates the unsubscribe token after opting out', async () => {
    const mock = useSupa([
      { data: EXISTING_USER, error: null },
      { data: null,          error: null },
    ])

    await unsubscribe(makeUnsubReq(VALID_TOKEN, 'price_alerts'))

    const updateCall = mock.from.mock.results[1].value
    const updateArg = (updateCall.update as jest.Mock).mock.calls[0][0]

    // The token in the update must be a new value (not the original)
    expect(updateArg.unsubscribe_token).toBeDefined()
    expect(updateArg.unsubscribe_token).not.toBe(VALID_TOKEN)
  })

  it('returns 200 HTML with price-alert-specific confirmation text', async () => {
    useSupa([
      { data: EXISTING_USER, error: null },
      { data: null,          error: null },
    ])

    const res = await unsubscribe(makeUnsubReq(VALID_TOKEN, 'price_alerts'))
    expect(res.status).toBe(200)

    const html = await res.text()
    expect(html).toContain('Price alert')
    expect(html).not.toContain("You won't receive any more weekly digest")
  })

  it('returns 404 when the token is not found (expired or fabricated)', async () => {
    useSupa([
      // Lookup fails — token not in DB
      { data: null, error: { message: 'not found' } },
    ])

    const res = await unsubscribe(makeUnsubReq('bad-token', 'price_alerts'))
    expect(res.status).toBe(404)
  })
})
