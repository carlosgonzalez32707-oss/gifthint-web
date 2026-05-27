/**
 * app/api/billing/create-checkout/route.ts — GiftHint
 *
 * Creates a Stripe Billing Checkout Session for a GiftHint Pro subscription.
 *
 * Request
 * -------
 *   POST /api/billing/create-checkout
 *   Authorization: Bearer <supabase-access-token>
 *   Content-Type: application/json
 *   { "priceId": "price_xxx" }     ← monthly or annual price ID
 *
 * Response (200)
 * --------------
 *   { "url": "https://checkout.stripe.com/c/pay/cs_xxx..." }
 *
 * Redirect the user's browser to that URL.  Stripe handles the payment flow.
 * On success Stripe redirects to NEXT_PUBLIC_APP_URL/dashboard?upgraded=1
 * On cancel  Stripe redirects to NEXT_PUBLIC_APP_URL/dashboard/upgrade
 *
 * Stripe customer lifecycle
 * -------------------------
 *   • First checkout: a Stripe Customer is created, its ID is stored in
 *     users.stripe_customer_id so future checkouts reuse the same Customer.
 *   • Subsequent checkouts (e.g. plan switch after cancellation): the existing
 *     Customer is retrieved and passed to the session to avoid duplicates.
 *
 * Webhook
 * -------
 *   After checkout completes, the billing webhook (app/api/billing/webhook)
 *   receives `checkout.session.completed` and updates subscription_status + period_end.
 *
 * Env vars required
 * -----------------
 *   STRIPE_SECRET_KEY             — Stripe secret key (sk_test_* or sk_live_*)
 *   STRIPE_PRO_MONTHLY_PRICE_ID   — price ID for the monthly plan
 *   STRIPE_PRO_ANNUAL_PRICE_ID    — price ID for the annual plan
 *   NEXT_PUBLIC_APP_URL           — canonical app URL (e.g. https://gifthint.io)
 *   SUPABASE_URL                  — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY     — service role key (bypasses RLS)
 */

import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createServerClient } from '@/lib/supabase-server'

// ── Allowed price IDs ─────────────────────────────────────────────────────────
// Build the allowlist at cold-start so we don't re-read env on every request.

function getAllowedPriceIds(): Set<string> {
  const ids = new Set<string>()
  const monthly = process.env.STRIPE_PRO_MONTHLY_PRICE_ID
  const annual  = process.env.STRIPE_PRO_ANNUAL_PRICE_ID
  if (monthly) ids.add(monthly)
  if (annual)  ids.add(annual)
  return ids
}

const ALLOWED_PRICE_IDS = getAllowedPriceIds()

// ── POST /api/billing/create-checkout ─────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── 1. Authenticate ─────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()
  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token)

  if (authError || !authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── 2. Parse body ────────────────────────────────────────────────────────────
  let priceId: string
  try {
    const body = await req.json() as { priceId?: unknown }
    if (typeof body.priceId !== 'string' || !body.priceId) {
      return NextResponse.json({ error: 'priceId is required' }, { status: 400 })
    }
    priceId = body.priceId
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Validate the price ID against the known allowlist to prevent arbitrary
  // price IDs being used (e.g. a test-mode price slipped into production).
  if (ALLOWED_PRICE_IDS.size > 0 && !ALLOWED_PRICE_IDS.has(priceId)) {
    return NextResponse.json({ error: 'Invalid price ID' }, { status: 400 })
  }

  // ── 3. Load the user row (email + stripe_customer_id) ───────────────────────
  const { data: userRow, error: rowError } = await supabase
    .from('users')
    .select('id, email, stripe_customer_id, subscription_status')
    .eq('id', authUser.id)
    .single()

  if (rowError || !userRow) {
    console.error('[billing/create-checkout] user row fetch error', rowError)
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // ── 4. Prevent duplicate active subscriptions ────────────────────────────────
  // A user with an active subscription should manage it via the Stripe portal,
  // not start a second checkout.  Allow 'free' and 'cancelled' (re-subscribe).
  if (userRow.subscription_status === 'pro') {
    return NextResponse.json(
      { error: 'You already have an active Pro subscription.' },
      { status: 409 },
    )
  }

  // ── 5. Get or create Stripe Customer ─────────────────────────────────────────
  let customerId: string

  if (userRow.stripe_customer_id) {
    // Reuse the existing customer — preserves payment history and addresses.
    customerId = userRow.stripe_customer_id
  } else {
    // First checkout for this user — create a new Customer.
    const customer = await stripe().customers.create({
      email:    userRow.email ?? authUser.email,
      metadata: { userId: authUser.id },
    })
    customerId = customer.id

    // Persist immediately so a second tab can't create a duplicate customer.
    const { error: updateError } = await supabase
      .from('users')
      .update({ stripe_customer_id: customerId })
      .eq('id', authUser.id)

    if (updateError) {
      console.error('[billing/create-checkout] failed to persist stripe_customer_id', updateError)
      // Non-fatal: the checkout will still work.  The webhook will also store it.
    }
  }

  // ── 6. Create the Checkout Session ───────────────────────────────────────────
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://gifthint.io'

  const session = await stripe().checkout.sessions.create({
    mode:      'subscription',
    customer:  customerId,
    line_items: [{ price: priceId, quantity: 1 }],

    // Pass userId in subscription metadata so the webhook can look up the user
    // without needing to join on stripe_customer_id.
    subscription_data: {
      metadata: { userId: authUser.id },
    },

    // Stripe Billing portal can be configured from the Stripe dashboard:
    // https://dashboard.stripe.com/settings/billing/portal
    success_url: `${appUrl}/dashboard?upgraded=1`,
    cancel_url:  `${appUrl}/dashboard/upgrade`,

    // Allow promotion codes entered by the user at checkout.
    allow_promotion_codes: true,

    // Collect billing address for tax purposes (configure in Stripe Dashboard).
    billing_address_collection: 'auto',
  })

  if (!session.url) {
    console.error('[billing/create-checkout] session created without URL', session.id)
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 })
  }

  return NextResponse.json({ url: session.url })
}
