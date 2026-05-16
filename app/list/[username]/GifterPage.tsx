/**
 * app/list/[username]/GifterPage.tsx — GiftHint public gifter page (client)
 *
 * Sections:
 *   CtaBar         — sticky viral top bar ("create your own list →")
 *   HeroSection    — avatar, name, item count, share link copy button
 *   FilterBar      — DNA tag chips for client-side filtering
 *   GiftGrid       — responsive grid of GiftCard components
 *   GiftCard       — individual item with inline claim flow
 *   ReminderSignup — email capture for "notify me when new gifts are added"
 *   Footer         — branding + CTA
 *
 * All Supabase mutations (claim) happen here via the browser anon client.
 * Reads were done server-side in page.tsx (service role key, never in browser).
 */

'use client'

import { useState, useMemo, useCallback, lazy, Suspense } from 'react'
import Image                              from 'next/image'
import { createClient }                   from '@supabase/supabase-js'
import { tokens }                         from '@/tokens'
import { trackBuyClick,
         inferAffiliateNetwork }          from '@/lib/analytics'
import { useRealtimeClaims }              from '@/hooks/useRealtimeClaims'
import { OccasionHero }                   from '@/components/OccasionHero'
import { GifterFooter }                   from '@/components/GifterFooter'
import { ViralCTABar }                    from '@/components/ViralCTABar'
import { OccasionThemeProvider }          from '@/components/OccasionThemeContext'
import { getOccasionTheme }               from '@/lib/occasion-themes'
import { AlternativeGiftPanel }           from '@/components/AlternativeGiftPanel'
import { DNA_TAG_TOOLTIPS }               from '@/lib/dna-tags'
import { generateAlternativeGuidance }    from '@/lib/alternative-guidance'
import type { DbWishlist }               from '@/lib/supabase-server'
import type { WishUser, WishItem }        from './page'

// ── Lazy-loaded below-fold components ─────────────────────────────────────────
// Code-splitting these keeps the initial JS bundle tight and lets the gift grid
// paint before the WebSocket panel and email signup are even downloaded.
const ReminderSignup = lazy(() =>
  import('@/components/ReminderSignup').then((m) => ({ default: m.ReminderSignup }))
)
const GifterCoordinationPanel = lazy(() =>
  import('@/components/GifterCoordinationPanel').then((m) => ({ default: m.GifterCoordinationPanel }))
)

// ── Product image blur placeholder ────────────────────────────────────────────
// 10×10 SVG filled with the app's surface2 colour (#1C1C22).
// Used as the blur-up base while next/image fetches the real product photo.
const PRODUCT_BLUR_PLACEHOLDER =
  'data:image/svg+xml;base64,' +
  'PHN2ZyB3aWR0aD0iMTAiIGhlaWdodD0iMTAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+' +
  'PHJlY3Qgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBmaWxsPSIjMUMxQzIyIi8+PC9zdmc+'

// ── Browser Supabase client (anon key — safe to expose) ───────────────────────
// Only used for claim mutations; reads are handled server-side in page.tsx.
const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

// ── Types ─────────────────────────────────────────────────────────────────────

type GifterPageProps = {
  user:      WishUser
  items:     WishItem[]
  /** Present when rendered from /list/[username]/[slug]; absent from legacy routes. */
  wishlist?: DbWishlist
}

// ── Root component ────────────────────────────────────────────────────────────

