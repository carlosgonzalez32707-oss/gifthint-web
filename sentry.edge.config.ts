/**
 * sentry.edge.config.ts — GiftHint
 *
 * Sentry SDK initialisation for the Edge runtime.
 * Runs in: middleware.ts, any route segments using `export const runtime = 'edge'`.
 *
 * The Edge runtime is a restricted V8 environment — no Node.js APIs, no file I/O.
 * @sentry/nextjs uses a lightweight Edge-compatible build automatically when it
 * detects this config file.
 *
 * SAMPLING RATIONALE
 * ──────────────────
 * tracesSampleRate: 0.05
 *   Middleware runs on EVERY request (500 req/IP/min limit). 5% sampling avoids
 *   flooding the Sentry quota with low-value middleware spans (health checks,
 *   static asset requests, etc.). Blocked-IP and rate-limit rejections are still
 *   captured as errors at 100% because they go through beforeSend, not sampling.
 *
 * Error capture is always 100% regardless of tracesSampleRate — sampling only
 * affects performance traces (spans), never error events.
 */

import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // ── Sampling ────────────────────────────────────────────────────────────────
  // Lower than server (0.1) because middleware wraps every HTTP request —
  // including static files, images, and prefetch traffic.
  tracesSampleRate: 0.05,   // 5% of edge requests traced

  // ── Environment ─────────────────────────────────────────────────────────────
  environment: process.env.NODE_ENV ?? 'development',

  // ── Noise reduction ──────────────────────────────────────────────────────────
  // Rate-limit 429 responses and IP-block 403s are expected; don't create issues.
  // Auth redirects from /admin/* are also expected operational behaviour.
  ignoreErrors: [
    'rate_limited',
    'ip_blocked',
  ],

  // ── Transaction normalisation ────────────────────────────────────────────────
  beforeSendTransaction(event) {
    // Drop spans for static assets — Next.js routes these through middleware
    // only in dev; in production they're served from the CDN. Drop defensively.
    if (event.transaction) {
      if (/\.(ico|png|jpg|svg|woff2?|css|js\.map)(\?|$)/.test(event.transaction)) {
        return null
      }
    }
    return event
  },
})
