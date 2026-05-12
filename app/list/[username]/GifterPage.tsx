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

import { useState, useMemo, useCallback } from 'react'
import { createClient }                   from '@supabase/supabase-js'
import { tokens }                         from '@/tokens'
import { trackBuyClick,
         inferAffiliateNetwork }          from '@/lib/analytics'
import type { WishUser, WishItem }        from './page'

// ── Browser Supabase client (anon key — safe to expose) ───────────────────────
// Only used for claim mutations; reads are handled server-side in page.tsx.
const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

// ── Types ─────────────────────────────────────────────────────────────────────

type GifterPageProps = {
  user:  WishUser
  items: WishItem[]
}

// ── Utility ───────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

// ── Root component ────────────────────────────────────────────────────────────

export default function GifterPage({ user, items: initialItems }: GifterPageProps) {
  // Optimistic claim updates live here — items prop is server-rendered initial state
  const [items, setItems] = useState<WishItem[]>(initialItems)
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [reminderEmail, setReminderEmail] = useState('')
  const [reminderSent,  setReminderSent]  = useState(false)

  const name    = user.display_name?.split(' ')[0] ?? user.public_username ?? 'Someone'
  const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? 'https://gifthint.io'
  const listUrl = `${appUrl}/list/${user.public_username}`

  // Collect every unique DNA tag across all items for the filter bar
  const allTags = useMemo<string[]>(() => {
    const seen = new Set<string>()
    items.forEach((item) => item.dna_tags.forEach((t) => seen.add(t)))
    return Array.from(seen)
  }, [items])

  // Apply tag filter client-side — no re-fetch needed
  const visibleItems = useMemo<WishItem[]>(() => {
    if (!activeTag) return items
    return items.filter((item) => item.dna_tags.includes(activeTag))
  }, [items, activeTag])

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

  async function handleReminderSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!reminderEmail) return
    // TODO: store in `reminder_subscribers` table or forward to email service
    // await supabaseBrowser.from('reminder_subscribers').insert({ email: reminderEmail, list_owner_id: user.id })
    setReminderSent(true)
  }

  return (
    <div
      style={{
        background:  tokens.colors.bg,
        color:       tokens.colors.text,
        minHeight:   '100vh',
        fontFamily:  tokens.font.sans,
      }}
    >
      <CtaBar appUrl={appUrl} />

      <main className="max-w-4xl mx-auto">
        <HeroSection
          user={user}
          name={name}
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
          onClaim={handleClaim}
          wisherUserId={user.id}
          gifterPageUsername={user.public_username ?? ''}
        />

        <ReminderSignup
          name={name}
          email={reminderEmail}
          onEmailChange={setReminderEmail}
          sent={reminderSent}
          onSubmit={handleReminderSubmit}
        />
      </main>

      <PageFooter appUrl={appUrl} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CtaBar
// ─────────────────────────────────────────────────────────────────────────────

function CtaBar({ appUrl }: { appUrl: string }) {
  return (
    <a
      href={appUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-center gap-1.5 w-full py-2.5 px-4 text-center text-xs font-semibold transition-opacity hover:opacity-80"
      style={{
        background:   `linear-gradient(90deg, ${tokens.colors.surface} 0%, rgba(139,131,240,0.10) 50%, ${tokens.colors.surface} 100%)`,
        borderBottom: `1px solid ${tokens.colors.border}`,
        color:        tokens.colors.purple,
      }}
    >
      <span>✨</span>
      <span>
        Save anything. Share your list.{' '}
        <span className="underline underline-offset-2">Create yours free →</span>
      </span>
    </a>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// HeroSection
// ─────────────────────────────────────────────────────────────────────────────

function HeroSection({
  user,
  name,
  itemCount,
  listUrl,
}: {
  user:      WishUser
  name:      string
  itemCount: number
  listUrl:   string
}) {
  const [copied, setCopied] = useState(false)

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(listUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (_) {
      /* clipboard unavailable on http:// */
    }
  }

  return (
    <section className="flex flex-col items-center gap-4 px-4 py-12 text-center">
      {/* Avatar */}
      <div
        className="w-20 h-20 rounded-full flex-shrink-0 overflow-hidden flex items-center justify-center text-2xl font-bold select-none"
        style={{
          background: user.avatar_url
            ? 'transparent'
            : `linear-gradient(140deg, ${tokens.colors.purple} 0%, #b0aaff 100%)`,
          color:  '#fff',
          border: `3px solid ${tokens.colors.purpleRing}`,
        }}
      >
        {user.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatar_url}
            alt={name}
            className="w-full h-full object-cover"
          />
        ) : (
          initials(user.display_name ?? name)
        )}
      </div>

      {/* Name + subtitle */}
      <div className="flex flex-col gap-1">
        <h1
          className="text-3xl font-extrabold tracking-tight"
          style={{ color: tokens.colors.text }}
        >
          {name}&apos;s Gift List
        </h1>
        <p className="text-sm" style={{ color: tokens.colors.muted }}>
          {itemCount} {itemCount === 1 ? 'gift' : 'gifts'} ·{' '}
          <span style={{ fontFamily: tokens.font.mono }}>
            {listUrl.replace('https://', '')}
          </span>
        </p>
      </div>

      {/* Copy share link */}
      <button
        onClick={copyLink}
        className="flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold transition-all"
        style={{
          background:  copied ? tokens.colors.greenDim  : tokens.colors.purpleDim,
          border:      `1px solid ${copied ? tokens.colors.greenRing : tokens.colors.purpleRing}`,
          color:       copied ? tokens.colors.green     : tokens.colors.purple,
        }}
      >
        {copied ? '✓ Copied!' : '🔗 Copy gift list link'}
      </button>
    </section>
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
  onClaim,
  wisherUserId,
  gifterPageUsername,
}: {
  items:              WishItem[]
  onClaim:            (id: string, name: string, anon: boolean) => Promise<void>
  wisherUserId:       string
  gifterPageUsername: string
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 px-4 text-center">
        <span className="text-5xl">🎁</span>
        <p className="font-semibold text-base" style={{ color: tokens.colors.text }}>
          No gifts here yet
        </p>
        <p className="text-sm" style={{ color: tokens.colors.muted }}>
          Try a different filter, or check back soon.
        </p>
      </div>
    )
  }

  return (
    <section className="px-4 pb-16">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((item) => (
          <GiftCard
            key={item.id}
            item={item}
            onClaim={onClaim}
            wisherUserId={wisherUserId}
            gifterPageUsername={gifterPageUsername}
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
  onClaim,
  wisherUserId,
  gifterPageUsername,
}: {
  item:               WishItem
  onClaim:            (id: string, name: string, anon: boolean) => Promise<void>
  wisherUserId:       string
  gifterPageUsername: string
}) {
  const [claiming,   setClaiming]   = useState(false)
  const [claimName,  setClaimName]  = useState('')
  const [anonymous,  setAnonymous]  = useState(false)
  const [submitting, setSubmitting] = useState(false)

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
      <div
        className="relative w-full aspect-square flex items-center justify-center text-5xl select-none"
        style={{ background: tokens.colors.surface2 }}
      >
        {item.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image_url}
            alt={item.title}
            className="w-full h-full object-cover"
          />
        ) : (
          '🎁'
        )}

        {/* Claimed overlay */}
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

        {/* DNA tags */}
        {item.dna_tags.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {item.dna_tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="text-xs px-2 py-0.5 rounded-full font-semibold"
                style={{
                  background: tokens.colors.purpleDim,
                  border:     `1px solid ${tokens.colors.purpleRing}`,
                  color:      tokens.colors.purple,
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Spacer — pushes action to bottom */}
        <div className="flex-1" />

        {/* ── Action area ─────────────────────────────────────────────── */}
        {item.is_claimed ? (
          /* Already claimed */
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
                disabled={submitting}
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

// ─────────────────────────────────────────────────────────────────────────────
// ReminderSignup
// ─────────────────────────────────────────────────────────────────────────────

function ReminderSignup({
  name,
  email,
  onEmailChange,
  sent,
  onSubmit,
}: {
  name:          string
  email:         string
  onEmailChange: (v: string) => void
  sent:          boolean
  onSubmit:      (e: React.FormEvent) => void
}) {
  return (
    <section
      className="mx-4 mb-16 rounded-2xl p-8 text-center"
      style={{
        background: tokens.colors.surface,
        border:     `1px solid ${tokens.colors.border}`,
      }}
    >
      <div className="text-3xl mb-3">🔔</div>

      <h2
        className="text-base font-bold mb-1.5"
        style={{ color: tokens.colors.text }}
      >
        Want to know when {name} adds more gifts?
      </h2>
      <p
        className="text-sm mb-6 max-w-xs mx-auto"
        style={{ color: tokens.colors.muted }}
      >
        One email, no spam. We&apos;ll ping you when new items are added.
      </p>

      {sent ? (
        <p
          className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-full"
          style={{
            background: tokens.colors.greenDim,
            border:     `1px solid ${tokens.colors.greenRing}`,
            color:      tokens.colors.green,
          }}
        >
          ✓ You&apos;re on the list!
        </p>
      ) : (
        <form
          onSubmit={onSubmit}
          className="flex gap-2 max-w-sm mx-auto"
        >
          <input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            required
            className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none"
            style={{
              background: tokens.colors.surface2,
              border:     `1px solid rgba(255,255,255,0.10)`,
              color:      tokens.colors.text,
            }}
          />
          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-opacity hover:opacity-85"
            style={{ background: tokens.colors.purple, color: '#fff' }}
          >
            Notify me
          </button>
        </form>
      )}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Footer
// ─────────────────────────────────────────────────────────────────────────────

function PageFooter({ appUrl }: { appUrl: string }) {
  return (
    <footer
      className="py-10 px-4 text-center text-sm"
      style={{
        borderTop: `1px solid ${tokens.colors.border}`,
        color:     tokens.colors.muted,
      }}
    >
      <p>
        Made with{' '}
        <span style={{ color: tokens.colors.pink }}>♥</span>
        {' '}on{' '}
        <a
          href={appUrl}
          className="font-semibold transition-opacity hover:opacity-80"
          style={{ color: tokens.colors.purple }}
        >
          GiftHint
        </a>
      </p>

      <a
        href={appUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 mt-4 px-5 py-2.5 rounded-full text-xs font-bold transition-all hover:opacity-85"
        style={{
          background: tokens.colors.purpleDim,
          border:     `1px solid ${tokens.colors.purpleRing}`,
          color:      tokens.colors.purple,
        }}
      >
        ✨ Create your own free wishlist
      </a>
    </footer>
  )
}
