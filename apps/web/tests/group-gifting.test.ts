/**
 * tests/group-gifting.test.ts — GiftHint
 *
 * Comprehensive unit tests for the group gifting + Stripe payment system.
 * All Supabase, Stripe, and Resend interactions are mocked — no network
 * or real API keys required.
 *
 * Coverage:
 *   POST /api/group-gift/contribute
 *     createPaymentIntent integration — returns clientSecret for valid pool
 *     Validation — rejects bad amounts, funded pools, missing fields, sub-minimum
 *
 *   POST /api/group-gift/webhook
 *     Signature verification — rejects tampered / missing signature
 *     Contribution update — marks succeeded, idempotent, missing contribution
 *     Pool funded notification — emails organiser when target is reached
 *
 *   POST /api/group-gift/refund
 *     Stripe refunds — creates refund per succeeded contribution
 *     Idempotency — skips already-refunded intents, no-ops cancelled pools
 *     Authorization — 403 for non-owner, 409 for purchased pool
 *     Cleanup — clears is_group_gift flag on the wishlist item
 *
 *   POST /api/group-gift/mark-purchased
 *     Happy path — transitions pool, emails every contributor
 *     Idempotency — already-purchased pool returns 200 without re-sending
 *     Authorization — 403 for non-owner, 409 for cancelled pool
 *
 * Mock strategy:
 *   • @/lib/supabase-server — createServerClient() replaced with chainable mock
 *     (same fromSequence pattern as claim-system.test.ts and email.test.ts)
 *   • @/lib/stripe          — createPaymentIntent, constructWebhookEvent, stripe()
 *     are all replaced with jest.fn() so tests control exactly what Stripe returns
 *   • @/lib/email           — sendPoolFundedEmail and sendContributorThankYouEmail
 *     mocked to avoid real network calls while still asserting they were invoked
 *
 * Run with: npm test -- group-gifting
 */

// ── Mocks must be hoisted before any imports ───────────────────────────────────

jest.mock('@/lib/supabase-server', () => ({
  createServerClient: jest.fn(),
}))

jest.mock('@/lib/stripe', () => ({
  createPaymentIntent:   jest.fn(),
  constructWebhookEvent: jest.fn(),
  stripe:                jest.fn(),
}))

jest.mock('@/lib/email', () => ({
  sendPoolFundedEmail:           jest.fn(),
  sendContributorThankYouEmail:  jest.fn(),
}))

import { NextRequest } from 'next/server'

import { createServerClient }    from '@/lib/supabase-server'
import { createPaymentIntent, constructWebhookEvent, stripe } from '@/lib/stripe'
import { sendPoolFundedEmail, sendContributorThankYouEmail }   from '@/lib/email'

import { POST as contributePost } from '@/app/api/group-gift/contribute/route'
import { POST as webhookPost }    from '@/app/api/group-gift/webhook/route'
import { POST as refundPost }     from '@/app/api/group-gift/refund/route'
import { POST as purchasePost }   from '@/app/api/group-gift/mark-purchased/route'

// ── Supabase chainable mock ───────────────────────────────────────────────────

type DbRow    = Record<string, unknown>
type DbResult = { data: DbRow | DbRow[] | null; error: { message: string; code?: string } | null }

/**
 * Builds a chainable Supabase-like mock. Each call to supabase.from() consumes
 * the next entry in fromSequence, returning a chain whose terminal methods
 * (.maybeSingle, .single, direct await) resolve with that entry.
 */
function makeSupa(fromSequence: DbResult[]) {
  let callIdx = 0

  function makeChain(result: DbResult): Record<string, unknown> {
    const chain: Record<string, unknown> = {}

    for (const m of [
      'select', 'update', 'insert', 'upsert', 'delete',
      'eq', 'neq', 'is', 'not', 'in',
      'order', 'limit',
    ]) {
      chain[m] = jest.fn().mockReturnValue(chain)
    }

    chain.maybeSingle = jest.fn().mockResolvedValue(result)
    chain.single      = jest.fn().mockResolvedValue(result)

    // Direct await — covers routes that skip the explicit terminal call
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
    // Default: valid JWT resolving to the wisher (USER_ID).
    // Tests that need a different identity override via mockResolvedValueOnce.
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data:  { user: { id: USER_ID } },
        error: null,
      }),
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

/** Returns a Stripe-client-like object for the stripe() singleton mock. */
function makeStripeClient(opts: {
  listData?: object[]
  createResult?: object
} = {}) {
  return {
    refunds: {
      list:   jest.fn().mockResolvedValue({ data: opts.listData ?? [] }),
      create: jest.fn().mockResolvedValue(opts.createResult ?? { id: 're_test_001' }),
    },
  }
}

