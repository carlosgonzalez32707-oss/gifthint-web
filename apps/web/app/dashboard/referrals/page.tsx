/**
 * app/dashboard/referrals/page.tsx — GiftHint
 *
 * Full referral dashboard for the authenticated user.
 *
 * Sections:
 *   1. ReferralPanel       — link, stats, progress, rewards
 *   2. CustomUsernameEditor — visible when custom_username_enabled = true
 *   3. Referral history table — anonymised list of referred users + activity
 *
 * Auth: client-side via useAuth() — redirects to / when signed out.
 * Data: browser Supabase client (RLS restricts rows to current user).
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter }                        from 'next/navigation'
import { tokens }                           from '@/tokens'
import { useAuth }                          from '@/hooks/useAuth'
import { getBrowserClient }                 from '@/lib/supabase-browser'
import { ReferralPanel }                    from '@/components/dashboard/ReferralPanel'
import { CustomUsernameEditor }             from '@/components/dashboard/CustomUsernameEditor'
import type { UserRewardState }             from '@/lib/rewards'

// ── Types ──────────────────────────────────────────────────────────────────────

interface UserRow {
  referral_code:            string
  referred_by:              string | null
  referral_count:           number
  public_username:          string | null
  custom_username_enabled:  boolean
  premium_themes_enabled:   boolean
  priority_support_enabled: boolean
  premium_tier:             string
}

interface ReferralEventRow {
  id:           string
  referee_id:   string | null
  event_type:   string
  created_at:   string
  metadata:     Record<string, unknown>
}

interface RefereeActivity {
  refereeId:    string
  signedUpAt:   string
  itemsSaved:   number
  buysClicked:  number
}

// ── Design tokens ─────────────────────────────────────────────────────────────

const c = tokens.colors
const r = tokens.radius

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const days  = Math.floor(diff / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7)  return `${days} days ago`
  if (days < 30) return `${Math.floor(days / 7)} week${Math.floor(days / 7) > 1 ? 's' : ''} ago`
  return `${Math.floor(days / 30)} month${Math.floor(days / 30) > 1 ? 's' : ''} ago`
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div style={{ padding: '32px 24px', maxWidth: '760px', margin: '0 auto' }}>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            height: '120px', borderRadius: r.xl,
            background: c.surface, border: `1px solid ${c.border}`,
            marginBottom: '16px', animation: 'gh-pulse 1.6s ease-in-out infinite',
          }}
        />
      ))}
      <style>{`@keyframes gh-pulse{0%,100%{opacity:.6}50%{opacity:.3}}`}</style>
    </div>
  )
}

// ── History table ─────────────────────────────────────────────────────────────

function HistoryTable({ rows }: { rows: RefereeActivity[] }) {
  if (rows.length === 0) {
    return (
      <div
        style={{
          padding:    '32px',
          textAlign:  'center',
          color:      c.muted,
          fontSize:   '13px',
          background: c.surface,
          borderRadius: r.xl,
          border:     `1px solid ${c.border}`,
        }}
      >
        No referral signups yet. Share your link to see your first entry here.
      </div>
    )
  }

  return (
    <div
      style={{
        background:   c.surface,
        borderRadius: r.xl,
        border:       `1px solid ${c.border}`,
        overflow:     'hidden',
      }}
    >
      {/* Header row */}
      <div
        style={{
          display:     'grid',
          gridTemplateColumns: '1fr 140px 100px 110px',
          gap:         '0 16px',
          padding:     '12px 20px',
          borderBottom: `1px solid ${c.border}`,
          fontSize:    '11px',
          fontWeight:  600,
          color:       c.muted,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        <span>User</span>
        <span>Joined</span>
        <span>Items saved</span>
        <span>Buy clicks</span>
      </div>

      {/* Data rows */}
      {rows.map((row, i) => (
        <div
          key={row.refereeId}
          style={{
            display:     'grid',
            gridTemplateColumns: '1fr 140px 100px 110px',
            gap:         '0 16px',
            padding:     '14px 20px',
            borderBottom: i < rows.length - 1 ? `1px solid ${c.border}` : 'none',
            alignItems:  'center',
          }}
        >
          {/* Anonymised user */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width:          '32px',
                height:         '32px',
                borderRadius:   r.pill,
                background:     c.purpleDim,
                border:         `1px solid ${c.purpleRing}`,
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                fontSize:       '14px',
                flexShrink:     0,
              }}
            >
              👤
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: c.text }}>
                Anonymous user
              </div>
              <div style={{ fontSize: '11px', color: c.muted }}>
                #{row.refereeId.slice(-6)}
              </div>
            </div>
          </div>

          {/* Joined */}
          <div style={{ fontSize: '13px', color: c.muted }}>
            {timeAgo(row.signedUpAt)}
          </div>

          {/* Items saved */}
          <div style={{ fontSize: '13px', color: row.itemsSaved > 0 ? c.green : c.muted }}>
            {row.itemsSaved > 0 ? `${row.itemsSaved} items` : '—'}
          </div>

          {/* Buy clicks */}
          <div style={{ fontSize: '13px', color: row.buysClicked > 0 ? c.amber : c.muted }}>
            {row.buysClicked > 0 ? `${row.buysClicked} clicks` : '—'}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ReferralsPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  const [dbUser,    setDbUser]    = useState<UserRow | null>(null)
  const [history,   setHistory]   = useState<RefereeActivity[]>([])
  const [fetching,  setFetching]  = useState(true)
  const [username,  setUsername]  = useState<string | null>(null)

  // Auth guard
  useEffect(() => {
    if (!authLoading && !user) router.replace('/')
  }, [authLoading, user, router])

  const load = useCallback(async (userId: string) => {
    setFetching(true)
    const sb = getBrowserClient()

    // 1. Fetch user's referral fields + reward flags
    // Use maybeSingle() so TypeScript gives us a nullable row (not a
    // GenericStringError union) — safe to narrow with a plain null check.
    const { data: userData } = await sb
      .from('users')
      .select([
        'referral_code', 'referred_by', 'referral_count', 'public_username',
        'custom_username_enabled', 'premium_themes_enabled',
        'priority_support_enabled', 'premium_tier',
      ].join(', '))
      .eq('id', userId)
      .maybeSingle()

    if (!userData) {
      setFetching(false)
      return
    }

    setDbUser(userData as unknown as UserRow)
    setUsername((userData as unknown as UserRow).public_username)

    // 2. Fetch signup referral events (limited to 50 most recent)
    const { data: events } = await sb
      .from('referral_events')
      .select('id, referee_id, event_type, created_at, metadata')
      .eq('referrer_id', userId)
      .eq('event_type', 'signup')
      .order('created_at', { ascending: false })
      .limit(50)

    if (!events || events.length === 0) {
      setHistory([])
      setFetching(false)
      return
    }

    // 3. For each referee, fetch their item saved count + buy-click count
    const refereeIds = Array.from(
      new Set((events as ReferralEventRow[]).map((e) => e.referee_id).filter(Boolean))
    ) as string[]

    // Parallel: items saved + buy clicks per referee
    const [itemsResult, clicksResult] = await Promise.all([
      sb
        .from('wishlist_items')
        .select('user_id')
        .in('user_id', refereeIds),
      sb
        .from('referral_events')
        .select('referrer_id, event_type')
        .in('referrer_id', refereeIds)
        .eq('event_type', 'first_save'),
    ])

    // Count items per user
    const itemCounts = new Map<string, number>()
    for (const row of (itemsResult.data ?? [])) {
      const uid = row.user_id as string
      itemCounts.set(uid, (itemCounts.get(uid) ?? 0) + 1)
    }

    // For buy-click counts, read from track_click events if that table exists,
    // otherwise fall back to 0 (graceful degradation)
    const buyCounts = new Map<string, number>()
    // We use a separate query if the table exists — silently skip on error.
    try {
      const { data: clicks } = await sb
        .from('click_events')
        .select('user_id')
        .in('user_id', refereeIds)

      for (const row of (clicks ?? [])) {
        const uid = row.user_id as string
        buyCounts.set(uid, (buyCounts.get(uid) ?? 0) + 1)
      }
    } catch {
      // click_events table may not exist — silently ignore
    }

    const signupEventByReferee = new Map<string, string>()
    for (const e of (events as ReferralEventRow[])) {
      if (e.referee_id && !signupEventByReferee.has(e.referee_id)) {
        signupEventByReferee.set(e.referee_id, e.created_at)
      }
    }

    const activityRows: RefereeActivity[] = refereeIds.map((rid) => ({
      refereeId:   rid,
      signedUpAt:  signupEventByReferee.get(rid) ?? '',
      itemsSaved:  itemCounts.get(rid)  ?? 0,
      buysClicked: buyCounts.get(rid)   ?? 0,
    }))

    activityRows.sort((a, b) =>
      new Date(b.signedUpAt).getTime() - new Date(a.signedUpAt).getTime()
    )

    setHistory(activityRows)
    setFetching(false)
  }, [])

  useEffect(() => {
    if (user) load(user.id)
  }, [user, load])

  if (authLoading || !user || fetching || !dbUser) return <Skeleton />

  const rewards: UserRewardState = {
    referralCount:           dbUser.referral_count,
    premiumTier:             dbUser.premium_tier as UserRewardState['premiumTier'],
    customUsernameEnabled:   dbUser.custom_username_enabled,
    premiumThemesEnabled:    dbUser.premium_themes_enabled,
    prioritySupportEnabled:  dbUser.priority_support_enabled,
  }

  return (
    <div
      style={{
        minHeight:  '100vh',
        background: c.bg,
        fontFamily: tokens.font.sans,
        color:      c.text,
      }}
    >
      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <header
        style={{
          borderBottom:   `1px solid ${c.border}`,
          padding:        '0 24px',
          height:         '56px',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          position:       'sticky',
          top:            0,
          zIndex:         10,
          background:     c.bg,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <a
            href="/dashboard"
            style={{ fontSize: '13px', color: c.muted, textDecoration: 'none' }}
          >
            ← Dashboard
          </a>
          <span style={{ color: c.border }}>|</span>
          <span style={{ fontSize: '15px', fontWeight: 800, letterSpacing: '-0.03em' }}>
            🔗 Referrals
          </span>
        </div>

        {dbUser.premium_tier !== 'free' && (
          <span
            style={{
              fontSize:     '11px',
              fontWeight:   700,
              padding:      '3px 10px',
              borderRadius: r.pill,
              background:   dbUser.premium_tier === 'pro' ? c.amberDim : c.purpleDim,
              color:        dbUser.premium_tier === 'pro' ? c.amber : c.purple,
              border:       `1px solid ${dbUser.premium_tier === 'pro' ? c.amberRing : c.purpleRing}`,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            {dbUser.premium_tier === 'pro' ? '⭐ Pro' : '✨ Plus'}
          </span>
        )}
      </header>

      {/* ── Main ─────────────────────────────────────────────────────────────── */}
      <main
        style={{
          padding:   '32px 24px',
          maxWidth:  '760px',
          margin:    '0 auto',
        }}
      >
        {/* Page heading */}
        <div style={{ marginBottom: '28px' }}>
          <h1
            style={{
              margin:        0,
              fontSize:      'clamp(20px, 4vw, 26px)',
              fontWeight:    800,
              letterSpacing: '-0.03em',
              color:         c.text,
            }}
          >
            Referrals
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: '13px', color: c.muted }}>
            Invite friends and unlock premium features as they join.
          </p>
        </div>

        {/* Referral panel */}
        <ReferralPanel
          userId={user.id}
          referralCode={dbUser.referral_code}
          referralCount={dbUser.referral_count}
          rewards={rewards}
        />

        {/* Custom username editor */}
        <div style={{ marginTop: '20px' }}>
          <CustomUsernameEditor
            userId={user.id}
            currentUsername={username}
            unlocked={dbUser.custom_username_enabled}
            onUpdated={(newName) => setUsername(newName)}
          />
        </div>

        {/* History */}
        <div style={{ marginTop: '32px' }}>
          <div
            style={{
              display:        'flex',
              alignItems:     'baseline',
              justifyContent: 'space-between',
              marginBottom:   '14px',
            }}
          >
            <h2
              style={{
                margin:        0,
                fontSize:      '16px',
                fontWeight:    700,
                letterSpacing: '-0.02em',
                color:         c.text,
              }}
            >
              Referral history
            </h2>
            {history.length > 0 && (
              <span style={{ fontSize: '12px', color: c.muted }}>
                {history.length} signup{history.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <HistoryTable rows={history} />
        </div>
      </main>
    </div>
  )
}
