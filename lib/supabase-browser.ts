/**
 * lib/supabase-browser.ts — GiftHint
 *
 * Browser-side Supabase client singleton.
 * Uses the public ANON key so it respects Row Level Security.
 *
 * All mutations that need owner-level access must send the user's JWT
 * in the Authorization header (handled by calling supabase.auth.getSession()
 * before each fetch, or by using this client directly — supabase-js attaches
 * the session token automatically when the user is logged in).
 *
 * Usage:
 *   import { getBrowserClient } from '@/lib/supabase-browser'
 *   const supabase = getBrowserClient()
 *   const { data: { user } } = await supabase.auth.getUser()
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ── Singleton ──────────────────────────────────────────────────────────────────

let client: SupabaseClient | null = null

export function getBrowserClient(): SupabaseClient {
  if (client) return client

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Add them to .env.local and restart the dev server.'
    )
  }

  client = createClient(url, key, {
    auth: {
      // Persist session in localStorage so the user stays logged in across tabs
      persistSession: true,
      autoRefreshToken: true,
    },
  })

  return client
}
