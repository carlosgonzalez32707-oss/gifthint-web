/**
 * components/dashboard/ReferralPanel.tsx — GiftHint
 *
 * Referral section used both inside the full /dashboard/referrals page and as
 * an embeddable panel in the main dashboard.
 *
 * Shows:
 *   - Referral link + copy button
 *   - Stats: clicks / signups / first saves
 *   - Progress bar to next reward tier
 *   - Rewards list with locked / unlocked badges
 *   - Share buttons: copy, WhatsApp, Twitter/X
 *
 * Props:
 *   userId         — the authenticated user's UUID (for the stats API call)
 *   referralCode   — the user's unique referral code
 *   referralCount  — current count of successful signups (from DB)
 *   rewards        — the user's current reward unlock state
 */

'use client'

import { useState, useEffect } from 'react'
import { tokens }              from '@/tokens'
import { REWARD_TIERS, nextLockedTier, type UserRewardState } from '@/lib/rewards'

// ── Types ──────────────────────────────────────────────────────────────────────

interface ReferralStats {
  totalClicks:     number
  totalSignups:    number
  totalFirstSaves: number
}

interface ReferralPanelProps {
  userId:        string
  referralCode:  string
  referralCount: number
  rewards:       UserRewardState
}

// ── Design tokens ─────────────────────────────────────────────────────────────

const c = tokens.colors
const r = tokens.radius

// ── Sub-components ────────────────────────────────────────────────────────────

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        flex:           '1 1 100px',
        background:     c.surface2,
        borderRadius:   r.md,
        padding:        '16px 20px',
        textAlign:      'center',
        border:         `1px solid ${c.border}`,
      }}
    >
      <div style={{ fontSize: '24px', fontWeight: 800, color: c.text, letterSpacing: '-0.03em' }}>
        {value}
      </div>
      <div style={{ fontSize: '11px', color: c.muted, marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </div>
    </div>
  )
}

function RewardRow({
  badge, label, description, minReferrals, referralCount,
}: {
  badge: string; label: string; description: string
  minReferrals: number; referralCount: number
}) {
  const unlocked = referralCount >= minReferrals
  return (
    <div
      style={{
        display:    'flex',
        alignItems: 'flex-start',
        gap:        '14px',
        padding:    '14px 0',
        borderBottom: `1px solid ${c.border}`,
        opacity:    unlocked ? 1 : 0.55,
      }}
    >
      {/* Badge circle */}
      <div
        style={{
          width:          '40px',
          height:         '40px',
          borderRadius:   r.md,
          background:     unlocked ? c.purpleDim : c.surface2,
          border:         `1px solid ${unlocked ? c.purpleRing : c.border}`,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          fontSize:       '18px',
          flexShrink:     0,
        }}
      >
        {unlocked ? badge : '🔒'}
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: c.text }}>{label}</span>
          <span
            style={{
              fontSize:     '11px',
              fontWeight:   600,
              padding:      '2px 8px',
              borderRadius: r.pill,
              background:   unlocked ? c.greenDim : c.surface3,
              color:        unlocked ? c.green : c.muted,
              border:       `1px solid ${unlocked ? c.greenRing : 'transparent'}`,
              letterSpacing: '0.04em',
            }}
          >
            {unlocked ? 'Unlocked' : `${minReferrals} referral${minReferrals > 1 ? 's' : ''}`}
          </span>
        </div>
        <div style={{ fontSize: '12px', color: c.muted, marginTop: '3px', lineHeight: 1.4 }}>
          {description}
        </div>
      </div>
    </div>
  )
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ referralCount }: { referralCount: number }) {
  const next = nextLockedTier(referralCount)

  if (!next) {
    return (
      <div
        style={{
          padding:      '12px 16px',
          borderRadius: r.md,
          background:   c.purpleDim,
          border:       `1px solid ${c.purpleRing}`,
          fontSize:     '13px',
          color:        c.purple,
          fontWeight:   600,
        }}
      >
        ⭐ You've unlocked all reward tiers — you're a GiftHint Pro!
      </div>
    )
  }

  const prev = REWARD_TIERS.slice().reverse().find((t) => t.minReferrals <= referralCount)
  const from = prev?.minReferrals ?? 0
  const to   = next.minReferrals
  const pct  = Math.round(((referralCount - from) / (to - from)) * 100)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ fontSize: '12px', color: c.muted }}>
          Next: <span style={{ color: c.text, fontWeight: 600 }}>{next.badge} {next.label}</span>
        </span>
        <span style={{ fontSize: '12px', color: c.muted }}>
          {referralCount}/{next.minReferrals} referrals
        </span>
      </div>
      {/* Track */}
      <div
        style={{
          height:       '6px',
          borderRadius: r.pill,
          background:   c.surface3,
          overflow:     'hidden',
        }}
      >
        {/* Fill */}
        <div
          style={{
            height:           '6px',
            width:            `${Math.min(pct, 100)}%`,
            borderRadius:     r.pill,
            background:       `linear-gradient(90deg, ${c.purple} 0%, #b3acf8 100%)`,
            transition:       'width 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        />
      </div>
      <div style={{ fontSize: '11px', color: c.muted, marginTop: '6px' }}>
        {next.minReferrals - referralCount} more referral{next.minReferrals - referralCount !== 1 ? 's' : ''} to unlock
      </div>
    </div>
  )
}

