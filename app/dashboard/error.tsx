/**
 * app/dashboard/error.tsx — GiftHint wisher dashboard error boundary
 *
 * Catches unhandled exceptions in the wisher dashboard route group:
 *   /dashboard          (main dashboard)
 *   /dashboard/[slug]   (individual wishlist view)
 *   /dashboard/referrals
 *   /dashboard/group-gifts
 *
 * Must be a Client Component — Next.js requirement for error.tsx.
 *
 * Unlike the gifter-page boundary, the dashboard serves authenticated wishers.
 * It's safe to show a slightly more specific message ("your dashboard") and to
 * display the error ID — wishers can quote it to support. Still no stack traces
 * or internal error messages.
 */

'use client'

import { useEffect }    from 'react'
import * as Sentry      from '@sentry/nextjs'
import { tokens }       from '@/tokens'

interface ErrorProps {
  error:  Error & { digest?: string }
  reset:  () => void
}

export default function DashboardError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Capture with context. The 'dashboard' tag enables a dedicated Sentry
    // alert if dashboard errors spike (separate from gifter-page errors).
    Sentry.captureException(error, {
      tags:  { errorBoundary: 'dashboard' },
      extra: { digest: error.digest },
    })
  }, [error])

  return (
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
        background:     tokens.colors.bg,
        color:          tokens.colors.text,
        fontFamily:     tokens.font.sans,
      }}
    >
      <span style={{ fontSize: 48, lineHeight: 1 }} aria-hidden="true">📋</span>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '380px' }}>
        <h1
          style={{
            margin:        0,
            fontSize:      '20px',
            fontWeight:    700,
            letterSpacing: '-0.2px',
            color:         tokens.colors.text,
          }}
        >
          We couldn&apos;t load your dashboard
        </h1>
        <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.6, color: tokens.colors.muted }}>
          Something went wrong on our end. Try refreshing — your wishlists
          and items are safe. If the problem persists, contact{' '}
          <a
            href="mailto:hello@gifthint.io"
            style={{ color: tokens.colors.purple, textDecoration: 'none' }}
          >
            hello@gifthint.io
          </a>
          .
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
          Try refreshing
        </button>
        <a
          href="/dashboard"
          style={{
            padding:        '10px 20px',
            borderRadius:   tokens.radius.pill,
            border:         `1px solid ${tokens.colors.border}`,
            background:     tokens.colors.surface2,
            color:          tokens.colors.muted,
            fontSize:       '14px',
            fontWeight:     600,
            textDecoration: 'none',
          }}
        >
          Back to dashboard
        </a>
      </div>

      {/* Show the digest in any environment for wishers to quote in support tickets.
          The digest is a hash — it contains no PII and no internal error detail. */}
      {error.digest && (
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
          Error reference: {error.digest}
        </p>
      )}
    </div>
  )
}
