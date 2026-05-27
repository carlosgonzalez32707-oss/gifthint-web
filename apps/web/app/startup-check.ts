/**
 * app/startup-check.ts — GiftHint
 *
 * Environment variable validation on server startup.
 *
 * WHAT IT DOES
 * ────────────
 * Throws a clear, descriptive Error in development if any required env var
 * is absent. In production (NODE_ENV=production) it logs a structured warning
 * for each missing var and throws only if vars that are absolutely required
 * for the app to function are missing.
 *
 * HOW TO USE
 * ──────────
 * Call validateEnv() from your Next.js root layout (app/layout.tsx) or from
 * a Server Component that is guaranteed to run on every server-side request.
 * It executes only once per serverless warm instance.
 *
 *   // app/layout.tsx
 *   import { validateEnv } from '@/app/startup-check'
 *   validateEnv()
 *
 * Because this module is imported at the top level, Next.js will evaluate it
 * at build time AND at serverless cold-start — the earliest possible moment
 * to surface misconfiguration.
 *
 * SEVERITY LEVELS
 * ───────────────
 * required  — App cannot start. Missing value throws Error in all environments.
 * optional  — Feature degrades gracefully. Logs a warning in development only.
 *
 * GROUPED BY SUBSYSTEM
 * ─────────────────────
 * 1. Supabase               — core database, required everywhere
 * 2. Stripe (group-gift)    — group-gift payment flow
 * 3. Stripe (billing)       — Pro subscription checkout
 * 4. Email (Resend)         — transactional email
 * 5. Google OAuth           — extension sign-in
 * 6. Redis / Rate Limiting  — Upstash rate limiting
 * 7. Affiliate              — Amazon Associates + Skimlinks
 * 8. Admin                  — admin dashboard access
 * 9. Cron                   — scheduled job authentication
 *
 * ADDED IN
 * ────────
 * Phase 1: Supabase, basic Stripe, email, Google OAuth
 * Phase 2: Upstash Redis, Skimlinks, affiliate vars
 * Phase 3: Stripe billing (Pro subscription), CRON_SECRET, admin vars
 */

// ── Var specification ──────────────────────────────────────────────────────────

interface EnvSpec {
  /** Environment variable name. */
  name: string
  /** Human-readable description shown in error / warning output. */
  description: string
  /**
   * 'required' — missing value throws in ALL environments.
   * 'optional' — missing value logs a warning in development only; app continues.
   */
  severity: 'required' | 'optional'
  /** Which subsystem / phase introduced this variable. */
  group: string
}

