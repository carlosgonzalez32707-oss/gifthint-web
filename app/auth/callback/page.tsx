'use client'

/**
 * app/auth/callback/page.tsx — GiftHint
 *
 * Client-side PKCE callback page.
 *
 * Supabase 2.x uses PKCE by default. After Google OAuth the browser lands here
 * with ?code=<pkce_code>&next=<destination>. We use the browser Supabase client
 * to exchange the code for a session (stored in localStorage), then redirect.
 *
 * Must be a Client Component — exchangeCodeForSession writes to localStorage
 * and cannot run in a server context with plain @supabase/supabase-js.
 */

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams }    from 'next/navigation'
import { getBrowserClient }              from '@/lib/supabase-browser'

// ── Inner component (reads searchParams — must be inside Suspense) ─────────────

function CallbackHandler() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'exchanging' | 'error'>('exchanging')

  useEffect(() => {
    const code    = searchParams.get('code')
    const nextRaw = searchParams.get('next') ?? '/dashboard'
    // Validate next to prevent open-redirect
    const next    = nextRaw.startsWith('/') ? nextRaw : '/dashboard'

    if (!code) {
      // No code in URL — might be an implicit-flow token already in the hash,
      // or the user navigated here directly. Just forward them on.
      router.replace(next)
      return
    }

    const supabase = getBrowserClient()
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) {
        console.error('[auth/callback] exchangeCodeForSession failed:', error.message)
        setStatus('error')
        setTimeout(() => router.replace('/?auth_error=callback_failed'), 2000)
      } else {
        router.replace(next)
      }
    })
  }, [searchParams, router])

  if (status === 'error') {
    return (
      <div style={styles.center}>
        <p style={styles.msg}>Sign-in failed — redirecting you home…</p>
      </div>
    )
  }

  return (
    <div style={styles.center}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={styles.spinner} />
      <p style={styles.msg}>Signing you in…</p>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div style={styles.center}>
        <div style={styles.spinner} />
        <p style={styles.msg}>Loading…</p>
      </div>
    }>
      <CallbackHandler />
    </Suspense>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = {
  center: {
    display:        'flex' as const,
    flexDirection:  'column' as const,
    alignItems:     'center' as const,
    justifyContent: 'center' as const,
    minHeight:      '100vh',
    gap:            '16px',
    background:     '#0C0C0E',
    color:          '#F0EEE8',
    fontFamily:     "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  spinner: {
    width:       '32px',
    height:      '32px',
    borderRadius:'50%',
    border:      '3px solid rgba(139,131,240,0.2)',
    borderTop:   '3px solid #8B83F0',
    animation:   'spin 0.8s linear infinite',
  },
  msg: {
    margin:   0,
    fontSize: '15px',
    color:    'rgba(240,238,232,0.6)',
  },
} as const
