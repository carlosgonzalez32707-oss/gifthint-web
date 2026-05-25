/**
 * lib/rewards.ts — GiftHint referral rewards
 *
 * Maps referral milestones to premium feature unlocks and writes them to the DB.
 *
 * Tier ladder:
 *   0  referrals → 'free'   — no extras
 *   1  referral  → 'plus'   — custom username
 *   3  referrals → 'plus'   — + premium themes
 *   5  referrals → 'plus'   — + priority support badge
 *   10 referrals → 'pro'    — + Pro badge + verified checkmark
 *
 * Usage:
 *   import { checkAndApplyRewards } from '@/lib/rewards'
 *   await checkAndApplyRewards(userId)   // call after every successful signup event
 *
 * SERVER-SIDE ONLY — never import in a client component.
 */

import { createServerClient } from '@/lib/supabase-server'

// ── Types ─────────────────────────────────────────────────────────────────────

export type PremiumTier = 'free' | 'plus' | 'pro'

export interface RewardTier {
  /** Referral count required to unlock this tier */
  minReferrals: number
  /** Human-readable label shown in the UI */
  label:        string
  /** Short description shown in the rewards list */
  description:  string
  /** Emoji badge rendered in lists and on gifter pages */
  badge:        string
  /** DB column unlocked at this milestone (null = no single column, use premium_tier) */
  unlockColumn: 'custom_username_enabled' | 'premium_themes_enabled' | 'priority_support_enabled' | null
}

export interface UserRewardState {
  referralCount:            number
  premiumTier:              PremiumTier
  customUsernameEnabled:    boolean
  premiumThemesEnabled:     boolean
  prioritySupportEnabled:   boolean
}

// ── REWARD_TIERS constant ─────────────────────────────────────────────────────
// Ordered by minReferrals ascending. checkAndApplyRewards walks this list.

export const REWARD_TIERS: RewardTier[] = [
  {
    minReferrals:  1,
    label:         'Custom username',
    description:   'Use gifthint.io/list/yourname instead of a random ID',
    badge:         '✏️',
    unlockColumn:  'custom_username_enabled',
  },
  {
    minReferrals:  3,
    label:         'Premium themes',
    description:   'Unlock Dark Gold, Minimal White, and Pastel themes',
    badge:         '🎨',
    unlockColumn:  'premium_themes_enabled',
  },
  {
    minReferrals:  5,
    label:         'Priority support',
    description:   'Priority response SLA + support badge on your profile',
    badge:         '⚡',
    unlockColumn:  'priority_support_enabled',
  },
  {
    minReferrals:  10,
    label:         'Pro badge',
    description:   'Pro badge + verified checkmark on your gifter page',
    badge:         '⭐',
    unlockColumn:  null, // gated by premium_tier = 'pro'
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Pure function — computes the correct DB patch for a given referral count.
 * Exported so it can be unit-tested without a DB connection.
 */
export function computeRewardPatch(referralCount: number): {
  premium_tier:              PremiumTier
  custom_username_enabled:   boolean
  premium_themes_enabled:    boolean
  priority_support_enabled:  boolean
} {
  return {
    premium_tier:             referralCount >= 10 ? 'pro' : referralCount >= 1 ? 'plus' : 'free',
    custom_username_enabled:  referralCount >= 1,
    premium_themes_enabled:   referralCount >= 3,
    priority_support_enabled: referralCount >= 5,
  }
}

/**
 * Returns the next locked REWARD_TIER for a given referral count, or null if
 * the user has unlocked everything.
 */
export function nextLockedTier(referralCount: number): RewardTier | null {
  return REWARD_TIERS.find((t) => t.minReferrals > referralCount) ?? null
}

// ── checkAndApplyRewards ──────────────────────────────────────────────────────

/**
 * Reads the current referral_count for userId, computes the correct reward
 * patch, and writes it to the DB in a single UPDATE.
 *
 * Idempotent — safe to call multiple times; the DB values simply converge to
 * the correct state.
 *
 * @throws if the DB read or write fails (callers should handle gracefully).
 */
export async function checkAndApplyRewards(userId: string): Promise<UserRewardState> {
  const supabase = createServerClient()

  // Read current referral_count
  const { data: user, error: readError } = await supabase
    .from('users')
    .select('referral_count, premium_tier, custom_username_enabled, premium_themes_enabled, priority_support_enabled')
    .eq('id', userId)
    .single()

  if (readError || !user) {
    throw new Error(
      `[GiftHint/rewards] failed to read user ${userId}: ${readError?.message ?? 'not found'}`,
    )
  }

  const patch = computeRewardPatch(user.referral_count)

  // Only write if something actually changed to avoid unnecessary UPDATE round-trips
  const changed =
    patch.premium_tier              !== user.premium_tier              ||
    patch.custom_username_enabled   !== user.custom_username_enabled   ||
    patch.premium_themes_enabled    !== user.premium_themes_enabled    ||
    patch.priority_support_enabled  !== user.priority_support_enabled

  if (changed) {
    const { error: writeError } = await supabase
      .from('users')
      .update(patch)
      .eq('id', userId)

    if (writeError) {
      throw new Error(
        `[GiftHint/rewards] failed to update rewards for ${userId}: ${writeError.message}`,
      )
    }
  }

  return {
    referralCount:           user.referral_count,
    premiumTier:             patch.premium_tier,
    customUsernameEnabled:   patch.custom_username_enabled,
    premiumThemesEnabled:    patch.premium_themes_enabled,
    prioritySupportEnabled:  patch.priority_support_enabled,
  }
}
