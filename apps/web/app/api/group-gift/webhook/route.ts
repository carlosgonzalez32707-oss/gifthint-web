/**
 * app/api/group-gift/webhook/route.ts — GiftHint
 *
 * Stripe webhook handler for group-gift payment events.
 *
 * Stripe calls this endpoint when payment_intent.succeeded fires.
 * We then:
 *   1. Look up the gift_contributions row by stripe_payment_intent_id
 *   2. Update its stripe_payment_status to 'succeeded'
 *   3. The DB trigger (trg_gift_pool_collect) automatically credits
 *      gift_pools.collected_amount and sets status='funded' when target is met
 *   4. If the pool just reached 'funded', send the organiser a notification email
 *
 * Security:
 *   Every request is verified with constructWebhookEvent() which checks the
 *   Stripe-Signature header against STRIPE_WEBHOOK_SECRET.
 *   Requests without a valid signature receive a 400 and are ignored.
 *
 * Idempotency:
 *   Stripe may deliver events more than once. The UPDATE is a no-op if the row
 *   is already 'succeeded', so duplicate deliveries are harmless.
 *
 * Local development:
 *   stripe listen --forward-to localhost:3000/api/group-gift/webhook
 *   Paste the webhook signing secret into STRIPE_WEBHOOK_SECRET in .env.local.
 *
 * NOTE: Next.js must NOT parse the request body before we verify the signature.
 * The `export const config` block disables the built-in body parser.
 */

import { NextRequest, NextResponse }    from 'next/server'
import { createServerClient }           from '@/lib/supabase-server'
import { constructWebhookEvent }        from '@/lib/stripe'
import { sendPoolFundedEmail }          from '@/lib/email'

// Disable Next.js body parsing — Stripe signature verification requires the raw body
export const dynamic = 'force-dynamic'

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Read raw body ──────────────────────────────────────────────────────────
  let rawBody: Buffer
  try {
    const bytes = await req.arrayBuffer()
    rawBody = Buffer.from(bytes)
  } catch {
    return NextResponse.json({ error: 'cannot_read_body' }, { status: 400 })
  }

  // ── Verify Stripe signature ────────────────────────────────────────────────
  const sig = req.headers.get('stripe-signature') ?? ''

  let event: ReturnType<typeof constructWebhookEvent>
  try {
    event = constructWebhookEvent(rawBody, sig)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'signature verification failed'
    console.error('[stripe-webhook] signature error:', message)
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 })
  }

  // ── Route event types ──────────────────────────────────────────────────────
  // Only handle payment_intent.succeeded for now.
  // Other event types are acknowledged with 200 to prevent Stripe retrying.

  if (event.type !== 'payment_intent.succeeded') {
    return NextResponse.json({ received: true, skipped: event.type })
  }

  const paymentIntent = event.data.object as { id: string; metadata?: { pool_id?: string } }
  const paymentIntentId = paymentIntent.id
  const poolId          = paymentIntent.metadata?.pool_id ?? null

  if (!poolId) {
    console.warn('[stripe-webhook] PaymentIntent missing pool_id metadata:', paymentIntentId)
    return NextResponse.json({ received: true, warning: 'no_pool_id_in_metadata' })
  }

  const supabase = createServerClient()

  // ── 1. Look up contribution ────────────────────────────────────────────────

  const { data: contribution, error: fetchErr } = await supabase
    .from('gift_contributions')
    .select('id, pool_id, stripe_payment_status, amount')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle()

  if (fetchErr) {
    console.error('[stripe-webhook] contribution fetch error:', fetchErr.message)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }

  if (!contribution) {
    // Could be a test-mode payment not created via our API — log and acknowledge
    console.warn('[stripe-webhook] no contribution found for intent:', paymentIntentId)
    return NextResponse.json({ received: true, warning: 'contribution_not_found' })
  }

  // Idempotency guard — already processed
  if (contribution.stripe_payment_status === 'succeeded') {
    return NextResponse.json({ received: true, skipped: 'already_succeeded' })
  }

  // ── 2. Mark contribution as succeeded ─────────────────────────────────────
  // The DB trigger (trg_gift_pool_collect) fires on this UPDATE and:
  //   - Adds contribution.amount to gift_pools.collected_amount
  //   - Sets gift_pools.status = 'funded' + funded_at if target is reached

  const { error: updateErr } = await supabase
    .from('gift_contributions')
    .update({ stripe_payment_status: 'succeeded' })
    .eq('id', contribution.id)

  if (updateErr) {
    console.error('[stripe-webhook] contribution update error:', updateErr.message)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }

  // ── 3. Check if pool is now funded ────────────────────────────────────────
  // Read the pool state after the trigger has run

  const { data: pool, error: poolErr } = await supabase
    .from('gift_pools')
    .select(`
      id, status, collected_amount, target_amount,
      organiser_name, organiser_email, item_id,
      wishlist_items ( title, image_url, source_url )
    `)
    .eq('id', poolId)
    .maybeSingle()

  if (poolErr) {
    console.error('[stripe-webhook] pool fetch error:', poolErr.message)
    // Non-fatal — contribution was updated; email just won't send
    return NextResponse.json({ received: true, warning: 'pool_fetch_failed' })
  }

  // ── 4. Send organiser notification if pool just became funded ─────────────

  if (pool?.status === 'funded') {
    // Fetch all succeeded contributors for the email
    const { data: contributors } = await supabase
      .from('gift_contributions')
      .select('contributor_name, amount, anonymous, contributed_at')
      .eq('pool_id', poolId)
      .eq('stripe_payment_status', 'succeeded')
      .order('contributed_at', { ascending: true })

    const item = Array.isArray(pool.wishlist_items)
      ? pool.wishlist_items[0]
      : pool.wishlist_items

    try {
      await sendPoolFundedEmail({
        organiserEmail:  pool.organiser_email,
        organiserName:   pool.organiser_name,
        itemTitle:       item?.title        ?? 'the gift',
        itemImageUrl:    item?.image_url    ?? null,
        itemUrl:         item?.source_url   ?? null,
        targetAmount:    Number(pool.target_amount),
        collectedAmount: Number(pool.collected_amount),
        currency:        'gbp',
        contributors:    (contributors ?? []).map((c) => ({
          name:      c.anonymous ? null : c.contributor_name,
          amount:    Number(c.amount),
          anonymous: c.anonymous,
        })),
      })
    } catch (emailErr) {
      // Non-fatal — log but don't fail the webhook (Stripe would retry)
      console.error('[stripe-webhook] sendPoolFundedEmail error:', emailErr)
    }
  }

  return NextResponse.json({ received: true, status: pool?.status ?? 'unknown' })
}
