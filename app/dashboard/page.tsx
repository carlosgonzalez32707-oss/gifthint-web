/**
 * app/dashboard/page.tsx — GiftHint
 *
 * Authenticated wisher dashboard.
 *
 * Auth flow:
 *   - Client-side only (no SSR auth available — no @supabase/ssr).
 *   - While loading → full-page skeleton.
 *   - Not authenticated → redirect to / (homepage handles sign-in).
 *   - Authenticated → loads wishlists + item/claimed counts.
 *
 * Data:
 *   Fetches wishlists from Supabase directly via the browser client
 *   (RLS: owner-select policy from migration 006).
 *   Item/claimed counts come from a single aggregate query.
 *
 * Actions:
 *   - Create new list → CreateListModal → optimistic prepend.
 *   - Update list     → via ListCard.onUpdated → patch in state.
 *   - Delete list     → via ListCard.onDeleted → filter from state.
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter }                        from 'next/navigation'
import { tokens }                           from '@/tokens'
import { useAuth }                          from '@/hooks/useAuth'
import { getBrowserClient }                 from '@/lib/supabase-browser'
import { ListCard }                         from '@/components/dashboard/ListCard'
import { CreateListModal }                  from '@/components/dashboard/CreateListModal'
import type { DbWishlist }                  from '@/lib/wishlists'

// ── Extended wishlist type with counts ────────────────────────────────────────

type WishlistWithCounts = DbWishlist & {
  item_count:    number
  claimed_count: number
}

// ── LoadingSkeleton ────────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div style={{ padding: '32px 24px', maxWidth: '900px', margin: '0 auto' }}>
      <div
        style={{
          width: '180px', height: '24px',
          borderRadius: tokens.radius.sm,
          background: tokens.colors.surface2,
          marginBottom: '32px',
        }}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              height: '180px',
              borderRadius: tokens.radius.lg,
              background: tokens.colors.surface,
              border: `1px solid ${tokens.colors.border}`,
              animation: 'gh-pulse 1.6s ease-in-out infinite',
            }}
          />
        ))}
      </div>
      <style>{`@keyframes gh-pulse{0%,100%{opacity:.6}50%{opacity:.3}}`}</style>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user, loading: authLoading, signOut } = useAuth()
  const router = useRouter()

  const [wishlists,   setWishlists]   = useState<WishlistWithCounts[]>([])
  const [fetching,    setFetching]    = useState(false)
  const [showModal,   setShowModal]   = useState(false)
  const [username,    setUsername]    = useState<string>('')

  // ── Auth guard — redirect to / when signed out ─────────────────────────────
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/')
    }
  }, [authLoading, user, router])

  // ── Load wishlists ─────────────────────────────────────────────────────────

  const loadWishlists = useCallback(async (userId: string) => {
    setFetching(true)
    const supabase = getBrowserClient()

    // Fetch all public + private lists the user owns
    const { data: lists, error: listErr } = await supabase
      .from('wishlists')
      .select('*')
      .eq('user_id', userId)
      .order('is_default', { ascending: false })
      .order('created_at',  { ascending: false })

    if (listErr || !lists) {
      console.error('[dashboard] wishlists fetch:', listErr)
      setFetching(false)
      return
    }

    // Aggregate item + claimed counts per wishlist in one query
    const { data: counts } = await supabase
      .from('wishlist_items')
      .select('wishlist_id, is_claimed')
      .eq('user_id', userId)

    const itemMap    = new Map<string, number>()
    const claimedMap = new Map<string, number>()

    for (const row of (counts ?? [])) {
      const wid = row.wishlist_id ?? '__default__'
      itemMap.set(wid, (itemMap.get(wid) ?? 0) + 1)
      if (row.is_claimed) {
        claimedMap.set(wid, (claimedMap.get(wid) ?? 0) + 1)
      }
    }

    const withCounts: WishlistWithCounts[] = lists.map((w) => ({
      ...w,
      item_count:    itemMap.get(w.id)    ?? 0,
      claimed_count: claimedMap.get(w.id) ?? 0,
    }))

    setWishlists(withCounts)
    setFetching(false)
  }, [])

  // Load username for "View as gifter" links
  useEffect(() => {
    if (!user) return
    const supabase = getBrowserClient()
    supabase
      .from('users')
      .select('public_username')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data?.public_username) setUsername(data.public_username)
      })
  }, [user])

  useEffect(() => {
    if (user) loadWishlists(user.id)
  }, [user, loadWishlists])

  // ── Auth states ────────────────────────────────────────────────────────────
  // Show skeleton while loading, or while the redirect to / is in flight.
  if (authLoading || !user) return <LoadingSkeleton />

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleCreated = (wishlist: DbWishlist) => {
    setShowModal(false)
    const withCounts: WishlistWithCounts = {
      ...wishlist,
      item_count:    0,
      claimed_count: 0,
    }
    setWishlists((prev) => [withCounts, ...prev])
  }

  const handleDeleted = (id: string) => {
    setWishlists((prev) => prev.filter((w) => w.id !== id))
  }

  const handleUpdated = (id: string, patch: Partial<DbWishlist>) => {
    setWishlists((prev) =>
      prev.map((w) => w.id === id ? { ...w, ...patch } : w)
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        minHeight:  '100vh',
        background: tokens.colors.bg,
        fontFamily: tokens.font.sans,
        color:      tokens.colors.text,
      }}
    >
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header
        style={{
          borderBottom: `1px solid ${tokens.colors.border}`,
          padding:      '0 24px',
          height:       '56px',
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'space-between',
          position:     'sticky',
          top:          0,
          zIndex:       10,
          background:   tokens.colors.bg,
        }}
      >
        <a
          href="/"
          style={{
            fontSize:       '15px',
            fontWeight:     800,
            color:          tokens.colors.text,
            textDecoration: 'none',
            letterSpacing:  '-0.03em',
          }}
        >
          🎁 GiftHint
        </a>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {username && (
            <a
              href={`/list/${username}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize:       '12px',
                color:          tokens.colors.muted,
                textDecoration: 'none',
              }}
            >
              View profile ↗
            </a>
          )}
          <button
            onClick={signOut}
            style={{
              background:   'transparent',
              border:       `1px solid ${tokens.colors.border}`,
              borderRadius: tokens.radius.pill,
              color:        tokens.colors.muted,
              fontSize:     '12px',
              padding:      '5px 12px',
              cursor:       'pointer',
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main style={{ padding: '32px 24px', maxWidth: '900px', margin: '0 auto' }}>

        {/* Page heading + Create button */}
        <div
          style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            flexWrap:       'wrap',
            gap:            '12px',
            marginBottom:   '28px',
          }}
        >
          <div>
            <h1
              style={{
                margin:        0,
                fontSize:      'clamp(20px, 4vw, 26px)',
                fontWeight:    800,
                color:         tokens.colors.text,
                letterSpacing: '-0.03em',
              }}
            >
              Your lists
            </h1>
            <p
              style={{
                margin:   '4px 0 0',
                fontSize: '13px',
                color:    tokens.colors.muted,
              }}
            >
              {wishlists.length === 0
                ? 'No lists yet — create your first one.'
                : `${wishlists.length} ${wishlists.length === 1 ? 'list' : 'lists'}`}
            </p>
          </div>

          <button
            onClick={() => setShowModal(true)}
            style={{
              display:        'inline-flex',
              alignItems:     'center',
              gap:            '7px',
              padding:        '10px 20px',
              borderRadius:   tokens.radius.pill,
              background:     tokens.colors.purple,
              border:         'none',
              color:          '#fff',
              fontSize:       '13px',
              fontWeight:     700,
              cursor:         'pointer',
              letterSpacing:  '-0.01em',
              boxShadow:      tokens.shadow.glow,
              transition:     'opacity 120ms ease',
            }}
          >
            ✨ New list
          </button>
        </div>

        {/* ── Lists grid ───────────────────────────────────────────────────── */}
        {fetching ? (
          <LoadingSkeleton />
        ) : wishlists.length === 0 ? (
          /* Empty state */
          <div
            style={{
              textAlign:    'center',
              padding:      '64px 24px',
              border:       `1px dashed ${tokens.colors.border}`,
              borderRadius: tokens.radius.xl,
            }}
          >
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🎁</div>
            <p style={{ color: tokens.colors.muted, fontSize: '14px', margin: 0 }}>
              Create your first list and share it with friends!
            </p>
          </div>
        ) : (
          <div
            style={{
              display:             'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap:                 '16px',
            }}
          >
            {wishlists.map((w) => (
              <ListCard
                key={w.id}
                wishlist={w}
                username={username}
                onUpdated={(patch) => handleUpdated(w.id, patch)}
                onDeleted={() => handleDeleted(w.id)}
              />
            ))}
          </div>
        )}
      </main>

      {/* ── Create modal ─────────────────────────────────────────────────── */}
      {showModal && user && (
        <CreateListModal
          userId={user.id}
          onCreated={handleCreated}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}
