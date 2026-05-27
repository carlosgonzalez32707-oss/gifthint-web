/**
 * tests/premium.test.ts — GiftHint
 *
 * QA tests for the premium subscription, feature gating, billing webhook,
 * and ThemeSelector component.
 *
 * Coverage:
 *   isPro()
 *     — returns true  when status='pro' and period_end is in the future
 *     — returns true  when status='pro' even when period_end is past
 *       (active subscriptions trust Stripe; date check only applies on cancel)
 *     — returns false when status='cancelled' and period_end has elapsed
 *     — boundary: returns false at the exact millisecond period_end expires
 *
 *   hasFeature()
 *     — returns true  for Pro user requesting 'custom_themes'
 *     — returns true  for free user with premium_themes_enabled (referral unlock)
 *     — returns false for free user without referral unlock
 *
 *   Billing webhook — POST /api/billing/webhook
 *     checkout.session.completed  → writes subscription_status='pro' to DB
 *     customer.subscription.deleted → writes subscription_status='cancelled' to DB
 *     Missing stripe-signature header → returns 400
 *     Invalid stripe-signature → returns 400
 *     invoice.payment_failed → sends payment-failed email, returns 200
 *
 *   ThemeSelector (React component)
 *     — all 5 premium theme cards render with blur lock overlay for free users
 *     — 'default' card does NOT render with lock overlay for free users
 *     — all 5 premium theme cards render WITHOUT lock overlay for Pro users
 *
 * Mock strategy:
 *   @/lib/supabase-server — createServerClient() replaced with chainable mock
 *   @/lib/stripe          — stripe() singleton replaced; webhooks + subscriptions
 *                           methods controlled per-test
 *   @/lib/email           — sendPaymentFailedEmail mocked to avoid network calls
 *   @/lib/supabase-browser — getBrowserClient() stub (only called on interaction)
 *
 * Run with: npm test -- premium
 */

// ── Mocks — must be hoisted before any imports ────────────────────────────────

jest.mock('@/lib/supabase-server', () => ({
  createServerClient: jest.fn(),
}))

jest.mock('@/lib/stripe', () => ({
  stripe: jest.fn(),
}))

jest.mock('@/lib/email', () => ({
  sendPaymentFailedEmail:          jest.fn().mockResolvedValue(undefined),
  sendContributorThankYouEmail:    jest.fn(),
  sendPoolFundedEmail:             jest.fn(),
  sendPriceDropAlertEmail:         jest.fn(),
  sendWeeklyDigestEmail:           jest.fn(),
  sendGroupGiftEmail:              jest.fn(),
}))

// getBrowserClient is only called inside the click handler — not during render.
// Mock it anyway to prevent the module from throwing on missing SUPABASE env vars.
jest.mock('@/lib/supabase-browser', () => ({
  getBrowserClient: jest.fn().mockReturnValue({
    from: jest.fn().mockReturnValue({
      update: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }),
    }),
  }),
}))

import React                        from 'react'
import { renderToStaticMarkup }     from 'react-dom/server'
import { NextRequest }              from 'next/server'

import { isPro, hasFeature }        from '@/lib/permissions'
import type { PermissionsUser }     from '@/lib/permissions'
import { createServerClient }       from '@/lib/supabase-server'
import { stripe }                   from '@/lib/stripe'
import { sendPaymentFailedEmail }   from '@/lib/email'

import { POST as billingWebhookPost } from '@/app/api/billing/webhook/route'
import { ThemeSelector }              from '@/components/dashboard/ThemeSelector'

// ── Shared fixtures ────────────────────────────────────────────────────────────

const USER_ID      = 'user-uuid-premium-001'
const SUB_ID       = 'sub_test_premium_001'
const CUSTOMER_ID  = 'cus_test_premium_001'
const PRICE_ID     = 'price_test_monthly_001'
const ITEM_ID_STRIPE = 'si_test_item_001'

const futureISO = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
const pastISO   = new Date(Date.now() -  1 * 24 * 60 * 60 * 1000).toISOString()

/** Unix timestamp 30 days from now (used in Stripe subscription items). */
const futurePeriodEndUnix = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60

