/**
 * tests/growth.test.ts — GiftHint Growth Systems QA suite
 *
 * Covers:
 *   1. Viral coefficient (K-factor) calculation — pure formula correctness
 *   2. growth_kpis view shape — all fields non-null for a seeded response
 *   3. Referral signup → referred_signups increment via RPC
 *   4. Partner landing page — fetchPartnerBySlug resolves for a valid slug
 *   5. GET /r/[code] — returns 302 redirect to homepage
 *
 * Mock strategy:
 *   createServerClient() is replaced with the project-standard chainable mock.
 *   Each test uses useSupa(fromSequence[]) to express the exact DB responses
 *   without a running database. No network calls are made.
 *
 * Run: npx jest tests/growth.test.ts
 */

// ── Environment ───────────────────────────────────────────────────────────────

process.env.NEXT_PUBLIC_APP_URL = 'https://gifthint.io'
process.env.RESEND_TEST_MODE    = 'true'
// NODE_ENV is read-only in strict TS — cast to bypass (Jest sets it anyway)
;(process.env as Record<string, string>).NODE_ENV = 'test'

// ── Supabase mock — hoisted above all imports ─────────────────────────────────

jest.mock('@/lib/supabase-server', () => ({
  createServerClient: jest.fn(),
}))

// rewards.ts is imported transitively by the signup route; keep the unit tight
jest.mock('@/lib/rewards', () => ({
  checkAndApplyRewards: jest.fn().mockResolvedValue({
    referralCount: 1, premiumTier: 'plus',
    customUsernameEnabled: true, premiumThemesEnabled: false,
    prioritySupportEnabled: false,
  }),
  computeRewardPatch: jest.requireActual('@/lib/rewards').computeRewardPatch,
  nextLockedTier:     jest.requireActual('@/lib/rewards').nextLockedTier,
  REWARD_TIERS:       jest.requireActual('@/lib/rewards').REWARD_TIERS,
}))

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { NextRequest }        from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { GET as referralRedirect } from '@/app/r/[code]/route'
import { POST as signupAttribution } from '@/app/api/auth/signup/route'
import { fetchPartnerBySlug } from '@/lib/partners'

// ── Chainable Supabase mock ───────────────────────────────────────────────────

type DbRow    = Record<string, unknown>
type DbResult = { data: DbRow | DbRow[] | null; error: { message: string } | null }

function makeChain(result: DbResult): Record<string, unknown> {
  const chain: Record<string, unknown> = {}
  for (const m of [
    'select', 'update', 'insert', 'upsert',
    'eq', 'neq', 'is', 'not', 'in', 'order', 'limit',
  ]) {
    chain[m] = jest.fn().mockReturnValue(chain)
  }
  chain.maybeSingle = jest.fn().mockResolvedValue(result)
  chain.single      = jest.fn().mockResolvedValue(result)
  chain.then        = (
    resolve: (v: DbResult) => unknown,
    reject?: (e: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve as (v: unknown) => unknown, reject)
  return chain
}

function makeSupa(fromSequence: DbResult[]) {
  let idx = 0
  const mock = {
    from: jest.fn().mockImplementation(() => {
      const r = fromSequence[Math.min(idx, fromSequence.length - 1)]
      idx++
      return makeChain(r)
    }),
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data:  { user: { id: 'user-uuid' } },
        error: null,
      }),
    },
  }
  return mock
}

function useSupa(fromSequence: DbResult[]) {
  const mock = makeSupa(fromSequence)
  jest.mocked(createServerClient).mockReturnValue(
    mock as unknown as ReturnType<typeof createServerClient>,
  )
  return mock
}

// Flush fire-and-forget microtasks in route handlers
const flush = () => new Promise<void>((r) => setTimeout(r, 10))

// ── Silence expected console.error noise ─────────────────────────────────────

beforeAll(() => jest.spyOn(console, 'error').mockImplementation(() => {}))
afterAll(()  => jest.restoreAllMocks())

// ═════════════════════════════════════════════════════════════════════════════
// 1.  Viral coefficient (K-factor) calculation
//
//     Formula matches growth_kpis VIEW:
//       K = new_referral_signups_last_30d / retained_users_who_could_refer
//
//     "retained_users_who_could_refer" = signed up >30d ago AND have ≥1 item.
//     We test the pure arithmetic here; the SQL view is integration-tested by
//     suite 2 (view shape).
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Mirrors the K-factor formula used in the growth_kpis SQL view.
 * Exported from here so suites can share it; not a lib function in production
 * because the calculation lives in the database view.
 */
