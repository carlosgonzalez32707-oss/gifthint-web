'use client'

/**
 * app/auth/callback/page.tsx — GiftHint
 *
 * Client-side PKCE callback page.
 */

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams }    from 'next/navigation'
import { getBrowserClient }              from '@/lib/supabase-browser'

// ── Inner component ────────────────────────────────────────────────────────────

function CallbackHandler() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const [status,   setStatus]   = useState<'exchanging' | 'error'>('exchanging')
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [debug,    setDebug]    = useState<string>('')

  useEffect(() => {
    const code    = searchParams.get('code')
    const nextRaw = searchParams.get('next') ?? '/dashboard'
    const next    = nextRaw.startsWith('/') ? nextRaw : '/dashboard'

    // ── Capture localStorage debug snapshot ──────────────────────────────────
    const lsKeys   = Object.keys(localStorage)
    const sbKeys   = lsKeys.filter(k => k.startsWith('sb-') || k.includes('verifier') || k.includes('supabase'))
    const verifier = sbKeys
      .filter(k => k.includes('verifier'))
      .map(k => `${k}=${localStorage.getItem(k)?.slice(0, 20)}…`)
      .join(' | ')

    const debugStr = [
      `code: ${code ? code.slice(0, 20) + '…' : 'MISSING'}`,
      `sb-keys: ${sbKeys.join(', ') || 'NONE'}`,
      `verifier: ${verifier || 'NOT FOUND'}`,
    ].join('\n')

    console.log('[auth/callback debug]\n' + debugStr)
    setDebug(debugStr)

    if (!code) {
      router.replace(next)
      return
    }

    const supabase = getBrowserClient()
    supabase.auth.exchangeCodeForSession(code).then(({ data, error }) => {
      if (error) {
        console.error('[auth/callback] exchangeCodeForSession failed:', error.message)
        setErrorMsg(error.message)
        setStatus('error')
        // Don't auto-redirect — keep debug info on screen
      } else {
        console.log('[auth/callback] session ok, user:', data.session?.user?.email)
        window.location.href = next
      }
    })
  }, [searchParams, router])

  if (status === 'error') {
    return (
      <div style={styles.center}>
        <p style={styles.msg}>Sign-in failed</p>
        <p style={{ ...styles.msg, color: '#f87171', fontSize: '13px', maxWidth: '500px', textAlign: 'center' }}>
          {errorMsg}
        </p>
        <pre style={{
          marginTop:   '24px',
          padding:     '16px',
          background:  '#1a1a2e',
          borderRadius: '8px',
          fontSize:    '11px',
          color:       '#94a3b8',
          maxWidth:    '500px',
          width:       '100%',
          whiteSpace:  'pre-wrap',
          wordBreak:   'break-all',
          textAlign:   'left',
        }}>
          {debug}
        </pre>
        <p style={{ ...styles.msg, fontSize: '12px', marginTop: '8px' }}>
          📸 Screenshot this page and share it
        </p>
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
    padding:        '24px',
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
