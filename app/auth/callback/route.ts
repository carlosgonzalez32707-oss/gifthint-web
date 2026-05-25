/**
 * app/auth/callback/route.ts — GiftHint
 *
 * Handles the Supabase PKCE OAuth callback.
 *
 * Supabase 2.x uses PKCE flow by default. After the user authenticates with
 * Google, Supabase redirects here with a one-time `code` parameter:
 *
 *   GET /auth/callback?code=<pkce_code>&next=/dashboard
 *
 * This route exchanges the code for a session cookie and redirects the user
 * to `next` (defaulting to /dashboard). Without this handler, the code lands
 * on a page whose client-side auth guard fires before the exchange completes,
 * causing the user to be bounced as unauthenticated.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }        from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)

  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  // Validate `next` to prevent open-redirect attacks — only allow relative paths
  const safeNext = next.startsWith('/') ? next : '/dashboard'

  if (code) {
    const supabase = createServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return NextResponse.redirect(`${origin}${safeNext}`)
    }

    console.error('[auth/callback] exchangeCodeForSession error:', error.message)
  }

  // Something went wrong — send to homepage with an error hint
  return NextResponse.redirect(`${origin}/?auth_error=callback_failed`)
}
