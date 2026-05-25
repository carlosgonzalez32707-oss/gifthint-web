'use client'

/**
 * app/signin/page.tsx — GiftHint
 *
 * Thin sign-in page — immediately triggers Google OAuth and shows a
 * spinner. Used by nav "Sign in" links on server-rendered pages where
 * we can't call signInWithOAuth() directly.
 *
 * After Google auth, Supabase redirects to /auth/callback?next=/dashboard
 * which exchanges the PKCE code and forwards the user on.
 */

import { useEffect } from 'react'
import { getBrowserClient } from '@/lib/supabase-browser'

export default function SignInPage() {
  useEffect(() => {
    const supabase = getBrowserClient()
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
      },
    })
  }, [])

  return (
    <div style={{
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      justifyContent: 'center',
      minHeight:      '100vh',
      gap:            '16px',
      background:     '#0C0C0E',
      color:          '#F0EEE8',
      fontFamily:     "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{
        width:        '32px',
        height:       '32px',
        borderRadius: '50%',
        border:       '3px solid rgba(139,131,240,0.2)',
        borderTop:    '3px solid #8B83F0',
        animation:    'spin 0.8s linear infinite',
      }} />
      <p style={{ margin: 0, fontSize: '15px', color: 'rgba(240,238,232,0.6)' }}>
        Redirecting to Google…
      </p>
    </div>
  )
}