export default function GifterPage({ user, items: initialItems, wishlist }: GifterPageProps) {
  // Optimistic claim updates live here — items prop is server-rendered initial state
  const [items, setItems] = useState<WishItem[]>(initialItems)
  const [activeTag, setActiveTag] = useState<string | null>(null)

  const name    = user.display_name?.split(' ')[0] ?? user.public_username ?? 'Someone'
  const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? 'https://gifthint.io'
  // When serving from a slug route, link directly to that list; fall back to profile
  const listUrl = wishlist
    ? `${appUrl}/list/${user.public_username}/${wishlist.slug}`
    : `${appUrl}/list/${user.public_username}`

  // ── Realtime claimed state ─────────────────────────────────────────────────
  // Seed with IDs already claimed in the server render so the hook never
  // triggers false flash notifications for pre-existing claimed items.
  const initialClaimed = useMemo<ReadonlySet<string>>(
    () => new Set(initialItems.filter((i) => i.is_claimed).map((i) => i.id)),
    // Only recompute when the initial server data changes (i.e. full page reload)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const { claimedItemIds, newlyClaimedId } = useRealtimeClaims(
    user.id,
    user.public_username ?? '',
    initialClaimed,
  )

  // Merge server-fetched claimed state with live realtime updates.
  // An item is claimed if the DB said so at render time OR a live event arrived.
  const effectiveItems = useMemo<WishItem[]>(
    () =>
      items.map((item) =>
        !item.is_claimed && claimedItemIds.has(item.id)
          ? { ...item, is_claimed: true, claimed_by: null, claimed_anonymous: true, claimed_at: new Date().toISOString() }
          : item,
      ),
    [items, claimedItemIds],
  )

  // Collect every unique DNA tag across all items for the filter bar
  const allTags = useMemo<string[]>(() => {
    const seen = new Set<string>()
    effectiveItems.forEach((item) => item.dna_tags.forEach((t) => seen.add(t)))
    return Array.from(seen)
  }, [effectiveItems])

  // Apply tag filter client-side — no re-fetch needed
  const visibleItems = useMemo<WishItem[]>(() => {
    if (!activeTag) return effectiveItems
    return effectiveItems.filter((item) => item.dna_tags.includes(activeTag))
  }, [effectiveItems, activeTag])

  // Called by GiftCard after user confirms claim
  async function handleClaim(
    itemId:    string,
    claimedBy: string,
    anonymous: boolean,
  ): Promise<void> {
    const { error } = await supabaseBrowser
      .from('wishlist_items')
      .update({
        is_claimed:        true,
        claimed_by:        anonymous ? null : claimedBy || null,
        claimed_anonymous: anonymous,
        claimed_at:        new Date().toISOString(),
      })
      .eq('id', itemId)

    if (error) {
      console.error('[GiftHint] claim error:', error.message)
      return
    }

    // Optimistic UI update — reflect the change without re-fetching
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? {
              ...item,
              is_claimed:        true,
              claimed_by:        anonymous ? null : claimedBy || null,
              claimed_anonymous: anonymous,
              claimed_at:        new Date().toISOString(),
            }
          : item,
      ),
    )
  }

  // Called by GiftCard when gifter's name matches the stored claimed_by
  async function handleUnclaim(itemId: string, claimedBy: string): Promise<'ok' | 'mismatch' | 'error'> {
    try {
      const res = await fetch(`/api/claim/${itemId}`, {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ claimedBy }),
      })

      if (res.status === 403) return 'mismatch'
      if (!res.ok)            return 'error'

      // Optimistic reset — bring the card back to unclaimed state
      setItems((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? {
                ...item,
                is_claimed:        false,
                claimed_by:        null,
                claimed_anonymous: false,
                claimed_at:        null,
              }
            : item,
        ),
      )

      return 'ok'
    } catch {
      return 'error'
    }
  }

  // Resolve the theme once at the top level — all descendants share it via context
  const theme = getOccasionTheme(wishlist?.occasion ?? 'other')

  return (
    <OccasionThemeProvider theme={theme}>
      <div
        style={{
          background:  tokens.colors.bg,
          color:       tokens.colors.text,
          minHeight:   '100vh',
          fontFamily:  tokens.font.sans,
        }}
      >
        {/* ViralCTABar reads accent colour from OccasionThemeContext */}
        <ViralCTABar username={user.public_username ?? ''} />

        <main className="max-w-4xl mx-auto">
          {/* OccasionHero replaces the inline HeroSection — reads theme from context */}
          <OccasionHero
            user={user}
            wishlist={wishlist}
            itemCount={items.length}
            listUrl={listUrl}
          />

          {allTags.length > 0 && (
            <FilterBar
              tags={allTags}
              activeTag={activeTag}
              onTagChange={setActiveTag}
            />
          )}

          <GiftGrid
            items={visibleItems}
            allItems={effectiveItems}
            name={name}
            activeTag={activeTag}
            onClearFilter={() => setActiveTag(null)}
            onClaim={handleClaim}
            onUnclaim={handleUnclaim}
            wisherUserId={user.id}
            gifterPageUsername={user.public_username ?? ''}
            newlyClaimedId={newlyClaimedId}
          />

          {/* ReminderSignup is below the fold — load lazily after the gift grid paints */}
          <Suspense fallback={null}>
            <ReminderSignup
              wisherUsername={user.public_username ?? ''}
              wisherName={name}
            />
          </Suspense>

          {/*
            GifterCoordinationPanel opens a realtime claims feed on first expand.
            Lazy-loading keeps its WebSocket setup out of the critical path so the
            gift grid renders immediately from the server-fetched data.
          */}
          <Suspense fallback={null}>
            <GifterCoordinationPanel
              username={user.public_username ?? ''}
              claimedCount={effectiveItems.filter((i) => i.is_claimed).length}
            />
          </Suspense>
        </main>

        {/* GifterFooter reads accent colour from OccasionThemeContext */}
        <GifterFooter />
      </div>
    </OccasionThemeProvider>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// FilterBar
// ─────────────────────────────────────────────────────────────────────────────

function FilterBar({
  tags,
  activeTag,
  onTagChange,
}: {
  tags:        string[]
  activeTag:   string | null
  onTagChange: (tag: string | null) => void
}) {
  return (
    <div
      className="flex gap-2 px-4 pb-8 overflow-x-auto flex-wrap justify-center"
      // overflow-x-auto for mobile; flex-wrap falls back on wider viewports
    >
      <TagPill
        label="All gifts"
        active={activeTag === null}
        onClick={() => onTagChange(null)}
      />
      {tags.map((tag) => (
        <TagPill
          key={tag}
          label={tag}
          active={activeTag === tag}
          onClick={() => onTagChange(activeTag === tag ? null : tag)}
        />
      ))}
    </div>
  )
}

function TagPill({
  label,
  active,
  onClick,
}: {
  label:   string
  active:  boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all"
      style={{
        background: active ? tokens.colors.purple : tokens.colors.purpleDim,
        border:     `1px solid ${active ? tokens.colors.purple : tokens.colors.purpleRing}`,
        color:      active ? '#fff'               : tokens.colors.purple,
      }}
    >
      {label}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// GiftGrid
// ─────────────────────────────────────────────────────────────────────────────

function GiftGrid({
  items,
  allItems,
  name,
  activeTag,
  onClearFilter,
  onClaim,
  onUnclaim,
  wisherUserId,
  gifterPageUsername,
  newlyClaimedId,
}: {
  items:              WishItem[]
  allItems:           WishItem[]
  name:               string
  activeTag:          string | null
  onClearFilter:      () => void
  onClaim:            (id: string, name: string, anon: boolean) => Promise<void>
  onUnclaim:          (itemId: string, claimedBy: string) => Promise<'ok' | 'mismatch' | 'error'>
  wisherUserId:       string
  gifterPageUsername: string
  /** ID of item claimed in the last 3 s — triggers flash notification on that card */
  newlyClaimedId:     string | null
}) {
  // ── Empty state: list owner has no items at all ───────────────────────────
  if (allItems.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 px-4 text-center">
        <span className="select-none" style={{ fontSize: 52, lineHeight: 1 }} aria-hidden="true">🎁</span>
        <p className="font-semibold text-base" style={{ color: tokens.colors.text }}>
          {name} hasn&apos;t added anything yet
        </p>
        <p className="text-sm" style={{ color: tokens.colors.muted }}>
          Check back soon — their wishlist is on its way!
        </p>
      </div>
    )
  }

  // ── Empty state: filter returns zero results ───────────────────────────────
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 px-4 text-center" role="status" aria-live="polite">
        <span className="select-none" style={{ fontSize: 44, lineHeight: 1 }} aria-hidden="true">🔍</span>
        <p className="font-semibold text-sm" style={{ color: tokens.colors.text }}>
          No items match this filter
        </p>
        {activeTag && (
          <button
            onClick={onClearFilter}
            className="mt-1 px-4 py-2 rounded-full text-xs font-semibold transition-opacity hover:opacity-80"
            style={{
              background: tokens.colors.surface2,
              border:     `1px solid ${tokens.colors.border}`,
              color:      tokens.colors.muted,
            }}
          >
            Clear filter
          </button>
        )}
      </div>
    )
  }

  // ── Empty state: every item is claimed ────────────────────────────────────
  const allClaimed = items.every((i) => i.is_claimed)
  if (allClaimed) {
    return (
      <>
        {/* Still render the cards — but show a banner above the grid */}
        <div
          className="mx-4 mb-6 px-5 py-4 rounded-2xl text-center"
          style={{
            background: tokens.colors.greenDim,
            border:     `1px solid ${tokens.colors.greenRing}`,
          }}
        >
          <p className="text-sm font-bold" style={{ color: tokens.colors.green }}>
            🎉 Everything&apos;s been claimed — {name} is lucky!
          </p>
          <p className="text-xs mt-1" style={{ color: tokens.colors.green, opacity: 0.75 }}>
            All gifts on this list have been spoken for.
          </p>
        </div>
        <section className="px-4 pb-16">
          <div
            style={{
              display:             'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap:                 '12px',
            }}
          >
            {items.map((item, index) => (
              <GiftCard
                key={item.id}
                item={item}
                index={index}
                onClaim={onClaim}
                onUnclaim={onUnclaim}
                wisherUserId={wisherUserId}
                gifterPageUsername={gifterPageUsername}
                wisherFirstName={name}
                justClaimed={item.id === newlyClaimedId}
              />
            ))}
          </div>
        </section>
      </>
    )
  }

  // ── Normal grid ───────────────────────────────────────────────────────────
  return (
    <section className="px-4 pb-16">
      {/*
        auto-fill grid: 160 px min-width = 2 cols on iPhone SE (375 px with padding).
        Naturally scales to 3 cols on tablet, 4+ on wide desktop.
      */}
      <div
        style={{
          display:             'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap:                 '12px',
        }}
      >
        {items.map((item, index) => (
          <GiftCard
            key={item.id}
            item={item}
            index={index}
            onClaim={onClaim}
            onUnclaim={onUnclaim}
            wisherUserId={wisherUserId}
            gifterPageUsername={gifterPageUsername}
            justClaimed={item.id === newlyClaimedId}
          />
        ))}
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// GiftCard
// ─────────────────────────────────────────────────────────────────────────────

function GiftCard({
  item,
  index = 0,
  onClaim,
  onUnclaim,
  wisherUserId,
  gifterPageUsername,
  wisherFirstName,
  justClaimed = false,
}: {
  item:               WishItem
  /** Grid position — used to set priority on above-fold images (index < 2) */
  index?:             number
  onClaim:            (id: string, name: string, anon: boolean) => Promise<void>
  onUnclaim:          (itemId: string, claimedBy: string) => Promise<'ok' | 'mismatch' | 'error'>
  wisherUserId:       string
  gifterPageUsername: string
  /** First name of the list owner — forwarded to AlternativeGiftPanel */
  wisherFirstName?:   string
  /** True for ~3 s when this item was claimed by someone else in real-time */
  justClaimed?:       boolean
}) {
  const [claiming,     setClaiming]     = useState(false)
  const [claimName,    setClaimName]    = useState('')
  const [anonymous,    setAnonymous]    = useState(false)
  const [submitting,   setSubmitting]   = useState(false)
  const [unclaiming,   setUnclaiming]   = useState(false)
  const [unclaimError, setUnclaimError] = useState<string | null>(null)

  // Fire-and-forget click tracking when gifter taps "I'll buy this"
  const handleBuyClick = useCallback(() => {
    const buyUrl = item.affiliate_url ?? item.source_url
    trackBuyClick({
      itemId:             item.id,
      wisherUserId,
      retailer:           item.retailer ?? 'unknown',
      affiliateNetwork:   inferAffiliateNetwork(buyUrl),
      gifterPageUsername,
    })
  }, [item.id, item.retailer, item.affiliate_url, item.source_url,
      wisherUserId, gifterPageUsername])

  async function submitClaim() {
    setSubmitting(true)
    await onClaim(item.id, claimName.trim(), anonymous)
    setSubmitting(false)
    setClaiming(false)
  }

  // Gifter can unclaim if they enter the same name they used when claiming.
  // The check is done server-side (403 on mismatch); client shows inline error.
  async function submitUnclaim() {
    if (!claimName.trim()) return
    setUnclaiming(true)
    setUnclaimError(null)
    const result = await onUnclaim(item.id, claimName.trim())
    setUnclaiming(false)
    if (result === 'mismatch') {
      setUnclaimError("Name doesn't match — only the person who claimed this can unclaim it.")
    } else if (result === 'error') {
      setUnclaimError('Something went wrong. Please try again.')
    } else {
      // 'ok' — item is unclaimed; reset form
      setClaiming(false)
      setClaimName('')
    }
  }

  const hasTags = Array.isArray(item.dna_tags) && item.dna_tags.length > 0
  // Guidance for unclaimed items — tells the gifter what kind of alternative to look for
  const guidance = !item.is_claimed && hasTags ? generateAlternativeGuidance(item) : null

  // True when the typed name matches the stored claimed_by (case-insensitive).
  // Used to decide whether to offer the unclaim button in the claim form.
  const nameMatchesClaim =
    item.is_claimed &&
    !item.claimed_anonymous &&
    !!item.claimed_by &&
    !!claimName.trim() &&
    claimName.trim().toLowerCase() === item.claimed_by.trim().toLowerCase()

  // Claimed attribution line: "Alex is getting this" / "Someone is getting this"
  const claimedLabel = item.claimed_anonymous || !item.claimed_by
    ? 'Someone is getting this 🎉'
    : `${item.claimed_by} is getting this 🎉`

  return (
    <article
      className="flex flex-col rounded-2xl overflow-hidden"
      style={{
        background: tokens.colors.surface,
        border:     `1px solid ${tokens.colors.border}`,
        boxShadow:  tokens.shadow.card,
      }}
    >
      {/* ── Product image ──────────────────────────────────────────────── */}
      {/*
        Transition: 400 ms on filter + opacity so a real-time claimed event
        fades the card to greyscale smoothly rather than snapping instantly.
      */}
      <div
        className="relative w-full aspect-square flex items-center justify-center text-5xl select-none"
        style={{
          background:  tokens.colors.surface2,
          transition:  'filter 400ms ease, opacity 400ms ease',
          filter:      item.is_claimed ? 'grayscale(1)' : 'grayscale(0)',
          opacity:     item.is_claimed ? 0.55 : 1,
        }}
      >
        {item.image_url ? (
          /*
           * next/image with fill covers the aspect-square container.
           * sizes matches the grid: 2 cols on mobile → ~50vw, 3 on tablet,
           * capped at 220 px on wide viewports (max-w-4xl layout).
           * First 2 cards (above the fold) get priority — no lazy-load attr.
           * All others use the default lazy loading.
           * placeholder="blur" fades in from the surface2 SVG while the real
           * image fetches, preventing layout shift.
           */
          <Image
            src={item.image_url}
            alt={item.title}
            fill
            sizes="(max-width: 640px) calc(50vw - 24px), (max-width: 1024px) calc(33vw - 20px), 220px"
            className="object-cover"
            priority={index < 2}
            placeholder="blur"
            blurDataURL={PRODUCT_BLUR_PLACEHOLDER}
          />
        ) : (
          '🎁'
        )}

        {/* Claimed overlay — appears when is_claimed is true */}
        {item.is_claimed && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.60)' }}
          >
            <span
              className="px-4 py-2 rounded-full text-sm font-bold"
              style={{
                background: tokens.colors.green,
                color:      '#0a1a12',
              }}
            >
              ✓ Claimed
            </span>
          </div>
        )}

        {/*
          Flash notification — visible for 3 s when a Realtime event arrives
          for this specific card. Positioned at bottom of the image so it
          doesn't block the "✓ Claimed" overlay above.
        */}
        {justClaimed && (
          <div
            aria-live="polite"
            aria-atomic="true"
            style={{
              // Absolutely positioned inside the image container
              position:     'absolute',
              bottom:       '8px',
              left:         '50%',
              transform:    'translateX(-50%)',
              // Green pill matching the design system
              background:   tokens.colors.green,
              color:        '#0a1a12',
              fontSize:     '11px',
              fontWeight:   700,
              padding:      '4px 12px',
              borderRadius: '999px',
              whiteSpace:   'nowrap',
              // Animate in from below
              animation:    'gifthint-flash-in 200ms ease forwards',
              // Keep above the claimed overlay if both are visible
              zIndex:       10,
              pointerEvents: 'none',
            }}
          >
            Just claimed by someone 🎉
          </div>
        )}

        {/* Retailer badge */}
        {item.retailer && (
          <span
            className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full text-xs font-medium"
            style={{
              background: 'rgba(12,12,14,0.80)',
              color:      tokens.colors.muted,
              backdropFilter: 'blur(4px)',
            }}
          >
            {item.retailer}
          </span>
        )}
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2.5 p-4 flex-1">

        {/* Title */}
        <a
          href={item.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold leading-snug line-clamp-2 hover:underline"
          style={{ color: tokens.colors.text }}
        >
          {item.title}
        </a>

        {/* Price */}
        {item.price != null && (
          <span className="text-base font-bold" style={{ color: tokens.colors.green }}>
            {item.currency === 'USD' ? '$' : item.currency + ' '}
            {Number(item.price).toFixed(2)}
          </span>
        )}

        {/* Hint */}
        {item.hint && (
          <p
            className="text-xs leading-relaxed px-2.5 py-2 rounded-lg"
            style={{
              background: tokens.colors.surface2,
              color:      tokens.colors.muted,
            }}
          >
            💡 <em>{item.hint}</em>
          </p>
        )}

        {/* DNA tags — with native browser tooltip on hover */}
        {hasTags && (
          <div className="flex gap-1.5 flex-wrap">
            {item.dna_tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                title={DNA_TAG_TOOLTIPS[tag]}
                className="text-xs px-2 py-0.5 rounded-full font-semibold"
                style={{
                  background: tokens.colors.purpleDim,
                  border:     `1px solid ${tokens.colors.purpleRing}`,
                  color:      tokens.colors.purple,
                  cursor:     DNA_TAG_TOOLTIPS[tag] ? 'default' : undefined,
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Gifting tips — inline guidance for unclaimed items with actionable DNA tags */}
        {guidance && (
          <p
            className="text-xs leading-relaxed px-2.5 py-2 rounded-lg"
            style={{
              background: tokens.colors.purpleDim,
              border:     `1px solid ${tokens.colors.purpleRing}`,
              color:      tokens.colors.purple,
            }}
          >
            💡 {guidance}
          </p>
        )}

        {/* Spacer — pushes action to bottom */}
        <div className="flex-1" />

        {/* ── Action area ─────────────────────────────────────────────── */}
        {item.is_claimed ? (
          /* Already claimed */
          <div className="flex flex-col gap-1">
            <div
              className="w-full py-2.5 px-3 rounded-xl text-xs font-semibold text-center"
              style={{
                background: tokens.colors.greenDim,
                border:     `1px solid ${tokens.colors.greenRing}`,
                color:      tokens.colors.green,
              }}
            >
              {claimedLabel}
            </div>

            {/* Alternative gift panel — only when item has DNA preference tags */}
            {hasTags && (
              <AlternativeGiftPanel
                item={item}
                wisherFirstName={wisherFirstName}
              />
            )}
          </div>

        ) : claiming ? (
          /* Inline claim form */
          <div
            className="flex flex-col gap-2 rounded-xl p-3"
            style={{
              background: tokens.colors.surface2,
              border:     `1px solid ${tokens.colors.border}`,
            }}
          >
            <p className="text-xs font-semibold" style={{ color: tokens.colors.muted }}>
              Let the list owner know who&apos;s buying it (optional)
            </p>

            <input
              type="text"
              placeholder="Your name"
              value={claimName}
              onChange={(e) => setClaimName(e.target.value)}
              disabled={anonymous}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none disabled:opacity-40 transition-opacity"
              style={{
                background: tokens.colors.surface,
                border:     `1px solid rgba(255,255,255,0.10)`,
                color:      tokens.colors.text,
              }}
            />

            <label
              className="flex items-center gap-2 text-xs cursor-pointer select-none"
              style={{ color: tokens.colors.muted }}
            >
              <input
                type="checkbox"
                checked={anonymous}
                onChange={(e) => setAnonymous(e.target.checked)}
                className="rounded"
              />
              Stay anonymous
            </label>

            <div className="flex gap-2 mt-1">
              <button
                onClick={submitClaim}
                disabled={submitting || unclaiming}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-opacity disabled:opacity-50"
                style={{ background: tokens.colors.purple, color: '#fff' }}
              >
                {submitting ? 'Saving…' : "I'll buy this 🎁"}
              </button>
              <button
                onClick={() => { setClaiming(false); setClaimName(''); setAnonymous(false) }}
                className="px-3 py-2.5 rounded-xl text-sm"
                style={{
                  background: 'transparent',
                  border:     `1px solid ${tokens.colors.border}`,
                  color:      tokens.colors.muted,
                }}
              >
                Cancel
              </button>
            </div>

            {/* ── Unclaim option — shown only when the name matches ──── */}
            {nameMatchesClaim && (
              <div
                style={{
                  marginTop:  '8px',
                  paddingTop: '8px',
                  borderTop:  `1px solid ${tokens.colors.border}`,
                }}
              >
                <p
                  style={{
                    fontSize:   '11px',
                    color:      tokens.colors.muted,
                    margin:     '0 0 6px',
                    textAlign:  'center',
                  }}
                >
                  You claimed this item. Changed your mind?
                </p>
                <button
                  onClick={submitUnclaim}
                  disabled={unclaiming || submitting}
                  className="w-full py-2 rounded-xl text-xs font-semibold transition-opacity disabled:opacity-50"
                  style={{
                    background: tokens.colors.surface,
                    border:     `1px solid ${tokens.colors.border}`,
                    color:      tokens.colors.muted,
                  }}
                >
                  {unclaiming ? 'Unclaiming…' : '↩ Unclaim this item'}
                </button>
              </div>
            )}

            {/* ── Unclaim error message ─────────────────────────────── */}
            {unclaimError && (
              <p
                role="alert"
                style={{
                  marginTop: '6px',
                  fontSize:  '11px',
                  color:     tokens.colors.amber,
                  textAlign: 'center',
                }}
              >
                {unclaimError}
              </p>
            )}
          </div>

        ) : (
          /* Idle — primary CTA */
          <button
            onClick={() => { handleBuyClick(); setClaiming(true) }}
            className="w-full py-2.5 rounded-xl text-sm font-bold transition-opacity hover:opacity-85 active:scale-[0.98]"
            style={{ background: tokens.colors.purple, color: '#fff' }}
          >
            I&apos;ll buy this 🎁
          </button>
        )}
      </div>
    </article>
  )
}

