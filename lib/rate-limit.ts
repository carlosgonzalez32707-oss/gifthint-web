/**
 * lib/rate-limit.ts — GiftHint
 *
 * Sliding-window rate limiting backed by Upstash Redis.
 * Used in API route handlers (Node.js serverless) and middleware (Edge Runtime).
 *
 * Required packages (install once):
 *   npm install @upstash/ratelimit @upstash/redis
 *
 * Required env vars:
 *   UPSTASH_REDIS_REST_URL    — from Upstash console → Redis → REST API
 *   UPSTASH_REDIS_REST_TOKEN  — from Upstash console → Redis → REST API
 *
 * FAIL-OPEN POLICY
 * ────────────────
 * If Redis is unavailable (network error, cold-start before env vars are set),
 * all rate limit checks return success=true so legitimate users are never
 * blocked by an infrastructure failure. Errors are logged to console for
 * alerting purposes.
 *
 * IDENTIFIER CONVENTIONS
 * ──────────────────────
 * Identifiers are namespaced by route to avoid cross-route key collisions:
 *
 *   Global (middleware):   `global:{ip}`
 *   track-click:           `click:{ip}`
 *   click fraud detect:    `click_fraud:{ip}:{itemId}`
 *   track-view:            `view:{ip}:{wishlistId}`
 *   fake-view detect:      `fake_views:{ip}:{wishlistId}`
 *   claim:                 `claim:{ip}`
 *   reminder-signup:       `reminder:{ip}`
 *   group-gift contribute: `contribute:{ip}`
 *   bookmarklet save:      `save:{userId}`
 *
 * All keys are prefixed with `gifthint:rl:` by the Upstash Ratelimit client.
 */

import { Ratelimit } from '@upstash/ratelimit'
import { Redis }     from '@upstash/redis'

// ── Redis singleton ────────────────────────────────────────────────────────────
// Module-level: shared within one serverless warm instance.
// Re-created on cold start (env vars already present by then).

let _redis: Redis | null = null

function getRedis(): Redis | null {
  if (_redis) return _redis

  const url   = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    // Not configured — fail open. Log once (on cold start).
    console.warn(
      '[rate-limit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set. ' +
      'Rate limiting is DISABLED — set these env vars before going to production.',
    )
    return null
  }

  _redis = new Redis({ url, token })
  return _redis
}

// ── Ratelimit instance cache ───────────────────────────────────────────────────
// Keyed by `${limit}:${windowSecs}` so different routes can share an instance
// when they happen to use the same limit+window combo.

const _limiters = new Map<string, Ratelimit>()

function getLimiter(limit: number, windowSecs: number): Ratelimit | null {
  const redis = getRedis()
  if (!redis) return null

  const cacheKey = `${limit}:${windowSecs}`
  if (_limiters.has(cacheKey)) return _limiters.get(cacheKey)!

  const limiter = new Ratelimit({
    redis,
    // slidingWindow gives smooth rate limiting: a request at t=30s counts
    // toward both the [0,60) and [30,90) windows, so bursts can't sneak through
    // at window boundaries the way they can with fixed windows.
    limiter:   Ratelimit.slidingWindow(limit, `${windowSecs} s`),
    prefix:    'gifthint:rl',
    analytics: true,   // enables hit-count data for the admin security panel
  })

  _limiters.set(cacheKey, limiter)
  return limiter
}

// ── Public API ─────────────────────────────────────────────────────────────────

export interface RateLimitResult {
  success:   boolean   // false means the limit was exceeded
  remaining: number    // tokens left in the current window
  reset:     number    // Unix timestamp (ms) when the window fully resets
  limit:     number    // the configured max for this window
}

/**
 * Check and consume one rate-limit token for the given identifier.
 *
 * Fails open if Redis is unavailable — logs the error and returns success=true
 * so legitimate users are not affected by infrastructure issues.
 *
 * @param identifier  Namespaced key, e.g. `click:203.0.113.42`
 * @param limit       Max requests allowed in the window
 * @param windowSecs  Window duration in seconds
 */
export async function rateLimit(
  identifier: string,
  limit:      number,
  windowSecs: number,
): Promise<RateLimitResult> {
  const limiter = getLimiter(limit, windowSecs)

  // Fail open when Redis is not configured
  if (!limiter) {
    return { success: true, remaining: limit, reset: Date.now() + windowSecs * 1000, limit }
  }

  try {
    const result = await limiter.limit(identifier)
    return {
      success:   result.success,
      remaining: result.remaining,
      reset:     result.reset,
      limit:     result.limit,
    }
  } catch (err) {
    // Network / Redis error — fail open
    console.error('[rate-limit] Redis error — failing open:', err)
    return { success: true, remaining: limit, reset: Date.now() + windowSecs * 1000, limit }
  }
}

// ── IP extraction ──────────────────────────────────────────────────────────────

/**
 * Extracts the real client IP from a Next.js request.
 *
 * In production behind Vercel's edge network, the original client IP is
 * available in `x-forwarded-for` (first value in the comma-separated list).
 * In local dev, falls back to `x-real-ip` or the literal `'unknown'`.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? 'unknown'
}

// ── Standard 429 response ─────────────────────────────────────────────────────

/**
 * Builds a RFC 6585-compliant 429 Too Many Requests response with a
 * `Retry-After` header telling the client how long to wait.
 *
 * @param reset  Unix timestamp (ms) when the rate limit window resets
 */
export function rateLimitResponse(reset: number): Response {
  const retryAfterSecs = Math.max(1, Math.ceil((reset - Date.now()) / 1000))
  return new Response(
    JSON.stringify({
      error:   'rate_limited',
      message: 'Too many requests. Please try again later.',
    }),
    {
      status:  429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After':  String(retryAfterSecs),
        'X-RateLimit-Limit':     '0',
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset':     String(Math.ceil(reset / 1000)),
      },
    },
  )
}

// ── Redis client export (for middleware and ban-ip route) ──────────────────────

/**
 * Returns the shared Redis client for operations outside rateLimit()
 * (e.g. SADD/SISMEMBER for the blocked-IP set).
 * Returns null when not configured — callers must handle this gracefully.
 */
export function getRedisClient(): Redis | null {
  return getRedis()
}
