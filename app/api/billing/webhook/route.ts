/**
 * app/api/billing/webhook/route.ts — GiftHint
 *
 * Handles Stripe Billing lifecycle events for the GiftHint Pro subscription.
 *
 * ⚠️  This is a SEPARATE webhook endpoint from app/api/group-gift/webhook.
 * Register it as a distinct endpoint in the Stripe Dashboard:
 *   https://dashboard.stripe.com/webhooks → Add endpoint
 *   URL: https://gifthint.io/api/billing/webhook
 *   Events: checkout.session.completed
 *            customer.subscription.updated
 *            customer.subscription.deleted
 *            invoice.payment_failed
 *
 * Security
 * --------
 *   All requests are verified using STRIPE_BILLING_WEBHOOK_SECRET (separate from
 *   STRIPE_WEBHOOK_SECRET used by the group-gift webhook).  Requests with an
 *   invalid or missing signature return 400 and are never processed.
 *
 * User lookup strategy
 * --------------------
 *   1. subscription.metadata.userId  — set during checkout session creation via
 *      subscription_data.metadata.  Present for all subscriptions created by
 *      app/api/billing/create-checkout.
 *   2. Fallback: customer_id lookup in users.stripe_customer_id  — catches edge
 *      cases where metadata is absent (e.g., subscriptions created outside the
 *      app or migrated customers).
 *
 * DB columns updated
 * ------------------
 *   users.stripe_customer_id      — stored on first checkout completion
 *   users.subscription_status     — 'free' | 'pro' | 'cancelled'
 *   users.subscription_period_end — ISO 8601 UTC from Stripe's current_period_end
 *
 * Env vars required
 * -----------------
 *   STRIPE_SECRET_KEY                  — Stripe API key
 *   STRIPE_BILLING_WEBHOOK_SECRET      — whsec_* from this endpoint in Stripe Dashboard
 *   SUPABASE_URL                       — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY          — service role key (bypasses RLS)
 *   NEXT_PUBLIC_APP_URL                — canonical URL for billing portal links
 *   RESEND_API_KEY                     — for payment-failed emails
 */

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { createServerClient } from '@/lib/supabase-server'
import { sendPaymentFailedEmail } from '@/lib/email'

// ── Webhook signature verification ───────────────────────────────────────────

function getWebhookSecret(): string {
  const secret = process.env.STRIPE_BILLING_WEBHOOK_SECRET
  if (!secret) {
    throw new Error(
      '[billing/webhook] STRIPE_BILLING_WEBHOOK_SECRET is not set.\n' +
      'Add it to .env.local.  Find it in Stripe Dashboard → Webhooks → your billing endpoint.',
    )
  }
  return secret
}

// ── User lookup helpers ───────────────────────────────────────────────────────

type SubscriptionStatus = 'free' | 'pro' | 'cancelled'

interface UserRow {
  id:          string
  email:       string | null
  display_name: string | null
}

async function findUserByMetadata(
  supabase: ReturnType<typeof createServerClient>,
  subscription: Stripe.Subscription,
): Promise<UserRow | null> {
  // Primary: userId in subscription metadata (set at checkout creation time).
  const userId = subscription.metadata?.userId
  if (userId) {
    const { data } = await supabase
      .from('users')
      .select('id, email, display_name')
      .eq('id', userId)
      .single()
    if (data) return data
  }

  // Fallback: look up by Stripe customer ID.
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id

  if (customerId) {
    const { data } = await supabase
      .from('users')
      .select('id, email, display_name')
      .eq('stripe_customer_id', customerId)
      .single()
    if (data) return data
  }

  return null
}

// ── Period-end helper ─────────────────────────────────────────────────────────
// In Stripe Node SDK v22 / API version 2026-04-22.dahlia, `current_period_end`
// moved from the Subscription root to each SubscriptionItem.
// We take the max across all items — for simple single-item plans this equals
// the sole item's period end.

function getSubscriptionPeriodEnd(subscription: Stripe.Subscription): string {
  let maxTs = 0
  for (const item of subscription.items.data) {
    if (item.current_period_end > maxTs) maxTs = item.current_period_end
  }
  if (maxTs === 0) {
    // Fallback: canceled_at or created (subscription has no items — edge case).
    maxTs = subscription.canceled_at ?? subscription.created
  }
  return new Date(maxTs * 1000).toISOString()
}

// ── Subscription status mapper ────────────────────────────────────────────────

/**
 * Maps a Stripe subscription status to our three-value enum.
 *
 * Stripe statuses: trialing | active | past_due | canceled | unpaid | paused |
 *                  incomplete | incomplete_expired
 *
 * We treat `trialing` and `active` as Pro.  Everything else (past_due, unpaid,
 * paused, incomplete*) leaves the status as-is until a definitive event
 * (deleted → cancelled, active → pro).
 */
function mapStripeStatus(
  stripeStatus: Stripe.Subscription.Status,
): SubscriptionStatus | null {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return 'pro'
    case 'canceled':
      return 'cancelled'
    default:
      // past_due / unpaid / paused / incomplete* — don't change our status yet.
      // The payment_failed event triggers the user-facing email; the DB is only
      // updated once Stripe reaches a terminal state (active or canceled).
      return null
  }
}

