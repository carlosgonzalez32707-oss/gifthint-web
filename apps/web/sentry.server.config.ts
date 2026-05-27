/**
 * sentry.server.config.ts — GiftHint
 *
 * Sentry SDK initialisation for the Node.js server runtime
 * (API routes, Server Components, server actions).
 * This file is loaded automatically by @sentry/nextjs.
 *
 * SAMPLING RATIONALE
 * ──────────────────
 * tracesSampleRate: 0.1
 *   Matches the client rate so parent→child distributed traces stay coherent.
 *   At 10k MAU the /api/* routes handle ~50k req/day; 10% = 5k server spans —
 *   enough for reliable P95 bucketing with room to spare.
 *
 * profilesSampleRate: 0.1
 *   Server-side CPU profiling on 10% of traced requests gives flame graphs
 *   for slow Supabase calls and price-check crons without measurable overhead.
 */

import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // ── Sampling ────────────────────────────────────────────────────────────────
  tracesSampleRate:   0.1,   // 10% of server requests traced
  profilesSampleRate: 0.1,   // 10% of server traces include Node.js CPU profile

  // ── Integrations ────────────────────────────────────────────────────────────
  integrations: [
    // Capture Node.js native http/https spans automatically.
    // This wraps every Supabase and Stripe HTTP call, giving you timing and
    // status-code breakdowns without manual instrumentation.
    // Trace header propagation is enabled by default in @sentry/nextjs v8+.
    Sentry.httpIntegration(),

    // Capture unhandled promise rejections in server actions / route handlers.
    // Next.js swallows some of these; this integration surfaces them in Sentry.
    Sentry.onUnhandledRejectionIntegration({ mode: 'strict' }),
  ],

  // ── Environment & release ────────────────────────────────────────────────────
  environment: process.env.NODE_ENV ?? 'development',

  // ── Noise reduction ──────────────────────────────────────────────────────────
  // Don't create Sentry issues for expected operational errors that are already
  // handled in the application layer (rate limits, intentional 4xx, etc.).
  beforeSend(event, hint) {
    const err = hint?.originalException

    // Suppress rate-limit errors — these are expected and counted in middleware metrics
    if (err instanceof Error && err.message.includes('rate_limited')) return null

    // Suppress "not_found" errors on public gifter pages — normal for deleted lists
    if (err instanceof Error && err.message.includes('not_found')) return null

    return event
  },

  // ── Transaction normalisation ────────────────────────────────────────────────
  // Collapse dynamic path segments so Sentry groups by route pattern,
  // not by individual user IDs or UUIDs.
  beforeSendTransaction(event) {
    if (event.transaction) {
      event.transaction = event.transaction
        .replace(/\/list\/[^/]+\/[^/?#]+/, '/list/:username/:slug')
        .replace(/\/api\/wishlists\/[^/?#]+/, '/api/wishlists/:id')
        .replace(/\/api\/analytics\/wishlist\/[^/?#]+/, '/api/analytics/wishlist/:wishlistId')
        .replace(/\/r\/[^/?#]+/, '/r/:code')
    }
    return event
  },
})
