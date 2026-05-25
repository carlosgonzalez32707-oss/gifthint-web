/**
 * lib/permissions.ts — GiftHint
 *
 * Feature gating for GiftHint Pro subscribers.
 *
 * Two paths to feature access:
 *   1. Paid subscription  — subscription_status = 'pro' (or 'cancelled' but still
 *      within the paid period)
 *   2. Referral milestones — premium_themes_enabled / priority_support_enabled /
 *      custom_username_enabled boolean columns written by lib/rewards.ts
 *
 * Usage:
 *   import { isPro, hasFeature } from '@/lib/permissions'
 *
 *   const user = await getUserRow(userId)
 *   if (isPro(user))                          // subscription check
 *   if (hasFeature(user, 'custom_themes'))    // subscription OR referral unlock
 *
 * Subscription-only features (never unlocked by referrals):
 *   unlimited_lists · advanced_analytics
 *
 * Features unlockable via referral milestones:
 *   custom_themes (3 referrals) · priority_support (5 referrals)
 *
 * SERVER-SAFE — this file has no client-side side-effects, but isPro() reads
 * subscription_period_end which is a server-side column.  You may import it
 * in both Server Components and API routes.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** All Pro features gated by this module. */
export type FeatureKey =
  | 'custom_themes'        // paid OR referral (3 referrals)
  | 'unlimited_lists'      // paid only
  | 'advanced_analytics'   // paid only
  | 'priority_support'     // paid OR referral (5 referrals)
  | 'pro_badge'            // paid only

/**
 * Minimal user shape needed by permissions checks.
 * Matches the columns added by:
 *   supabase/migrations/20260518_subscription.sql (subscription fields)
 *   supabase/migrations/20260518_referral_rewards.sql (referral unlock fields)
 */
export interface PermissionsUser {
  // ── Subscription fields ──────────────────────────────────────────────────
  subscription_status:     'free' | 'pro' | 'cancelled'
  subscription_period_end: string | null  // ISO 8601 UTC, null for free users

  // ── Referral unlock booleans ─────────────────────────────────────────────
  premium_themes_enabled:    boolean
  priority_support_enabled:  boolean
  custom_username_enabled:   boolean

  // ── Referral tier (set by lib/rewards.ts) ────────────────────────────────
  premium_tier: 'free' | 'plus' | 'pro'
}

// ── isPro ─────────────────────────────────────────────────────────────────────

/**
 * Returns true if the user has an active paid Pro subscription.
 *
 * Covers two cases:
 *   - `subscription_status = 'pro'`  — subscription is active and current
 *   - `subscription_status = 'cancelled'` AND `subscription_period_end` is in
 *     the future — subscription was cancelled but the user has already paid for
 *     the remainder of the current billing period.
 *
 * For 'cancelled' users we check the period_end server-side so they lose access
 * at exactly the right moment without requiring a webhook to flip the status.
 * (The webhook handler sets status → 'cancelled' on `customer.subscription.deleted`
 * but period_end may still be days away.)
 */
export function isPro(user: PermissionsUser): boolean {
  if (user.subscription_status === 'pro') {
    // Active subscription.  Stripe guarantees the status is accurate while the
    // subscription is live; trust it without rechecking the period_end.
    return true
  }

  if (user.subscription_status === 'cancelled' && user.subscription_period_end) {
    // Graceful access: cancelled but paid-up until period_end.
    const periodEnd = new Date(user.subscription_period_end)
    return periodEnd > new Date()
  }

  return false
}

// ── hasFeature ────────────────────────────────────────────────────────────────

/**
 * Returns true if the user has access to the requested feature.
 *
 * Access is granted if EITHER condition is met:
 *   - The user is a Pro subscriber (isPro(user) = true)
 *   - The feature is in the referral-unlock grant matrix and the corresponding
 *     column is true
 *
 * Subscription-only features (`unlimited_lists`, `advanced_analytics`,
 * `pro_badge`) are NEVER granted via referrals — the only path is a paid plan.
 */
export function hasFeature(user: PermissionsUser, feature: FeatureKey): boolean {
  // Paid subscription unlocks every feature.
  if (isPro(user)) return true

  // Referral unlock paths — subscription-only features short-circuit here.
  switch (feature) {
    case 'custom_themes':
      // Unlocked at 3 referrals (premium_themes_enabled column).
      return user.premium_themes_enabled

    case 'priority_support':
      // Unlocked at 5 referrals (priority_support_enabled column).
      return user.priority_support_enabled

    // Subscription-only — no referral path.
    case 'unlimited_lists':
    case 'advanced_analytics':
    case 'pro_badge':
      return false

    default:
      return false
  }
}

// ── getReferralUnlocks ────────────────────────────────────────────────────────

export interface ReferralUnlockStatus {
  feature:  FeatureKey
  label:    string
  unlocked: boolean
  /** true = requires subscription; false = unlockable via referrals */
  paidOnly: boolean
}

/**
 * Returns the referral-unlock status for every feature.
 * Used on the upgrade page to show which features the user has already
 * unlocked via referrals vs. which still require a paid plan.
 */
export function getReferralUnlocks(user: PermissionsUser): ReferralUnlockStatus[] {
  return [
    {
      feature:  'custom_themes',
      label:    'Premium themes',
      unlocked: user.premium_themes_enabled,
      paidOnly: false,
    },
    {
      feature:  'priority_support',
      label:    'Priority support',
      unlocked: user.priority_support_enabled,
      paidOnly: false,
    },
    {
      feature:  'unlimited_lists',
      label:    'Unlimited wishlists',
      unlocked: false,
      paidOnly: true,
    },
    {
      feature:  'advanced_analytics',
      label:    'Advanced analytics',
      unlocked: false,
      paidOnly: true,
    },
    {
      feature:  'pro_badge',
      label:    'Pro badge',
      unlocked: false,
      paidOnly: true,
    },
  ]
}
