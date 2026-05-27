/**
 * middleware.ts — GiftHint
 *
 * Edge middleware that runs on /admin/* and /api/* routes.
 *
 * RESPONSIBILITIES
 * ────────────────
 * 1. Admin auth guard (/admin/*)
 *    Cookie-based shared-secret check. Redirects unauthenticated visitors to /.
 *
 * 2. IP blocklist (/api/*)
 *    Checks the Redis set `gifthint:blocked_ips`. IPs banned via
 *    POST /api/admin/ban-ip are added to this set. Returns 403 immediately.
 *
 * 3. Global rate limiting (/api/* except /api/cron/*)
 *    500 requests / IP / minute (DDoS protection).
 *    Returns 429 with Retry-After when exceeded.
 *
 * CRON WHITELIST
 * ──────────────
 * /api/cron/* routes are exempted from rate limiting when the request carries
 * `Authorization: Bearer <CRON_SECRET>` (sent automatically by Vercel Cron).
 *
 * FAIL-OPEN POLICY
 * ────────────────
 * If Upstash Redis is not configured or is temporarily unavailable, the
 * middleware skips steps 2 and 3 and continues to the route handler. A Redis
 * outage never takes down the site. Admin auth relies on a cookie, not Redis.
 *
 * ENV VARS
 * ────────
 *   ADMIN_SECRET              — shared secret for /admin cookie auth
 *   CRON_SECRET               — Vercel Cron bearer token (whitelisted from RL)
 *   UPSTASH_REDIS_REST_URL    — Upstash Redis REST endpoint
 *   UPSTASH_REDIS_REST_TOKEN  — Upstash Redis REST token
 */

import { Ratelimit } from '@upstash/ratelimit'
import { Redis }     from '@upstash/redis'
import { NextRequest, NextResponse } from 'next/server'

// ── Constants ──────────────────────────────────────────────────────────────────

const ADMIN_COOKIE    = 'gh_admin'
const BLOCKED_IPS_KEY = 'gifthint:blocked_ips'

// ── Edge-scoped singletons ─────────────────────────────────────────────────────
// Module-level state is preserved across requests within a warm Edge Function
// instance, avoiding repeated client instantiation on every call.

let _redis:   Redis     | null = null
let _limiter: Ratelimit | null = null

function getEdgeRedis(): Redis | null {
  if (_redis) return _redis

  const url   = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null

  _redis = new Redis({ url, token })
  return _redis
}

function getGlobalLimiter(): Ratelimit | null {
  if (_limiter) return _limiter

  const redis = getEdgeRedis()
  if (!redis) return null

  _limiter = new Ratelimit({
    redis,
    // 500 requests per IP per minute — DDoS protection, not per-route limiting.
    // Each API route applies its own tighter per-route limit on top of this.
    limiter:   Ratelimit.slidingWindow(500, '60 s'),
    prefix:    'gifthint:rl',
    analytics: false,  // skip analytics on the global limiter (high volume)
  })
  return _limiter
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? 'unknown'
}

function isAdminAuthorised(req: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET
  if (!secret) return false
  const cookie = req.cookies.get(ADMIN_COOKIE)
  return cookie?.value === secret
}

/** Returns true when a /api/cron/* request carries the Vercel Cron bearer token. */
function isCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

function tooManyRequestsResponse(reset: number): NextResponse {
  const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000))
  return new NextResponse(
    JSON.stringify({ error: 'rate_limited', message: 'Too many requests. Please try again later.' }),
    {
      status:  429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After':  String(retryAfter),
      },
    },
  )
}

// ── Middleware ─────────────────────────────────────────────────────────────────

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl

  // ── 1. Admin auth guard ──────────────────────────────────────────────────────
  if (pathname.startsWith('/admin')) {
    // Allow the secret-seeding flow: /admin?secret=X lets the browser set the
    // cookie, after which all subsequent requests are verified via the cookie.
    const incomingSecret   = req.nextUrl.searchParams.get('secret')
    const configuredSecret = process.env.ADMIN_SECRET
    const isSeedingCookie  =
      !!incomingSecret &&
      !!configuredSecret &&
      incomingSecret === configuredSecret

    if (!isSeedingCookie && !isAdminAuthorised(req)) {
      return NextResponse.redirect(new URL('/', req.url))
    }
  }

  // ── 2 & 3. API protection: blocklist + global rate limit ─────────────────────
  if (pathname.startsWith('/api')) {
    const ip = getClientIp(req)

    // Vercel Cron jobs carry CRON_SECRET — exempt from rate limiting.
    // All other /api/cron/* calls (missing the secret) still go through limits.
    const skipRateLimit = pathname.startsWith('/api/cron') && isCronRequest(req)

    if (!skipRateLimit && ip !== 'unknown') {
      const redis   = getEdgeRedis()
      const limiter = getGlobalLimiter()

      // Run blocklist and rate limit checks concurrently to minimise latency.
      const [isBlocked, rlResult] = await Promise.all([
        // ── 2. Blocked IP — O(1) Redis set membership check ─────────────────
        redis
          ? redis.sismember(BLOCKED_IPS_KEY, ip).catch(() => 0 as number | boolean)
          : Promise.resolve(0 as number | boolean),

        // ── 3. Global rate limit ─────────────────────────────────────────────
        limiter
          ? limiter.limit(`global:${ip}`).catch(() => ({
              success: true,
              reset:   Date.now() + 60_000,
              remaining: 500,
              limit: 500,
            }))
          : Promise.resolve({ success: true, reset: Date.now() + 60_000, remaining: 500, limit: 500 }),
      ])

      if (isBlocked) {
        return new NextResponse(
          JSON.stringify({ error: 'forbidden', message: 'Access denied.' }),
          {
            status:  403,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }

      if (!rlResult.success) {
        return tooManyRequestsResponse(rlResult.reset)
      }
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    // Admin dashboard — cookie auth guard
    '/admin/:path*',
    // All API routes — IP blocklist + global rate limiting
    // Next.js automatically excludes _next/static, _next/image, and favicon
    // from middleware when using path-based matchers like this.
    '/api/:path*',
  ],
}
