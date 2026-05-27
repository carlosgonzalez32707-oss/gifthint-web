/**
 * app/list/[username]/error.tsx — GiftHint gifter page error boundary
 *
 * Next.js error boundary for the gifter-facing route (/list/:username/:slug).
 * Catches unhandled exceptions thrown during rendering of page.tsx or
 * any of its Server Component children.
 *
 * Must be a Client Component — Next.js requirement for error.tsx.
 *
 * GIFTER PRIVACY PRINCIPLE
 * ───────────────────────
 * Gifters are unauthenticated visitors who may not know what "GiftHint" is.
 * This error page NEVER shows:
 *   - Stack traces or error messages (could expose wisher PII or item data)
 *   - Technical identifiers (digest IDs, route paths)
 *   - Any mention that the wisher uses GiftHint specifically
 *
 * Sentry still receives the full error + stack — we just don't display it.
 * The errorBoundary:'gifter-page' tag makes it filterable in the Sentry UI.
 */

'use client'

import { useEffect } from 'react'
import * as Sentry   from '@sentry/nextjs'
import { tokens }    from '@/tokens'

interface ErrorProps {
  error:  Error & { digest?: string }
  reset:  () => void
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Send full error context to Sentry; show nothing technical to the gifter.
    // Tagged so the Alert "error rate > 5% on gifter page" can filter by this tag.
    Sentry.captureException(error, {
      tags:  { errorBoundary: 'gifter-page' },
      extra: { digest: error.digest },
    })
  }, [error])

  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen gap-6 px-4 text-center"
      style={{ background: tokens.colors.bg, color: tokens.colors.text }}
    >
      <span style={{ fontSize: 52, lineHeight: 1 }} aria-hidden="true">
        🎁
      </span>

      <div className="flex flex-col gap-2 max-w-xs">
        <h1
          className="text-xl font-bold"
          style={{ color: tokens.colors.text }}
        >
          This list isn&apos;t available right now
        </h1>
        <p
          className="text-sm leading-relaxed"
          style={{ color: tokens.colors.muted }}
        >
          The gift list you&apos;re looking for might have moved or be temporarily
          unavailable. Try refreshing or come back in a moment.
        </p>
      </div>

      <div className="flex gap-3">
        <button
          onClick={reset}
          className="px-5 py-2.5 rounded-full text-sm font-semibold transition-opacity hover:opacity-85"
          style={{
            background: tokens.colors.purple,
            color:      '#fff',
          }}
        >
          Try again
        </button>
        <a
          href="/"
          className="px-5 py-2.5 rounded-full text-sm font-semibold transition-opacity hover:opacity-85"
          style={{
            background: tokens.colors.surface2,
            border:     `1px solid ${tokens.colors.border}`,
            color:      tokens.colors.muted,
          }}
        >
          Go home
        </a>
      </div>

      {/* Never show technical details on the gifter-facing page — even in dev.
          Find the full error in Sentry using the errorBoundary:'gifter-page' filter. */}
    </div>
  )
}
