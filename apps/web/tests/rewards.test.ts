/**
 * tests/rewards.test.ts — GiftHint Referral Rewards suite
 *
 * Covers:
 *   1. lib/rewards.ts  — computeRewardPatch, nextLockedTier, REWARD_TIERS shape
 *   2. checkAndApplyRewards  — DB read + conditional write logic (mocked Supabase)
 *   3. DbUser type — reward fields present
 *
 * Run:  npx jest tests/rewards.test.ts
 */

// ── Supabase mock ─────────────────────────────────────────────────────────────

type UserRecord = {
  referral_count:           number
  premium_tier:             string
  custom_username_enabled:  boolean
  premium_themes_enabled:   boolean
  priority_support_enabled: boolean
}

// Immutable seed — reset before each test
const MOCK_USER_SEED: Record<string, UserRecord> = {
  'user-0-refs':          { referral_count: 0,  premium_tier: 'free', custom_username_enabled: false, premium_themes_enabled: false, priority_support_enabled: false },
  'user-1-ref':           { referral_count: 1,  premium_tier: 'free', custom_username_enabled: false, premium_themes_enabled: false, priority_support_enabled: false },
  'user-3-refs':          { referral_count: 3,  premium_tier: 'plus', custom_username_enabled: true,  premium_themes_enabled: false, priority_support_enabled: false },
  'user-5-refs':          { referral_count: 5,  premium_tier: 'plus', custom_username_enabled: true,  premium_themes_enabled: true,  priority_support_enabled: false },
  'user-10-refs':         { referral_count: 10, premium_tier: 'plus', custom_username_enabled: true,  premium_themes_enabled: true,  priority_support_enabled: true  },
  'user-already-correct': { referral_count: 1,  premium_tier: 'plus', custom_username_enabled: true,  premium_themes_enabled: false, priority_support_enabled: false },
}

let mockUserDb: Record<string, UserRecord> = {}

// Restore DB to seed state before each test so tests are independent
beforeEach(() => {
  mockUserDb = Object.fromEntries(
    Object.entries(MOCK_USER_SEED).map(([k, v]) => [k, { ...v }])
  )
})

const updateCalls: Array<{ id: string; patch: Partial<UserRecord> }> = []

jest.mock('@/lib/supabase-server', () => ({
  createServerClient: () => ({
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (col: string, val: string) => ({
          single: () => {
            if (col === 'id' && mockUserDb[val]) {
              return Promise.resolve({ data: mockUserDb[val], error: null })
            }
            return Promise.resolve({ data: null, error: { message: 'not found' } })
          },
        }),
      }),
      update: (patch: Partial<UserRecord>) => ({
        eq: (_col: string, userId: string) => {
          updateCalls.push({ id: userId, patch })
          // Apply update so subsequent reads reflect the change
          if (mockUserDb[userId]) {
            Object.assign(mockUserDb[userId], patch)
          }
          return Promise.resolve({ error: null })
        },
      }),
    }),
  }),
}))

// ── Imports ───────────────────────────────────────────────────────────────────

import {
  computeRewardPatch,
  nextLockedTier,
  checkAndApplyRewards,
  REWARD_TIERS,
  type PremiumTier,
} from '@/lib/rewards'
import type { DbUser } from '@/lib/supabase-server'

// ─────────────────────────────────────────────────────────────────────────────
// 1. computeRewardPatch
// ─────────────────────────────────────────────────────────────────────────────

