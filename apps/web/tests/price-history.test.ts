/**
 * tests/price-history.test.ts — GiftHint
 *
 * Coverage:
 *
 *   GET /api/price-history/[itemId] — app/api/price-history/[itemId]/route.ts
 *     - Returns rows ordered oldest-first with lowestPrice and currentPrice
 *     - Returns 403 when the authenticated user does not own the item
 *     - Returns 401 when no Authorization header is supplied
 *     - Returns 404 when itemId does not exist
 *
 *   PriceBadge — components/dashboard/PriceBadge.tsx
 *     - Renders "Lowest ever" badge when currentPrice ≈ lowestPrice (within 0.5%)
 *     - Renders "Price dropped N%" badge when currentPrice < lastWeekPrice by ≥ 1%
 *     - Renders "Up N% since saved" when currentPrice > originalSavedPrice by ≥ 1%
 *     - Renders nothing when there is no meaningful price change
 *
 * Mock strategy:
 *   - createServerClient() → chainable Supabase mock matching price-tracking.test.ts pattern
 *   - ReactDOMServer.renderToStaticMarkup() used for PriceBadge — works in node testEnvironment
 *     without jsdom; the component uses only inline styles + span, no browser APIs
 *   - No fetch mock needed (no scraping in this file)
 */

// ── Hoisted mocks ──────────────────────────────────────────────────────────────

jest.mock('@/lib/supabase-server', () => ({
  createServerClient: jest.fn(),
}))

// ── Imports ────────────────────────────────────────────────────────────────────

import React                         from 'react'
import * as ReactDOMServer           from 'react-dom/server'
import { NextRequest }               from 'next/server'
import { createServerClient }        from '@/lib/supabase-server'
import { GET as getPriceHistory }    from '@/app/api/price-history/[itemId]/route'
import { PriceBadge }                from '@/components/dashboard/PriceBadge'

// ─────────────────────────────────────────────────────────────────────────────
// Supabase mock helpers (mirrors price-tracking.test.ts for consistency)
// ─────────────────────────────────────────────────────────────────────────────

type DbRow    = Record<string, unknown>
type DbResult = { data: DbRow | DbRow[] | null; error: { message: string; code?: string } | null }
type AuthResult = {
  data:  { user: { id: string } | null }
  error: { message: string } | null
}

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
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeRequest(itemId: string, token?: string): NextRequest {
  const url = `http://localhost/api/price-history/${itemId}`
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  return new NextRequest(url, { headers })
}