// ── Event handlers ────────────────────────────────────────────────────────────

async function handleCheckoutSessionCompleted(
  supabase: ReturnType<typeof createServerClient>,
  session:  Stripe.Checkout.Session,
): Promise<void> {
  if (session.mode !== 'subscription' || !session.subscription) {
    // Not a subscription checkout — nothing to do.
    return
  }

  const subscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription.id

  // Retrieve the full subscription object to get period_end and metadata.
  const subscription = await stripe().subscriptions.retrieve(subscriptionId)
  const user         = await findUserByMetadata(supabase, subscription)

  if (!user) {
    console.error(
      '[billing/webhook] checkout.session.completed — user not found',
      { subscriptionId, customerId: session.customer },
    )
    return
  }

  const periodEnd  = getSubscriptionPeriodEnd(subscription)
  const customerId =
    typeof session.customer === 'string' ? session.customer : session.customer?.id

  await supabase
    .from('users')
    .update({
      subscription_status:     'pro',
      subscription_period_end: periodEnd,
      ...(customerId ? { stripe_customer_id: customerId } : {}),
    })
    .eq('id', user.id)
}

async function handleSubscriptionUpdated(
  supabase:     ReturnType<typeof createServerClient>,
  subscription: Stripe.Subscription,
): Promise<void> {
  const user = await findUserByMetadata(supabase, subscription)
  if (!user) {
    console.error(
      '[billing/webhook] customer.subscription.updated — user not found',
      { subscriptionId: subscription.id },
    )
    return
  }

  const newStatus = mapStripeStatus(subscription.status)
  if (!newStatus) {
    // Non-terminal status change (e.g. past_due) — skip DB update.
    return
  }

  const periodEnd = getSubscriptionPeriodEnd(subscription)

  await supabase
    .from('users')
    .update({
      subscription_status:     newStatus,
      subscription_period_end: periodEnd,
    })
    .eq('id', user.id)
}

async function handleSubscriptionDeleted(
  supabase:     ReturnType<typeof createServerClient>,
  subscription: Stripe.Subscription,
): Promise<void> {
  const user = await findUserByMetadata(supabase, subscription)
  if (!user) {
    console.error(
      '[billing/webhook] customer.subscription.deleted — user not found',
      { subscriptionId: subscription.id },
    )
    return
  }

  // Keep period_end so isPro() can grant graceful access until the paid period ends.
  const periodEnd = getSubscriptionPeriodEnd(subscription)

  await supabase
    .from('users')
    .update({
      subscription_status:     'cancelled',
      subscription_period_end: periodEnd,
    })
    .eq('id', user.id)
}

async function handleInvoicePaymentFailed(
  supabase: ReturnType<typeof createServerClient>,
  invoice:  Stripe.Invoice,
): Promise<void> {
  const customerId =
    typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id

  if (!customerId) return

  // Look up the user by customer ID.
  const { data: user } = await supabase
    .from('users')
    .select('id, email, display_name')
    .eq('stripe_customer_id', customerId)
    .single()

  if (!user?.email) {
    console.error(
      '[billing/webhook] invoice.payment_failed — user or email not found',
      { customerId },
    )
    return
  }

  const appUrl     = process.env.NEXT_PUBLIC_APP_URL ?? 'https://gifthint.io'
  const billingUrl = `${appUrl}/api/billing/portal`

  try {
    await sendPaymentFailedEmail({
      to:          user.email,
      displayName: user.display_name ?? '',
      billingUrl,
    })
  } catch (emailError) {
    // Log but don't throw — webhook must return 200 so Stripe doesn't retry.
    console.error('[billing/webhook] sendPaymentFailedEmail failed', emailError)
  }
}

// ── POST /api/billing/webhook ─────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── 1. Read raw body (required for signature verification) ──────────────────
  let rawBody: Buffer
  try {
    const bytes = await req.arrayBuffer()
    rawBody = Buffer.from(bytes)
  } catch {
    return NextResponse.json({ error: 'Failed to read request body' }, { status: 400 })
  }

  // ── 2. Verify Stripe signature ───────────────────────────────────────────────
  const sig = req.headers.get('stripe-signature')
  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe().webhooks.constructEvent(rawBody, sig, getWebhookSecret())
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[billing/webhook] signature verification failed:', message)
    return NextResponse.json({ error: `Webhook signature invalid: ${message}` }, { status: 400 })
  }

  // ── 3. Dispatch event ────────────────────────────────────────────────────────
  const supabase = createServerClient()

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(supabase, event.data.object as Stripe.Checkout.Session)
        break

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(supabase, event.data.object as Stripe.Subscription)
        break

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(supabase, event.data.object as Stripe.Subscription)
        break

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(supabase, event.data.object as Stripe.Invoice)
        break

      default:
        // Unknown event type — not subscribed in the Stripe dashboard.  No-op.
        break
    }
  } catch (err) {
    console.error(`[billing/webhook] error handling event ${event.type}:`, err)
    // Return 500 so Stripe retries the delivery.
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
