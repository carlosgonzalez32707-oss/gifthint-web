/**
 * app/api/group-gift/contribute/route.ts — GiftHint
 *
 * POST /api/group-gift/contribute
 *
 * Validates a contribution request, creates a Stripe PaymentIntent, and
 * creates a pending gift_contributions row. The frontend then uses the
 * returned clientSecret with Stripe Elements to collect payment details.
 *
 * After payment succeeds, the Stripe webhook (app/api/group-gift/webhook)
 * updates the contribution status to 'succeeded' → the DB trigger
 * (trg_gift_pool_collect) credits the pool and flips it to 'funded'
 * if the target is reached.
 *
 * Request body:
 *   {
 *     poolId:            string   — gift_pools.id
 *     contributorName:   string   — display name (stored unless anonymous)
 *     contributorEmail:  string   — receipt email passed to Stripe
 *     amount:            number   — contribution in major units (e.g. 10.00)
 *     anonymous?:        boolean  — hides name on the contribution list
 *   }
 *
 * Auth:
 *   No auth required — gifters do not have accounts.
 *   Stripe handles payment auth; the webhook verifies completion server-side.
 *
 * Responses:
 *   201  { clientSecret: string, contributionId: string }
 *   400  { error: 'invalid_body',    message: string }
 *   404  { error: 'pool_not_found' }
 *   409  { error: 'pool_not_open',   status: string }
 *   422  { error: 'amount_exceeds_remaining', remaining: number }
 *   500  { error: 'server_error',    message: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }        from '@/lib/supabase-server'
import { createPaymentIntent }       from '@/lib/stripe'
import { rateLimit, getClientIp }    from '@/lib/rate-limit'

// ── Types ─────────────────────────────────────────────────────────────────────

type ContributeBody = {
  poolId:           string
  contributorName:  string
  contributorEmail: string
  amount:           number
  anonymous?:       boolean
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Rate limit: 10 contributions / IP / hour ──────────────────────────────
  // Prevents a single IP from spamming Stripe PaymentIntent creation.
  const ip = getClientIp(req)
  const rl = await rateLimit(`contribute:${ip}`, 10, 3_600)
  if (!rl.success) {
    return NextResponse.json(
      { error: 'rate_limited', message: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil((rl.reset - Date.now()) / 1000))) } },
    )
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: Partial<ContributeBody>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'invalid_body', message: 'Request body must be valid JSON.' },
      { status: 400 },
    )
  }

  const {
    poolId,
    contributorName,
    contributorEmail,
    amount,
    anonymous = false,
  } = body

  // ── Validate fields ────────────────────────────────────────────────────────

  if (typeof poolId !== 'string' || !poolId.trim()) {
    return NextResponse.json(
      { error: 'invalid_body', message: 'poolId is required.' },
      { status: 400 },
    )
  }

  if (typeof contributorName !== 'string' || !contributorName.trim()) {
    return NextResponse.json(
      { error: 'invalid_body', message: 'contributorName is required.' },
      { status: 400 },
    )
  }

  if (typeof contributorEmail !== 'string' || !contributorEmail.includes('@')) {
    return NextResponse.json(
      { error: 'invalid_body', message: 'contributorEmail must be a valid email address.' },
      { status: 400 },
    )
  }

  if (typeof amount !== 'number' || amount <= 0 || !isFinite(amount)) {
    return NextResponse.json(
      { error: 'invalid_body', message: 'amount must be a positive number.' },
      { status: 400 },
    )
  }

  // Minimum £0.30 — Stripe rejects PaymentIntents below ~30p
  if (amount < 0.30) {
    return NextResponse.json(
      { error: 'invalid_body', message: 'Minimum contribution is £0.30.' },
      { status: 400 },
    )
  }

  const supabase = createServerClient()

  // ── Load and validate the pool ─────────────────────────────────────────────

  const { data: pool, error: poolError } = await supabase
    .from('gift_pools')
    .select('id, status, target_amount, collected_amount')
    .eq('id', poolId)
    .maybeSingle()

  if (poolError) {
    console.error('[contribute] pool lookup error:', poolError.message)
    return NextResponse.json({ error: 'server_error', message: poolError.message }, { status: 500 })
  }

  if (!pool) {
    return NextResponse.json({ error: 'pool_not_found' }, { status: 404 })
  }

  if (pool.status !== 'open') {
    return NextResponse.json(
      { error: 'pool_not_open', status: pool.status },
      { status: 409 },
    )
  }

  // ── Check amount ≤ remaining balance ──────────────────────────────────────

  const remaining = Number(pool.target_amount) - Number(pool.collected_amount)

  if (amount > remaining + 0.001) {
    // +0.001 tolerance for floating-point imprecision
    return NextResponse.json(
      {
        error:     'amount_exceeds_remaining',
        remaining: Math.round(remaining * 100) / 100,
      },
      { status: 422 },
    )
  }

  // ── Create Stripe PaymentIntent ────────────────────────────────────────────

  let clientSecret:    string
  let paymentIntentId: string

  try {
    const result = await createPaymentIntent(
      amount,
      poolId,
      contributorEmail.trim().toLowerCase(),
    )
    clientSecret    = result.clientSecret
    paymentIntentId = result.paymentIntentId
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe error'
    console.error('[contribute] Stripe PaymentIntent error:', message)
    return NextResponse.json({ error: 'server_error', message }, { status: 500 })
  }

  // ── Create pending contribution row ───────────────────────────────────────

  const { data: contribution, error: insertError } = await supabase
    .from('gift_contributions')
    .insert({
      pool_id:                  poolId,
      contributor_name:         anonymous ? null : contributorName.trim(),
      contributor_email:        contributorEmail.trim().toLowerCase(),
      amount,
      stripe_payment_intent_id: paymentIntentId,
      stripe_payment_status:    'pending',
      anonymous,
    })
    .select('id')
    .single()

  if (insertError) {
    console.error('[contribute] insert error:', insertError.message)
    return NextResponse.json(
      { error: 'server_error', message: insertError.message },
      { status: 500 },
    )
  }

  // ── Return clientSecret to frontend ───────────────────────────────────────
  // The frontend passes this to stripe.confirmPayment() via Stripe Elements.

  return NextResponse.json(
    { clientSecret, contributionId: contribution.id },
    { status: 201 },
  )
}
