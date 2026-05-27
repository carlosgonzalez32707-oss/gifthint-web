/**
 * app/dashboard/upgrade/page.tsx — GiftHint
 *
 * GiftHint Pro upgrade page.
 *
 * Sections:
 *   1. Header — Pro badge + headline
 *   2. Billing toggle — monthly / annual (save 20%)
 *   3. Feature comparison — Free vs Pro
 *   4. Referral unlocks — features already unlocked by the user's referrals
 *   5. Upgrade CTA — calls /api/billing/create-checkout, redirects to Stripe
 *
 * Auth: client-side via useAuth() — redirects to / when signed out.
 * Data: browser Supabase client (RLS restricts to current user).
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter }                        from 'next/navigation'
import { tokens }                           from '@/tokens'
import { useAuth }                          from '@/hooks/useAuth'
import { getBrowserClient }                 from '@/lib/supabase-browser'
import { isPro, hasFeature, getReferralUnlocks } from '@/lib/permissions'
import type { PermissionsUser, FeatureKey } from '@/lib/permissions'

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserRow {
  subscription_status:     string
  subscription_period_end: string | null
  premium_themes_enabled:   boolean
  priority_support_enabled: boolean
  custom_username_enabled:  boolean
  premium_tier:             string
}

// ── Feature list ──────────────────────────────────────────────────────────────

interface FeatureRow {
  key:        FeatureKey
  label:      string
  description: string
  free:        string | false   // false = not available, string = what free gets
  pro:         string
}

const FEATURE_ROWS: FeatureRow[] = [
  {
    key:         'unlimited_lists',
    label:       'Wishlists',
    description: 'Number of wishlists you can create',
    free:        'Up to 3',
    pro:         'Unlimited',
  },
  {
    key:         'advanced_analytics',
    label:       'Analytics',
    description: 'See who viewed your lists and what they clicked',
    free:        'Last 7 days',
    pro:         'Full history + exports',
  },
  {
    key:         'custom_themes',
    label:       'Premium themes',
    description: 'Dark glass, pastel, and seasonal colour palettes',
    free:        false,
    pro:         'All themes',
  },
  {
    key:         'priority_support',
    label:       'Support',
    description: 'Response time and queue priority',
    free:        'Standard',
    pro:         'Priority (< 24h)',
  },
  {
    key:         'pro_badge',
    label:       'Pro badge',
    description: 'Verified Pro checkmark shown on your gifter page',
    free:        false,
    pro:         '✓ Shown on profile',
  },
]

// ── Prices ────────────────────────────────────────────────────────────────────

const MONTHLY_PRICE_ID = process.env.NEXT_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID ?? ''
const ANNUAL_PRICE_ID  = process.env.NEXT_PUBLIC_STRIPE_PRO_ANNUAL_PRICE_ID  ?? ''

// Hard-coded display prices (kept in sync with Stripe product config).
const MONTHLY_DISPLAY = '£4.99'
const ANNUAL_DISPLAY  = '£3.99'    // per month, billed annually = £47.88/yr

// ── Helpers ───────────────────────────────────────────────────────────────────

function toPermissionsUser(row: UserRow): PermissionsUser {
  return {
    subscription_status:     (row.subscription_status as PermissionsUser['subscription_status']) ?? 'free',
    subscription_period_end: row.subscription_period_end,
    premium_themes_enabled:   row.premium_themes_enabled,
    priority_support_enabled: row.priority_support_enabled,
    custom_username_enabled:  row.custom_username_enabled,
    premium_tier:             (row.premium_tier as PermissionsUser['premium_tier']) ?? 'free',
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CheckIcon({ color = tokens.colors.purple }: { color?: string }) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 16 16" fill="none"
      style={{ flexShrink: 0 }}
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="7.5" stroke={color} strokeOpacity="0.3" />
      <path
        d="M5 8l2.333 2.333L11 5.667"
        stroke={color} strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  )
}

function CrossIcon() {
  return (
    <svg
      width="16" height="16" viewBox="0 0 16 16" fill="none"
      style={{ flexShrink: 0 }}
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="7.5" stroke={tokens.colors.muted} strokeOpacity="0.3" />
      <path
        d="M5.5 5.5l5 5M10.5 5.5l-5 5"
        stroke={tokens.colors.muted} strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

// ── Page component ────────────────────────────────────────────────────────────

export default function UpgradePage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  const [userRow,    setUserRow]    = useState<UserRow | null>(null)
  const [loadingRow, setLoadingRow] = useState(true)
  const [annual,     setAnnual]     = useState(false)
  const [checkingOut, setCheckingOut] = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  // ── Redirect if not signed in ─────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/')
    }
  }, [authLoading, user, router])

  // ── Fetch user row ────────────────────────────────────────────────────────
  const fetchUser = useCallback(async () => {
    if (!user) return
    const supabase = getBrowserClient()
    const { data } = await supabase
      .from('users')
      .select(
        'subscription_status, subscription_period_end, ' +
        'premium_themes_enabled, priority_support_enabled, ' +
        'custom_username_enabled, premium_tier',
      )
      .eq('id', user.id)
      .single()

    if (data) setUserRow(data as unknown as UserRow)
    setLoadingRow(false)
  }, [user])

  useEffect(() => { fetchUser() }, [fetchUser])

  // ── Redirect Pro users to dashboard ──────────────────────────────────────
  useEffect(() => {
    if (!userRow) return
    const permUser = toPermissionsUser(userRow)
    if (isPro(permUser)) {
      router.replace('/dashboard?tab=settings')
    }
  }, [userRow, router])

  // ── Checkout ──────────────────────────────────────────────────────────────
  async function handleUpgrade() {
    if (!user) return
    setError(null)
    setCheckingOut(true)

    const priceId = annual ? ANNUAL_PRICE_ID : MONTHLY_PRICE_ID
    if (!priceId) {
      setError('Stripe price IDs are not configured. Please contact support.')
      setCheckingOut(false)
      return
    }

    try {
      const supabase = getBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('No session token')

      const res = await fetch('/api/billing/create-checkout', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ priceId }),
      })

      const json = await res.json() as { url?: string; error?: string }

      if (!res.ok || !json.url) {
        throw new Error(json.error ?? 'Failed to create checkout session')
      }

      window.location.href = json.url
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong'
      setError(message)
      setCheckingOut(false)
    }
  }

  // ── Loading state ─────────────────────────────────────────────────────────
  if (authLoading || loadingRow) {
    return (
      <main style={{
        minHeight: '100dvh',
        background: tokens.colors.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <p style={{ color: tokens.colors.muted, fontSize: 14 }}>Loading…</p>
      </main>
    )
  }

  if (!user || !userRow) return null

  const permUser        = toPermissionsUser(userRow)
  const referralUnlocks = getReferralUnlocks(permUser)
  const unlockedByRef   = referralUnlocks.filter(r => r.unlocked)

  const selectedPriceId = annual ? ANNUAL_PRICE_ID : MONTHLY_PRICE_ID
  const priceDisplay    = annual ? ANNUAL_DISPLAY : MONTHLY_DISPLAY

  return (
    <main style={{
      minHeight:  '100dvh',
      background: tokens.colors.bg,
      color:      tokens.colors.text,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      <div style={{
        maxWidth: 680,
        margin:   '0 auto',
        padding:  'clamp(32px, 6vw, 64px) 20px',
      }}>

        {/* ── Back link ──────────────────────────────────────────────────── */}
        <button
          onClick={() => router.back()}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: tokens.colors.muted, fontSize: 13,
            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 40,
            padding: 0,
          }}
        >
          ← Back
        </button>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            display:     'inline-flex',
            alignItems:  'center',
            gap:          6,
            background:  tokens.colors.purpleDim,
            border:      `1px solid rgba(139,131,240,0.25)`,
            borderRadius: tokens.radius.pill,
            padding:      '5px 14px',
            marginBottom: 16,
          }}>
            <span style={{ fontSize: 12 }}>✦</span>
            <span style={{
              fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: tokens.colors.purple,
            }}>
              GiftHint Pro
            </span>
          </div>

          <h1 style={{
            fontSize:   'clamp(26px, 5vw, 36px)',
            fontWeight:  800,
            letterSpacing: '-0.5px',
            lineHeight:  1.1,
            margin:      '0 0 12px',
            color:       tokens.colors.text,
          }}>
            Upgrade to Pro
          </h1>
          <p style={{
            fontSize: 15, color: tokens.colors.muted,
            margin: 0, lineHeight: 1.6,
          }}>
            Unlimited wishlists, advanced analytics, and more — for less than a coffee a month.
          </p>
        </header>

        {/* ── Billing toggle ──────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 12, marginBottom: 32,
        }}>
          <span style={{
            fontSize: 13, color: annual ? tokens.colors.muted : tokens.colors.text,
            transition: 'color 200ms',
          }}>
            Monthly
          </span>

          <button
            onClick={() => setAnnual(prev => !prev)}
            role="switch"
            aria-checked={annual}
            aria-label="Toggle annual billing"
            style={{
              position:     'relative',
              width:         44,
              height:        24,
              borderRadius:  12,
              border:        'none',
              cursor:       'pointer',
              background:   annual ? tokens.colors.purple : 'rgba(240,238,232,0.12)',
              transition:   'background 200ms',
              padding:       0,
            }}
          >
            <span style={{
              position:     'absolute',
              top:           3,
              left:          annual ? 22 : 3,
              width:         18,
              height:        18,
              borderRadius:  9,
              background:   '#fff',
              transition:   'left 200ms',
              display:      'block',
            }} />
          </button>

          <span style={{
            fontSize: 13, color: annual ? tokens.colors.text : tokens.colors.muted,
            transition: 'color 200ms',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            Annual
            <span style={{
              fontSize:     10, fontWeight: 700, letterSpacing: '0.06em',
              textTransform: 'uppercase', color: tokens.colors.green,
              background:   'rgba(78,201,154,0.12)', borderRadius: 4,
              padding:      '2px 5px',
            }}>
              Save 20%
            </span>
          </span>
        </div>

        {/* ── Pricing card ────────────────────────────────────────────────── */}
        <div style={{
          background:   tokens.colors.surface,
          border:       `1px solid rgba(139,131,240,0.3)`,
          borderRadius:  tokens.radius.xl,
          padding:       '28px 28px 24px',
          marginBottom:  24,
          position:     'relative',
          overflow:     'hidden',
        }}>
          {/* Purple glow */}
          <div style={{
            position:   'absolute', top: -60, right: -60,
            width: 180, height: 180,
            background: 'radial-gradient(circle, rgba(139,131,240,0.18) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />

          {/* Price */}
          <div style={{
            display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4,
          }}>
            <span style={{ fontSize: 36, fontWeight: 800, color: tokens.colors.text }}>
              {priceDisplay}
            </span>
            <span style={{ fontSize: 13, color: tokens.colors.muted }}>/ month</span>
          </div>

          {annual && (
            <p style={{ fontSize: 12, color: tokens.colors.muted, margin: '0 0 20px' }}>
              Billed annually (£47.88/yr)
            </p>
          )}

          {/* Feature list */}
          <ul style={{
            listStyle: 'none', margin: '20px 0 24px', padding: 0,
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            {FEATURE_ROWS.map(f => (
              <li key={f.key} style={{
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <CheckIcon />
                <span style={{ fontSize: 13.5, color: tokens.colors.text }}>
                  <strong>{f.label}</strong>
                  {' — '}
                  <span style={{ color: tokens.colors.muted }}>{f.pro}</span>
                </span>
              </li>
            ))}
          </ul>

          {/* CTA */}
          {error && (
            <p style={{
              fontSize: 12, color: '#E24B4A',
              background: 'rgba(226,75,74,0.08)',
              border: '1px solid rgba(226,75,74,0.2)',
              borderRadius: 8, padding: '8px 12px',
              marginBottom: 12, margin: '0 0 12px',
            }}>
              {error}
            </p>
          )}

          <button
            onClick={handleUpgrade}
            disabled={checkingOut || !selectedPriceId}
            style={{
              width:        '100%',
              padding:      '14px 0',
              background:   checkingOut
                              ? 'rgba(139,131,240,0.5)'
                              : tokens.colors.purple,
              border:       'none',
              borderRadius:  tokens.radius.md,
              color:        '#fff',
              fontSize:      15,
              fontWeight:    700,
              cursor:        checkingOut ? 'not-allowed' : 'pointer',
              letterSpacing: '0.1px',
              transition:   'opacity 150ms',
            }}
          >
            {checkingOut ? 'Redirecting to Stripe…' : `Upgrade to Pro ${annual ? '(Annual)' : '(Monthly)'}`}
          </button>

          <p style={{
            fontSize: 11, color: tokens.colors.muted, textAlign: 'center',
            margin: '10px 0 0',
          }}>
            Secured by Stripe · Cancel anytime
          </p>
        </div>

        {/* ── Feature comparison table ─────────────────────────────────────── */}
        <section aria-label="Feature comparison" style={{ marginBottom: 32 }}>
          <h2 style={{
            fontSize: 13, fontWeight: 700, letterSpacing: '0.07em',
            textTransform: 'uppercase', color: tokens.colors.muted,
            margin: '0 0 12px',
          }}>
            What's included
          </h2>

          <div style={{
            background:   tokens.colors.surface,
            border:       `1px solid ${tokens.colors.border}`,
            borderRadius:  tokens.radius.lg,
            overflow:     'hidden',
          }}>
            {/* Header row */}
            <div style={{
              display:         'grid',
              gridTemplateColumns: '1fr 80px 80px',
              borderBottom:    `1px solid ${tokens.colors.border}`,
              padding:         '10px 16px',
            }}>
              <span />
              <span style={{
                fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.07em', color: tokens.colors.muted, textAlign: 'center',
              }}>
                Free
              </span>
              <span style={{
                fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.07em', color: tokens.colors.purple, textAlign: 'center',
              }}>
                Pro
              </span>
            </div>

            {FEATURE_ROWS.map((f, i) => {
              const alreadyUnlocked = userRow
                ? hasFeature(toPermissionsUser(userRow), f.key)
                : false

              return (
                <div
                  key={f.key}
                  style={{
                    display:         'grid',
                    gridTemplateColumns: '1fr 80px 80px',
                    alignItems:      'center',
                    padding:         '12px 16px',
                    borderBottom:    i < FEATURE_ROWS.length - 1
                                       ? `1px solid ${tokens.colors.border}`
                                       : 'none',
                    background:      alreadyUnlocked ? 'rgba(139,131,240,0.04)' : 'transparent',
                  }}
                >
                  <div>
                    <p style={{ fontSize: 13.5, color: tokens.colors.text, margin: '0 0 2px' }}>
                      {f.label}
                      {alreadyUnlocked && !isPro(toPermissionsUser(userRow)) && (
                        <span style={{
                          marginLeft: 6, fontSize: 10, fontWeight: 700,
                          color: tokens.colors.green,
                          background: 'rgba(78,201,154,0.1)',
                          borderRadius: 4, padding: '1px 5px',
                          verticalAlign: 'middle',
                        }}>
                          Unlocked
                        </span>
                      )}
                    </p>
                    <p style={{ fontSize: 11.5, color: tokens.colors.muted, margin: 0 }}>
                      {f.description}
                    </p>
                  </div>

                  <div style={{ textAlign: 'center' }}>
                    {f.free
                      ? <span style={{ fontSize: 11.5, color: tokens.colors.muted }}>{f.free}</span>
                      : <CrossIcon />
                    }
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <CheckIcon color={tokens.colors.purple} />
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* ── Referral unlocks ─────────────────────────────────────────────── */}
        {unlockedByRef.length > 0 && (
          <section
            aria-label="Features you've unlocked via referrals"
            style={{
              background:   tokens.colors.surface,
              border:       `1px solid rgba(78,201,154,0.2)`,
              borderRadius:  tokens.radius.lg,
              padding:      '18px 20px',
              marginBottom:  32,
            }}
          >
            <p style={{
              fontSize: 11, fontWeight: 700, letterSpacing: '0.07em',
              textTransform: 'uppercase', color: tokens.colors.green,
              margin: '0 0 10px',
            }}>
              Already unlocked by your referrals
            </p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {unlockedByRef.map(r => (
                <li key={r.feature} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckIcon color={tokens.colors.green} />
                  <span style={{ fontSize: 13, color: tokens.colors.text }}>{r.label}</span>
                </li>
              ))}
            </ul>
            <p style={{
              fontSize: 12, color: tokens.colors.muted,
              margin: '12px 0 0', lineHeight: 1.6,
            }}>
              Upgrading to Pro adds the remaining features on top of what you've already earned.
            </p>
          </section>
        )}

        {/* ── Fine print ───────────────────────────────────────────────────── */}
        <p style={{
          fontSize: 11.5, color: tokens.colors.muted, textAlign: 'center',
          lineHeight: 1.7,
        }}>
          Prices shown in GBP. VAT may apply depending on your location.
          Cancel any time from your account settings — you'll keep Pro access until
          the end of your paid period.
        </p>

      </div>
    </main>
  )
}