const ENV_SPECS: EnvSpec[] = [
  // ── 1. Supabase (Phase 1) — absolutely required ─────────────────────────────
  {
    name:        'SUPABASE_URL',
    description: 'Supabase project URL (server-side). Find in: Supabase → Settings → API.',
    severity:    'required',
    group:       'Supabase',
  },
  {
    name:        'SUPABASE_SERVICE_ROLE_KEY',
    description: 'Supabase service role key (bypasses RLS). Keep server-side only.',
    severity:    'required',
    group:       'Supabase',
  },
  {
    name:        'NEXT_PUBLIC_SUPABASE_URL',
    description: 'Supabase project URL (browser-safe). Must match SUPABASE_URL.',
    severity:    'required',
    group:       'Supabase',
  },
  {
    name:        'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    description: 'Supabase anon key (browser-safe). Use the anon/public key, NOT service role.',
    severity:    'required',
    group:       'Supabase',
  },

  // ── 2. Stripe — group-gift payment (Phase 1) ─────────────────────────────────
  {
    name:        'STRIPE_SECRET_KEY',
    description: 'Stripe secret key for group-gift PaymentIntent creation.',
    severity:    'required',
    group:       'Stripe (group-gift)',
  },
  {
    name:        'STRIPE_WEBHOOK_SECRET',
    description: 'Stripe webhook signing secret for /api/group-gift/webhook.',
    severity:    'required',
    group:       'Stripe (group-gift)',
  },
  {
    name:        'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
    description: 'Stripe publishable key (browser-safe). Used by Stripe Elements.',
    severity:    'required',
    group:       'Stripe (group-gift)',
  },

  // ── 3. Stripe — Pro subscription billing (Phase 3) ───────────────────────────
  {
    name:        'STRIPE_PRO_MONTHLY_PRICE_ID',
    description: 'Stripe Price ID for the Pro monthly plan (price_xxx). Create in Stripe Dashboard.',
    severity:    'required',
    group:       'Stripe (billing)',
  },
  {
    name:        'STRIPE_PRO_ANNUAL_PRICE_ID',
    description: 'Stripe Price ID for the Pro annual plan (price_xxx). Create in Stripe Dashboard.',
    severity:    'required',
    group:       'Stripe (billing)',
  },
  {
    name:        'STRIPE_BILLING_WEBHOOK_SECRET',
    description: 'Webhook signing secret for /api/billing/webhook (separate from group-gift webhook).',
    severity:    'required',
    group:       'Stripe (billing)',
  },
  {
    name:        'NEXT_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID',
    description: 'Browser-safe copy of STRIPE_PRO_MONTHLY_PRICE_ID for the upgrade page toggle.',
    severity:    'required',
    group:       'Stripe (billing)',
  },
  {
    name:        'NEXT_PUBLIC_STRIPE_PRO_ANNUAL_PRICE_ID',
    description: 'Browser-safe copy of STRIPE_PRO_ANNUAL_PRICE_ID for the upgrade page toggle.',
    severity:    'required',
    group:       'Stripe (billing)',
  },

  // ── 4. Email — Resend (Phase 1) ──────────────────────────────────────────────
  {
    name:        'RESEND_API_KEY',
    description: 'Resend transactional email API key (re_xxx). Set RESEND_TEST_MODE=true for local dev.',
    severity:    'required',
    group:       'Email (Resend)',
  },

  // ── 5. Google OAuth — extension sign-in (Phase 1) ────────────────────────────
  {
    name:        'GOOGLE_CLIENT_ID',
    description: 'Google OAuth client ID. Used by /api/auth/exchange for the browser extension.',
    severity:    'required',
    group:       'Google OAuth',
  },
  {
    name:        'GOOGLE_CLIENT_SECRET',
    description: 'Google OAuth client secret (server-side only — never expose to the extension).',
    severity:    'required',
    group:       'Google OAuth',
  },

  // ── 6. Upstash Redis — rate limiting (Phase 2) ───────────────────────────────
  {
    name:        'UPSTASH_REDIS_REST_URL',
    description: 'Upstash Redis REST URL. Required for rate limiting and IP blocklist. App fails open if absent.',
    severity:    'optional',
    group:       'Redis (rate limiting)',
  },
  {
    name:        'UPSTASH_REDIS_REST_TOKEN',
    description: 'Upstash Redis REST token. Required for rate limiting. App fails open if absent.',
    severity:    'optional',
    group:       'Redis (rate limiting)',
  },

  // ── 7. Affiliate (Phase 2) ───────────────────────────────────────────────────
  {
    name:        'AMAZON_ASSOCIATES_TAG',
    description: 'Amazon Associates tracking tag (e.g. gifthint-20). Affiliate links work without it but earn no commission.',
    severity:    'optional',
    group:       'Affiliate',
  },
  {
    name:        'AMAZON_ACCESS_KEY',
    description: 'Amazon Product Advertising API access key. Required for live price checks via PA API.',
    severity:    'optional',
    group:       'Affiliate',
  },
  {
    name:        'AMAZON_SECRET_KEY',
    description: 'Amazon PA API secret key. Required for price checks.',
    severity:    'optional',
    group:       'Affiliate',
  },
  {
    name:        'SKIMLINKS_PUBLISHER_ID',
    description: 'Skimlinks publisher ID. Required for Skimlinks commission attribution.',
    severity:    'optional',
    group:       'Affiliate',
  },
  {
    name:        'SKIMLINKS_API_KEY',
    description: 'Skimlinks API key. Required for commission report API calls.',
    severity:    'optional',
    group:       'Affiliate',
  },

  // ── 8. Admin (Phase 3) ───────────────────────────────────────────────────────
  {
    name:        'ADMIN_SECRET',
    description: 'Protects the /admin dashboard route. Generate with: node -e "require(\'crypto\').randomBytes(32).toString(\'hex\')"',
    severity:    'required',
    group:       'Admin',
  },
  {
    name:        'ADMIN_REFUND_SECRET',
    description: 'Protects POST /api/group-gift/refund in admin mode. Must differ from ADMIN_SECRET.',
    severity:    'required',
    group:       'Admin',
  },

  // ── 9. Cron authentication (Phase 3) ─────────────────────────────────────────
  {
    name:        'CRON_SECRET',
    description: 'Bearer token that Vercel Cron sends to /api/cron/* endpoints. Must be set in Vercel environment variables.',
    severity:    'required',
    group:       'Cron',
  },

  // ── 10. App public URL (Phase 1) ─────────────────────────────────────────────
  {
    name:        'NEXT_PUBLIC_APP_URL',
    description: 'Canonical base URL for OG tags and email links. E.g. https://gifthint.io (no trailing slash).',
    severity:    'required',
    group:       'App',
  },
]

