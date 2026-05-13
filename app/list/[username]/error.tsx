/**
 * app/list/[username]/error.tsx — GiftHint
 *
 * Next.js 14 error boundary for the gifter page route.
 * Catches unhandled exceptions thrown during rendering of page.tsx or
 * any of its Server Component children.
 *
 * Must be a Client Component — Next.js requirement for error.tsx.
 */

'use client'

import { useEffect } from 'react'
import { tokens }    from '@/tokens'

interface ErrorProps {
  error:  Error & { digest?: string }
  reset:  () => void
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log to your error monitoring service here (e.g. Sentry)
    console.error('[GiftHint] gifter page error:', error)
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
          Something went wrong
        </h1>
        <p
          className="text-sm leading-relaxed"
          style={{ color: tokens.colors.muted }}
        >
          We couldn&apos;t load this gift list right now. It might be a
          temporary hiccup — try refreshing.
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

      {/* Show error digest in development for quick debugging */}
      {process.env.NODE_ENV === 'development' && error.digest && (
        <p
          className="text-xs font-mono px-3 py-1.5 rounded-lg"
          style={{
            background: tokens.colors.surface2,
            color:      tokens.colors.muted,
            border:     `1px solid ${tokens.colors.border}`,
          }}
        >
          Error ID: {error.digest}
        </p>
      )}
    </div>
  )
}
