'use client'

import { useEffect, useState } from 'react'
import { getBrowserClient } from '@/lib/supabase-browser'

export function LandingNavAuth() {
  const [signedIn, setSignedIn] = useState(false)

  useEffect(() => {
    getBrowserClient()
      .auth.getSession()
      .then(({ data }) => setSignedIn(!!data.session))
  }, [])

  const style: React.CSSProperties = {
    fontSize: 13.5,
    fontWeight: 500,
    color: '#6B7280',
    padding: '6px 12px',
  }

  if (signedIn) {
    return (
      <a href="/dashboard" style={style}>
        Dashboard
      </a>
    )
  }

  return (
    <a href="/signin" className="nav-link" style={style}>
      Sign in
    </a>
  )
}
