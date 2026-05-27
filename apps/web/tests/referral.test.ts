/**
 * tests/referral.test.ts — GiftHint Referral System suite
 *
 * Covers:
 *   1. GET /r/[code]              — cookie setting, click event logging, redirects
 *   2. POST /api/auth/signup      — referred_by, counter increment, duplicate guard,
 *                                   self-referral guard, no-cookie path
 *   3. lib/referral.ts            — getReferralLink, getReferralStats, generateReferralCode
 *   4. lib/rewards.ts integration — custom username at count=1, themes at count=3
 *   5. lib/email.ts               — sendReferralEmail resolves in test mode
 *   6. lib/supabase-server.ts     — DbUser type shape
 *
 * Mock strategy:
 *   createServerClient() is replaced with the project-standard chainable mock.
 *   fromSequence[n] is consumed by the n-th supabase.from() call, so each test
 *   can express exactly what the DB returns at each step without a running DB.
 *
 * Run:  npx jest tests/referral.test.ts
 */

// ── Environment ───────────────────────────────────────────────────────────────

process.env.NEXT_PUBLIC_APP_URL = 'https://gifthint.io'
process.env.RESEND_TEST_MODE    = 'true'
;(process.env as Record<string, string>).NODE_ENV = 'test'

// ── Supabase mock — must be hoisted above all imports ─────────────────────────

jest.mock('@/lib/supabase-server', () => ({
  createServerClient: jest.fn(),
}))

// rewards.ts is imported by the signup route; mock it to keep the unit tight
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
import { GET  as referralRedirect } from '@/app/r/[code]/route'
import { POST as signupAttribution } from '@/app/api/auth/signup/route'
import { getReferralLink, getReferralStats, generateReferralCode } from '@/lib/referral'
import { sendReferralEmail } from '@/lib/email'
import type { DbUser }        from '@/lib/supabase-server'

// ── Chainable Supabase mock ───────────────────────────────────────────────────

