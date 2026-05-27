/**
 * tests/permissions.test.ts — GiftHint
 *
 * Unit tests for lib/permissions.ts (feature gating).
 *
 * Coverage:
 *   isPro()              — active, cancelled-in-period, cancelled-expired, free
 *   hasFeature()         — each FeatureKey via paid path and referral path
 *   getReferralUnlocks() — structure and paidOnly flag
 *
 * No mocks needed — all functions are pure (no I/O).
 * Run with: npm test
 */

import {
  isPro,
  hasFeature,
  getReferralUnlocks,
} from '@/lib/permissions'
import type { PermissionsUser } from '@/lib/permissions'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<PermissionsUser> = {}): PermissionsUser {
  return {
    subscription_status:     'free',
    subscription_period_end: null,
    premium_themes_enabled:   false,
    priority_support_enabled: false,
    custom_username_enabled:  false,
    premium_tier:             'free',
    ...overrides,
  }
}

const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
const pastDate   = new Date(Date.now() -  1 * 24 * 60 * 60 * 1000).toISOString()

// ── isPro ─────────────────────────────────────────────────────────────────────

describe('isPro()', () => {
  it('returns true for an active subscription', () => {
    const user = makeUser({ subscription_status: 'pro' })
    expect(isPro(user)).toBe(true)
  })

  it('returns true for a cancelled subscription still within the paid period', () => {
    const user = makeUser({
      subscription_status:     'cancelled',
      subscription_period_end: futureDate,
    })
    expect(isPro(user)).toBe(true)
  })

  it('returns false for a cancelled subscription whose period has ended', () => {
    const user = makeUser({
      subscription_status:     'cancelled',
      subscription_period_end: pastDate,
    })
    expect(isPro(user)).toBe(false)
  })

  it('returns false for a cancelled subscription with no period_end', () => {
    const user = makeUser({
      subscription_status:     'cancelled',
      subscription_period_end: null,
    })
    expect(isPro(user)).toBe(false)
  })

  it('returns false for a free user', () => {
    const user = makeUser({ subscription_status: 'free' })
    expect(isPro(user)).toBe(false)
  })
})

// ── hasFeature ────────────────────────────────────────────────────────────────

describe('hasFeature() — paid path', () => {
  const proUser = makeUser({ subscription_status: 'pro' })

  test.each([
    'custom_themes',
    'unlimited_lists',
    'advanced_analytics',
    'priority_support',
    'pro_badge',
  ] as const)('grants %s to Pro subscribers', (feature) => {
    expect(hasFeature(proUser, feature)).toBe(true)
  })
})

describe('hasFeature() — referral unlock path', () => {
  const freeUser = makeUser()

  it('grants custom_themes when premium_themes_enabled = true', () => {
    const user = makeUser({ premium_themes_enabled: true })
    expect(hasFeature(user, 'custom_themes')).toBe(true)
  })

  it('denies custom_themes when premium_themes_enabled = false', () => {
    expect(hasFeature(freeUser, 'custom_themes')).toBe(false)
  })

  it('grants priority_support when priority_support_enabled = true', () => {
    const user = makeUser({ priority_support_enabled: true })
    expect(hasFeature(user, 'priority_support')).toBe(true)
  })

  it('denies priority_support when priority_support_enabled = false', () => {
    expect(hasFeature(freeUser, 'priority_support')).toBe(false)
  })
})

describe('hasFeature() — subscription-only features', () => {
  const freeUserWithAllReferrals = makeUser({
    premium_themes_enabled:   true,
    priority_support_enabled: true,
    custom_username_enabled:  true,
    premium_tier:             'pro',
  })

  it('denies unlimited_lists to a free user (even with all referrals)', () => {
    expect(hasFeature(freeUserWithAllReferrals, 'unlimited_lists')).toBe(false)
  })

  it('denies advanced_analytics to a free user (even with all referrals)', () => {
    expect(hasFeature(freeUserWithAllReferrals, 'advanced_analytics')).toBe(false)
  })

  it('denies pro_badge to a free user (even with all referrals)', () => {
    expect(hasFeature(freeUserWithAllReferrals, 'pro_badge')).toBe(false)
  })
})

describe('hasFeature() — cancelled-in-period still has access', () => {
  const cancelledInPeriod = makeUser({
    subscription_status:     'cancelled',
    subscription_period_end: futureDate,
  })

  it('grants unlimited_lists during the paid period after cancellation', () => {
    expect(hasFeature(cancelledInPeriod, 'unlimited_lists')).toBe(true)
  })

  it('grants pro_badge during the paid period after cancellation', () => {
    expect(hasFeature(cancelledInPeriod, 'pro_badge')).toBe(true)
  })
})

// ── getReferralUnlocks ────────────────────────────────────────────────────────

describe('getReferralUnlocks()', () => {
  it('returns five entries', () => {
    expect(getReferralUnlocks(makeUser())).toHaveLength(5)
  })

  it('marks paid-only features correctly', () => {
    const unlocks = getReferralUnlocks(makeUser())
    const paidOnly = unlocks.filter(u => u.paidOnly).map(u => u.feature)
    expect(paidOnly).toEqual(
      expect.arrayContaining(['unlimited_lists', 'advanced_analytics', 'pro_badge']),
    )
    const referralPath = unlocks.filter(u => !u.paidOnly).map(u => u.feature)
    expect(referralPath).toEqual(
      expect.arrayContaining(['custom_themes', 'priority_support']),
    )
  })

  it('reflects premium_themes_enabled in unlocked status', () => {
    const user    = makeUser({ premium_themes_enabled: true })
    const unlocks = getReferralUnlocks(user)
    const themes  = unlocks.find(u => u.feature === 'custom_themes')
    expect(themes?.unlocked).toBe(true)
  })

  it('reflects priority_support_enabled in unlocked status', () => {
    const user    = makeUser({ priority_support_enabled: true })
    const unlocks = getReferralUnlocks(user)
    const support = unlocks.find(u => u.feature === 'priority_support')
    expect(support?.unlocked).toBe(true)
  })

  it('marks paid-only features as unlocked=false regardless of referrals', () => {
    const user    = makeUser({
      premium_themes_enabled:   true,
      priority_support_enabled: true,
      custom_username_enabled:  true,
      premium_tier:             'pro',
    })
    const unlocks = getReferralUnlocks(user)
    for (const u of unlocks.filter(x => x.paidOnly)) {
      expect(u.unlocked).toBe(false)
    }
  })
})
