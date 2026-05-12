/**
 * lib/supabase-server.ts — GiftHint
 *
 * Creates a Supabase client for use in Server Components and Route Handlers.
 * Uses the SERVICE ROLE key so it bypasses Row Level Security — safe only
 * because it never runs in the browser (tree-shaken out of client bundles).
 *
 * For browser/client components use NEXT_PUBLIC_SUPABASE_ANON_KEY instead.
 *
 * Usage:
 *   import { createServerClient } from '@/lib/supabase-server'
 *   const supabase = createServerClient()
 *   const { data } = await supabase.from('users').select('*')
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ── Types ──────────────────────────────────────────────────────────────────────
// Lightweight DB shape — extend with generated types (supabase gen types) later.

export type DbUser = {
  id:              string
  google_id:       string
  email:           string | null
  display_name:    string | null
  avatar_url:      string | null
  public_username: string | null
  created_at:      string
}

export type DbWishlistItem = {
  id:               string
  user_id:          string
  title:            string
  price:            number | null
  currency:         string
  image_url:        string | null
  source_url:       string
  original_url:     string | null
  affiliate_url:    string | null
  retailer:         string | null
  hint:             string | null
  dna_tags:         string[]
  is_claimed:       boolean
  claimed_by:       string | null
  claimed_at:       string | null
  claimed_anonymous: boolean
  sort_order:       number
  created_at:       string
}

// ── Client factory ─────────────────────────────────────────────────────────────

/**
 * Returns a new Supabase client authenticated with the service role key.
 * Call this once per request — do NOT cache across requests to avoid
 * leaking auth context between concurrent server renders.
 */
export function createServerClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      '[GiftHint] Missing required env vars: SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Copy .env.local.example to .env.local and fill in your Supabase project credentials.',
    )
  }

  return createClient(url, key, {
    auth: {
      // Disable client-side session management — this client is server-only
      autoRefreshToken: false,
      persistSession:   false,
      detectSessionInUrl: false,
    },
  })
}
