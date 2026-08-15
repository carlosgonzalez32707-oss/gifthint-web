'use client'

/**
 * app/signin/page.tsx — GiftHint
 *
 * Sign-in page with two paths:
 *   1. Continue with Google (OAuth)
 *   2. Email magic link (Supabase OTP)
 *
 * Views driven by `view` state:
 *   'chooser' — default; both options visible
 *   'sent'    — magic link sent; confirmation screen
 *
 * After Google auth, Supabase redirects to /auth/callback?next=/dashboard.
 * Magic link email also redirects to /auth/callback?next=/dashboard on click.
 */

import { useState, useCallback } from 'react'
import { getBrowserClient } from '@/lib/supabase-browser'

type View = 'chooser' | 'sent'

export default function SignInPage() {
  const [view,          setView]          = useState<View>('chooser')
  const [email,         setEmail]         = useState('')
  const [googleLoading, setGoogleLoading] = useState(false)
  const [magicLoading,  setMagicLoading]  = useState(false)
  const [googleError,   setGoogleError]   = useState<string | null>(null)
  const [magicError,    setMagicError]    = useState<string | null>(null)

  // ── Google OAuth ────────────────────────────────────────────────────────────

  const handleGoogle = useCallback(async () => {
    setGoogleLoading(true)
    setGoogleError(null)
    try {
      const supabase = getBrowserClient()
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
        },
      })
      if (error) setGoogleError(error.message)
    } catch (err) {
      setGoogleError(err instanceof Error ? err.message : 'Sign-in failed')
    } finally {
      setGoogleLoading(false)
    }
  }, [])

  // ── Magic link ──────────────────────────────────────────────────────────────

  const handleMagicLink = useCallback(async () => {
    const trimmed = email.trim()
    if (!trimmed || !trimmed.includes('@')) {
      setMagicError('Please enter a valid email address.')
      return
    }
    setMagicLoading(true)
    setMagicError(null)
    try {
      const supabase = getBrowserClient()
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
        },
      })
      if (error) {
        setMagicError(error.message)
      } else {
        setView('sent')
      }
    } catch (err) {
      setMagicError(err instanceof Error ? err.message : 'Failed to send link')
    } finally {
      setMagicLoading(false)
    }
  }, [email])

  // ── Shared styles ───────────────────────────────────────────────────────────

  const page: React.CSSProperties = {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    minHeight:      '100vh',
    background:     '#0C0C0E',
    fontFamily:     "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    padding:        '24px',
  }

  const card: React.CSSProperties = {
    width:        '100%',
    maxWidth:     '360px',
    background:   '#141418',
    border:       '1px solid rgba(240,238,232,0.08)',
    borderRadius: '20px',
    padding:      '36px 32px',
  }

  // ── Sent confirmation ───────────────────────────────────────────────────────

  if (view === 'sent') {
    return (
      <div style={page}>
        <div style={{ ...card, textAlign: 'center' }}>
          <div style={{ fontSize: '40px', marginBottom: '18px' }}>📬</div>
          <h1
            style={{
              margin:        '0 0 10px',
              fontSize:      '20px',
              fontWeight:    800,
              color:         '#F0EEE8',
              letterSpacing: '-0.03em',
            }}
          >
            Check your inbox
          </h1>
          <p style={{ margin: '0 0 20px', fontSize: '14px', color: 'rgba(240,238,232,0.55)', lineHeight: 1.6 }}>
            We sent a sign-in link to <strong style={{ color: '#F0EEE8' }}>{email.trim()}</strong>.
            Click it to continue — no password needed.
          </p>
          <button
            onClick={() => { setView('chooser'); setMagicError(null) }}
            style={{
              background:   'transparent',
              border:       'none',
              color:        'rgba(240,238,232,0.4)',
              fontSize:     '13px',
              cursor:       'pointer',
              textDecoration: 'underline',
              padding:      0,
            }}
          >
            Use a different email
          </button>
        </div>
      </div>
    )
  }

  // ── Chooser ─────────────────────────────────────────────────────────────────

  return (
    <div style={page}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        .gh-signin-input:focus { border-color: #8B83F0 !important; outline: none; }
        .gh-google-btn:hover:not(:disabled) { background: #f5f5f5 !important; }
        .gh-magic-btn:hover:not(:disabled)  { opacity: 0.88 !important; }
      `}</style>

      <div style={card}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <span style={{ fontSize: '32px' }}>🎁</span>
          <p style={{ margin: '8px 0 0', fontSize: '13px', color: 'rgba(240,238,232,0.4)', letterSpacing: '0.05em' }}>
            GIFTHINT
          </p>
        </div>

        <h1
          style={{
            margin:        '0 0 24px',
            fontSize:      '19px',
            fontWeight:    800,
            color:         '#F0EEE8',
            letterSpacing: '-0.02em',
            textAlign:     'center',
          }}
        >
          Sign in to your account
        </h1>

        {/* Google button */}
        <button
          className="gh-google-btn"
          onClick={handleGoogle}
          disabled={googleLoading || magicLoading}
          style={{
            width:        '100%',
            height:       '46px',
            display:      'flex',
            alignItems:   'center',
            justifyContent: 'center',
            gap:          '10px',
            background:   '#fff',
            color:        '#18181C',
            border:       'none',
            borderRadius: '12px',
            fontSize:     '15px',
            fontWeight:   600,
            cursor:       googleLoading ? 'not-allowed' : 'pointer',
            opacity:      googleLoading ? 0.7 : 1,
            transition:   'background 150ms ease, opacity 150ms ease',
            fontFamily:   'inherit',
          }}
        >
          {googleLoading ? (
            <span style={{
              width:        '18px',
              height:       '18px',
              borderRadius: '50%',
              border:       '2px solid rgba(0,0,0,0.15)',
              borderTop:    '2px solid #18181C',
              display:      'inline-block',
              animation:    'spin 0.7s linear infinite',
              flexShrink:   0,
            }} />
          ) : (
            /* Google "G" icon */
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" style={{ flexShrink: 0 }}>
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
              <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
          )}
          {googleLoading ? 'Redirecting…' : 'Continue with Google'}
        </button>

        {googleError && (
          <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#FB7185', textAlign: 'center' }}>
            {googleError}
          </p>
        )}

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '20px 0' }}>
          <div style={{ flex: 1, height: '1px', background: 'rgba(240,238,232,0.1)' }} />
          <span style={{ fontSize: '12px', color: 'rgba(240,238,232,0.3)', flexShrink: 0 }}>or</span>
          <div style={{ flex: 1, height: '1px', background: 'rgba(240,238,232,0.1)' }} />
        </div>

        {/* Email input */}
        <input
          className="gh-signin-input"
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setMagicError(null) }}
          onKeyDown={(e) => { if (e.key === 'Enter') handleMagicLink() }}
          placeholder="you@example.com"
          disabled={magicLoading}
          style={{
            width:        '100%',
            boxSizing:    'border-box',
            background:   '#1A1A1F',
            border:       `1px solid ${magicError ? 'rgba(251,113,133,0.5)' : 'rgba(240,238,232,0.12)'}`,
            borderRadius: '10px',
            padding:      '12px 14px',
            color:        '#F0EEE8',
            fontSize:     '15px',
            fontFamily:   'inherit',
            opacity:      magicLoading ? 0.6 : 1,
            marginBottom: '10px',
          }}
        />

        {/* Magic link button */}
        <button
          className="gh-magic-btn"
          onClick={handleMagicLink}
          disabled={magicLoading || !email.trim()}
          style={{
            width:        '100%',
            height:       '46px',
            background:   '#8B83F0',
            color:        '#fff',
            border:       'none',
            borderRadius: '12px',
            fontSize:     '15px',
            fontWeight:   700,
            cursor:       magicLoading || !email.trim() ? 'not-allowed' : 'pointer',
            opacity:      magicLoading || !email.trim() ? 0.5 : 1,
            transition:   'opacity 150ms ease',
            fontFamily:   'inherit',
            display:      'flex',
            alignItems:   'center',
            justifyContent: 'center',
            gap:          '8px',
          }}
        >
          {magicLoading && (
            <span style={{
              width:        '16px',
              height:       '16px',
              borderRadius: '50%',
              border:       '2px solid rgba(255,255,255,0.25)',
              borderTop:    '2px solid #fff',
              display:      'inline-block',
              animation:    'spin 0.7s linear infinite',
              flexShrink:   0,
            }} />
          )}
          {magicLoading ? 'Sending…' : 'Send magic link'}
        </button>

        {magicError && (
          <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#FB7185', textAlign: 'center' }}>
            {magicError}
          </p>
        )}

        {/* Footer */}
        <p style={{ margin: '24px 0 0', fontSize: '12px', color: 'rgba(240,238,232,0.25)', textAlign: 'center', lineHeight: 1.5 }}>
          By continuing, you agree to GiftHint's{' '}
          <a href="/terms" style={{ color: 'rgba(240,238,232,0.4)', textDecoration: 'underline' }}>Terms</a>
          {' '}and{' '}
          <a href="/privacy" style={{ color: 'rgba(240,238,232,0.4)', textDecoration: 'underline' }}>Privacy Policy</a>.
        </p>
      </div>
    </div>
  )
}