// ── ReferralPanel ─────────────────────────────────────────────────────────────

export function ReferralPanel({
  userId,
  referralCode,
  referralCount,
  rewards,
}: ReferralPanelProps) {
  const siteUrl    = process.env.NEXT_PUBLIC_APP_URL ?? 'https://gifthint.io'
  const refLink    = `${siteUrl}/r/${referralCode}`

  const [copied,  setCopied]  = useState(false)
  const [stats,   setStats]   = useState<ReferralStats | null>(null)
  const [loading, setLoading] = useState(true)

  // ── Fetch live stats via referral count (already server-read) + event counts
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        // Browser-side Supabase fetch for referral_events counts
        const { getBrowserClient } = await import('@/lib/supabase-browser')
        const sb = getBrowserClient()

        const [clickRes, signupRes, firstSaveRes] = await Promise.all([
          sb.from('referral_events').select('id', { count: 'exact', head: true })
            .eq('referrer_id', userId).eq('event_type', 'click'),
          sb.from('referral_events').select('id', { count: 'exact', head: true })
            .eq('referrer_id', userId).eq('event_type', 'signup'),
          sb.from('referral_events').select('id', { count: 'exact', head: true })
            .eq('referrer_id', userId).eq('event_type', 'first_save'),
        ])

        if (!cancelled) {
          setStats({
            totalClicks:     clickRes.count    ?? 0,
            totalSignups:    signupRes.count   ?? 0,
            totalFirstSaves: firstSaveRes.count ?? 0,
          })
        }
      } catch {
        if (!cancelled) setStats({ totalClicks: 0, totalSignups: 0, totalFirstSaves: 0 })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [userId])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(refLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback — select the input
    }
  }

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`I've been using GiftHint to share my wishlists — it's the easiest way to let people know what you actually want! Create yours free: ${refLink}`)}`
  const twitterUrl  = `https://twitter.com/intent/tweet?text=${encodeURIComponent(`Stop guessing, start gifting right 🎁\nCreate your GiftHint wishlist and share it with friends: ${refLink}`)}`

  return (
    <div style={{ fontFamily: tokens.font.sans, color: c.text }}>

      {/* ── Referral link card ──────────────────────────────────────────────── */}
      <div
        style={{
          background:   c.surface,
          borderRadius: r.xl,
          border:       `1px solid ${c.border}`,
          padding:      '24px',
          marginBottom: '20px',
        }}
      >
        <h3 style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: 700, color: c.text }}>
          Your referral link
        </h3>
        <p style={{ margin: '0 0 16px', fontSize: '12px', color: c.muted, lineHeight: 1.5 }}>
          Share this link. When someone signs up via it, you unlock rewards.
        </p>

        {/* Link box */}
        <div
          style={{
            display:      'flex',
            alignItems:   'center',
            gap:          '8px',
            background:   c.surface2,
            borderRadius: r.md,
            border:       `1px solid ${c.borderSoft}`,
            padding:      '10px 12px',
            marginBottom: '16px',
          }}
        >
          <span
            style={{
              flex:       1,
              fontSize:   '13px',
              color:      c.muted,
              overflow:   'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontFamily: tokens.font.mono,
            }}
          >
            {refLink}
          </span>
          <button
            onClick={handleCopy}
            style={{
              flexShrink:   0,
              background:   copied ? c.greenDim : c.purpleSoft,
              border:       `1px solid ${copied ? c.greenRing : c.purpleRing}`,
              borderRadius: r.sm,
              color:        copied ? c.green : c.purple,
              fontSize:     '12px',
              fontWeight:   600,
              padding:      '5px 12px',
              cursor:       'pointer',
              transition:   'all 150ms',
              whiteSpace:   'nowrap',
            }}
          >
            {copied ? '✓ Copied!' : 'Copy link'}
          </button>
        </div>

        {/* Share buttons */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display:        'inline-flex',
              alignItems:     'center',
              gap:            '6px',
              padding:        '8px 14px',
              borderRadius:   r.pill,
              background:     'rgba(37, 211, 102, 0.12)',
              border:         '1px solid rgba(37, 211, 102, 0.28)',
              color:          '#25D366',
              fontSize:       '12px',
              fontWeight:     600,
              textDecoration: 'none',
            }}
          >
            <span style={{ fontSize: '14px' }}>💬</span> WhatsApp
          </a>
          <a
            href={twitterUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display:        'inline-flex',
              alignItems:     'center',
              gap:            '6px',
              padding:        '8px 14px',
              borderRadius:   r.pill,
              background:     'rgba(29, 161, 242, 0.12)',
              border:         '1px solid rgba(29, 161, 242, 0.28)',
              color:          '#1DA1F2',
              fontSize:       '12px',
              fontWeight:     600,
              textDecoration: 'none',
            }}
          >
            <span style={{ fontSize: '14px' }}>𝕏</span> Tweet
          </a>
        </div>
      </div>

      {/* ── Stats ───────────────────────────────────────────────────────────── */}
      <div
        style={{
          display:      'flex',
          gap:          '10px',
          flexWrap:     'wrap',
          marginBottom: '20px',
        }}
      >
        {loading ? (
          [0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                flex:         '1 1 100px',
                height:       '72px',
                borderRadius: r.md,
                background:   c.surface2,
                border:       `1px solid ${c.border}`,
                animation:    'gh-pulse 1.6s ease-in-out infinite',
              }}
            />
          ))
        ) : (
          <>
            <StatPill label="Link clicks"   value={stats?.totalClicks     ?? 0} />
            <StatPill label="Signups"       value={stats?.totalSignups    ?? 0} />
            <StatPill label="First saves"   value={stats?.totalFirstSaves ?? 0} />
          </>
        )}
      </div>

      {/* ── Progress ────────────────────────────────────────────────────────── */}
      <div
        style={{
          background:   c.surface,
          borderRadius: r.xl,
          border:       `1px solid ${c.border}`,
          padding:      '20px 24px',
          marginBottom: '20px',
        }}
      >
        <h3 style={{ margin: '0 0 14px', fontSize: '14px', fontWeight: 700 }}>
          Your progress
        </h3>
        <ProgressBar referralCount={referralCount} />
      </div>

      {/* ── Rewards list ────────────────────────────────────────────────────── */}
      <div
        style={{
          background:   c.surface,
          borderRadius: r.xl,
          border:       `1px solid ${c.border}`,
          padding:      '20px 24px',
        }}
      >
        <h3 style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 700 }}>
          Rewards
        </h3>
        <p style={{ margin: '0 0 4px', fontSize: '12px', color: c.muted }}>
          Unlock features by referring friends to GiftHint.
        </p>
        <div>
          {REWARD_TIERS.map((tier) => (
            <RewardRow
              key={tier.minReferrals}
              badge={tier.badge}
              label={tier.label}
              description={tier.description}
              minReferrals={tier.minReferrals}
              referralCount={referralCount}
            />
          ))}
        </div>
      </div>

      <style>{`@keyframes gh-pulse{0%,100%{opacity:.6}50%{opacity:.3}}`}</style>
    </div>
  )
}
