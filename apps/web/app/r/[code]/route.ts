/**
 * app/r/[code]/route.ts — GiftHint referral link redirect
 *
 * GET /r/<code>
 *
 * 1. Validates the referral code against the users table.
 * 2. Logs a 'click' event to referral_events (fire-and-forget — never fails the
 *    redirect if the DB write errors).
 * 3. Sets a `gifthint_ref` cookie (30 days, httpOnly) so the auth signup handler
 *    can attribute the new user to this referrer.
 * 4. Redirects to /?ref=<code> so the landing page can optionally show a
 *    personalised welcome message.
 *
 * Invalid codes redirect silently to / with no cookie set.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }        from '@/lib/supabase-server'

// ── Config ─────────────────────────────────────────────────────────────────────

/** Cookie TTL: 30 days in seconds */
const REF_COOKIE_MAX_AGE = 60 * 60 * 24 * 30

/** Cookie name read by the signup handler */
const REF_COOKIE_NAME = 'gifthint_ref'

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(
  req:     NextRequest,
  { params }: { params: { code: string } },
): Promise<NextResponse> {
  const code = params.code?.trim().toLowerCase()

  if (!code) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  const supabase = createServerClient()

  // 1. Look up the referrer by their code
  const { data: referrer, error } = await supabase
    .from('users')
    .select('id, referral_code')
    .eq('referral_code', code)
    .maybeSingle()

  if (error) {
    console.error('[GiftHint/referral] code lookup error:', error.message)
  }

  // Invalid or unknown code → silent redirect, no cookie
  if (!referrer) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  // 2. Log click event — fire and forget
  supabase
    .from('referral_events')
    .insert({
      referrer_id:   referrer.id,
      referee_id:    null,
      event_type:    'click',
      referral_code: referrer.referral_code,
      metadata:      {},
    })
    .then(({ error: insertError }) => {
      if (insertError) {
        console.error('[GiftHint/referral] click insert error:', insertError.message)
      }
    })

  // 3. Build redirect response and set cookie
  const destination = new URL('/', req.url)
  destination.searchParams.set('ref', referrer.referral_code)

  const response = NextResponse.redirect(destination)

  response.cookies.set(REF_COOKIE_NAME, referrer.referral_code, {
    path:     '/',
    maxAge:   REF_COOKIE_MAX_AGE,
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  })

  return response
}
