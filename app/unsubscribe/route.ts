/**
 * app/unsubscribe/route.ts — GiftHint
 *
 * GET /unsubscribe?token=<unsubscribe_token>
 *
 * One-click email unsubscribe for the weekly digest.
 *
 * HOW IT WORKS
 * ────────────
 * 1. Each user has a unique `unsubscribe_token` column (see 012_digest_schema.sql).
 * 2. The weekly digest email embeds a link:
 *      https://gifthint.io/unsubscribe?token=<token>
 * 3. When the user clicks the link, this handler:
 *    a. Looks up the user by token
 *    b. Sets email_digest_enabled = false
 *    c. Rotates the token (prevents replay attacks — old links stop working)
 *    d. Returns a styled HTML confirmation page (no redirect needed)
 *
 * TOKEN ROTATION
 * ──────────────
 * After a successful unsubscribe, the token is replaced with a new random UUID.
 * This means the same unsubscribe link cannot be replayed (e.g. by an email
 * scanner that pre-fetches links). If the user re-subscribes and then clicks
 * an old link, nothing happens because the token no longer matches.
 *
 * RE-SUBSCRIBE
 * ────────────
 * Users can re-enable the digest from their account settings at /dashboard.
 * We don't expose a re-subscribe link in this response to keep the flow simple.
 *
 * NO AUTH REQUIRED
 * ────────────────
 * The token IS the credential here. Service-role key is used server-side.
 * The route is public (no cookie/JWT needed) — that's the point of the token.
 *
 * DESIGN
 * ──────
 * Returns an HTML page (not JSON) because the link is clicked in a browser
 * from the email client. Inline styles only, dark background matching brand.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }         from '@/lib/supabase-server'

// ── Response pages (inline HTML) ──────────────────────────────────────────────

const PAGE_STYLES = `
  body {
    margin: 0;
    padding: 0;
    background: #0C0C0E;
    color: #F0EEE8;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
  }
  .card {
    max-width: 480px;
    width: calc(100% - 48px);
    background: #141418;
    border: 1px solid rgba(240,238,232,0.08);
    border-radius: 20px;
    padding: 48px 40px;
    text-align: center;
  }
  .icon  { font-size: 40px; margin: 0 0 16px; }
  h1     { margin: 0 0 12px; font-size: 22px; font-weight: 700; letter-spacing: -0.03em; color: #F0EEE8; }
  p      { margin: 0 0 20px; font-size: 14px; line-height: 1.6; color: #7A7870; }
  a      { color: #8B83F0; text-decoration: none; }
  a:hover { text-decoration: underline; }
`

function unsubscribedPage(): NextResponse {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Unsubscribed — GiftHint</title>
  <style>${PAGE_STYLES}</style>
</head>
<body>
  <div class="card">
    <p class="icon">✅</p>
    <h1>You've been unsubscribed</h1>
    <p>
      You won't receive any more weekly digest emails from GiftHint.
      Your wishlist is still active — gifters can still view and claim items.
    </p>
    <p>
      Changed your mind? You can re-enable digest emails from your
      <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://gifthint.io'}/dashboard">account settings</a>.
    </p>
    <p style="font-size: 12px; color: #555450; margin-top: 24px; margin-bottom: 0;">
      <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://gifthint.io'}">GiftHint</a>
    </p>
  </div>
</body>
</html>`

  return new NextResponse(html, {
    status:  200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

function invalidTokenPage(): NextResponse {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invalid link — GiftHint</title>
  <style>${PAGE_STYLES}</style>
</head>
<body>
  <div class="card">
    <p class="icon">🔗</p>
    <h1>This link has expired</h1>
    <p>
      This unsubscribe link has already been used or is no longer valid.
      If you'd like to stop receiving digest emails, you can update your preferences
      from your <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://gifthint.io'}/dashboard">account settings</a>.
    </p>
    <p style="font-size: 12px; color: #555450; margin-top: 24px; margin-bottom: 0;">
      <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://gifthint.io'}">GiftHint</a>
    </p>
  </div>
</body>
</html>`

  return new NextResponse(html, {
    status:  404,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

function errorPage(): NextResponse {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Something went wrong — GiftHint</title>
  <style>${PAGE_STYLES}</style>
</head>
<body>
  <div class="card">
    <p class="icon">⚠️</p>
    <h1>Something went wrong</h1>
    <p>
      We couldn't process your unsubscribe request right now. Please try again,
      or manage your preferences from your
      <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://gifthint.io'}/dashboard">account settings</a>.
    </p>
  </div>
</body>
</html>`

  return new NextResponse(html, {
    status:  500,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

// ── Route handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.nextUrl.searchParams.get('token')

  if (!token || token.trim().length === 0) {
    return invalidTokenPage()
  }

  const supabase = createServerClient()

  // ── Look up user by token ──────────────────────────────────────────────────
  const { data: user, error: lookupError } = await supabase
    .from('users')
    .select('id, email_digest_enabled')
    .eq('unsubscribe_token', token)
    .single()

  if (lookupError || !user) {
    // Token not found — already used or fabricated
    return invalidTokenPage()
  }

  const { id: userId } = user as { id: string; email_digest_enabled: boolean }

  // ── Update: disable digest + rotate token ──────────────────────────────────
  // We use a DB-generated UUID for the new token so there's no chance of a
  // race condition where two requests get the same replacement token.
  const { error: updateError } = await supabase.rpc('rotate_unsubscribe_token', {
    p_user_id: userId,
  })

  if (updateError) {
    // RPC doesn't exist yet or failed — fall back to a direct update
    // (token rotation won't happen, but the opt-out still will)
    const { error: fallbackError } = await supabase
      .from('users')
      .update({
        email_digest_enabled: false,
        unsubscribe_token:    crypto.randomUUID(),
      })
      .eq('id', userId)

    if (fallbackError) {
      console.error('[unsubscribe] DB update failed:', fallbackError.message)
      return errorPage()
    }
  }

  console.log(`[unsubscribe] User ${userId} opted out of digest emails.`)

  return unsubscribedPage()
}