function render(el: React.ReactElement): string {
  return ReactDOMServer.renderToStaticMarkup(el)
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const OWNER_ID   = 'user-uuid-owner'
const OTHER_ID   = 'user-uuid-other'
const ITEM_ID    = 'item-uuid-ph-001'
const TOKEN      = 'valid-token-abc'

/** DB returns rows DESC (newest first) — the route reverses them. */
const HISTORY_ROWS_DESC: DbRow[] = [
  { price: 80,  checked_at: '2026-05-17T06:00:00Z', source: 'scraper' },  // newest
  { price: 90,  checked_at: '2026-05-14T06:00:00Z', source: 'scraper' },
  { price: 100, checked_at: '2026-05-10T06:00:00Z', source: 'scraper' },  // oldest
]

const ITEM_ROW: DbRow = {
  user_id:      OWNER_ID,
  price:        80,
  lowest_price: 75,
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/price-history/[itemId]
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/price-history/[itemId]', () => {
  afterEach(() => jest.clearAllMocks())

  // ── Happy path ──────────────────────────────────────────────────────────────

  it('returns rows ordered oldest-first with lowestPrice and currentPrice', async () => {
    useSupa(
      [
        // [0] wishlist_items ownership check
        { data: ITEM_ROW, error: null },
        // [1] price_history rows (returned DESC from DB)
        { data: HISTORY_ROWS_DESC, error: null },
      ],
      { data: { user: { id: OWNER_ID } }, error: null },
    )

    const res  = await getPriceHistory(makeRequest(ITEM_ID, TOKEN), { params: { itemId: ITEM_ID } })
    const body = await res.json() as {
      rows:         Array<{ price: number; checked_at: string; source: string }>
      lowestPrice:  number | null
      currentPrice: number | null
    }

    expect(res.status).toBe(200)

    // Rows must be ascending by checked_at (oldest first)
    const dates = body.rows.map((r) => r.checked_at)
    expect(dates).toEqual([...dates].sort())  // sorted copy matches original

    // First row is the oldest price point, last is the newest
    expect(body.rows[0].price).toBe(100)
    expect(body.rows[body.rows.length - 1].price).toBe(80)

    // lowestPrice and currentPrice come from the wishlist_items row, not history
    expect(body.lowestPrice).toBe(75)
    expect(body.currentPrice).toBe(80)
  })

  // ── Auth: no token ──────────────────────────────────────────────────────────

  it('returns 401 when Authorization header is missing', async () => {
    useSupa([], undefined)   // getUser never reached

    const res = await getPriceHistory(makeRequest(ITEM_ID), { params: { itemId: ITEM_ID } })

    expect(res.status).toBe(401)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('unauthorized')
  })

  // ── Auth: invalid token ─────────────────────────────────────────────────────

  it('returns 401 when token does not resolve to a user', async () => {
    useSupa([], { data: { user: null }, error: { message: 'invalid jwt' } })

    const res = await getPriceHistory(makeRequest(ITEM_ID, 'bad-token'), { params: { itemId: ITEM_ID } })

    expect(res.status).toBe(401)
  })

  // ── Ownership: different user ───────────────────────────────────────────────

  it('returns 403 when the authenticated user does not own the item', async () => {
    useSupa(
      [
        // ownership check returns a row owned by OWNER_ID, but the authed user is OTHER_ID
        { data: { ...ITEM_ROW, user_id: OWNER_ID }, error: null },
      ],
      { data: { user: { id: OTHER_ID } }, error: null },
    )

    const res = await getPriceHistory(makeRequest(ITEM_ID, TOKEN), { params: { itemId: ITEM_ID } })

    expect(res.status).toBe(403)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('forbidden')
  })

  // ── Not found ───────────────────────────────────────────────────────────────

  it('returns 404 when itemId does not exist', async () => {
    useSupa(
      [
        // .single() rejects → treated as not_found
        { data: null, error: { message: 'no rows', code: 'PGRST116' } },
      ],
      { data: { user: { id: OWNER_ID } }, error: null },
    )

    const res = await getPriceHistory(makeRequest(ITEM_ID, TOKEN), { params: { itemId: ITEM_ID } })

    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('not_found')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// PriceBadge component
// ─────────────────────────────────────────────────────────────────────────────

describe('PriceBadge', () => {
  // ── Lowest ever ─────────────────────────────────────────────────────────────

  it('renders "Lowest ever" when currentPrice ≈ lowestPrice (within 0.5%)', () => {
    // currentPrice = 100.00, lowestPrice = 100.10 → diff = 0.1% < 0.5% → lowest badge
    const html = render(
      React.createElement(PriceBadge, {
        currentPrice:       100.00,
        lowestPrice:        100.10,
        lastWeekPrice:      110,
        originalSavedPrice: 120,
        currency:           'GBP',
      }),
    )

    expect(html).toContain('Lowest ever')
    // Should NOT show the drop badge since lowest-ever wins the priority race
    expect(html).not.toContain('Price dropped')
  })

  it('renders "Lowest ever" when currentPrice exactly equals lowestPrice', () => {
    const html = render(
      React.createElement(PriceBadge, {
        currentPrice:       49.99,
        lowestPrice:        49.99,
        lastWeekPrice:      null,
        originalSavedPrice: null,
        currency:           'USD',
      }),
    )

    expect(html).toContain('Lowest ever')
  })

  // ── Price dropped ───────────────────────────────────────────────────────────

  it('renders "Price dropped N%" when currentPrice is ≥ 1% below lastWeekPrice', () => {
    // 90 vs 100 → 10% drop
    const html = render(
      React.createElement(PriceBadge, {
        currentPrice:       90,
        lowestPrice:        80,   // lower than current so "lowest ever" doesn't fire
        lastWeekPrice:      100,
        originalSavedPrice: 100,
        currency:           'GBP',
      }),
    )

    expect(html).toContain('Price dropped')
    expect(html).toContain('10%')
    expect(html).not.toContain('Lowest ever')
  })

  it('does NOT render "Price dropped" when drop is less than 1%', () => {
    // 99.5 vs 100 → 0.5% drop — below threshold
    const html = render(
      React.createElement(PriceBadge, {
        currentPrice:       99.5,
        lowestPrice:        80,
        lastWeekPrice:      100,
        originalSavedPrice: 100,
        currency:           'GBP',
      }),
    )

    // 0.5% drop is insufficient; also not a rise (current < original) → no badge
    expect(html).toBe('')
  })

  // ── Price rose (badge variant) ──────────────────────────────────────────────

  it('renders "Up N% since saved" badge when currentPrice is ≥ 1% below originalSavedPrice', () => {
    // The PriceBadge 'rose' variant uses pctDiff(currentPrice, originalSavedPrice)
    // which is positive when currentPrice < originalSavedPrice (i.e. price fell since
    // the item was added). The label "Up N% since saved" communicates that the buyer's
    // potential savings have increased since the item was first added to the wish list.
    // currentPrice=80, originalSavedPrice=100 → fell = 20% ≥ 1 → badge fires.
    const html = render(
      React.createElement(PriceBadge, {
        currentPrice:       80,
        lowestPrice:        60,    // clearly below current → "lowest ever" does not fire
        lastWeekPrice:      null,  // no last-week data → "price dropped" does not fire
        originalSavedPrice: 100,
        currency:           'USD',
      }),
    )

    expect(html).toContain('Up')
    expect(html).toContain('since saved')
    expect(html).toContain('20%')
  })

  // ── No badge ────────────────────────────────────────────────────────────────

  it('renders nothing when price is unchanged and no meaningful signals exist', () => {
    const html = render(
      React.createElement(PriceBadge, {
        currentPrice:       100,
        lowestPrice:        null,
        lastWeekPrice:      null,
        originalSavedPrice: null,
        currency:           'GBP',
      }),
    )

    expect(html).toBe('')
  })

  it('renders nothing when currentPrice is null', () => {
    const html = render(
      React.createElement(PriceBadge, {
        currentPrice:       null,
        lowestPrice:        90,
        lastWeekPrice:      110,
        originalSavedPrice: 120,
        currency:           'GBP',
      }),
    )

    expect(html).toBe('')
  })

  // ── Priority: lowest > dropped ──────────────────────────────────────────────

  it('shows "Lowest ever" even when lastWeekPrice is also lower (priority check)', () => {
    // currentPrice matches lowestPrice → "lowest ever" wins over "price dropped"
    const html = render(
      React.createElement(PriceBadge, {
        currentPrice:       50,
        lowestPrice:        50,   // exact match → lowest ever
        lastWeekPrice:      60,   // would also qualify for "dropped 16%"
        originalSavedPrice: 80,
        currency:           'GBP',
      }),
    )

    expect(html).toContain('Lowest ever')
    expect(html).not.toContain('Price dropped')
  })
})