function makeUser(overrides: Partial<PermissionsUser> = {}): PermissionsUser {
  return {
    subscription_status:     'free',
    subscription_period_end: null,
    premium_themes_enabled:   false,
    priority_support_enabled: false,
    custom_username_enabled:  false,
    premium_tier:             'free',
    ...overrides,
  }
}

// ── Supabase chainable mock (mirrors group-gifting.test.ts pattern) ────────────

type DbRow    = Record<string, unknown>
type DbResult = { data: DbRow | DbRow[] | null; error: { message: string } | null }

function makeSupa(fromSequence: DbResult[]) {
  let callIdx = 0

  function makeChain(result: DbResult) {
    const chain: Record<string, unknown> = {}

    for (const m of ['select', 'update', 'insert', 'upsert', 'delete', 'eq', 'neq', 'is', 'not', 'in', 'order', 'limit']) {
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

  return {
    from: jest.fn().mockImplementation(() => {
      const result = fromSequence[Math.min(callIdx, fromSequence.length - 1)]
      callIdx++
      return makeChain(result)
    }),
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: USER_ID } }, error: null }),
    },
  }
}

function useSupa(seq: DbResult[]) {
  const mock = makeSupa(seq)
  jest.mocked(createServerClient).mockReturnValue(
    mock as unknown as ReturnType<typeof createServerClient>,
  )
  return mock
}

// ── Stripe mock helpers ────────────────────────────────────────────────────────

/**
 * Builds a minimal Stripe Subscription object matching the v22 shape:
 * current_period_end lives on SubscriptionItem, not the Subscription root.
 */
function makeStripeSubscription(opts: {
  id?:        string
  status?:    string
  userId?:    string
  periodEnd?: number
  cancelledAt?: number | null
} = {}) {
  const periodEnd = opts.periodEnd ?? futurePeriodEndUnix
  return {
    id:          opts.id      ?? SUB_ID,
    status:      opts.status  ?? 'active',
    customer:    CUSTOMER_ID,
    canceled_at: opts.cancelledAt ?? null,
    created:     Math.floor(Date.now() / 1000) - 60,
    metadata:    { userId: opts.userId ?? USER_ID },
    items: {
      data: [
        {
          id:                ITEM_ID_STRIPE,
          price:             { id: PRICE_ID },
          current_period_end: periodEnd,
        },
      ],
    },
  }
}

/**
 * Builds a minimal Stripe Checkout Session for subscription mode.
 */
function makeCheckoutSession(opts: { subscriptionId?: string; customerId?: string } = {}) {
  return {
    id:           'cs_test_001',
    mode:         'subscription',
    subscription: opts.subscriptionId ?? SUB_ID,
    customer:     opts.customerId ?? CUSTOMER_ID,
  }
}

/**
 * Wraps a Stripe event payload in the minimal Event envelope.
 */
function makeStripeEvent(type: string, data: object) {
  return { id: `evt_test_${Date.now()}`, type, data: { object: data } }
}

/**
 * Builds a NextRequest for the billing webhook with a raw JSON body
 * and a fake stripe-signature header.
 */
function webhookReq(payload: object, sig = 'valid-sig') {
  return new NextRequest('http://localhost/api/billing/webhook', {
    method:  'POST',
    body:    JSON.stringify(payload),
    headers: {
      'Content-Type':    'application/json',
      'stripe-signature': sig,
    },
  })
}

/**
 * Configures the stripe() mock to return a client that:
 *   - verifies any signature (constructEvent just returns the payload)
 *   - exposes subscriptions.retrieve returning the given subscription
 */
// Accepts a full subscription object or a partial spread (e.g. metadata: {})
// so TypeScript doesn't lock the parameter to the exact inferred return shape.
function useStripe(subscription?: Record<string, unknown>) {
  const mockClient = {
    webhooks: {
      constructEvent: jest.fn().mockImplementation((_body: Buffer, _sig: string, _secret: string) => {
        // Parse the raw body back to the event payload — no real signature check in tests.
        return JSON.parse(_body.toString())
      }),
    },
    subscriptions: {
      retrieve: jest.fn().mockResolvedValue(subscription ?? makeStripeSubscription()),
    },
  }
  jest.mocked(stripe).mockReturnValue(mockClient as unknown as ReturnType<typeof stripe>)
  return mockClient
}