describe('computeRewardPatch', () => {
  test('0 referrals → free tier, all flags false', () => {
    const p = computeRewardPatch(0)
    expect(p.premium_tier).toBe('free')
    expect(p.custom_username_enabled).toBe(false)
    expect(p.premium_themes_enabled).toBe(false)
    expect(p.priority_support_enabled).toBe(false)
  })

  test('1 referral → plus tier, custom username enabled', () => {
    const p = computeRewardPatch(1)
    expect(p.premium_tier).toBe('plus')
    expect(p.custom_username_enabled).toBe(true)
    expect(p.premium_themes_enabled).toBe(false)
    expect(p.priority_support_enabled).toBe(false)
  })

  test('2 referrals → still plus, still only custom username', () => {
    const p = computeRewardPatch(2)
    expect(p.premium_tier).toBe('plus')
    expect(p.custom_username_enabled).toBe(true)
    expect(p.premium_themes_enabled).toBe(false)
  })

  test('3 referrals → premium themes unlocked', () => {
    const p = computeRewardPatch(3)
    expect(p.premium_themes_enabled).toBe(true)
    expect(p.priority_support_enabled).toBe(false)
  })

  test('5 referrals → priority support unlocked', () => {
    const p = computeRewardPatch(5)
    expect(p.priority_support_enabled).toBe(true)
    expect(p.premium_tier).toBe('plus')
  })

  test('9 referrals → still plus (not pro)', () => {
    const p = computeRewardPatch(9)
    expect(p.premium_tier).toBe('plus')
  })

  test('10 referrals → pro tier', () => {
    const p = computeRewardPatch(10)
    expect(p.premium_tier).toBe('pro')
    expect(p.custom_username_enabled).toBe(true)
    expect(p.premium_themes_enabled).toBe(true)
    expect(p.priority_support_enabled).toBe(true)
  })

  test('50 referrals → still pro, all flags true', () => {
    const p = computeRewardPatch(50)
    expect(p.premium_tier).toBe('pro')
    expect(p.custom_username_enabled).toBe(true)
    expect(p.premium_themes_enabled).toBe(true)
    expect(p.priority_support_enabled).toBe(true)
  })

  test('thresholds are exact — 0 referrals is not plus', () => {
    expect(computeRewardPatch(0).premium_tier).toBe('free')
    expect(computeRewardPatch(1).premium_tier).toBe('plus')
  })

  test('returns all four expected keys', () => {
    const p = computeRewardPatch(5)
    expect(Object.keys(p).sort()).toEqual([
      'custom_username_enabled',
      'premium_themes_enabled',
      'premium_tier',
      'priority_support_enabled',
    ])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. nextLockedTier
// ─────────────────────────────────────────────────────────────────────────────

describe('nextLockedTier', () => {
  test('0 referrals → next tier is the 1-referral custom username tier', () => {
    const t = nextLockedTier(0)
    expect(t?.minReferrals).toBe(1)
    expect(t?.unlockColumn).toBe('custom_username_enabled')
  })

  test('1 referral → next tier is 3-referral premium themes', () => {
    const t = nextLockedTier(1)
    expect(t?.minReferrals).toBe(3)
  })

  test('10 referrals → all tiers unlocked, returns null', () => {
    expect(nextLockedTier(10)).toBeNull()
  })

  test('100 referrals → returns null', () => {
    expect(nextLockedTier(100)).toBeNull()
  })

  test('4 referrals → next is 5-referral tier', () => {
    expect(nextLockedTier(4)?.minReferrals).toBe(5)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. REWARD_TIERS constant shape
// ─────────────────────────────────────────────────────────────────────────────

describe('REWARD_TIERS', () => {
  test('has exactly 4 tiers', () => {
    expect(REWARD_TIERS).toHaveLength(4)
  })

  test('minReferrals are [1, 3, 5, 10] in ascending order', () => {
    expect(REWARD_TIERS.map((t) => t.minReferrals)).toEqual([1, 3, 5, 10])
  })

  test('every tier has required fields: minReferrals, label, description, badge, unlockColumn', () => {
    REWARD_TIERS.forEach((t) => {
      expect(typeof t.minReferrals).toBe('number')
      expect(typeof t.label).toBe('string')
      expect(typeof t.description).toBe('string')
      expect(typeof t.badge).toBe('string')
      expect('unlockColumn' in t).toBe(true)
    })
  })

  test('Pro tier (10 refs) has unlockColumn: null (gated by premium_tier, not a flag)', () => {
    const pro = REWARD_TIERS.find((t) => t.minReferrals === 10)
    expect(pro?.unlockColumn).toBeNull()
  })

  test('custom username tier has unlockColumn: custom_username_enabled', () => {
    const t = REWARD_TIERS.find((t) => t.minReferrals === 1)
    expect(t?.unlockColumn).toBe('custom_username_enabled')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. checkAndApplyRewards
// ─────────────────────────────────────────────────────────────────────────────

describe('checkAndApplyRewards', () => {
  // updateCalls is reset in the global beforeEach alongside the mock DB
  beforeEach(() => { updateCalls.length = 0 })

  test('user with 1 referral gets custom_username_enabled = true', async () => {
    const state = await checkAndApplyRewards('user-1-ref')
    expect(state.customUsernameEnabled).toBe(true)
    expect(state.premiumTier).toBe('plus')
  })

  test('writes a DB update when rewards have changed', async () => {
    updateCalls.length = 0
    await checkAndApplyRewards('user-1-ref')
    // user-1-ref starts with premium_tier: 'free' — should update
    expect(updateCalls.length).toBeGreaterThan(0)
  })

  test('does NOT write a DB update when rewards are already correct', async () => {
    updateCalls.length = 0
    await checkAndApplyRewards('user-already-correct')
    expect(updateCalls.length).toBe(0)
  })

  test('user with 10 referrals gets pro tier', async () => {
    const state = await checkAndApplyRewards('user-10-refs')
    expect(state.premiumTier).toBe('pro')
    expect(state.prioritySupportEnabled).toBe(true)
  })

  test('user with 0 referrals stays on free tier', async () => {
    const state = await checkAndApplyRewards('user-0-refs')
    expect(state.premiumTier).toBe('free')
    expect(state.customUsernameEnabled).toBe(false)
  })

  test('returns a UserRewardState with all expected keys', async () => {
    const state = await checkAndApplyRewards('user-0-refs')
    // Sort alphabetically: premiumThemesEnabled (Th) < premiumTier (Ti)
    expect(Object.keys(state).sort()).toEqual([
      'customUsernameEnabled',
      'premiumThemesEnabled',
      'premiumTier',
      'prioritySupportEnabled',
      'referralCount',
    ])
  })

  test('throws when userId does not exist', async () => {
    await expect(checkAndApplyRewards('nonexistent-uuid')).rejects.toThrow()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. DbUser reward fields — type shape
// ─────────────────────────────────────────────────────────────────────────────

describe('DbUser reward fields', () => {
  test('accepts all four new reward columns', () => {
    const user: DbUser = {
      id:                       'uuid',
      google_id:                'google-id',
      email:                    'user@example.com',
      display_name:             'Test User',
      avatar_url:               null,
      public_username:          'testuser',
      created_at:               '2026-01-01T00:00:00Z',
      price_alerts_enabled:     true,
      unsubscribe_token:        null,
      referral_code:            'abc12345',
      referred_by:              null,
      referral_count:           3,
      premium_tier:             'plus',
      custom_username_enabled:  true,
      premium_themes_enabled:   true,
      priority_support_enabled: false,
    }
    expect(user.premium_tier).toBe('plus')
    expect(user.custom_username_enabled).toBe(true)
    expect(user.premium_themes_enabled).toBe(true)
    expect(user.priority_support_enabled).toBe(false)
  })

  test('premium_tier literal type accepts free / plus / pro', () => {
    const tiers: Array<'free' | 'plus' | 'pro'> = ['free', 'plus', 'pro']
    tiers.forEach((tier) => {
      const t: PremiumTier = tier
      expect(['free', 'plus', 'pro']).toContain(t)
    })
  })
})
