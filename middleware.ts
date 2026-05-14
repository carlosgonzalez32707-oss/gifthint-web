/**
 * middleware.ts — GiftHint
 *
 * Edge middleware that protects all /admin/* routes.
 *
 * AUTH STRATEGY
 * ─────────────
 * This app does not yet have @supabase/ssr set up, so the session JWT is
 * not available in a server-readable cookie. Instead we use a shared-secret
 * cookie (`gh_admin`) that the admin sets once by visiting:
 *
 *   /admin?secret=<ADMIN_SECRET>
 *
 * The page sets the cookie on the response, and middleware verifies it on
 * every subsequent /admin/* request. The cookie is HttpOnly + SameSite=Strict,
 * so it cannot be read or forged by client-side JS.
 *
 * ENV VARS REQUIRED
 * ─────────────────
 *   ADMIN_SECRET   — The shared secret. Keep it long (≥32 chars), random,
 *                    and out of git. Rotate it when team members leave.
 *   ADMIN_EMAIL    — The admin's email address, used for display only in the
 *                    dashboard UI (not validated by middleware itself).
 *
 * UPGRADE PATH
 * ────────────
 * When @supabase/ssr is added, replace `verifyCookie` with a Supabase
 * `createServerClient()` session check and compare `session.user.email`
 * against process.env.ADMIN_EMAIL.
 */

import { NextRequest, NextResponse } from 'next/server'

const ADMIN_COOKIE = 'gh_admin'

/**
 * Verifies that the request carries a valid admin cookie.
 * Returns true only when ADMIN_SECRET is set AND the cookie matches it.
 */
function isAdmin(req: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET
  if (!secret) return false   // admin access disabled if secret not configured

  const cookie = req.cookies.get(ADMIN_COOKIE)
  return cookie?.value === secret
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // ── Protect /admin/* routes ──────────────────────────────────────────────
  if (pathname.startsWith('/admin')) {
    // Allow the secret-seeding query param — the page itself sets the cookie
    const incomingSecret = req.nextUrl.searchParams.get('secret')
    const configuredSecret = process.env.ADMIN_SECRET
    const seedingAdmin =
      !!incomingSecret &&
      !!configuredSecret &&
      incomingSecret === configuredSecret

    if (!seedingAdmin && !isAdmin(req)) {
      // Not authenticated — redirect to home page
      return NextResponse.redirect(new URL('/', req.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  // Run on all /admin/* routes; skip Next.js internals and static assets
  matcher: ['/admin/:path*'],
}
