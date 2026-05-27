/**
 * next.config.js — GiftHint
 *
 * Wrapped with withSentryConfig() to:
 *   - Inject the Sentry webpack plugin (uploads source maps to Sentry on build)
 *   - Auto-instrument server components and API routes
 *   - Tree-shake Sentry from routes that don't need it
 */

const { withSentryConfig } = require('@sentry/nextjs')

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      // Amazon
      { protocol: 'https', hostname: '**.amazon.com' },
      { protocol: 'https', hostname: '**.ssl-images-amazon.com' },
      { protocol: 'https', hostname: 'm.media-amazon.com' },
      // Etsy
      { protocol: 'https', hostname: '**.etsystatic.com' },
      // Walmart
      { protocol: 'https', hostname: 'i5.walmartimages.com' },
      // Target
      { protocol: 'https', hostname: 'target.scene7.com' },
      // Sephora
      { protocol: 'https', hostname: '**.sephora.com' },
      // Generic CDN patterns
      { protocol: 'https', hostname: '**.cloudfront.net' },
      { protocol: 'https', hostname: '**.shopify.com' },
      { protocol: 'https', hostname: '**.shopifycdn.com' },
    ],
  },
}

module.exports = withSentryConfig(nextConfig, {
  // ── Sentry organisation & project ────────────────────────────────────────────
  // These resolve from environment variables so CI/CD can override them without
  // changing source code. Set them in Vercel project environment variables.
  org:     process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // ── Auth token ───────────────────────────────────────────────────────────────
  // SENTRY_AUTH_TOKEN must be a Sentry internal-integration token with
  // project:write + org:read scopes. Generate at:
  //   Sentry → Settings → Developer Settings → New Internal Integration
  // Add to Vercel environment as SENTRY_AUTH_TOKEN (server-only, not NEXT_PUBLIC_).
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // ── Source maps ──────────────────────────────────────────────────────────────
  // Upload source maps on every production build so Sentry can de-minify stack
  // traces. Source maps are NOT shipped to the browser — only to Sentry's servers.
  hideSourceMaps: true,       // strip .map files from the public build output

  // ── Silent mode ──────────────────────────────────────────────────────────────
  // Suppress the "Sentry successfully uploaded source maps" banner in CI logs.
  silent: process.env.CI === 'true',

  // ── Tree-shaking ─────────────────────────────────────────────────────────────
  // Automatically tree-shake @sentry/nextjs from routes that don't use it.
  // This keeps the client bundle small for gifter-page visitors who never
  // trigger an error (majority of traffic).
  widenClientFileUpload: true,

  // ── Auto-instrumentation ─────────────────────────────────────────────────────
  // Wrap Server Component and API route handlers with Sentry error capture
  // and performance tracing automatically — no manual try/catch needed.
  autoInstrumentServerFunctions: true,
  autoInstrumentMiddleware:       true,   // wraps middleware.ts for edge tracing
  autoInstrumentAppDirectory:     true,   // wraps app/ Server Components

  // ── Tunnelling ───────────────────────────────────────────────────────────────
  // Routes Sentry requests through /monitoring instead of directly to sentry.io.
  // Ad-blockers block sentry.io by hostname; this bypasses that and prevents
  // a blank hole in your error data from privacy-conscious gifters.
  tunnelRoute: '/monitoring',
})
