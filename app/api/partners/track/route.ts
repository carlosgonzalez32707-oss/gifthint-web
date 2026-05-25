/**
 * app/api/partners/track/route.ts — GiftHint
 *
 * GET /api/partners/track?code=<referral_code>
 *
 * Cookie-setting step for partner referral attribution. Called when a visitor
 * on a partner landing page (/partners/[slug]) clicks the "Create my free
 * list" CTA.
 *
 * Flow:
 *   1. Validate the referral_code query param against the partners table.
 *   2. Log a 'click' referral_event (fire-and-forget — never blocks the redirect).
 *   3. Set gifthint_ref=<referral_code> cookie (30 days, same as user referrals).
 *   4. Redirect to / so the visitor sees the GiftHint homepage and can click
 *      "Get started" to trigger Google OAuth → /dashboard → /api/auth/signup
 *      reads the cookie and attributes the signup to the partner.
 *
 * Invalid or missing codes: silent redirect to / with no cookie.
 *
 * This route intentionally does NOT render any HTML — it is a pure redirect
 * handler. The rendered landing page is the Server Component at
 * app/partners/[partnerSlug]/page.tsx.
 *
 * Why a separate route?
 *   Next.js 14 App Router Server Components cannot set cookies — only Route
 *   Handlers and Server Actions can. This handler is the cleanest way to set
 *   the attribution cookie without a client-side JS dependency.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }        from '@/lib/supabase-server'

// ── Constants (mirror app/r/[code]/route.ts) ──────────────────────────────────

const REF_COOKIE_NAME    = 'gifthint_ref'
const REF_COOKIE_MAX_AGE = 60 * 60 * 24 * 30  // 30 days in seconds

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const code = req.nextUrl.searchParams.get('code')?.trim().toLowerCase() ?? ''

  // ── Validate ───────────────────────────────────────────────────────────────
  if (!code) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  const supabase = createServerClient()

  // Look up the partner by referral_code (denormalised on the partners table).
  // We query partners rather than users so we can confirm the code belongs to
  // an active partner, not an arbitrary user account.
  const { data: partner, error } = await supabase
    .from('partners')
    .select('id, referral_code, user_id, slug')
    .eq('referral_code', code)
    .eq('active', true)
    .maybeSingle()

  if (error) {
    console.error('[partners/track] lookup error:', error.message)
  }

  // Unknown or inactive partner → silent redirect, no cookie
  if (!partner) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  // ── Log click event (fire-and-forget) ─────────────────────────────────────
  // Mirrors the click-logging in app/r/[code]/route.ts. The insert runs
  // asynchronously so it never delays the redirect.
  supabase
    .from('referral_events')
    .insert({
      referrer_id:   partner.user_id,
      referee_id:    null,
      event_type:    'click',
      referral_code: partner.referral_code,
      metadata:      { source: 'partner_page', partner_slug: partner.slug },
    })
    .then(({ error: insertErr }) => {
      if (insertErr) {
        console.error('[partners/track] click event insert error:', insertErr.message)
      }
    })

  // ── Set attribution cookie and redirect ───────────────────────────────────
  const destination = new URL('/', req.url)
  destination.searchParams.set('ref', partner.referral_code)

  const response = NextResponse.redirect(destination)

  response.cookies.set(REF_COOKIE_NAME, partner.referral_code, {
    path:     '/',
    maxAge:   REF_COOKIE_MAX_AGE,
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  })

  return response
}
