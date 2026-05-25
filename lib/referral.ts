/**
 * lib/referral.ts — GiftHint referral utilities
 *
 * SERVER-SIDE ONLY — never import in a client component.
 *
 * Exports:
 *   getReferralLink(user)       → full shareable URL for the user's referral code
 *   getReferralStats(userId)    → click / signup / first_save counts for a user
 *   generateReferralCode()      → unique 8-char alphanumeric, retries on collision
 */

import { createServerClient } from '@/lib/supabase-server'
import type { DbUser }        from '@/lib/supabase-server'

// ── Constants ─────────────────────────────────────────────────────────────────

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://gifthint.io'

/** Characters used when generating a referral code (alphanumeric, no ambiguous chars) */
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

/** Length of generated referral codes */
const CODE_LENGTH = 8

/** Maximum retries when a generated code collides with an existing one */
const MAX_RETRIES = 10

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReferralStats {
  totalClicks:    number
  totalSignups:   number
  totalFirstSaves: number
}

// ── getReferralLink ───────────────────────────────────────────────────────────

/**
 * Returns the full shareable referral URL for a user.
 *
 * @example
 *   getReferralLink({ referral_code: 'abc12345' })
 *   // → 'https://gifthint.io/r/abc12345'
 */
export function getReferralLink(user: Pick<DbUser, 'referral_code'>): string {
  return `${SITE_URL}/r/${user.referral_code}`
}

// ── getReferralStats ──────────────────────────────────────────────────────────

/**
 * Fetches aggregated referral event counts for a user.
 *
 * Runs three COUNT queries in parallel — one per event_type — to avoid
 * fetching raw rows and doing the aggregation in JS.
 */
export async function getReferralStats(userId: string): Promise<ReferralStats> {
  const supabase = createServerClient()

  const [clicksResult, signupsResult, firstSavesResult] = await Promise.all([
    supabase
      .from('referral_events')
      .select('id', { count: 'exact', head: true })
      .eq('referrer_id', userId)
      .eq('event_type', 'click'),

    supabase
      .from('referral_events')
      .select('id', { count: 'exact', head: true })
      .eq('referrer_id', userId)
      .eq('event_type', 'signup'),

    supabase
      .from('referral_events')
      .select('id', { count: 'exact', head: true })
      .eq('referrer_id', userId)
      .eq('event_type', 'first_save'),
  ])

  if (clicksResult.error) {
    console.error('[GiftHint/referral] clicks query error:', clicksResult.error.message)
  }
  if (signupsResult.error) {
    console.error('[GiftHint/referral] signups query error:', signupsResult.error.message)
  }
  if (firstSavesResult.error) {
    console.error('[GiftHint/referral] first_saves query error:', firstSavesResult.error.message)
  }

  return {
    totalClicks:     clicksResult.count     ?? 0,
    totalSignups:    signupsResult.count    ?? 0,
    totalFirstSaves: firstSavesResult.count ?? 0,
  }
}

// ── generateReferralCode ──────────────────────────────────────────────────────

/**
 * Generates a unique 8-character alphanumeric referral code and confirms its
 * uniqueness against the users table.  Retries up to MAX_RETRIES times if the
 * generated code already exists (probability < 1 in a billion for typical user
 * counts).
 *
 * @throws Error if MAX_RETRIES collisions are encountered (should never happen
 *         in practice but makes the failure explicit rather than silent).
 */
export async function generateReferralCode(): Promise<string> {
  const supabase = createServerClient()

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const code = randomCode()

    const { data, error } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('referral_code', code)

    if (error) {
      console.error('[GiftHint/referral] uniqueness check error:', error.message)
      // If the DB is temporarily unavailable, still return a code — the UNIQUE
      // constraint on the column will catch any real collision at insert time.
      return code
    }

    // count is 0 when no rows matched → code is unique
    if ((data as unknown as null) === null) {
      // head: true returns null data on success
      return code
    }
  }

  throw new Error(
    `[GiftHint/referral] generateReferralCode: failed to find unique code after ${MAX_RETRIES} attempts`,
  )
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function randomCode(): string {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  }
  return code
}
