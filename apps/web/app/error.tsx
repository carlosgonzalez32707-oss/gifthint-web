/**
 * app/error.tsx — GiftHint root error boundary
 *
 * Catches any unhandled exception thrown in any route that does NOT have its
 * own error.tsx (admin dashboard, blog, API routes that render, etc.).
 *
 * Must be a Client Component — Next.js requirement for error.tsx files.
 * "use client" means this file is excluded from Server Component rendering,
 * so it is safe to import Sentry's client-side captureException here.
 *
 * What Sentry captures:
 *   - error.message + full stack trace
 *   - error.digest (Next.js's internal error identifier for server errors)
 *   - URL, user agent, and any active Sentry user context
 *   - Session Replay clip if replaysOnErrorSampleRate fires (100%)
 *
 * What users see:
 *   - Friendly headline with no technical detail
 *   - "Try again" (calls reset() — re-renders the subtree)
 *   - "Go home" — escape hatch to the landing page
 *   - Error ID shown in development only for quick Sentry lookup
 */

'use client'

import { useEffect }   from 'react'
import * as Sentry     from '@sentry/nextjs'
import { tokens }      from '@/tokens'

interface ErrorProps {
  error:  Error & { digest?: string }
  reset:  () => void
}

export default function GlobalError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Capture with full context. Sentry.captureException is a no-op in
    // development if NEXT_PUBLIC_SENTRY_DSN is not set — safe to leave in.
    Sentry.captureException(error, {
      // Tag lets you filter to root-boundary errors in the Sentry issue list.
      tags: { errorBoundary: 'root' },
      // error.digest is Next.js's internal server-side error ID.
      // Including it as extra lets you cross-reference Vercel function logs.
      extra: { digest: error.digest },
    })
  }, [error])

  return (
    <html lang="en">
      <body style={{ margin: 0, background: tokens.colors.bg, color: tokens.colors.text, fontFamily: tokens.font.sans }}>
        <div
          style={{
            display:        'flex',
            flexDirection:  'column',
            alignItems:     'center',
            justifyContent: 'center',
            minHeight:      '100vh',
            gap:            '24px',
            padding:        '24px',
            textAlign:      'center',
          }}
        >
          <span style={{ fontSize: 52, lineHeight: 1 }} aria-hidden="true">⚠️</span>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '360px' }}>
            <h1
              style={{
                margin:      0,
                fontSize:    '20px',
                fontWeight:  700,
                letterSpacing: '-0.2px',
                color:       tokens.colors.text,
              }}
            >
              Something went wrong
            </h1>
            <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.6, color: tokens.colors.muted }}>
              We hit an unexpected error. Our team has been notified automatically.
              Try refreshing — most errors are temporary.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={reset}
              style={{
                padding:      '10px 20px',
                borderRadius: tokens.radius.pill,
                border:       'none',
                background:   tokens.colors.purple,
                color:        '#fff',
                fontSize:     '14px',
                fontWeight:   600,
                cursor:       'pointer',
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                padding:      '10px 20px',
                borderRadius: tokens.radius.pill,
                border:       `1px solid ${tokens.colors.border}`,
                background:   tokens.colors.surface2,
                color:        tokens.colors.muted,
                fontSize:     '14px',
                fontWeight:   600,
                textDecoration: 'none',
              }}
            >
              Go home
            </a>
          </div>

          {/* Sentry event ID — visible in development for quick lookup */}
          {process.env.NODE_ENV === 'development' && error.digest && (
            <p
              style={{
                margin:       0,
                fontSize:     '11px',
                fontFamily:   tokens.font.mono,
                padding:      '6px 12px',
                borderRadius: tokens.radius.sm,
                background:   tokens.colors.surface2,
                color:        tokens.colors.muted,
                border:       `1px solid ${tokens.colors.border}`,
              }}
            >
              Error ID: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  )
}
