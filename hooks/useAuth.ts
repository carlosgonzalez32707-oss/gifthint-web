/**
 * hooks/useAuth.ts — GiftHint
 *
 * Subscribes to the Supabase auth state and re-renders any consumer
 * whenever the user signs in or out.
 *
 * Returns:
 *   user     — the logged-in Supabase User, or null when signed out
 *   loading  — true during the initial session check (avoids flash)
 *   signIn() — triggers Google OAuth redirect flow
 *   signOut()— clears the session
 *
 * Usage:
 *   const { user, loading, signIn, signOut } = useAuth()
 */

'use client'

import { useEffect, useState, useCallback } from 'react'
import type { User }                         from '@supabase/supabase-js'
import { getBrowserClient }                  from '@/lib/supabase-browser'

// ── Types ──────────────────────────────────────────────────────────────────────

interface UseAuthReturn {
  user:    User | null
  loading: boolean
  signIn:  () => Promise<void>
  signOut: () => Promise<void>
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useAuth(): UseAuthReturn {
  const supabase = getBrowserClient()

  const [user,    setUser]    = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 1. Eagerly read the cached session (synchronous path, no network)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // 2. Subscribe to future auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [supabase.auth])

  const signIn = useCallback(async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
      },
    })
  }, [supabase.auth])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [supabase.auth])

  return { user, loading, signIn, signOut }
}
