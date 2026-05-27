/**
 * app/api/group-gift/mark-purchased/route.ts — GiftHint
 *
 * POST /api/group-gift/mark-purchased
 *
 * Called by the wisher once they have physically bought the item.
 * Transitions a funded pool to 'purchased' and sends a personalised
 * thank-you email to every contributor who paid.
 *
 * Request body:
 *   {
 *     poolId:      string   — gift_pools.id
 *     receiptUrl?: string   — optional purchase receipt URL included in emails
 *   }
 *
 * Auth:
 *   Requires a valid Supabase access token in Authorization: Bearer <token>.
 *   The pool's item must belong to the authenticated user.
 *
 * Business rules:
 *   - Pool must be in status 'funded' (or 'open', to allow early close).
 *   - Idempotent: already-'purchased' pools return 200 without re-sending emails.
 *   - Emails are sent best-effort; failure is logged but does not roll back the
 *     status update.
 *
 * Responses:
 *   200  { pool: GiftPool }
 *   400  { error: 'invalid_body',     message: string }
 *   401  { error: 'unauthorized' }
 *   403  { error: 'forbidden' }
 *   404  { error: 'pool_not_found' }
 *   409  { error: 'pool_not_purchasable', status: string }
 *   500  { error: 'server_error',    message: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }        from '@/lib/supabase-server'
import { sendContributorThankYouEmail } from '@/lib/email'

// ── Types ─────────────────────────────────────────────────────────────────────

type MarkPurchasedBody = {
  poolId:      string
  receiptUrl?: string
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: Partial<MarkPurchasedBody>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'invalid_body', message: 'Request body must be valid JSON.' },
      { status: 400 },
    )
  }

  const { poolId, receiptUrl } = body

  if (typeof poolId !== 'string' || !poolId.trim()) {
    return NextResponse.json(
      { error: 'invalid_body', message: 'poolId is required.' },
      { status: 400 },
    )
  }

  if (receiptUrl !== undefined && (typeof receiptUrl !== 'string' || !receiptUrl.startsWith('http'))) {
    return NextResponse.json(
      { error: 'invalid_body', message: 'receiptUrl must be a valid URL.' },
      { status: 400 },
    )
  }

  // ── Auth: verify Supabase JWT ──────────────────────────────────────────────
  const authHeader = req.headers.get('authorization') ?? ''
  const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''

  if (!token) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()

  const { data: { user: authUser }, error: authErr } = await supabase.auth.getUser(token)

  if (authErr || !authUser) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // ── Load pool + item ───────────────────────────────────────────────────────
  const { data: pool, error: poolErr } = await supabase
    .from('gift_pools')
    .select(`
      id,
      status,
      target_amount,
      collected_amount,
      organiser_name,
      organiser_email,
      item_id,
      wishlist_items (
        id,
        user_id,
        title,
        image_url,
        source_url,
        price,
        currency
      )
    `)
    .eq('id', poolId)
    .maybeSingle()

  if (poolErr) {
    console.error('[mark-purchased] pool lookup error:', poolErr.message)
    return NextResponse.json({ error: 'server_error', message: poolErr.message }, { status: 500 })
  }

  if (!pool) {
    return NextResponse.json({ error: 'pool_not_found' }, { status: 404 })
  }

  // ── Verify ownership ───────────────────────────────────────────────────────
  // pool.wishlist_items is an object (maybeSingle join)
  const item = Array.isArray(pool.wishlist_items)
    ? pool.wishlist_items[0]
    : pool.wishlist_items

  if (!item || item.user_id !== authUser.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // ── Idempotency — already purchased ───────────────────────────────────────
  if (pool.status === 'purchased') {
    return NextResponse.json({ pool }, { status: 200 })
  }

  // ── Validate status ────────────────────────────────────────────────────────
  if (pool.status !== 'funded' && pool.status !== 'open') {
    return NextResponse.json(
      { error: 'pool_not_purchasable', status: pool.status },
      { status: 409 },
    )
  }

  // ── Update pool status ─────────────────────────────────────────────────────
  const { data: updatedPool, error: updateErr } = await supabase
    .from('gift_pools')
    .update({ status: 'purchased' })
    .eq('id', poolId)
    .select()
    .single()

  if (updateErr) {
    console.error('[mark-purchased] update error:', updateErr.message)
    return NextResponse.json({ error: 'server_error', message: updateErr.message }, { status: 500 })
  }

  // ── Fetch contributors to email ────────────────────────────────────────────
  const { data: contributions } = await supabase
    .from('gift_contributions')
    .select('id, contributor_name, contributor_email, amount, anonymous')
    .eq('pool_id', poolId)
    .eq('stripe_payment_status', 'succeeded')

  // ── Send thank-you emails (best effort) ───────────────────────────────────
  // authUser is supabase.auth.User and has no display_name — use the name
  // stored on the pool at creation time (organiser_name), which is the wisher's
  // chosen display name.
  const wisherName = pool.organiser_name ?? 'your friend'

  const emailJobs: Promise<void>[] = (contributions ?? []).map(async (c) => {
    // Skip anonymous contributors with no email (shouldn't happen, but guard)
    if (!c.contributor_email) return

    const displayName = c.anonymous || !c.contributor_name
      ? 'Friend'
      : c.contributor_name

    try {
      await sendContributorThankYouEmail({
        contributorEmail: c.contributor_email,
        contributorName:  displayName,
        contributionAmount: Number(c.amount),
        currency:         item.currency ?? 'gbp',
        wisherName,
        receiptUrl:       receiptUrl ?? null,
        item: {
          title:     item.title,
          imageUrl:  item.image_url,
          price:     item.price,
          sourceUrl: item.source_url,
        },
      })
    } catch (err) {
      // Non-fatal — log and continue; status is already updated
      console.error(
        `[mark-purchased] thank-you email failed for ${c.contributor_email}:`,
        err instanceof Error ? err.message : err,
      )
    }
  })

  await Promise.allSettled(emailJobs)

  return NextResponse.json({ pool: updatedPool }, { status: 200 })
}
