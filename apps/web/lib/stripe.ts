/**
 * lib/stripe.ts — GiftHint
 *
 * Server-side Stripe client for group gifting payments.
 *
 * ⚠️  STRIPE TEST MODE
 * All keys in .env.local.example are test-mode placeholders.
 * Test keys start with sk_test_ / pk_test_.
 * Use https://dashboard.stripe.com/test/payments to inspect test payments.
 * Switch to live keys (sk_live_ / pk_live_) only when ready for production.
 *
 * NEVER import this file from client components — it reads STRIPE_SECRET_KEY
 * which must never appear in the browser bundle.
 *
 * Usage:
 *   import { createPaymentIntent } from '@/lib/stripe'
 *   const { clientSecret } = await createPaymentIntent(2500, poolId, email)
 */

import Stripe from 'stripe'

// ── Client singleton ──────────────────────────────────────────────────────────
// Instantiated once per cold start. Safe because this module is server-only.

function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY

  if (!key) {
    throw new Error(
      '[GiftHint] STRIPE_SECRET_KEY is not set.\n' +
      'Copy .env.local.example to .env.local and add your Stripe secret key.\n' +
      'Test keys start with sk_test_ — find them at https://dashboard.stripe.com/test/apikeys',
    )
  }

  return new Stripe(key, {
    apiVersion: '2026-04-22.dahlia',
    typescript:  true,
  })
}

// Lazy singleton — avoids instantiation at import time (safe for build)
let _stripe: Stripe | null = null
/** Returns the shared Stripe client. Call once per request or helper. */
export function stripe(): Stripe {
  if (!_stripe) _stripe = getStripeClient()
  return _stripe
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type PaymentIntentResult = {
  clientSecret:      string
  paymentIntentId:   string
}

export type TransferResult = {
  transferId: string
}

// ── createPaymentIntent ───────────────────────────────────────────────────────
/**
 * Creates a Stripe PaymentIntent for a group-gift contribution.
 *
 * @param amount           - Contribution amount in the currency's major unit (e.g. 25.00 for £25)
 * @param poolId           - gift_pools.id — stored as PaymentIntent metadata for webhook routing
 * @param contributorEmail - Pre-fills Stripe's receipt email field
 * @param currency         - ISO 4217 currency code, defaults to 'gbp'
 *
 * Returns the clientSecret needed by Stripe Elements on the frontend,
 * and the PaymentIntent ID to store in gift_contributions.stripe_payment_intent_id.
 *
 * NOTE: amount is converted to the smallest currency unit (pence/cents) before
 * sending to Stripe. Stripe always works in integers.
 */
export async function createPaymentIntent(
  amount:           number,
  poolId:           string,
  contributorEmail: string,
  currency          = 'gbp',
): Promise<PaymentIntentResult> {
  if (amount <= 0) {
    throw new Error('[stripe] amount must be > 0')
  }
  if (!poolId) {
    throw new Error('[stripe] poolId is required')
  }

  // Convert major units → smallest unit (e.g. £25.00 → 2500 pence)
  const amountInSmallestUnit = Math.round(amount * 100)

  const intent = await stripe().paymentIntents.create({
    amount:               amountInSmallestUnit,
    currency:             currency.toLowerCase(),
    receipt_email:        contributorEmail || undefined,
    automatic_payment_methods: { enabled: true },
    metadata: {
      pool_id:   poolId,
      source:    'gifthint_group_gift',
    },
  })

  if (!intent.client_secret) {
    throw new Error('[stripe] PaymentIntent created without a client_secret')
  }

  return {
    clientSecret:    intent.client_secret,
    paymentIntentId: intent.id,
  }
}

// ── createTransfer ────────────────────────────────────────────────────────────
/**
 * Transfers funds from the GiftHint Stripe platform account to a connected
 * organiser account (Phase 4 — payouts to organisers).
 *
 * Requires Stripe Connect to be configured. Not called during Phase 3 —
 * included here so the payout flow can be wired up without touching this file.
 *
 * @param amount      - Amount in major currency units (e.g. 50.00 for £50)
 * @param destination - Stripe connected account ID (acct_xxxxxxxx)
 * @param currency    - ISO 4217 code, defaults to 'gbp'
 */
export async function createTransfer(
  amount:      number,
  destination: string,
  currency     = 'gbp',
): Promise<TransferResult> {
  if (amount <= 0)    throw new Error('[stripe] transfer amount must be > 0')
  if (!destination)   throw new Error('[stripe] destination account ID is required')

  const amountInSmallestUnit = Math.round(amount * 100)

  const transfer = await stripe().transfers.create({
    amount:      amountInSmallestUnit,
    currency:    currency.toLowerCase(),
    destination,
    metadata: {
      source: 'gifthint_group_gift_payout',
    },
  })

  return { transferId: transfer.id }
}

// ── retrievePaymentIntent ─────────────────────────────────────────────────────
/**
 * Retrieves a PaymentIntent by ID — used in webhook handler to confirm status
 * before crediting a contribution.
 */
export async function retrievePaymentIntent(
  paymentIntentId: string,
): Promise<Stripe.PaymentIntent> {
  return stripe().paymentIntents.retrieve(paymentIntentId)
}

// ── constructWebhookEvent ─────────────────────────────────────────────────────
/**
 * Verifies the Stripe webhook signature and returns the parsed Event.
 * Call this in app/api/webhooks/stripe/route.ts.
 *
 * @param rawBody  - Raw request body as Buffer (must NOT be parsed as JSON first)
 * @param sig      - Value of the stripe-signature header
 */
export function constructWebhookEvent(
  rawBody: Buffer,
  sig:     string,
): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET

  if (!secret) {
    throw new Error(
      '[GiftHint] STRIPE_WEBHOOK_SECRET is not set.\n' +
      'Add it to .env.local. Find it in the Stripe dashboard under Webhooks → your endpoint.',
    )
  }

  return stripe().webhooks.constructEvent(rawBody, sig, secret)
}
