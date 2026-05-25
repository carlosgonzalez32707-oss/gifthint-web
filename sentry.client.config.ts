/**
 * sentry.client.config.ts — GiftHint
 *
 * Sentry SDK initialisation for browser (client) bundles.
 * This file is loaded automatically by @sentry/nextjs via next.config.js.
 *
 * SAMPLING RATIONALE
 * ──────────────────
 * tracesSampleRate: 0.1
 *   10% of page loads are traced end-to-end. At 10k MAU, this gives ~3 k
 *   distributed traces/day — enough to spot P95 regressions without the cost
 *   of 100% sampling. Raise to 0.5 on staging for richer local profiling.
 *
 * replaysSessionSampleRate: 0.02
 *   2% of sessions are replayed. Session Replay is charged per 1k replays;
 *   2% of 10k MAU ≈ 200 replays/day — within the free plan (500/day).
 *
 * replaysOnErrorSampleRate: 1.0
 *   Every session that throws an uncaught error is fully replayed.
 *   This is the highest-signal replay and costs nothing extra until an error fires.
 *
 * profilesSampleRate: 0.1
 *   Match traces so every captured trace includes a JS flame graph.
 */

import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // ── Sampling ────────────────────────────────────────────────────────────────
  tracesSampleRate:         0.1,    // 10% of requests traced (see rationale above)
  profilesSampleRate:       0.1,    // 10% of traces include a JS CPU profile

  // ── Session Replay ───────────────────────────────────────────────────────────
  // Provides visual context for bug reports. Loaded lazily — zero cost until triggered.
  replaysSessionSampleRate: 0.02,   // 2% of normal sessions replayed
  replaysOnErrorSampleRate: 1.0,    // 100% of error sessions replayed

  integrations: [
    // Lazy-load Session Replay so it does not bloat the main bundle.
    Sentry.replayIntegration({
      // Mask all text and block all images by default — GDPR safe.
      // Change to unmask/unblock specific selectors if you need richer replays.
      maskAllText:    true,
      blockAllMedia:  true,
    }),

    // Browser performance tracing — automatically instruments fetch, XHR,
    // navigation, and route changes. Provides P75/P95 timings in the dashboard.
    Sentry.browserTracingIntegration(),
  ],

  // ── Environment & release ────────────────────────────────────────────────────
  // SENTRY_RELEASE is injected by the @sentry/nextjs webpack plugin during build.
  // The release string (git SHA) links Sentry events to source maps automatically.
  environment: process.env.NODE_ENV ?? 'development',

  // ── Noise reduction ──────────────────────────────────────────────────────────
  // Ignore errors triggered by browser extensions or ad-blockers that are
  // outside our control. Expand this list based on Sentry's "Top Issues" view.
  ignoreErrors: [
    // Chrome extension injection errors
    /chrome-extension:\/\//i,
    // ResizeObserver loop notifications (browser-level, not actionable)
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications',
    // Safari private-browsing storage errors
    'The operation is insecure',
    // User navigated away mid-fetch (completely normal)
    'AbortError',
  ],

  // Ignore traces originating from browser extensions
  tracePropagationTargets: [
    /^https:\/\/gifthint\.io/,
    /^https:\/\/[a-z0-9-]+\.supabase\.co/,
  ],

  // Normalise URL paths so /list/carlos/birthday and /list/alice/xmas
  // collapse into a single transaction "/list/:username/:slug" in the dashboard.
  beforeSendTransaction(event) {
    if (event.transaction) {
      event.transaction = event.transaction
        .replace(/\/list\/[^/]+\/[^/?#]+/, '/list/:username/:slug')
        .replace(/\/r\/[^/?#]+/, '/r/:code')
    }
    return event
  },
})