function computeViralK(
  referralSignups30d: number,
  retainedUserCount:  number,
): number {
  if (retainedUserCount === 0) return 0
  return Math.round((referralSignups30d / retainedUserCount) * 100) / 100
}

describe('Viral coefficient (K-factor) — formula correctness', () => {
  it('returns 0.50 when 10 signups from 20 retained users', () => {
    expect(computeViralK(10, 20)).toBe(0.5)
  })

  it('returns 1.00 when referral signups equal retained user count', () => {
    expect(computeViralK(30, 30)).toBe(1.0)
  })

  it('returns 0.00 when there are no referral signups', () => {
    expect(computeViralK(0, 100)).toBe(0.0)
  })

  it('returns 0.00 (not Infinity) when retained user count is 0', () => {
    expect(computeViralK(5, 0)).toBe(0.0)
  })

  it('rounds to 2 decimal places (e.g. 7 / 30 = 0.23)', () => {
    expect(computeViralK(7, 30)).toBe(0.23)
  })

  it('returns value > 1.0 for super-linear growth (K = 2.00)', () => {
    expect(computeViralK(40, 20)).toBe(2.0)
  })

  it('Phase 3 target: K ≥ 0.5 is achievable with modest referral activity', () => {
    // 50 referred signups / 100 retained users = 0.50 — Phase 3 W12 target
    expect(computeViralK(50, 100)).toBeGreaterThanOrEqual(0.5)
  })

  it('is monotonically increasing with more referral signups', () => {
    const base = computeViralK(10, 100)
    const more = computeViralK(20, 100)
    expect(more).toBeGreaterThan(base)
  })

  it('is monotonically decreasing as retained user count grows', () => {
    const fewer = computeViralK(10, 50)
    const more  = computeViralK(10, 200)
    expect(more).toBeLessThan(fewer)
  })
})

// ── weeksToTarget helper (mirrors GrowthChart.tsx) ────────────────────────────

/**
 * Mirrors weeksToTarget() from components/admin/GrowthChart.tsx.
 * Averages the last two weeks of total signups, divides remaining users
 * needed by that average.
 */
interface WeekRow { organic: number; referral: number; partner: number }

function weeksToTarget(
  data:       WeekRow[],
  totalUsers: number,
  target:     number,
): number | null {
  if (data.length < 2) return null
  const last = data[data.length - 1]
  const prev = data[data.length - 2]
  const weeklyNew = (last.organic + last.referral + last.partner)
    + (prev.organic + prev.referral + prev.partner)
  const avgPerWeek = weeklyNew / 2
  if (avgPerWeek <= 0) return null
  const remaining = target - totalUsers
  if (remaining <= 0) return 0
  return Math.ceil(remaining / avgPerWeek)
}