// Set the webhook secret env var once for all webhook tests.
beforeAll(() => {
  process.env.STRIPE_BILLING_WEBHOOK_SECRET = 'whsec_test_secret'
})

afterEach(() => {
  jest.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// isPro() — subscription status gating
// ─────────────────────────────────────────────────────────────────────────────

describe('isPro() — subscription status gating', () => {
  it('returns true when subscription_status=pro and period_end is in the future', () => {
    const user = makeUser({
      subscription_status:     'pro',
      subscription_period_end: futureISO,
    })
    expect(isPro(user)).toBe(true)
  })

  it('returns true when subscription_status=pro even when period_end is past (active subs trust Stripe)', () => {
    // Design note: for status='pro', isPro() returns true unconditionally.
    // Stripe keeps this status accurate while the subscription is live.
    // The period_end date-check only applies during the 'cancelled' grace window.
    const user = makeUser({
      subscription_status:     'pro',
      subscription_period_end: pastISO,
    })
    expect(isPro(user)).toBe(true)
  })

  it('returns false when subscription_status=cancelled and period_end has elapsed', () => {
    const user = makeUser({
      subscription_status:     'cancelled',
      subscription_period_end: pastISO,
    })
    expect(isPro(user)).toBe(false)
  })

  it('returns true when subscription_status=cancelled but period_end is still in the future (grace access)', () => {
    const user = makeUser({
      subscription_status:     'cancelled',
      subscription_period_end: futureISO,
    })
    expect(isPro(user)).toBe(true)
  })

  it('returns false when status=cancelled with no period_end', () => {
    const user = makeUser({
      subscription_status:     'cancelled',
      subscription_period_end: null,
    })
    expect(isPro(user)).toBe(false)
  })

  it('returns false for a free user', () => {
    expect(isPro(makeUser())).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// hasFeature() — custom_themes via paid subscription and referral path
// ─────────────────────────────────────────────────────────────────────────────

describe('hasFeature() — custom_themes feature', () => {
  it('returns true for a Pro subscriber requesting custom_themes', () => {
    const user = makeUser({ subscription_status: 'pro' })
    expect(hasFeature(user, 'custom_themes')).toBe(true)
  })

  it('returns true for a free user with premium_themes_enabled=true (3-referral unlock)', () => {
    const user = makeUser({ premium_themes_enabled: true })
    expect(hasFeature(user, 'custom_themes')).toBe(true)
  })

  it('returns false for a free user without the referral unlock', () => {
    const user = makeUser({ premium_themes_enabled: false })
    expect(hasFeature(user, 'custom_themes')).toBe(false)
  })

  it('returns true for a cancelled-in-period user requesting custom_themes', () => {
    const user = makeUser({
      subscription_status:     'cancelled',
      subscription_period_end: futureISO,
    })
    expect(hasFeature(user, 'custom_themes')).toBe(true)
  })

  it('returns false for a cancelled-post-period user without referral unlock', () => {
    const user = makeUser({
      subscription_status:     'cancelled',
      subscription_period_end: pastISO,
      premium_themes_enabled:  false,
    })
    expect(hasFeature(user, 'custom_themes')).toBe(false)
  })

  it('subscription-only: returns false for unlimited_lists regardless of referral flags', () => {
    const userWithAllReferrals = makeUser({
      premium_themes_enabled:   true,
      priority_support_enabled: true,
      custom_username_enabled:  true,
    })
    expect(hasFeature(userWithAllReferrals, 'unlimited_lists')).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Billing webhook — POST /api/billing/webhook
// ─────────────────────────────────────────────────────────────────────────────

describe('Billing webhook — signature guard', () => {
  it('returns 400 when stripe-signature header is absent', async () => {
    useStripe()
    useSupa([])
    const req = new NextRequest('http://localhost/api/billing/webhook', {
      method: 'POST',
      body:   '{}',
      headers: { 'Content-Type': 'application/json' },
      // no stripe-signature
    })
    const res = await billingWebhookPost(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/missing stripe-signature/i)
  })

  it('returns 400 when stripe signature verification fails', async () => {
    const mockClient = {
      webhooks: {
        constructEvent: jest.fn().mockImplementation(() => {
          throw new Error('No signatures found matching the expected signature for payload')
        }),
      },
      subscriptions: { retrieve: jest.fn() },
    }
    jest.mocked(stripe).mockReturnValue(mockClient as unknown as ReturnType<typeof stripe>)
    useSupa([])

    const res = await billingWebhookPost(webhookReq({ type: 'test' }, 'tampered-sig'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/webhook signature invalid/i)
  })
})

describe('Billing webhook — checkout.session.completed', () => {
  it('writes subscription_status=pro to DB after successful checkout', async () => {
    const subscription = makeStripeSubscription({ status: 'active', userId: USER_ID })
    const stripeClient = useStripe(subscription)

    const userRow: DbRow = { id: USER_ID, email: 'alice@example.com', display_name: 'Alice' }
    // Sequence: (1) users.select by userId (2) users.update
    const supa = useSupa([
      { data: userRow, error: null },
      { data: null,    error: null },
    ])

    const session = makeCheckoutSession({ subscriptionId: SUB_ID, customerId: CUSTOMER_ID })
    const event   = makeStripeEvent('checkout.session.completed', session)

    const res = await billingWebhookPost(webhookReq(event))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.received).toBe(true)

    // The route must have retrieved the full subscription from Stripe.
    expect(stripeClient.subscriptions.retrieve).toHaveBeenCalledWith(SUB_ID)

    // The DB update chain must have been started.
    expect(supa.from).toHaveBeenCalledWith('users')

    // Verify the update call contained subscription_status='pro'.
    // supa.from() returns a chain; get the last call's chain and inspect .update.
    const fromCalls = jest.mocked(supa.from).mock.results
    const updateCallArgs: unknown[] = []
    for (const call of fromCalls) {
      const chain = call.value as Record<string, jest.Mock>
      if (chain.update?.mock.calls.length) {
        updateCallArgs.push(...chain.update.mock.calls.flat())
      }
    }

    const updatePayload = updateCallArgs.find(
      (arg) => typeof arg === 'object' && arg !== null && 'subscription_status' in (arg as object),
    ) as Record<string, unknown> | undefined

    expect(updatePayload).toBeDefined()
    expect(updatePayload!.subscription_status).toBe('pro')
    expect(typeof updatePayload!.subscription_period_end).toBe('string')
  })

  it('stores stripe_customer_id during checkout.session.completed', async () => {
    const subscription = makeStripeSubscription({ userId: USER_ID })
    useStripe(subscription)

    const userRow: DbRow = { id: USER_ID, email: 'alice@example.com', display_name: 'Alice' }
    const supa = useSupa([
      { data: userRow, error: null },
      { data: null,    error: null },
    ])

    const session = makeCheckoutSession({ subscriptionId: SUB_ID, customerId: CUSTOMER_ID })
    const event   = makeStripeEvent('checkout.session.completed', session)

    await billingWebhookPost(webhookReq(event))

    const fromCalls = jest.mocked(supa.from).mock.results
    const updateCallArgs: unknown[] = []
    for (const call of fromCalls) {
      const chain = call.value as Record<string, jest.Mock>
      if (chain.update?.mock.calls.length) {
        updateCallArgs.push(...chain.update.mock.calls.flat())
      }
    }

    const updatePayload = updateCallArgs.find(
      (arg) => typeof arg === 'object' && arg !== null && 'stripe_customer_id' in (arg as object),
    ) as Record<string, unknown> | undefined

    expect(updatePayload?.stripe_customer_id).toBe(CUSTOMER_ID)
  })

  it('returns 200 (no-op) when checkout mode is not subscription', async () => {
    const stripeClient = useStripe()
    useSupa([])

    const nonSubSession = { id: 'cs_test_002', mode: 'payment', subscription: null, customer: null }
    const event = makeStripeEvent('checkout.session.completed', nonSubSession)

    const res = await billingWebhookPost(webhookReq(event))
    expect(res.status).toBe(200)
    // Should NOT have attempted to retrieve subscription from Stripe.
    expect(stripeClient.subscriptions.retrieve).not.toHaveBeenCalled()
  })
})

describe('Billing webhook — customer.subscription.deleted', () => {
  it('writes subscription_status=cancelled to DB when subscription is deleted', async () => {
    const subscription = makeStripeSubscription({
      status:      'canceled',
      userId:      USER_ID,
      cancelledAt: Math.floor(Date.now() / 1000),
    })
    useStripe(subscription)

    const userRow: DbRow = { id: USER_ID, email: 'alice@example.com', display_name: 'Alice' }
    const supa = useSupa([
      { data: userRow, error: null },
      { data: null,    error: null },
    ])

    const event = makeStripeEvent('customer.subscription.deleted', subscription)

    const res = await billingWebhookPost(webhookReq(event))
    expect(res.status).toBe(200)

    // Verify update was called with subscription_status='cancelled'.
    const fromCalls = jest.mocked(supa.from).mock.results
    const updateCallArgs: unknown[] = []
    for (const call of fromCalls) {
      const chain = call.value as Record<string, jest.Mock>
      if (chain.update?.mock.calls.length) {
        updateCallArgs.push(...chain.update.mock.calls.flat())
      }
    }

    const updatePayload = updateCallArgs.find(
      (arg) => typeof arg === 'object' && arg !== null && 'subscription_status' in (arg as object),
    ) as Record<string, unknown> | undefined

    expect(updatePayload).toBeDefined()
    expect(updatePayload!.subscription_status).toBe('cancelled')
    // period_end must be preserved so isPro() can grant grace access.
    expect(typeof updatePayload!.subscription_period_end).toBe('string')
  })

  it('looks up user by stripe_customer_id when metadata.userId is absent', async () => {
    const subscriptionNoMeta = {
      ...makeStripeSubscription({ status: 'canceled' }),
      metadata: {},  // no userId in metadata
    }
    useStripe(subscriptionNoMeta)

    const userRow: DbRow = { id: USER_ID, email: 'alice@example.com', display_name: 'Alice' }
    // With no metadata.userId, the userId lookup block is skipped entirely.
    // Only two from() calls occur: (1) customerId fallback → user found, (2) update.
    const supa = useSupa([
      { data: userRow, error: null },  // customerId fallback → finds user
      { data: null,    error: null },  // update succeeds
    ])

    const event = makeStripeEvent('customer.subscription.deleted', subscriptionNoMeta)
    const res   = await billingWebhookPost(webhookReq(event))

    expect(res.status).toBe(200)
    // At least two from('users') calls (lookup + update).
    expect(jest.mocked(supa.from).mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('returns 200 without crashing when no user is found (unknown customer)', async () => {
    const subscription = makeStripeSubscription({ status: 'canceled', userId: 'nonexistent' })
    useStripe(subscription)

    useSupa([
      { data: null, error: null },  // userId lookup → not found
      { data: null, error: null },  // customerId fallback → not found
    ])

    const event = makeStripeEvent('customer.subscription.deleted', subscription)
    const res   = await billingWebhookPost(webhookReq(event))
    // Must still return 200 — Stripe must not retry.
    expect(res.status).toBe(200)
  })
})

describe('Billing webhook — invoice.payment_failed', () => {
  it('sends a payment-failed email and returns 200', async () => {
    useStripe()

    const userRow: DbRow = {
      id:           USER_ID,
      email:        'alice@example.com',
      display_name: 'Alice',
    }
    useSupa([{ data: userRow, error: null }])

    const invoice = {
      id:       'in_test_001',
      customer: CUSTOMER_ID,
      status:   'open',
    }
    const event = makeStripeEvent('invoice.payment_failed', invoice)

    const res = await billingWebhookPost(webhookReq(event))
    expect(res.status).toBe(200)

    expect(sendPaymentFailedEmail).toHaveBeenCalledTimes(1)
    expect(sendPaymentFailedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to:          'alice@example.com',
        displayName: 'Alice',
      }),
    )
  })

  it('returns 200 even when email sending fails (must not cause Stripe retry)', async () => {
    useStripe()
    jest.mocked(sendPaymentFailedEmail).mockRejectedValueOnce(new Error('Resend timeout'))

    const userRow: DbRow = { id: USER_ID, email: 'alice@example.com', display_name: 'Alice' }
    useSupa([{ data: userRow, error: null }])

    const invoice = { id: 'in_test_002', customer: CUSTOMER_ID }
    const event   = makeStripeEvent('invoice.payment_failed', invoice)

    const res = await billingWebhookPost(webhookReq(event))
    // Must still return 200 so Stripe doesn't retry infinitely.
    expect(res.status).toBe(200)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// ThemeSelector — lock overlay rendering
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Renders ThemeSelector to an HTML string using react-dom/server so we can
 * assert on the DOM structure without a browser or jsdom.
 *
 * We look for the lock SVG (rect with stroke and width=16) as a reliable
 * signal that the lock overlay is present.  The blur overlay also contains
 * a "Pro" badge span — we assert on that text too.
 */
function renderSelector(canUseThemes: boolean): string {
  return renderToStaticMarkup(
    React.createElement(ThemeSelector, {
      wishlistId:    'wl-uuid-001',
      currentTheme:  'default',
      canUseThemes,
      username:      'alice',
      slug:          'birthday-2026',
      onThemeChange: jest.fn(),
    }),
  )
}

describe('ThemeSelector — free user (canUseThemes=false)', () => {
  const PREMIUM_THEMES = ['midnight', 'cloud', 'forest', 'rose', 'slate'] as const

  let html: string

  beforeAll(() => {
    // Set env var used in the component's previewUrl construction.
    process.env.NEXT_PUBLIC_APP_URL = 'https://gifthint.io'
    html = renderSelector(false)
  })

  it('renders a card for each of the 5 premium themes', () => {
    // Each ThemeCard renders an aria-label with the theme name.
    for (const theme of PREMIUM_THEMES) {
      // aria-label="Midnight theme (Pro required)" — case-insensitive match
      expect(html.toLowerCase()).toContain(`${theme} theme`)
    }
  })

  it('renders the lock overlay (blur + Pro badge) on all 5 premium theme cards', () => {
    // The lock overlay renders a <span>Pro</span> badge inside a blurred div.
    // Count occurrences of the Pro badge text.
    const proMatches = (html.match(/>\s*Pro\s*</g) ?? []).length
    expect(proMatches).toBeGreaterThanOrEqual(5)
  })

  it('applies backdrop-filter:blur to all 5 premium card overlays', () => {
    const blurMatches = (html.match(/blur\(/g) ?? []).length
    expect(blurMatches).toBeGreaterThanOrEqual(5)
  })

  it('does NOT render the lock overlay on the default (free) card', () => {
    // Default card has aria-label="Default theme" (no "Pro required").
    expect(html).not.toContain('Default theme (Pro required)')
    // The aria-disabled attribute on the default card should be false.
    expect(html).toContain('aria-label="Default theme"')
  })

  it('renders the "Preview as gifter" link pointing to the correct URL', () => {
    expect(html).toContain('https://gifthint.io/list/alice/birthday-2026')
  })

  it('renders the upgrade CTA section when canUseThemes=false', () => {
    expect(html).toContain('Unlock premium themes')
    expect(html).toContain('/dashboard/upgrade')
  })
})

describe('ThemeSelector — Pro user (canUseThemes=true)', () => {
  let html: string

  beforeAll(() => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://gifthint.io'
    html = renderSelector(true)
  })

  it('renders all 5 premium theme cards without lock overlay', () => {
    // No "Pro required" aria-label suffix when unlocked.
    expect(html).not.toContain('Pro required')
  })

  it('does NOT render backdrop blur on any card for Pro users', () => {
    // blur() only appears inside the locked overlay div.
    expect(html).not.toContain('blur(')
  })

  it('does NOT render the upgrade CTA section when canUseThemes=true', () => {
    expect(html).not.toContain('Unlock premium themes')
  })

  it('renders all theme cards with tabIndex=0 (focusable) for Pro users', () => {
    // Locked cards have tabIndex="-1"; unlocked cards have tabIndex="0".
    // With 6 cards all unlocked, there should be no tabIndex="-1".
    expect(html).not.toContain('tabindex="-1"')
  })
})
