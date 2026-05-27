/**
 * app/api/auth/signup/route.ts — GiftHint post-signup referral attribution
 *
 * POST /api/auth/signup
 *
 * Called immediately after Supabase creates a new user account (e.g. from an
 * OAuth callback or email-confirmation handler). The caller MUST pass the
 * Supabase session access token in `Authorization: Bearer <token>` — the
 * user's identity is derived from the verified JWT, never from the request body.
 *
 * Request headers:
 *   Authorization: Bearer <supabase_access_token>
 *
 * Flow:
 *   1. Verify the Bearer token via supabase.auth.getUser() — reject 401 if invalid.
 *   2. Read the `gifthint_ref` cookie from the request.
 *   3. If present, look up the referrer user by that code.
 *   4. Idempotently set `referred_by` on the new user (only if still null).
 *   5. Call the `increment_referral_count` Postgres RPC for the referrer.
 *   6. Log a 'signup' referral_event.
 *   7. Call checkAndApplyRewards for the referrer.
 *   8. Send a notification email to the referrer.
 *   9. Clear the `gifthint_ref` cookie.
 *
 * If no cookie is present or the code is invalid, returns 200 with no-op.
 * Errors in the referral attribution flow never surface to the caller — the
 * signup itself must always succeed regardless.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }        from '@/lib/supabase-server'
import { sendReferralEmail }         from '@/lib/email'
import { checkAndApplyRewards }      from '@/lib/rewards'

// ── Constants ─────────────────────────────────────────────────────────────────

const REF_COOKIE_NAME = 'gifthint_ref'

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Verify the caller via Supabase JWT.
  //    The userId is derived from the verified token — never trusted from the
  //    request body. This prevents referral fraud where any caller could pass
  //    an arbitrary userId and inflate another user's referral count.
  const authHeader = req.headers.get('authorization') ?? ''
  const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''

  if (!token) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()

  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token)

  if (authError || !authUser) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Verified — use the JWT subject as the authoritative userId
  const userId = authUser.id

  // 2. Read the referral code from the cookie
  const refCode = req.cookies.get(REF_COOKIE_NAME)?.value?.trim().toLowerCase()

  if (!refCode) {
    // No referral cookie — normal signup, nothing to attribute
    return NextResponse.json({ ok: true, attributed: false })
  }

  try {
    // 3. Look up referrer by code
    const { data: referrer, error: referrerError } = await supabase
      .from('users')
      .select('id, referral_code, display_name, email')
      .eq('referral_code', refCode)
      .maybeSingle()

    if (referrerError) {
      console.error('[GiftHint/signup] referrer lookup error:', referrerError.message)
      return NextResponse.json({ ok: true, attributed: false })
    }

    if (!referrer) {
      // Code is no longer valid — skip attribution
      return buildClearCookieResponse({ ok: true, attributed: false })
    }

    // Prevent self-referral
    if (referrer.id === userId) {
      return buildClearCookieResponse({ ok: true, attributed: false })
    }

    // 4. Idempotently set referred_by on the new user (only if still null)
    const { error: updateError } = await supabase
      .from('users')
      .update({ referred_by: referrer.id })
      .eq('id', userId)
      .is('referred_by', null) // no-op if already attributed

    if (updateError) {
      console.error('[GiftHint/signup] referred_by update error:', updateError.message)
      // Non-fatal — continue so the event and counter are still recorded
    }

    // 5. Atomically increment the referrer's counter
    const { error: rpcError } = await supabase.rpc('increment_referral_count', {
      user_id: referrer.id,
    })

    if (rpcError) {
      console.error('[GiftHint/signup] increment_referral_count error:', rpcError.message)
    }

    // 6. Log signup event
    const { error: eventError } = await supabase.from('referral_events').insert({
      referrer_id:   referrer.id,
      referee_id:    userId,
      event_type:    'signup',
      referral_code: refCode,
      metadata:      {},
    })

    if (eventError) {
      console.error('[GiftHint/signup] event insert error:', eventError.message)
    }

    // 7. Check and apply reward tier upgrades for the referrer
    try {
      await checkAndApplyRewards(referrer.id)
    } catch (rewardError) {
      console.error('[GiftHint/signup] rewards error:', rewardError)
    }

    // 8. Send notification email to the referrer
    if (referrer.email) {
      try {
        await sendReferralEmail({
          to:           referrer.email,
          referrerName: referrer.display_name ?? 'there',
        })
      } catch (emailError) {
        // Email failure must never block the signup response
        console.error('[GiftHint/signup] referral email error:', emailError)
      }
    }
  } catch (err) {
    // Catch-all: attribution errors must never fail the signup
    console.error('[GiftHint/signup] unexpected attribution error:', err)
    return buildClearCookieResponse({ ok: true, attributed: false })
  }

  // 9. Clear the referral cookie and return success
  return buildClearCookieResponse({ ok: true, attributed: true })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildClearCookieResponse(body: Record<string, unknown>): NextResponse {
  const response = NextResponse.json(body)
  response.cookies.set(REF_COOKIE_NAME, '', {
    path:    '/',
    maxAge:  0,
    expires: new Date(0),
  })
  return response
}