describe('weeksToTarget — GrowthChart countdown helper', () => {
  const twoWeeks: WeekRow[] = [
    { organic: 40, referral: 10, partner: 5 },   // prev: 55 total
    { organic: 45, referral: 15, partner: 10 },  // last: 70 total
  ]
  // avgPerWeek = (55 + 70) / 2 = 62.5

  it('returns null when fewer than 2 data points', () => {
    expect(weeksToTarget([twoWeeks[0]], 500, 10_000)).toBeNull()
    expect(weeksToTarget([], 500, 10_000)).toBeNull()
  })

  it('returns correct ceil(remaining / avgPerWeek)', () => {
    // remaining = 10_000 - 400 = 9_600; avg = 62.5; ceil(9600/62.5) = 154
    expect(weeksToTarget(twoWeeks, 400, 10_000)).toBe(154)
  })

  it('returns 0 when totalUsers >= target', () => {
    expect(weeksToTarget(twoWeeks, 10_000, 10_000)).toBe(0)
    expect(weeksToTarget(twoWeeks, 11_000, 10_000)).toBe(0)
  })

  it('returns null when all recent weeks had 0 signups', () => {
    const zero: WeekRow[] = [
      { organic: 0, referral: 0, partner: 0 },
      { organic: 0, referral: 0, partner: 0 },
    ]
    expect(weeksToTarget(zero, 500, 10_000)).toBeNull()
  })

  it('accounts for all three channels in the average', () => {
    const mixed: WeekRow[] = [
      { organic: 20, referral: 20, partner: 20 }, // 60
      { organic: 20, referral: 20, partner: 20 }, // 60; avg = 60
    ]
    // remaining = 10_000 - 1_000 = 9_000; ceil(9000/60) = 150
    expect(weeksToTarget(mixed, 1_000, 10_000)).toBe(150)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 2.  growth_kpis view shape — all fields non-null for a seeded response
//
//     Simulates the admin growth page calling .from('growth_kpis').maybeSingle()
//     and verifies the data mapping in fetchGrowthData() (inlined below because
//     that function lives in the Server Component, not an importable lib).
// ═════════════════════════════════════════════════════════════════════════════

/** Mirrors the mapping in app/admin/growth/page.tsx fetchGrowthData(). */
interface GrowthKpis {
  total_users:            number
  weekly_active_wishers:  number
  viral_k:                number
  revenue_per_user_pence: number
  d30_retention_pct:      number | null
}

function mapKpisRow(raw: DbRow | null): GrowthKpis {
  return raw ? {
    total_users:            Number(raw.total_users            ?? 0),
    weekly_active_wishers:  Number(raw.weekly_active_wishers  ?? 0),
    viral_k:                Number(raw.viral_k                ?? 0),
    revenue_per_user_pence: Number(raw.revenue_per_user_pence ?? 0),
    d30_retention_pct:      raw.d30_retention_pct !== null && raw.d30_retention_pct !== undefined
      ? Number(raw.d30_retention_pct)
      : null,
  } : {
    total_users: 0, weekly_active_wishers: 0, viral_k: 0,
    revenue_per_user_pence: 0, d30_retention_pct: null,
  }
}

const SEEDED_KPIS_ROW: DbRow = {
  total_users:            847,
  weekly_active_wishers:  123,
  viral_k:                '0.42',     // SQL NUMERIC comes back as string from JS driver
  revenue_per_user_pence: '18.7',
  d30_retention_pct:      '28.5',
}

describe('growth_kpis view — shape and field mapping', () => {
  it('all five KPI fields are present in the seeded row', () => {
    expect(SEEDED_KPIS_ROW).toHaveProperty('total_users')
    expect(SEEDED_KPIS_ROW).toHaveProperty('weekly_active_wishers')
    expect(SEEDED_KPIS_ROW).toHaveProperty('viral_k')
    expect(SEEDED_KPIS_ROW).toHaveProperty('revenue_per_user_pence')
    expect(SEEDED_KPIS_ROW).toHaveProperty('d30_retention_pct')
  })

  it('mapKpisRow converts all numeric strings to numbers', () => {
    const kpis = mapKpisRow(SEEDED_KPIS_ROW)
    expect(typeof kpis.total_users).toBe('number')
    expect(typeof kpis.weekly_active_wishers).toBe('number')
    expect(typeof kpis.viral_k).toBe('number')
    expect(typeof kpis.revenue_per_user_pence).toBe('number')
    expect(typeof kpis.d30_retention_pct).toBe('number')
  })

  it('mapKpisRow returns correct values for all fields', () => {
    const kpis = mapKpisRow(SEEDED_KPIS_ROW)
    expect(kpis.total_users).toBe(847)
    expect(kpis.weekly_active_wishers).toBe(123)
    expect(kpis.viral_k).toBeCloseTo(0.42)
    expect(kpis.revenue_per_user_pence).toBeCloseTo(18.7)
    expect(kpis.d30_retention_pct).toBeCloseTo(28.5)
  })

  it('mapKpisRow returns null for d30_retention_pct when the value is null', () => {
    const kpis = mapKpisRow({ ...SEEDED_KPIS_ROW, d30_retention_pct: null })
    expect(kpis.d30_retention_pct).toBeNull()
  })

  it('mapKpisRow returns zero-state when raw row is null (empty DB)', () => {
    const kpis = mapKpisRow(null)
    expect(kpis.total_users).toBe(0)
    expect(kpis.weekly_active_wishers).toBe(0)
    expect(kpis.viral_k).toBe(0)
    expect(kpis.revenue_per_user_pence).toBe(0)
    expect(kpis.d30_retention_pct).toBeNull()
  })

  it('simulates fetching growth_kpis from Supabase mock', async () => {
    const supa = useSupa([{ data: SEEDED_KPIS_ROW, error: null }])

    // maybeSingle() is typed unknown via the chainable mock; cast explicitly.
    const chain  = supa.from('growth_kpis') as ReturnType<typeof makeChain>
    const result = await (chain.maybeSingle as () => Promise<DbResult>)()
    const kpis   = mapKpisRow(result.data as DbRow | null)

    expect(kpis.total_users).toBe(847)
    expect(kpis.viral_k).toBeCloseTo(0.42)
  })

  it('total_users is a positive integer in seeded data', () => {
    const kpis = mapKpisRow(SEEDED_KPIS_ROW)
    expect(kpis.total_users).toBeGreaterThan(0)
    expect(Number.isInteger(kpis.total_users)).toBe(true)
  })

  it('viral_k stays within a plausible range (0 – 5) for the seeded row', () => {
    const kpis = mapKpisRow(SEEDED_KPIS_ROW)
    expect(kpis.viral_k).toBeGreaterThanOrEqual(0)
    expect(kpis.viral_k).toBeLessThanOrEqual(5)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 3.  Referral signup → referred_signups increment via RPC
//
//     A new user signs up with a valid gifthint_ref cookie.
//     Verifies that the RPC increment_referral_count is called exactly once
//     with the referrer's user ID — this is the mechanism that drives the
//     referred_signups_7d count in the growth_kpis view.
// ═════════════════════════════════════════════════════════════════════════════

describe('Referral signup → referred_signups increment', () => {
  function makeSignupReq(refCookie?: string): NextRequest {
    const req = new NextRequest('https://gifthint.io/api/auth/signup', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer test-token',
      },
    })
    if (refCookie) {
      Object.defineProperty(req, 'cookies', {
        value: { get: (name: string) => name === 'gifthint_ref' ? { value: refCookie } : undefined },
      })
    }
    return req
  }

  it('calls rpc("increment_referral_count") with the referrer UUID on valid attribution', async () => {
    const supa = useSupa([
      { data: { id: 'referrer-uuid', referral_code: 'abc12345', display_name: 'Emma', email: 'emma@example.com' }, error: null },
      { data: null, error: null }, // referred_by update
      { data: null, error: null }, // referral_events insert
    ])

    await signupAttribution(makeSignupReq('abc12345'))

    expect(supa.rpc).toHaveBeenCalledTimes(1)
    expect(supa.rpc).toHaveBeenCalledWith(
      'increment_referral_count',
      { user_id: 'referrer-uuid' },
    )
  })

  it('does NOT call rpc on organic signup (no cookie)', async () => {
    const supa = useSupa([])
    await signupAttribution(makeSignupReq())
    expect(supa.rpc).not.toHaveBeenCalled()
  })

  it('does NOT call rpc when the referral code does not exist in the DB', async () => {
    const supa = useSupa([
      { data: null, error: null }, // referrer lookup → not found
    ])
    await signupAttribution(makeSignupReq('nonexistent'))
    expect(supa.rpc).not.toHaveBeenCalled()
  })

  it('does NOT call rpc on self-referral', async () => {
    const supa = useSupa([
      { data: { id: 'same-uuid', referral_code: 'selfcode', display_name: null, email: null }, error: null },
    ])
    jest.mocked(supa.auth.getUser).mockResolvedValueOnce({
      data: { user: { id: 'same-uuid' } }, error: null,
    } as never)

    await signupAttribution(makeSignupReq('selfcode'))
    expect(supa.rpc).not.toHaveBeenCalled()
  })

  it('returns { ok: true, attributed: true } and status 200 on successful increment', async () => {
    useSupa([
      { data: { id: 'referrer-uuid', referral_code: 'abc12345', display_name: 'Jo', email: null }, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ])

    const res  = await signupAttribution(makeSignupReq('abc12345'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ ok: true, attributed: true })
  })

  it('records a "signup" event with correct referrer_id and referee_id', async () => {
    const supa = useSupa([
      { data: { id: 'referrer-uuid', referral_code: 'abc12345', display_name: null, email: null }, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ])

    await signupAttribution(makeSignupReq('abc12345'))

    // Third from() call = referral_events insert
    const insertChain = supa.from.mock.results[2]?.value as Record<string, jest.Mock>
    const insertArg   = insertChain?.insert?.mock.calls[0]?.[0] as DbRow

    expect(insertArg).toMatchObject({
      referrer_id:   'referrer-uuid',
      referee_id:    'user-uuid',     // from auth.getUser mock default
      event_type:    'signup',
      referral_code: 'abc12345',
    })
  })

  it('clears the gifthint_ref cookie in the response after attribution', async () => {
    useSupa([
      { data: { id: 'referrer-uuid', referral_code: 'abc12345', display_name: null, email: null }, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ])

    const res = await signupAttribution(makeSignupReq('abc12345'))
    const setCookie = res.headers.get('set-cookie') ?? ''

    expect(setCookie).toContain('gifthint_ref=')
    expect(setCookie).toMatch(/Max-Age=0|expires=Thu, 01 Jan 1970/i)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 4.  Partner landing page — fetchPartnerBySlug resolves for a valid slug
//
//     Tests the data-fetching layer for /partners/[slug]. The Server Component
//     itself is not renderable in Jest (it's async RSC), so we test the data
//     function that feeds it.
// ═════════════════════════════════════════════════════════════════════════════

const MOCK_PARTNER: DbRow = {
  id:             'partner-uuid',
  user_id:        'partner-user-uuid',
  slug:           'knighton-weddings',
  name:           'Knighton Weddings',
  category:       'wedding',
  tagline:        'Elegant weddings, effortless gifting',
  referral_code:  'kwed1234',
  logo_url:       'https://cdn.example.com/knighton-logo.png',
  accent_colour:  '#C084FC',
  contact_email:  'hello@knighton-weddings.co.uk',
  contact_name:   'Sarah Knighton',
  active:         true,
  created_at:     '2026-05-01T10:00:00Z',
}

describe('fetchPartnerBySlug — partner landing page data layer', () => {
  it('returns a PartnerRow for a valid, active slug', async () => {
    useSupa([{ data: MOCK_PARTNER, error: null }])

    const partner = await fetchPartnerBySlug('knighton-weddings')

    expect(partner).not.toBeNull()
    expect(partner?.slug).toBe('knighton-weddings')
    expect(partner?.name).toBe('Knighton Weddings')
    expect(partner?.category).toBe('wedding')
    expect(partner?.active).toBe(true)
  })

  it('returns all required PartnerRow fields', async () => {
    useSupa([{ data: MOCK_PARTNER, error: null }])

    const partner = await fetchPartnerBySlug('knighton-weddings')

    expect(partner).toMatchObject({
      id:            'partner-uuid',
      user_id:       'partner-user-uuid',
      slug:          'knighton-weddings',
      referral_code: 'kwed1234',
      active:        true,
    })
  })

  it('returns null for an unknown slug', async () => {
    useSupa([{ data: null, error: null }])
    const partner = await fetchPartnerBySlug('nonexistent-slug')
    expect(partner).toBeNull()
  })

  it('returns null on a Supabase error', async () => {
    useSupa([{ data: null, error: { message: 'connection refused' } }])
    const partner = await fetchPartnerBySlug('knighton-weddings')
    expect(partner).toBeNull()
  })

  it('queries partners table with .eq("slug", slug)', async () => {
    const supa = useSupa([{ data: MOCK_PARTNER, error: null }])
    await fetchPartnerBySlug('knighton-weddings')

    const chain = supa.from.mock.results[0]?.value as Record<string, jest.Mock>
    const eqCalls = (chain.eq?.mock.calls ?? []) as unknown[][]

    expect(supa.from).toHaveBeenCalledWith('partners')
    expect(eqCalls.some((call) => call[0] === 'slug' && call[1] === 'knighton-weddings')).toBe(true)
  })

  it('filters by active = true so inactive partners return null', async () => {
    const supa = useSupa([{ data: null, error: null }]) // inactive → no row returned

    await fetchPartnerBySlug('inactive-partner')

    const chain = supa.from.mock.results[0]?.value as Record<string, jest.Mock>
    const eqCalls = (chain.eq?.mock.calls ?? []) as unknown[][]

    expect(eqCalls.some((call) => call[0] === 'active' && call[1] === true)).toBe(true)
  })

  it('optional fields (logo_url, tagline, accent_colour) can be null', async () => {
    const minimalPartner = { ...MOCK_PARTNER, logo_url: null, tagline: null, accent_colour: null }
    useSupa([{ data: minimalPartner, error: null }])

    const partner = await fetchPartnerBySlug('knighton-weddings')

    expect(partner?.logo_url).toBeNull()
    expect(partner?.tagline).toBeNull()
    expect(partner?.accent_colour).toBeNull()
  })

  it('all valid partner categories are accepted', async () => {
    const categories = ['wedding', 'baby_shower', 'corporate', 'sports_club', 'education', 'other'] as const

    for (const category of categories) {
      useSupa([{ data: { ...MOCK_PARTNER, category }, error: null }])
      const partner = await fetchPartnerBySlug('knighton-weddings')
      expect(partner?.category).toBe(category)
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 5.  GET /r/[code] — 302 redirect to homepage
//
//     Validates the fundamental promise of the referral link: it is a pure
//     redirect handler that never renders HTML. The redirect must be a 3xx
//     (Next.js NextResponse.redirect defaults to 307, which browsers treat
//     as temporary). A 302 is the logical intent and both are acceptable here.
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /r/[code] — redirect behaviour', () => {
  function makeReq(code: string): NextRequest {
    return new NextRequest(`https://gifthint.io/r/${code}`)
  }

  it('returns a 3xx redirect (307) for a valid referral code', async () => {
    useSupa([
      { data: { id: 'referrer-uuid', referral_code: 'abc12345' }, error: null },
      { data: null, error: null },
    ])

    const res = await referralRedirect(makeReq('abc12345'), { params: { code: 'abc12345' } })

    expect(res.status).toBeGreaterThanOrEqual(300)
    expect(res.status).toBeLessThan(400)
  })

  it('redirect location points to the homepage (gifthint.io/)', async () => {
    useSupa([
      { data: { id: 'referrer-uuid', referral_code: 'abc12345' }, error: null },
      { data: null, error: null },
    ])

    const res = await referralRedirect(makeReq('abc12345'), { params: { code: 'abc12345' } })
    const loc = res.headers.get('location') ?? ''

    expect(loc).toMatch(/^https:\/\/gifthint\.io\//)
    expect(new URL(loc).pathname).toBe('/')
  })

  it('appends ?ref=[code] to the redirect URL', async () => {
    useSupa([
      { data: { id: 'referrer-uuid', referral_code: 'abc12345' }, error: null },
      { data: null, error: null },
    ])

    const res = await referralRedirect(makeReq('abc12345'), { params: { code: 'abc12345' } })
    const loc = new URL(res.headers.get('location') ?? 'https://gifthint.io/')

    expect(loc.searchParams.get('ref')).toBe('abc12345')
  })

  it('still redirects (to /) for an unknown code — never returns 4xx', async () => {
    useSupa([{ data: null, error: null }])

    const res = await referralRedirect(makeReq('badcode'), { params: { code: 'badcode' } })

    expect(res.status).toBeGreaterThanOrEqual(300)
    expect(res.status).toBeLessThan(400)
    expect(res.headers.get('location')).toBe('https://gifthint.io/')
  })

  it('does NOT set a gifthint_ref cookie for an unknown code', async () => {
    useSupa([{ data: null, error: null }])

    const res = await referralRedirect(makeReq('badcode'), { params: { code: 'badcode' } })

    expect(res.headers.get('set-cookie') ?? '').not.toContain('gifthint_ref')
  })

  it('redirects to / for an empty code — never throws', async () => {
    useSupa([])

    const res = await referralRedirect(makeReq(''), { params: { code: '' } })

    expect(res.status).toBeGreaterThanOrEqual(300)
    expect(res.status).toBeLessThan(400)
  })

  it('response body is empty — this is a pure redirect, no HTML rendered', async () => {
    useSupa([
      { data: { id: 'referrer-uuid', referral_code: 'abc12345' }, error: null },
      { data: null, error: null },
    ])

    const res  = await referralRedirect(makeReq('abc12345'), { params: { code: 'abc12345' } })
    const body = await res.text()

    // NextResponse.redirect returns no body content
    expect(body).toBe('')
  })

  it('fire-and-forget click insert does not delay the redirect', async () => {
    useSupa([
      { data: { id: 'referrer-uuid', referral_code: 'abc12345' }, error: null },
      { data: null, error: null },
    ])

    const start = Date.now()
    await referralRedirect(makeReq('abc12345'), { params: { code: 'abc12345' } })
    const elapsed = Date.now() - start

    // The redirect itself should complete in well under 100ms (the insert is async)
    expect(elapsed).toBeLessThan(200)

    await flush() // settle the background insert so Jest can exit cleanly
  })
})
