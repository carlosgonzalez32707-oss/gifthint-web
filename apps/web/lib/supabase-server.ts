/**
 * lib/supabase-server.ts — GiftHint
 *
 * Creates a Supabase client for use in Server Components and Route Handlers.
 * Uses the SERVICE ROLE key so it bypasses Row Level Security — safe only
 * because it never runs in the browser (tree-shaken out of client bundles).
 *
 * For browser/client components use NEXT_PUBLIC_SUPABASE_ANON_KEY instead.
 *
 * ── Connection strategy (Vercel + Supabase at 10 k+ users) ──────────────────
 *
 * @supabase/supabase-js communicates with Supabase over HTTP (PostgREST).
 * PostgREST maintains its own internal Postgres connection pool, so each
 * HTTP request does NOT open a new Postgres connection — the pool is managed
 * server-side by Supabase.
 *
 * However, long-running queries in a serverless context (Vercel Functions)
 * will pin a PostgREST worker for the full duration. To prevent a single
 * slow query from starving other requests we wrap every fetch in a hard
 * 10-second AbortSignal timeout (SUPABASE_TIMEOUT_MS overrides).
 *
 * ── Supabase connection pooler (direct Postgres) ─────────────────────────────
 *
 * If you later add direct Postgres access via pg / Prisma / Drizzle, connect
 * through Supabase's PgBouncer Transaction-mode pooler instead of the direct
 * port 5432 endpoint:
 *
 *   Direct (dev only):  postgresql://postgres.xxxx:5432/postgres
 *   Pooler (production): postgresql://postgres.xxxx:6543/postgres?pgbouncer=true
 *
 * Set DATABASE_URL in .env.local (and Vercel env) to the pooler URL.
 * The `pgbouncer=true` parameter tells Prisma / pg to disable prepared
 * statements, which are incompatible with Transaction-mode pooling.
 *
 * ── Environment variables ────────────────────────────────────────────────────
 *
 *   SUPABASE_URL                — PostgREST API base URL (always required)
 *   SUPABASE_SERVICE_ROLE_KEY   — service role JWT (always required)
 *   SUPABASE_TIMEOUT_MS         — per-request hard timeout in ms (default 10000)
 *   DATABASE_URL                — Postgres pooler URL (required for direct pg)
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
  id:                   string
  google_id:            string
  email:                string | null
  display_name:         string | null
  avatar_url:           string | null
  public_username:      string | null
  created_at:           string
  /** Whether the user has opted into price drop alert emails (default true) */
  price_alerts_enabled: boolean
  /** Token embedded in unsubscribe links; rotated after each use */
  unsubscribe_token:    string | null
  /** Unique 8-char alphanumeric code used in /r/[code] referral links */
  referral_code:        string
  /** UUID of the user who referred this account (null if organic signup) */
  referred_by:          string | null
  /** Total number of users who signed up via this user's referral link */
  referral_count:       number
  /** Reward tier: 'free' | 'plus' | 'pro' — computed by lib/rewards.ts */
  premium_tier:               'free' | 'plus' | 'pro'
  /** Unlocked at 1 referral — allows setting a custom public_username */
  custom_username_enabled:    boolean
  /** Unlocked at 3 referrals — access to Dark Gold / Minimal White / Pastel themes */
  premium_themes_enabled:     boolean
  /** Unlocked at 5 referrals — priority support badge + response SLA */
  priority_support_enabled:   boolean
}

export type DbWishlistItem = {
  id:               string
  user_id:          string
  wishlist_id?:     string | null
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
  is_group_gift?:      boolean
  group_gift_target?:  number | null
  is_claimed:          boolean
  claimed_by:          string | null
  claimed_at:          string | null
  claimed_anonymous:   boolean
  sort_order:          number
  created_at:          string
}

export type DbWishlist = {
  id:            string
  user_id:       string
  title:         string
  occasion:      string
  occasion_date: string | null
  slug:          string
  is_default:    boolean
  is_public:     boolean
  created_at:    string
  /** Premium theme key. Defaults to 'default'. See lib/themes.ts. */
  theme:         string
}

// ── Connection timeout ─────────────────────────────────────────────────────────

/**
 * Returns a fetch wrapper that aborts any request that takes longer than
 * timeoutMs milliseconds. Prevents slow queries from holding Vercel function
 * invocations open for their full 30-second limit.
 *
 * AbortSignal.timeout() is available in Node.js 17.3+ (Next.js 13+).
 */
function makeFetchWithTimeout(timeoutMs: number): typeof globalThis.fetch {
  return (input, init) =>
    fetch(input, {
      ...init,
      // AbortSignal.timeout creates a signal that fires after timeoutMs.
      // It does not cancel in-flight Postgres queries server-side — for that
      // set statement_timeout in your Supabase project settings (recommended:
      // 8000 ms to give the 10 s fetch timeout a 2 s margin to propagate).
      signal: AbortSignal.timeout(timeoutMs),
    })
}

// ── Client factory ─────────────────────────────────────────────────────────────

/**
 * Returns a new Supabase client authenticated with the service role key.
 * Call this once per request — do NOT cache across requests to avoid
 * leaking auth context between concurrent server renders.
 *
 * Every outbound fetch is wrapped in a hard AbortSignal timeout
 * (default 10 s, overridable via SUPABASE_TIMEOUT_MS) so runaway queries
 * cannot hold Vercel serverless functions open past their time limit.
 */
export function createServerClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      '[GiftHint] Missing required env vars: SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Copy .env.local.example to .env.local and fill in your Supabase project credentials.\n' +
      'For the connection pooler, also set DATABASE_URL to your PgBouncer URL (port 6543).',
    )
  }

  // Allow the timeout to be tuned per environment without a code change.
  // Staging might want a longer timeout for slow seed queries; production
  // should stay at ≤10 s to respect Vercel's function limit.
  const timeoutMs = Number(process.env.SUPABASE_TIMEOUT_MS ?? 10_000)

  return createClient(url, key, {
    auth: {
      // Disable client-side session management — this client is server-only.
      autoRefreshToken:   false,
      persistSession:     false,
      detectSessionInUrl: false,
    },

    db: {
      // Explicit schema declaration surfaces type errors earlier if a query
      // targets the wrong schema and makes the intent clear to readers.
      schema: 'public',
    },

    global: {
      // Hard per-request timeout — prevents slow queries from keeping Vercel
      // serverless functions alive for their full 30-second limit.
      fetch: makeFetchWithTimeout(timeoutMs),
    },
  })
}