type DbRow    = Record<string, unknown>
type DbResult = { data: DbRow | DbRow[] | null; error: { message: string } | null; count?: number }

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

  // Direct await support — covers `.then(({ error })` in fire-and-forget blocks
  chain.then = (
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
    rpc: jest.fn().mockResolvedValue({ error: null }),
    auth: {
      // Default: valid JWT resolving to 'new-user-uuid'.
      // Individual tests override this via mock.auth.getUser.mockResolvedValueOnce(...)
      getUser: jest.fn().mockResolvedValue({
        data:  { user: { id: 'new-user-uuid' } },
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

// ── Flush fire-and-forget microtasks ──────────────────────────────────────────

const flush = () => new Promise<void>((r) => setTimeout(r, 10))

// ── Request factories ─────────────────────────────────────────────────────────

function makeRedirectReq(code: string): NextRequest {
  return new NextRequest(`https://gifthint.io/r/${code}`)
}

function makeSignupReq(
  _userId: string,  // kept for call-site clarity; actual identity comes from the JWT mock
  refCookie?: string,
): NextRequest {
  const req = new NextRequest('https://gifthint.io/api/auth/signup', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': 'Bearer test-access-token',
    },
  })
  if (refCookie) {
    Object.defineProperty(req, 'cookies', {
      value: {
        get: (name: string) =>
          name === 'gifthint_ref' ? { value: refCookie } : undefined,
      },
    })
  }
  return req
}

// ── Silence expected console.error noise ─────────────────────────────────────

beforeAll(() => { jest.spyOn(console, 'error').mockImplementation(() => {}) })
afterAll(()  => { jest.restoreAllMocks() })

// ═════════════════════════════════════════════════════════════════════════════
// 1.  GET /r/[code] — referral link redirect
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /r/[code] — referral redirect', () => {
  // ── Happy path ──────────────────────────────────────────────────────────────

  it('redirects to /?ref=[code] when code is valid', async () => {
    useSupa([
      { data: { id: 'referrer-uuid', referral_code: 'abc12345' }, error: null }, // users lookup
      { data: null, error: null },                                                 // click insert
    ])

    const res = await referralRedirect(
      makeRedirectReq('abc12345'),
      { params: { code: 'abc12345' } },
    )

    expect(res.status).toBe(307)
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('/?ref=abc12345')
  })

  it('sets gifthint_ref cookie with correct value and maxAge', async () => {
    useSupa([
      { data: { id: 'referrer-uuid', referral_code: 'abc12345' }, error: null },
      { data: null, error: null },
    ])

    const res = await referralRedirect(
      makeRedirectReq('abc12345'),
      { params: { code: 'abc12345' } },
    )

    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('gifthint_ref=abc12345')
    // 30 days = 2 592 000 seconds
    expect(setCookie).toContain('Max-Age=2592000')
  })

  it('sets cookie as HttpOnly', async () => {
    useSupa([
      { data: { id: 'referrer-uuid', referral_code: 'abc12345' }, error: null },
      { data: null, error: null },
    ])

    const res = await referralRedirect(
      makeRedirectReq('abc12345'),
      { params: { code: 'abc12345' } },
    )

    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie.toLowerCase()).toContain('httponly')
  })

  it('sets cookie SameSite=Lax', async () => {
    useSupa([
      { data: { id: 'referrer-uuid', referral_code: 'abc12345' }, error: null },
      { data: null, error: null },
    ])

    const res = await referralRedirect(
      makeRedirectReq('abc12345'),
      { params: { code: 'abc12345' } },
    )

    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie.toLowerCase()).toContain('samesite=lax')
  })

  it('logs a click event with correct fields after redirect', async () => {
    const supa = useSupa([
      { data: { id: 'referrer-uuid', referral_code: 'abc12345' }, error: null },
      { data: null, error: null },
    ])

    await referralRedirect(
      makeRedirectReq('abc12345'),
      { params: { code: 'abc12345' } },
    )

    await flush() // let the fire-and-forget insert settle

    // The second from() call is the click insert
    const insertChain = supa.from.mock.results[1]?.value as Record<string, jest.Mock>
    const insertArg   = insertChain?.insert?.mock.calls[0]?.[0] as DbRow

    expect(insertArg).toMatchObject({
      referrer_id:   'referrer-uuid',
      event_type:    'click',
      referral_code: 'abc12345',
      referee_id:    null,
    })
  })

  // ── Invalid / missing code ──────────────────────────────────────────────────

  it('redirects to / without cookie when code is unknown', async () => {
    useSupa([
      { data: null, error: null }, // no user found
    ])

    const res = await referralRedirect(
      makeRedirectReq('notacode'),
      { params: { code: 'notacode' } },
    )

    expect(res.status).toBe(307)
    const loc = res.headers.get('location') ?? ''
    expect(loc).toBe('https://gifthint.io/')
    // No cookie should be set
    expect(res.headers.get('set-cookie') ?? '').not.toContain('gifthint_ref')
  })

  it('redirects to / without cookie when params.code is empty', async () => {
    useSupa([])

    const res = await referralRedirect(
      makeRedirectReq(''),
      { params: { code: '' } },
    )

    expect(res.status).toBe(307)
    expect(res.headers.get('set-cookie') ?? '').not.toContain('gifthint_ref')
  })

  it('does NOT log a click event for an unknown code', async () => {
    const supa = useSupa([
      { data: null, error: null }, // no user found
    ])

    await referralRedirect(
      makeRedirectReq('badcode'),
      { params: { code: 'badcode' } },
    )

    await flush()

    // Only one from() call was made (the user lookup); no insert
    expect(supa.from.mock.calls.length).toBe(1)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 2.  POST /api/auth/signup — referral attribution
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /api/auth/signup — referral attribution', () => {
  // ── No cookie — organic signup ──────────────────────────────────────────────

  it('returns { ok: true, attributed: false } when no cookie is present', async () => {
    useSupa([])
    const res  = await signupAttribution(makeSignupReq('new-user-uuid'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toMatchObject({ ok: true, attributed: false })
  })

  it('makes no DB calls when there is no referral cookie', async () => {
    const supa = useSupa([])
    await signupAttribution(makeSignupReq('new-user-uuid'))
    expect(supa.from.mock.calls.length).toBe(0)
  })

  // ── Cookie present — happy path ─────────────────────────────────────────────

  it('returns { ok: true, attributed: true } on successful attribution', async () => {
    useSupa([
      // referrer lookup
      { data: { id: 'referrer-uuid', referral_code: 'abc12345', display_name: 'Emma', email: 'emma@example.com' }, error: null },
      // referred_by update
      { data: null, error: null },
      // referral_events insert
      { data: null, error: null },
    ])

    const res  = await signupAttribution(makeSignupReq('new-user-uuid', 'abc12345'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toMatchObject({ ok: true, attributed: true })
  })

  it('sets referred_by = referrer.id on the new user', async () => {
    const supa = useSupa([
      { data: { id: 'referrer-uuid', referral_code: 'abc12345', display_name: 'Emma', email: null }, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ])

    await signupAttribution(makeSignupReq('new-user-uuid', 'abc12345'))

    // Second from() call is the referred_by update
    const updateChain = supa.from.mock.results[1]?.value as Record<string, jest.Mock>
    const updateArg   = updateChain?.update?.mock.calls[0]?.[0] as DbRow

    expect(updateArg).toMatchObject({ referred_by: 'referrer-uuid' })
  })

  it('uses .is("referred_by", null) guard to prevent double-attribution', async () => {
    const supa = useSupa([
      { data: { id: 'referrer-uuid', referral_code: 'abc12345', display_name: null, email: null }, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ])

    await signupAttribution(makeSignupReq('new-user-uuid', 'abc12345'))

    const updateChain = supa.from.mock.results[1]?.value as Record<string, jest.Mock>
    // .is() must be called with ('referred_by', null) — idempotency guard
    const isCalls = updateChain?.is?.mock.calls as unknown[][]
    expect(isCalls.some((call) => call[0] === 'referred_by' && call[1] === null)).toBe(true)
  })

  it('increments referral_count via RPC', async () => {
    const supa = useSupa([
      { data: { id: 'referrer-uuid', referral_code: 'abc12345', display_name: null, email: null }, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ])

    await signupAttribution(makeSignupReq('new-user-uuid', 'abc12345'))

    expect(supa.rpc).toHaveBeenCalledWith(
      'increment_referral_count',
      { user_id: 'referrer-uuid' },
    )
  })

  it('logs a signup event with correct fields', async () => {
    const supa = useSupa([
      { data: { id: 'referrer-uuid', referral_code: 'abc12345', display_name: null, email: null }, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ])

    await signupAttribution(makeSignupReq('new-user-uuid', 'abc12345'))

    // Third from() call is the referral_events insert
    const insertChain = supa.from.mock.results[2]?.value as Record<string, jest.Mock>
    const insertArg   = insertChain?.insert?.mock.calls[0]?.[0] as DbRow

    expect(insertArg).toMatchObject({
      referrer_id:   'referrer-uuid',
      referee_id:    'new-user-uuid',
      event_type:    'signup',
      referral_code: 'abc12345',
    })
  })

  it('clears the gifthint_ref cookie after attribution', async () => {
    useSupa([
      { data: { id: 'referrer-uuid', referral_code: 'abc12345', display_name: null, email: null }, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ])

    const res = await signupAttribution(makeSignupReq('new-user-uuid', 'abc12345'))

    const setCookie = res.headers.get('set-cookie') ?? ''
    // Cookie should be expired / zeroed out
    expect(setCookie).toContain('gifthint_ref=')
    expect(setCookie).toMatch(/Max-Age=0|expires=Thu, 01 Jan 1970/i)
  })

  // ── Self-referral prevention ────────────────────────────────────────────────

  it('prevents self-referral: returns attributed: false when referrer.id === userId', async () => {
    // JWT resolves to 'same-user-uuid' — same as the referrer row returned by DB
    const supa = useSupa([
      { data: { id: 'same-user-uuid', referral_code: 'selfcode', display_name: null, email: null }, error: null },
    ])
    jest.mocked(supa.auth.getUser).mockResolvedValueOnce({
      data: { user: { id: 'same-user-uuid' } }, error: null,
    } as never)

    const res  = await signupAttribution(makeSignupReq('same-user-uuid', 'selfcode'))
    const body = await res.json()
    expect(body).toMatchObject({ ok: true, attributed: false })
  })

  it('makes no RPC call on self-referral', async () => {
    const supa = useSupa([
      { data: { id: 'same-user-uuid', referral_code: 'selfcode', display_name: null, email: null }, error: null },
    ])
    jest.mocked(supa.auth.getUser).mockResolvedValueOnce({
      data: { user: { id: 'same-user-uuid' } }, error: null,
    } as never)

    await signupAttribution(makeSignupReq('same-user-uuid', 'selfcode'))
    expect(supa.rpc).not.toHaveBeenCalled()
  })

  // ── Duplicate attribution prevention ───────────────────────────────────────

  it('still returns 200 when referred_by update is a no-op (already attributed)', async () => {
    // The .is('referred_by', null) guard causes the UPDATE to match 0 rows.
    // Supabase returns { data: null, error: null } for a 0-row update — not an error.
    useSupa([
      { data: { id: 'referrer-uuid', referral_code: 'abc12345', display_name: null, email: null }, error: null },
      { data: null, error: null }, // 0-row update — not treated as error
      { data: null, error: null },
    ])

    const res  = await signupAttribution(makeSignupReq('already-attributed-uuid', 'abc12345'))
    const body = await res.json()
    expect(res.status).toBe(200)
    // The flow continues — counter still increments, event still logged
    expect(body.ok).toBe(true)
  })

  // ── Invalid code ───────────────────────────────────────────────────────────

  it('returns { attributed: false } and clears cookie when code is invalid', async () => {
    useSupa([
      { data: null, error: null }, // no referrer found
    ])

    const res  = await signupAttribution(makeSignupReq('new-user-uuid', 'invalid'))
    const body = await res.json()
    expect(body).toMatchObject({ ok: true, attributed: false })
    // Cookie should still be cleared
    expect(res.headers.get('set-cookie') ?? '').toMatch(/gifthint_ref=/)
  })

  // ── Auth validation ────────────────────────────────────────────────────────

  it('returns 401 when Authorization header is missing', async () => {
    useSupa([])
    const req = new NextRequest('https://gifthint.io/api/auth/signup', {
      method: 'POST',
    })
    const res = await signupAttribution(req)
    expect(res.status).toBe(401)
  })

  it('returns 401 when the JWT is invalid', async () => {
    const supa = useSupa([])
    jest.mocked(supa.auth.getUser).mockResolvedValueOnce({
      data: { user: null }, error: { message: 'invalid token' },
    } as never)

    const req = new NextRequest('https://gifthint.io/api/auth/signup', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer bad-token' },
    })
    const res = await signupAttribution(req)
    expect(res.status).toBe(401)
  })

  // ── Reward integration ─────────────────────────────────────────────────────

  it("calls checkAndApplyRewards with the referrer's id after signup", async () => {
    const { checkAndApplyRewards } = jest.requireMock('@/lib/rewards')
    jest.clearAllMocks()

    useSupa([
      { data: { id: 'referrer-uuid', referral_code: 'abc12345', display_name: null, email: null }, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ])

    await signupAttribution(makeSignupReq('new-user-uuid', 'abc12345'))

    expect(checkAndApplyRewards).toHaveBeenCalledWith('referrer-uuid')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 3.  lib/referral.ts — utility functions
// ═════════════════════════════════════════════════════════════════════════════

describe('getReferralLink', () => {
  it('returns https://gifthint.io/r/[code]', () => {
    expect(getReferralLink({ referral_code: 'abc12345' } as DbUser))
      .toBe('https://gifthint.io/r/abc12345')
  })

  it('is a valid HTTPS URL', () => {
    const link = getReferralLink({ referral_code: 'abc12345' } as DbUser)
    const u = new URL(link)
    expect(u.protocol).toBe('https:')
    expect(u.pathname).toBe('/r/abc12345')
  })

  it('embeds the code verbatim (no case transforms)', () => {
    expect(getReferralLink({ referral_code: 'XyZ9' } as DbUser))
      .toContain('/r/XyZ9')
  })
})

describe('getReferralStats', () => {
  function mockCountSupa(clicks: number, signups: number, firstSaves: number) {
    let idx = 0
    const counts = [clicks, signups, firstSaves]
    jest.mocked(createServerClient).mockReturnValue({
      from: jest.fn().mockImplementation(() => {
        const c = counts[Math.min(idx, counts.length - 1)]
        idx++
        const chain: Record<string, unknown> = {}
        for (const m of ['select', 'eq']) chain[m] = jest.fn().mockReturnValue(chain)
        chain.then = (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ count: c, error: null }).then(resolve)
        return chain
      }),
    } as unknown as ReturnType<typeof createServerClient>)
  }

  it('returns correct counts for clicks, signups, first_saves', async () => {
    mockCountSupa(42, 7, 5)
    const s = await getReferralStats('user-uuid')
    expect(s).toEqual({ totalClicks: 42, totalSignups: 7, totalFirstSaves: 5 })
  })

  it('returns zeros when there are no events', async () => {
    mockCountSupa(0, 0, 0)
    const s = await getReferralStats('user-uuid')
    expect(s.totalClicks).toBe(0)
    expect(s.totalSignups).toBe(0)
    expect(s.totalFirstSaves).toBe(0)
  })
})

describe('generateReferralCode', () => {
  it('returns an 8-character string', async () => {
    useSupa([{ data: null, error: null }]) // uniqueness check returns no conflict
    const code = await generateReferralCode()
    expect(code).toHaveLength(8)
  })

  it('only uses characters from the safe alphabet (no 0, 1, i, l, o)', async () => {
    useSupa(Array(20).fill({ data: null, error: null }))
    const codes = await Promise.all(Array.from({ length: 10 }, () => generateReferralCode()))
    codes.forEach((code) => {
      expect(/[01ilo]/i.test(code)).toBe(false)
    })
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 4.  checkAndApplyRewards — reward unlock thresholds
//     (uses real implementation via jest.requireActual)
// ═════════════════════════════════════════════════════════════════════════════

describe('checkAndApplyRewards — reward unlock thresholds', () => {
  const { computeRewardPatch } = jest.requireActual<
    typeof import('@/lib/rewards')
  >('@/lib/rewards')

  it('unlocks custom_username_enabled at referral_count = 1', () => {
    expect(computeRewardPatch(1).custom_username_enabled).toBe(true)
    expect(computeRewardPatch(0).custom_username_enabled).toBe(false)
  })

  it('unlocks premium_themes_enabled at referral_count = 3', () => {
    expect(computeRewardPatch(3).premium_themes_enabled).toBe(true)
    expect(computeRewardPatch(2).premium_themes_enabled).toBe(false)
  })

  it('unlocks priority_support_enabled at referral_count = 5', () => {
    expect(computeRewardPatch(5).priority_support_enabled).toBe(true)
    expect(computeRewardPatch(4).priority_support_enabled).toBe(false)
  })

  it('upgrades premium_tier to "pro" at referral_count = 10', () => {
    expect(computeRewardPatch(10).premium_tier).toBe('pro')
    expect(computeRewardPatch(9).premium_tier).toBe('plus')
  })

  it('all plus-tier features are unlocked at pro tier (10+ referrals)', () => {
    const patch = computeRewardPatch(10)
    expect(patch.custom_username_enabled).toBe(true)
    expect(patch.premium_themes_enabled).toBe(true)
    expect(patch.priority_support_enabled).toBe(true)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 5.  sendReferralEmail — test-mode smoke test
// ═════════════════════════════════════════════════════════════════════════════

describe('sendReferralEmail', () => {
  it('resolves without throwing in RESEND_TEST_MODE', async () => {
    await expect(
      sendReferralEmail({ to: 'referrer@example.com', referrerName: 'Emma' }),
    ).resolves.toBeUndefined()
  })

  it('resolves when referrerName is the fallback "there"', async () => {
    await expect(
      sendReferralEmail({ to: 'x@example.com', referrerName: 'there' }),
    ).resolves.toBeUndefined()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 6.  DbUser type — referral + reward fields present
// ═════════════════════════════════════════════════════════════════════════════

describe('DbUser — referral and reward field types', () => {
  it('accepts a fully-populated referral user object', () => {
    const user: DbUser = {
      id: 'uuid', google_id: 'gid', email: 'a@b.com',
      display_name: 'Alice', avatar_url: null, public_username: 'alice',
      created_at: '2026-01-01T00:00:00Z',
      price_alerts_enabled: true, unsubscribe_token: null,
      referral_code: 'abc12345', referred_by: null, referral_count: 3,
      premium_tier: 'plus',
      custom_username_enabled: true, premium_themes_enabled: true,
      priority_support_enabled: false,
    }
    expect(user.referral_code).toBe('abc12345')
    expect(user.referral_count).toBe(3)
    expect(user.premium_tier).toBe('plus')
  })

  it('referred_by accepts null (organic signup)', () => {
    const partial = { referred_by: null } as Pick<DbUser, 'referred_by'>
    expect(partial.referred_by).toBeNull()
  })

  it('referred_by accepts a UUID string (referred signup)', () => {
    const partial = { referred_by: 'referrer-uuid' } as Pick<DbUser, 'referred_by'>
    expect(partial.referred_by).toBe('referrer-uuid')
  })
})