// ── Validation logic ───────────────────────────────────────────────────────────

let _validated = false

/**
 * Validates that all required environment variables are set.
 *
 * - In development (NODE_ENV=development): throws immediately on the first
 *   missing REQUIRED var, and logs a warning for each missing OPTIONAL var.
 * - In production (NODE_ENV=production): logs errors for missing required vars
 *   and still throws if any REQUIRED vars are absent (app cannot function).
 *
 * Safe to call multiple times — runs validation only once per warm instance.
 *
 * @throws {Error} If any required environment variable is missing.
 */
export function validateEnv(): void {
  if (_validated) return
  _validated = true

  const isDev   = process.env.NODE_ENV !== 'production'
  const missing: EnvSpec[] = []
  const optional: EnvSpec[] = []

  for (const spec of ENV_SPECS) {
    const value = process.env[spec.name]
    const absent = !value || value.trim() === ''

    if (!absent) continue

    if (spec.severity === 'required') {
      missing.push(spec)
    } else {
      optional.push(spec)
    }
  }

  // Log optional warnings in development only (avoid log noise in prod)
  if (isDev && optional.length > 0) {
    console.warn(
      `[startup-check] ${optional.length} optional env var(s) not set — affected features will be degraded:`,
    )
    for (const spec of optional) {
      console.warn(`  [${spec.group}] ${spec.name}: ${spec.description}`)
    }
  }

  // Required vars missing — always fatal
  if (missing.length > 0) {
    const lines = [
      '',
      '╔═══════════════════════════════════════════════════════════════╗',
      '║  GiftHint — Missing required environment variables            ║',
      '╚═══════════════════════════════════════════════════════════════╝',
      '',
      `${missing.length} required variable(s) are not set:`,
      '',
      ...missing.flatMap((spec) => [
        `  ✗  ${spec.name}  [${spec.group}]`,
        `     ${spec.description}`,
        '',
      ]),
      'Copy .env.local.example → .env.local and fill in the missing values.',
      'See README.md → Environment Variables for setup instructions.',
      '',
    ]

    const message = lines.join('\n')
    console.error(message)
    throw new Error(
      `[startup-check] ${missing.length} required environment variable(s) missing. ` +
      `See server logs for details.`,
    )
  }
}

/**
 * Returns a summary of all env vars and their current status.
 * Useful for health-check endpoints or admin diagnostics.
 * Never include actual values — only presence/absence.
 */
export interface EnvVarStatus {
  name:     string
  group:    string
  severity: 'required' | 'optional'
  present:  boolean
}

export function getEnvStatus(): EnvVarStatus[] {
  return ENV_SPECS.map((spec) => ({
    name:     spec.name,
    group:    spec.group,
    severity: spec.severity,
    present:  Boolean(process.env[spec.name]?.trim()),
  }))
}
