/**
 * app/api/group-gift/refund/route.ts — GiftHint
 *
 * POST /api/group-gift/refund
 *
 * Cancels a gift pool and issues Stripe refunds for every succeeded
 * contribution. Used when a wisher disables a group gift after contributions
 * have already been made, or when an admin needs to force-close a pool.
 *
 * Auth (two accepted modes):
 *   1. Admin mode  — Authorization: Bearer <ADMIN_REFUND_SECRET>
 *      Full access to any pool. The secret is set in the ADMIN_REFUND_SECRET
 *      environment variable (never committed — add to .env.local / Vercel).
 *
 *   2. Owner mode  — Authorization: Bearer <supabase_access_token>
 *      Allows the wisher who owns the item to cancel their own pool.
 *      Verified via supabase.auth.getUser() — same pattern as all other routes.
 *      Refused with 403 if the pool's item belongs to a different user.
 *
 * Request body:
 *   { poolId: string }
 *
 * Behaviour:
 *   1. Validates the pool exists and is cancellable (open or funded; not
 *      already purchased / cancelled).
 *   2. Calls stripe.refunds.create() for each succeeded payment intent.
 *      Already-refunded intents are skipped gracefully.
 *   3. Marks the pool status as 'cancelled'.
 *   4. Clears is_group_gift / group_gift_target on the wishlist item.
 *   5. Returns a summary of refunds issued.
 *
 * Responses:
 *   200  { cancelled: true, refundCount: number, skipped: number }
 *   400  { error: 'invalid_body' }
 *   401  { error: 'unauthorized' }
 *   403  { error: 'forbidden' }
 *   404  { error: 'pool_not_found' }
 *   409  { error: 'pool_not_cancellable', status: string }
 *   500  { error: 'server_error',        message: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }        from '@/lib/supabase-server'
import { stripe }                    from '@/lib/stripe'

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'invalid_body', message: 'Request body must be valid JSON.' },
      { status: 400 },
    )
  }

  const { poolId } = body

  if (typeof poolId !== 'string' || !poolId.trim()) {
    return NextResponse.json(
      { error: 'invalid_body', message: 'poolId is required.' },
      { status: 400 },
    )
  }

  // ── Auth ───────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('authorization') ?? ''
  const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''

  if (!token) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase    = createServerClient()
  const adminSecret = process.env.ADMIN_REFUND_SECRET
  const isAdmin     = adminSecret && token === adminSecret

  // Resolve wisher identity via Supabase JWT if not admin
  let wisherUserId: string | null = null

  if (!isAdmin) {
    const { data: { user: authUser }, error: authErr } = await supabase.auth.getUser(token)

    if (authErr || !authUser) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    wisherUserId = authUser.id
  }

  // ── Load pool + item ───────────────────────────────────────────────────────
  const { data: pool, error: poolErr } = await supabase
    .from('gift_pools')
    .select(`
      id,
      status,
      item_id,
      wishlist_items (
        id,
        user_id
      )
    `)
    .eq('id', poolId)
    .maybeSingle()

  if (poolErr) {
    console.error('[refund] pool lookup error:', poolErr.message)
    return NextResponse.json({ error: 'server_error', message: poolErr.message }, { status: 500 })
  }

  if (!pool) {
    return NextResponse.json({ error: 'pool_not_found' }, { status: 404 })
  }

  // ── Owner auth check (non-admin) ───────────────────────────────────────────
  if (!isAdmin) {
    const item = Array.isArray(pool.wishlist_items)
      ? pool.wishlist_items[0]
      : pool.wishlist_items

    if (!item || item.user_id !== wisherUserId) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
  }

  // ── Validate pool is cancellable ───────────────────────────────────────────
  if (pool.status === 'purchased') {
    return NextResponse.json(
      { error: 'pool_not_cancellable', status: pool.status,
        message: 'Pool is already purchased and cannot be cancelled.' },
      { status: 409 },
    )
  }

  if (pool.status === 'cancelled') {
    // Idempotent — already cancelled
    return NextResponse.json({ cancelled: true, refundCount: 0, skipped: 0 }, { status: 200 })
  }

  // ── Fetch succeeded contributions ──────────────────────────────────────────
  const { data: contributions, error: contribErr } = await supabase
    .from('gift_contributions')
    .select('id, stripe_payment_intent_id, amount, stripe_payment_status')
    .eq('pool_id', poolId)
    .eq('stripe_payment_status', 'succeeded')

  if (contribErr) {
    console.error('[refund] contributions lookup error:', contribErr.message)
    return NextResponse.json({ error: 'server_error', message: contribErr.message }, { status: 500 })
  }

  // ── Issue Stripe refunds ───────────────────────────────────────────────────
  let refundCount = 0
  let skipped     = 0
  const stripeClient = stripe()

  const refundJobs = (contributions ?? []).map(async (c) => {
    if (!c.stripe_payment_intent_id) { skipped++; return }

    try {
      // Check if a refund already exists for this payment intent to be idempotent
      const existing = await stripeClient.refunds.list({ payment_intent: c.stripe_payment_intent_id, limit: 1 })
      if (existing.data.length > 0) { skipped++; return }

      await stripeClient.refunds.create({ payment_intent: c.stripe_payment_intent_id })
      refundCount++
    } catch (err) {
      // Log individual failure but continue with others; we still cancel the pool
      console.error(
        `[refund] Stripe refund failed for PI ${c.stripe_payment_intent_id}:`,
        err instanceof Error ? err.message : err,
      )
      skipped++
    }
  })

  await Promise.allSettled(refundJobs)

  // ── Cancel pool ────────────────────────────────────────────────────────────
  const { error: cancelErr } = await supabase
    .from('gift_pools')
    .update({ status: 'cancelled' })
    .eq('id', poolId)

  if (cancelErr) {
    console.error('[refund] pool cancel error:', cancelErr.message)
    return NextResponse.json({ error: 'server_error', message: cancelErr.message }, { status: 500 })
  }

  // ── Clear group-gift flag on the item ─────────────────────────────────────
  const { error: itemErr } = await supabase
    .from('wishlist_items')
    .update({ is_group_gift: false, group_gift_target: null })
    .eq('id', pool.item_id)

  if (itemErr) {
    // Non-fatal — the pool is already cancelled
    console.error('[refund] item update error (non-fatal):', itemErr.message)
  }

  return NextResponse.json({ cancelled: true, refundCount, skipped }, { status: 200 })
}