// ── Request helpers ────────────────────────────────────────────────────────────

function makeJson(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(url, {
    method:  'POST',
    body:    JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function contributeReq(body: unknown) {
  return makeJson('http://localhost/api/group-gift/contribute', body)
}

function refundReq(body: unknown, token = 'google-id-wisher') {
  return makeJson(
    'http://localhost/api/group-gift/refund',
    body,
    { Authorization: `Bearer ${token}` },
  )
}

function purchaseReq(body: unknown, token = 'google-id-wisher') {
  return makeJson(
    'http://localhost/api/group-gift/mark-purchased',
    body,
    { Authorization: `Bearer ${token}` },
  )
}

/** Constructs a webhook NextRequest with raw body bytes and optional sig header. */
function webhookReq(payload: object, sig = 'valid-sig') {
  const rawBody = JSON.stringify(payload)
  return new NextRequest('http://localhost/api/group-gift/webhook', {
    method:  'POST',
    body:    rawBody,
    headers: {
      'Content-Type':    'application/json',
      'stripe-signature': sig,
    },
  })
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USER_ID   = 'user-uuid-001'
const POOL_ID   = 'pool-uuid-001'
const ITEM_ID   = 'item-uuid-001'
const CONTRIB_1 = 'contrib-uuid-001'
const CONTRIB_2 = 'contrib-uuid-002'

const POOL_OPEN: DbRow = {
  id:               POOL_ID,
  status:           'open',
  target_amount:    50,
  collected_amount: 20,   // £30 remaining
}

const POOL_FUNDED: DbRow = {
  id:               POOL_ID,
  status:           'funded',
  target_amount:    50,
  collected_amount: 50,
}

const POOL_PURCHASED: DbRow = {
  id:               POOL_ID,
  status:           'purchased',
  target_amount:    50,
  collected_amount: 50,
}

const POOL_CANCELLED: DbRow = {
  id:               POOL_ID,
  status:           'cancelled',
  target_amount:    50,
  collected_amount: 0,
}

/** Pool row with wishlist_items nested join (used in routes that verify ownership). */
const POOL_WITH_ITEM = (status = 'open'): DbRow => ({
  id:              POOL_ID,
  status,
  target_amount:   50,
  collected_amount: status === 'funded' || status === 'purchased' ? 50 : 20,
  organiser_name:  'Sarah',
  organiser_email: 'sarah@example.com',
  item_id:         ITEM_ID,
  funded_at:       null,
  wishlist_items: {
    id:        ITEM_ID,
    user_id:   USER_ID,
    title:     'Blue Cashmere Sweater',
    image_url: null,
    source_url: 'https://example.com/sweater',
    price:     50,
    currency:  'gbp',
  },
})

const DB_USER: DbRow = {
  id:           USER_ID,
  display_name: 'Sarah',
  google_id:    'google-id-wisher',
}

const CONTRIBUTION_ROW: DbRow = {
  id:                       CONTRIB_1,
  pool_id:                  POOL_ID,
  stripe_payment_intent_id: 'pi_test_001',
  stripe_payment_status:    'pending',
  amount:                   20,
}

const CONTRIB_SUCCEEDED_1: DbRow = {
  id:                       CONTRIB_1,
  stripe_payment_intent_id: 'pi_test_001',
  amount:                   25,
  stripe_payment_status:    'succeeded',
}

const CONTRIB_SUCCEEDED_2: DbRow = {
  id:                       CONTRIB_2,
  stripe_payment_intent_id: 'pi_test_002',
  amount:                   25,
  stripe_payment_status:    'succeeded',
}

/** Stripe event payload for payment_intent.succeeded with pool metadata. */
const PAYMENT_INTENT_EVENT = {
  type: 'payment_intent.succeeded',
  data: {
    object: {
      id:       'pi_test_001',
      metadata: { pool_id: POOL_ID },
    },
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1: POST /api/group-gift/contribute
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/group-gift/contribute', () => {

  beforeEach(() => {
    jest.mocked(createPaymentIntent).mockReset()
    jest.mocked(createPaymentIntent).mockResolvedValue({
      clientSecret:    'pi_test_secret_abc',
      paymentIntentId: 'pi_test_abc',
    })
  })

  // ── createPaymentIntent integration ─────────────────────────────────────────

  describe('createPaymentIntent — returns clientSecret for valid pool', () => {

    it('returns 201 with clientSecret and contributionId', async () => {
      useSupa([
        { data: POOL_OPEN,               error: null },  // pool lookup
        { data: { id: CONTRIB_1 },       error: null },  // contribution insert
      ])

      const res  = await contributePost(contributeReq({
        poolId:           POOL_ID,
        contributorName:  'Alice',
        contributorEmail: 'alice@example.com',
        amount:           10,
      }))
      const body = await res.json()

      expect(res.status).toBe(201)
      expect(typeof body.clientSecret).toBe('string')
      expect(body.clientSecret).toBe('pi_test_secret_abc')
      expect(body.contributionId).toBe(CONTRIB_1)
    })

    it('calls createPaymentIntent with the correct amount, poolId, and email', async () => {
      useSupa([
        { data: POOL_OPEN,         error: null },
        { data: { id: CONTRIB_1 }, error: null },
      ])

      await contributePost(contributeReq({
        poolId:           POOL_ID,
        contributorName:  'Alice',
        contributorEmail: 'Alice@Example.COM',  // should be lowercased
        amount:           15.50,
      }))

      expect(createPaymentIntent).toHaveBeenCalledTimes(1)
      const [amount, poolId, email] = jest.mocked(createPaymentIntent).mock.calls[0]
      expect(amount).toBe(15.50)
      expect(poolId).toBe(POOL_ID)
      expect(email).toBe('alice@example.com')   // normalised to lowercase
    })

    it('persists the pending contribution row before returning', async () => {
      const supa = useSupa([
        { data: POOL_OPEN,         error: null },
        { data: { id: CONTRIB_1 }, error: null },
      ])

      await contributePost(contributeReq({
        poolId:           POOL_ID,
        contributorName:  'Bob',
        contributorEmail: 'bob@example.com',
        amount:           10,
        anonymous:        true,
      }))

      // Verify the insert chain was reached (2nd from() call)
      expect(supa.from).toHaveBeenCalledTimes(2)
      const insertChain = supa.from.mock.results[1].value as Record<string, jest.Mock>
      const insertPayload = insertChain.insert.mock.calls[0][0] as Record<string, unknown>

      expect(insertPayload.pool_id).toBe(POOL_ID)
      expect(insertPayload.stripe_payment_status).toBe('pending')
      expect(insertPayload.anonymous).toBe(true)
      expect(insertPayload.contributor_name).toBeNull()  // anonymous contribution
    })

  })

  // ── Validation ───────────────────────────────────────────────────────────────

  describe('validation — rejects invalid requests', () => {

    it('returns 422 amount_exceeds_remaining when amount > remaining', async () => {
      // Pool has £20 collected, £50 target → £30 remaining; request £40
      useSupa([{ data: POOL_OPEN, error: null }])

      const res  = await contributePost(contributeReq({
        poolId: POOL_ID, contributorName: 'Alice', contributorEmail: 'alice@example.com',
        amount: 40,  // exceeds £30 remaining
      }))
      const body = await res.json()

      expect(res.status).toBe(422)
      expect(body.error).toBe('amount_exceeds_remaining')
      expect(body.remaining).toBeCloseTo(30, 2)
      expect(createPaymentIntent).not.toHaveBeenCalled()
    })

    it('returns 409 pool_not_open when pool is funded', async () => {
      useSupa([{ data: POOL_FUNDED, error: null }])

      const res  = await contributePost(contributeReq({
        poolId: POOL_ID, contributorName: 'Alice', contributorEmail: 'alice@example.com',
        amount: 10,
      }))
      const body = await res.json()

      expect(res.status).toBe(409)
      expect(body.error).toBe('pool_not_open')
      expect(body.status).toBe('funded')
      expect(createPaymentIntent).not.toHaveBeenCalled()
    })

    it('returns 409 pool_not_open when pool is cancelled', async () => {
      useSupa([{ data: POOL_CANCELLED, error: null }])

      const res  = await contributePost(contributeReq({
        poolId: POOL_ID, contributorName: 'Alice', contributorEmail: 'alice@example.com',
        amount: 10,
      }))
      const body = await res.json()

      expect(res.status).toBe(409)
      expect(body.error).toBe('pool_not_open')
      expect(body.status).toBe('cancelled')
    })

    it('returns 400 when amount is below £0.30 Stripe minimum', async () => {
      useSupa([])

      const res  = await contributePost(contributeReq({
        poolId: POOL_ID, contributorName: 'Alice', contributorEmail: 'alice@example.com',
        amount: 0.25,
      }))
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toBe('invalid_body')
      expect(createPaymentIntent).not.toHaveBeenCalled()
    })

    it('returns 400 when poolId is missing', async () => {
      useSupa([])
      const res  = await contributePost(contributeReq({ contributorName: 'Alice', contributorEmail: 'a@b.com', amount: 10 }))
      const body = await res.json()
      expect(res.status).toBe(400)
      expect(body.error).toBe('invalid_body')
    })

    it('returns 400 when contributorEmail is invalid', async () => {
      useSupa([])
      const res = await contributePost(contributeReq({
        poolId: POOL_ID, contributorName: 'Alice', contributorEmail: 'not-an-email', amount: 10,
      }))
      expect(res.status).toBe(400)
    })

    it('returns 400 when amount is zero or negative', async () => {
      useSupa([])
      const res = await contributePost(contributeReq({
        poolId: POOL_ID, contributorName: 'Alice', contributorEmail: 'a@b.com', amount: 0,
      }))
      expect(res.status).toBe(400)
    })

    it('returns 404 when pool does not exist', async () => {
      useSupa([{ data: null, error: null }])  // pool not found

      const res  = await contributePost(contributeReq({
        poolId: 'nonexistent-pool', contributorName: 'Alice', contributorEmail: 'alice@example.com',
        amount: 10,
      }))
      const body = await res.json()

      expect(res.status).toBe(404)
      expect(body.error).toBe('pool_not_found')
    })

    it('returns 400 for non-JSON body', async () => {
      const req = new NextRequest('http://localhost/api/group-gift/contribute', {
        method:  'POST',
        body:    'not json',
        headers: { 'Content-Type': 'application/json' },
      })
      const res  = await contributePost(req)
      const body = await res.json()
      expect(res.status).toBe(400)
      expect(body.error).toBe('invalid_body')
    })

  })

})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2: POST /api/group-gift/webhook
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/group-gift/webhook', () => {

  beforeEach(() => {
    jest.mocked(constructWebhookEvent).mockReset()
    jest.mocked(sendPoolFundedEmail).mockReset()
    jest.mocked(sendPoolFundedEmail).mockResolvedValue(undefined)
  })

  // ── Signature verification ────────────────────────────────────────────────

  describe('signature verification', () => {

    it('returns 400 invalid_signature for a tampered payload', async () => {
      jest.mocked(constructWebhookEvent).mockImplementation(() => {
        throw new Error('No signatures found matching the expected signature for payload')
      })

      const res  = await webhookPost(webhookReq({ tampered: true }, 'wrong-sig'))
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toBe('invalid_signature')
    })

    it('returns 400 invalid_signature when stripe-signature header is absent', async () => {
      jest.mocked(constructWebhookEvent).mockImplementation(() => {
        throw new Error('stripe-signature header missing')
      })

      const req = new NextRequest('http://localhost/api/group-gift/webhook', {
        method:  'POST',
        body:    '{}',
        headers: { 'Content-Type': 'application/json' },
        // No stripe-signature header
      })
      const res  = await webhookPost(req)
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toBe('invalid_signature')
    })

    it('returns 400 invalid_signature when webhook secret does not match', async () => {
      jest.mocked(constructWebhookEvent).mockImplementation(() => {
        throw new Error('Webhook signature verification failed. Timestamp expired or signature mismatch')
      })

      const res  = await webhookPost(webhookReq(PAYMENT_INTENT_EVENT, 'completely-wrong-secret'))
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toBe('invalid_signature')
    })

  })

  // ── Event routing ─────────────────────────────────────────────────────────

  describe('event routing', () => {

    it('acknowledges non-payment events without DB updates', async () => {
      jest.mocked(constructWebhookEvent).mockReturnValue({
        type: 'customer.subscription.created',
        data: { object: {} },
      } as ReturnType<typeof constructWebhookEvent>)

      useSupa([])

      const res  = await webhookPost(webhookReq({ type: 'customer.subscription.created' }))
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.received).toBe(true)
      expect(body.skipped).toBe('customer.subscription.created')
    })

    it('handles missing pool_id metadata gracefully', async () => {
      jest.mocked(constructWebhookEvent).mockReturnValue({
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_test_001', metadata: {} } }, // no pool_id
      } as ReturnType<typeof constructWebhookEvent>)

      useSupa([])

      const res  = await webhookPost(webhookReq({}))
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.warning).toBe('no_pool_id_in_metadata')
    })

  })

  // ── Contribution update ───────────────────────────────────────────────────

  describe('contribution update — payment_intent.succeeded', () => {

    beforeEach(() => {
      jest.mocked(constructWebhookEvent).mockReturnValue(
        PAYMENT_INTENT_EVENT as unknown as ReturnType<typeof constructWebhookEvent>,
      )
    })

    it('updates contribution stripe_payment_status to succeeded', async () => {
      const supa = useSupa([
        // 0: contribution lookup
        { data: CONTRIBUTION_ROW, error: null },
        // 1: contribution UPDATE
        { data: null,             error: null },
        // 2: pool lookup (still open after this contribution)
        { data: POOL_WITH_ITEM('open'), error: null },
      ])

      const res  = await webhookPost(webhookReq(PAYMENT_INTENT_EVENT))
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.received).toBe(true)

      // The second from() call should be the UPDATE
      const updateChain = supa.from.mock.results[1].value as Record<string, jest.Mock>
      const updatePayload = updateChain.update.mock.calls[0][0] as Record<string, unknown>
      expect(updatePayload.stripe_payment_status).toBe('succeeded')
    })

    it('is idempotent — skips already-succeeded contribution', async () => {
      useSupa([
        // Contribution already marked succeeded
        { data: { ...CONTRIBUTION_ROW, stripe_payment_status: 'succeeded' }, error: null },
      ])

      const res  = await webhookPost(webhookReq(PAYMENT_INTENT_EVENT))
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.skipped).toBe('already_succeeded')
      // No further DB calls after the idempotency check
    })

    it('handles contribution not found gracefully', async () => {
      useSupa([{ data: null, error: null }]) // no contribution row

      const res  = await webhookPost(webhookReq(PAYMENT_INTENT_EVENT))
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.warning).toBe('contribution_not_found')
      expect(sendPoolFundedEmail).not.toHaveBeenCalled()
    })

  })

  // ── Pool funded notification ──────────────────────────────────────────────

  describe('pool funded notification', () => {

    beforeEach(() => {
      jest.mocked(constructWebhookEvent).mockReturnValue(
        PAYMENT_INTENT_EVENT as unknown as ReturnType<typeof constructWebhookEvent>,
      )
    })

    it('sends sendPoolFundedEmail when pool transitions to funded', async () => {
      useSupa([
        // 0: contribution lookup (pending)
        { data: CONTRIBUTION_ROW,        error: null },
        // 1: contribution UPDATE
        { data: null,                    error: null },
        // 2: pool lookup → funded (trigger ran)
        { data: {
            ...POOL_WITH_ITEM('funded'),
            collected_amount: 50,
            target_amount:    50,
          }, error: null,
        },
        // 3: contributors SELECT for email
        { data: [
            { contributor_name: 'Alice', amount: 25, anonymous: false, contributed_at: '2026-01-01T00:00:00Z' },
            { contributor_name: null,    amount: 25, anonymous: true,  contributed_at: '2026-01-02T00:00:00Z' },
          ], error: null,
        },
      ])

      const res  = await webhookPost(webhookReq(PAYMENT_INTENT_EVENT))
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.received).toBe(true)
      expect(body.status).toBe('funded')

      expect(sendPoolFundedEmail).toHaveBeenCalledTimes(1)
      const emailArgs = jest.mocked(sendPoolFundedEmail).mock.calls[0][0]
      expect(emailArgs.organiserEmail).toBe('sarah@example.com')
      expect(emailArgs.itemTitle).toBe('Blue Cashmere Sweater')
      expect(emailArgs.collectedAmount).toBe(50)
      expect(emailArgs.contributors).toHaveLength(2)
    })

    it('does NOT send email when pool is still open after payment', async () => {
      useSupa([
        { data: CONTRIBUTION_ROW,        error: null },
        { data: null,                    error: null },
        { data: POOL_WITH_ITEM('open'),  error: null },  // still open
      ])

      await webhookPost(webhookReq(PAYMENT_INTENT_EVENT))

      expect(sendPoolFundedEmail).not.toHaveBeenCalled()
    })

    it('does not fail the webhook if email sending throws', async () => {
      jest.mocked(sendPoolFundedEmail).mockRejectedValueOnce(new Error('Resend rate limit'))

      useSupa([
        { data: CONTRIBUTION_ROW,        error: null },
        { data: null,                    error: null },
        { data: POOL_WITH_ITEM('funded'), error: null },
        { data: [],                      error: null },  // empty contributors fine
      ])

      const res = await webhookPost(webhookReq(PAYMENT_INTENT_EVENT))

      // Webhook must still acknowledge Stripe even when email fails
      expect(res.status).toBe(200)
    })

    it('marks pool collected_amount in email equal to pool.collected_amount', async () => {
      const poolRow = {
        ...POOL_WITH_ITEM('funded'),
        collected_amount: 50,
        target_amount:    50,
      }

      useSupa([
        { data: CONTRIBUTION_ROW,   error: null },
        { data: null,               error: null },
        { data: poolRow,            error: null },
        { data: [],                 error: null },
      ])

      await webhookPost(webhookReq(PAYMENT_INTENT_EVENT))

      const emailArgs = jest.mocked(sendPoolFundedEmail).mock.calls[0][0]
      expect(emailArgs.targetAmount).toBe(50)
      expect(emailArgs.collectedAmount).toBe(50)
    })

  })

})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3: POST /api/group-gift/refund
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/group-gift/refund', () => {

  let mockStripe: ReturnType<typeof makeStripeClient>

  beforeEach(() => {
    mockStripe = makeStripeClient()
    jest.mocked(stripe).mockReturnValue(mockStripe as unknown as ReturnType<typeof stripe>)
  })

  // ── Stripe refunds ─────────────────────────────────────────────────────────

  describe('Stripe refunds', () => {

    it('calls stripe.refunds.create for each succeeded contribution', async () => {
      useSupa([
        { data: POOL_WITH_ITEM('open'),          error: null },  // pool + item
        { data: [CONTRIB_SUCCEEDED_1, CONTRIB_SUCCEEDED_2], error: null },  // contributions
        { data: null,                            error: null },  // pool UPDATE
        { data: null,                            error: null },  // item UPDATE
      ])

      const res  = await refundPost(refundReq({ poolId: POOL_ID }))
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.cancelled).toBe(true)
      expect(body.refundCount).toBe(2)
      expect(body.skipped).toBe(0)

      expect(mockStripe.refunds.create).toHaveBeenCalledTimes(2)
      expect(mockStripe.refunds.create).toHaveBeenCalledWith(
        expect.objectContaining({ payment_intent: 'pi_test_001' }),
      )
      expect(mockStripe.refunds.create).toHaveBeenCalledWith(
        expect.objectContaining({ payment_intent: 'pi_test_002' }),
      )
    })

    it('skips contributions that are already refunded in Stripe', async () => {
      // Simulate Stripe returning an existing refund for pi_test_001
      mockStripe.refunds.list.mockResolvedValue({ data: [{ id: 're_existing_001' }] })

      useSupa([
        { data: POOL_WITH_ITEM('open'),   error: null },
        { data: [CONTRIB_SUCCEEDED_1],    error: null },  // one contribution
        { data: null,                     error: null },
        { data: null,                     error: null },
      ])

      const res  = await refundPost(refundReq({ poolId: POOL_ID }))
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.refundCount).toBe(0)
      expect(body.skipped).toBe(1)
      expect(mockStripe.refunds.create).not.toHaveBeenCalled()
    })

    it('cancels pool and clears is_group_gift on the item after refunds', async () => {
      const supa = useSupa([
        { data: POOL_WITH_ITEM('open'), error: null },
        { data: [],                     error: null },  // no contributions to refund
        { data: null,                   error: null },  // pool UPDATE
        { data: null,                   error: null },  // item UPDATE
      ])

      await refundPost(refundReq({ poolId: POOL_ID }))

      // 3rd from() call = gift_pools UPDATE
      const poolUpdateChain = supa.from.mock.results[2].value as Record<string, jest.Mock>
      const poolPayload = poolUpdateChain.update.mock.calls[0][0] as Record<string, unknown>
      expect(poolPayload.status).toBe('cancelled')

      // 4th from() call = wishlist_items UPDATE
      const itemUpdateChain = supa.from.mock.results[3].value as Record<string, jest.Mock>
      const itemPayload = itemUpdateChain.update.mock.calls[0][0] as Record<string, unknown>
      expect(itemPayload.is_group_gift).toBe(false)
      expect(itemPayload.group_gift_target).toBeNull()
    })

  })

  // ── Authorization ─────────────────────────────────────────────────────────

  describe('authorization', () => {

    it('returns 403 forbidden when pool belongs to a different user', async () => {
      const supa = useSupa([
        { data: POOL_WITH_ITEM('open'), error: null },  // pool (owner = USER_ID)
      ])
      // Auth user is 'other-user-id', pool owner is USER_ID — mismatch
      ;(supa.auth.getUser as jest.Mock).mockResolvedValueOnce({
        data: { user: { id: 'other-user-id' } }, error: null,
      })

      const res  = await refundPost(refundReq({ poolId: POOL_ID }, 'google-id-other'))
      const body = await res.json()

      expect(res.status).toBe(403)
      expect(body.error).toBe('forbidden')
      expect(mockStripe.refunds.create).not.toHaveBeenCalled()
    })

    it('returns 401 when Authorization header is missing', async () => {
      const req = new NextRequest('http://localhost/api/group-gift/refund', {
        method:  'POST',
        body:    JSON.stringify({ poolId: POOL_ID }),
        headers: { 'Content-Type': 'application/json' },
      })
      const res  = await refundPost(req)
      const body = await res.json()

      expect(res.status).toBe(401)
      expect(body.error).toBe('unauthorized')
    })

    it('returns 409 pool_not_cancellable when pool is already purchased', async () => {
      useSupa([
        { data: POOL_WITH_ITEM('purchased'), error: null },
      ])

      const res  = await refundPost(refundReq({ poolId: POOL_ID }))
      const body = await res.json()

      expect(res.status).toBe(409)
      expect(body.error).toBe('pool_not_cancellable')
      expect(mockStripe.refunds.create).not.toHaveBeenCalled()
    })

    it('accepts admin secret and bypasses user lookup', async () => {
      process.env.ADMIN_REFUND_SECRET = 'super-secret-admin-key'

      useSupa([
        // No user lookup when admin — sequence starts with pool
        { data: POOL_WITH_ITEM('open'), error: null },
        { data: [],                     error: null },  // contributions
        { data: null,                   error: null },  // pool UPDATE
        { data: null,                   error: null },  // item UPDATE
      ])

      const res = await refundPost(refundReq({ poolId: POOL_ID }, 'super-secret-admin-key'))

      expect(res.status).toBe(200)

      delete process.env.ADMIN_REFUND_SECRET
    })

  })

  // ── Idempotency ───────────────────────────────────────────────────────────

  describe('idempotency', () => {

    it('returns 200 immediately for an already-cancelled pool', async () => {
      useSupa([
        { data: POOL_WITH_ITEM('cancelled'), error: null },
      ])

      const res  = await refundPost(refundReq({ poolId: POOL_ID }))
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.cancelled).toBe(true)
      expect(body.refundCount).toBe(0)
      expect(mockStripe.refunds.create).not.toHaveBeenCalled()
    })

    it('returns 404 for an unknown pool', async () => {
      useSupa([
        { data: null, error: null },  // pool not found
      ])

      const res  = await refundPost(refundReq({ poolId: 'nonexistent-pool' }))
      const body = await res.json()

      expect(res.status).toBe(404)
      expect(body.error).toBe('pool_not_found')
    })

  })

})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4: POST /api/group-gift/mark-purchased
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/group-gift/mark-purchased', () => {

  beforeEach(() => {
    jest.mocked(sendContributorThankYouEmail).mockReset()
    jest.mocked(sendContributorThankYouEmail).mockResolvedValue(undefined)
  })

  const PURCHASED_POOL_ROW: DbRow = { id: POOL_ID, status: 'purchased' }

  // ── Happy path ─────────────────────────────────────────────────────────────

  describe('happy path', () => {

    it('returns 200 and transitions pool to purchased', async () => {
      useSupa([
        { data: POOL_WITH_ITEM('funded'),    error: null },  // pool + item join
        { data: PURCHASED_POOL_ROW,          error: null },  // pool UPDATE .single()
        { data: [
            { id: CONTRIB_1, contributor_name: 'Alice', contributor_email: 'alice@example.com',
              amount: 25, anonymous: false },
            { id: CONTRIB_2, contributor_name: null,    contributor_email: 'anon@example.com',
              amount: 25, anonymous: true },
          ], error: null,
        },  // contributions SELECT
      ])

      const res  = await purchasePost(purchaseReq({ poolId: POOL_ID }))
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.pool.status).toBe('purchased')
    })

    it('sends sendContributorThankYouEmail to each succeeded contributor', async () => {
      useSupa([
        { data: POOL_WITH_ITEM('funded'), error: null },
        { data: PURCHASED_POOL_ROW,       error: null },
        { data: [
            { id: CONTRIB_1, contributor_name: 'Alice', contributor_email: 'alice@example.com', amount: 25, anonymous: false },
            { id: CONTRIB_2, contributor_name: null,    contributor_email: 'bob@example.com',   amount: 25, anonymous: true  },
          ], error: null,
        },
      ])

      await purchasePost(purchaseReq({ poolId: POOL_ID }))

      expect(sendContributorThankYouEmail).toHaveBeenCalledTimes(2)

      const calls = jest.mocked(sendContributorThankYouEmail).mock.calls

      // First contributor — named
      expect(calls[0][0].contributorEmail).toBe('alice@example.com')
      expect(calls[0][0].contributorName).toBe('Alice')
      expect(calls[0][0].contributionAmount).toBe(25)
      expect(calls[0][0].wisherName).toBe('Sarah')

      // Second contributor — anonymous, should still receive email
      expect(calls[1][0].contributorEmail).toBe('bob@example.com')
      expect(calls[1][0].contributorName).toBe('Friend')  // fallback for anonymous
    })

    it('passes receiptUrl to each thank-you email when provided', async () => {
      useSupa([
        { data: POOL_WITH_ITEM('funded'), error: null },
        { data: PURCHASED_POOL_ROW,       error: null },
        { data: [
            { id: CONTRIB_1, contributor_name: 'Alice', contributor_email: 'alice@example.com', amount: 25, anonymous: false },
          ], error: null,
        },
      ])

      await purchasePost(purchaseReq({
        poolId:     POOL_ID,
        receiptUrl: 'https://receipts.example.com/order-123.pdf',
      }))

      const emailArgs = jest.mocked(sendContributorThankYouEmail).mock.calls[0][0]
      expect(emailArgs.receiptUrl).toBe('https://receipts.example.com/order-123.pdf')
    })

    it('emails are sent best-effort — one failure does not block others', async () => {
      jest.mocked(sendContributorThankYouEmail)
        .mockRejectedValueOnce(new Error('Resend bounce'))  // first email fails
        .mockResolvedValueOnce(undefined)                   // second email succeeds

      useSupa([
        { data: POOL_WITH_ITEM('funded'), error: null },
        { data: PURCHASED_POOL_ROW,       error: null },
        { data: [
            { id: CONTRIB_1, contributor_name: 'Alice', contributor_email: 'alice@example.com', amount: 25, anonymous: false },
            { id: CONTRIB_2, contributor_name: 'Bob',   contributor_email: 'bob@example.com',   amount: 25, anonymous: false },
          ], error: null,
        },
      ])

      // Should NOT throw even when one email fails
      const res = await purchasePost(purchaseReq({ poolId: POOL_ID }))
      expect(res.status).toBe(200)
      expect(sendContributorThankYouEmail).toHaveBeenCalledTimes(2)
    })

  })

  // ── Idempotency ───────────────────────────────────────────────────────────

  describe('idempotency', () => {

    it('returns 200 without re-sending emails for already-purchased pool', async () => {
      useSupa([
        { data: POOL_WITH_ITEM('purchased'), error: null },
      ])

      const res  = await purchasePost(purchaseReq({ poolId: POOL_ID }))
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(sendContributorThankYouEmail).not.toHaveBeenCalled()
    })

  })

  // ── Authorization and status guards ──────────────────────────────────────

  describe('authorization and status guards', () => {

    it('returns 403 when pool belongs to a different user', async () => {
      // pool item.user_id = USER_ID, but auth user.id = 'other-user-id'
      const supa = useSupa([
        { data: POOL_WITH_ITEM('funded'), error: null },
      ])
      ;(supa.auth.getUser as jest.Mock).mockResolvedValueOnce({
        data: { user: { id: 'other-user-id' } }, error: null,
      })

      const res  = await purchasePost(purchaseReq({ poolId: POOL_ID }, 'google-id-other'))
      const body = await res.json()

      expect(res.status).toBe(403)
      expect(body.error).toBe('forbidden')
      expect(sendContributorThankYouEmail).not.toHaveBeenCalled()
    })

    it('returns 401 when Authorization header is absent', async () => {
      const req = new NextRequest('http://localhost/api/group-gift/mark-purchased', {
        method:  'POST',
        body:    JSON.stringify({ poolId: POOL_ID }),
        headers: { 'Content-Type': 'application/json' },
      })
      const res  = await purchasePost(req)
      expect(res.status).toBe(401)
    })

    it('returns 409 for a cancelled pool (cannot be purchased)', async () => {
      useSupa([
        { data: POOL_WITH_ITEM('cancelled'), error: null },
      ])

      const res  = await purchasePost(purchaseReq({ poolId: POOL_ID }))
      const body = await res.json()

      expect(res.status).toBe(409)
      expect(body.error).toBe('pool_not_purchasable')
      expect(body.status).toBe('cancelled')
    })

    it('returns 404 for an unknown pool', async () => {
      useSupa([
        { data: null, error: null },  // pool not found
      ])

      const res  = await purchasePost(purchaseReq({ poolId: 'bad-pool-id' }))
      const body = await res.json()

      expect(res.status).toBe(404)
      expect(body.error).toBe('pool_not_found')
    })

    it('returns 400 for invalid receiptUrl format', async () => {
      useSupa([])

      const res  = await purchasePost(purchaseReq({
        poolId:     POOL_ID,
        receiptUrl: 'not-a-url',
      }))

      expect(res.status).toBe(400)
      expect(sendContributorThankYouEmail).not.toHaveBeenCalled()
    })

  })

})
