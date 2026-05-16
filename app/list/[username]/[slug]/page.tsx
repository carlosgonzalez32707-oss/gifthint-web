/**
 * app/list/[username]/[slug]/page.tsx — GiftHint individual wishlist
 *
 * Server Component: resolves user → wishlist by slug → items, then
 * hands off to the GifterPage client component.
 *
 * URL pattern: /list/<username>/<slug>
 *   e.g. /list/emma/birthday-2026
 *        /list/carlos/my-wishlist
 *
 * 404 when:
 *   - username doesn't exist
 *   - no public wishlist with that slug exists for this user
 */

import type { Metadata, ResolvingMetadata } from 'next'
import { Suspense }                          from 'react'
import { notFound }                          from 'next/navigation'
import { createServerClient }                from '@/lib/supabase-server'
import type { DbWishlistItem }               from '@/lib/supabase-server'
import { getWishlistBySlug, getOccasionMeta } from '@/lib/wishlists'
import { rewriteAmazonUrls }                 from '@/lib/affiliate'
import type { WishlistItem }                  from '@/types/wishlist'
import GifterPage                            from '../GifterPage'
import { TrackPageView }                     from '@/components/TrackPageView'
import { GiftGridSkeleton }                  from '@/components/GiftGridSkeleton'

// ── ISR — revalidate cached page every 60 s so claim counts stay fresh ───────
export const revalidate = 60

// ── Re-export shared prop types ───────────────────────────────────────────────
// GifterPage.tsx imports these from the parent page; we re-export for convenience.

export type { WishUser } from '../page'
export type { WishItem } from '../page'

// ── Route params ──────────────────────────────────────────────────────────────

type RouteProps = {
  params: { username: string; slug: string }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function firstName(displayName: string | null, username: string): string {
  return displayName?.split(' ')[0] ?? username
}

// ── generateMetadata ──────────────────────────────────────────────────────────

export async function generateMetadata(
  { params }: RouteProps,
  _parent: ResolvingMetadata,
): Promise<Metadata> {
  const supabase = createServerClient()

  const { data: user } = await supabase
    .from('users')
    .select('id, display_name, avatar_url')
    .eq('public_username', params.username)
    .maybeSingle()

  if (!user) return { title: 'List not found — GiftHint' }

  const wishlist = await getWishlistBySlug(user.id, params.slug)
  if (!wishlist || !wishlist.is_public) return { title: 'List not found — GiftHint' }

  const name     = firstName(user.display_name, params.username)
  const occasion = getOccasionMeta(wishlist.occasion)
  const siteUrl  = process.env.NEXT_PUBLIC_APP_URL ?? 'https://gifthint.io'
  const listUrl  = `${siteUrl}/list/${params.username}/${params.slug}`

  // Parallel-fetch item counts + OG image in a single round-trip
  const [totalResult, availableResult, ogResult] = await Promise.all([
    // Total item count (head: true = no row data, just the count)
    supabase
      .from('wishlist_items')
      .select('id', { count: 'exact', head: true })
      .eq('wishlist_id', wishlist.id),

    // Unclaimed item count
    supabase
      .from('wishlist_items')
      .select('id', { count: 'exact', head: true })
      .eq('wishlist_id', wishlist.id)
      .eq('is_claimed', false),

    // First product image for OG card (prefer unclaimed items so image isn't greyed-out)
    supabase
      .from('wishlist_items')
      .select('image_url')
      .eq('wishlist_id', wishlist.id)
      .not('image_url', 'is', null)
      .order('is_claimed', { ascending: true })  // unclaimed first
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const totalItems     = totalResult.count ?? 0
  const availableItems = availableResult.count ?? 0
  const ogImage        = ogResult.data?.image_url ?? null

  // "[Name]'s [Occasion] Wishlist — [X] gifts · GiftHint"
  const title = `${name}'s ${occasion.label} Wishlist — ${totalItems} gift${totalItems === 1 ? '' : 's'} · GiftHint`

  // "Help [Name] get the perfect [occasion] gifts. [X] items on their list, [Y] still available."
  const description =
    `Help ${name} get the perfect ${occasion.label.toLowerCase()} gifts. ` +
    `${totalItems} item${totalItems === 1 ? '' : 's'} on their list, ` +
    `${availableItems} still available.`

  return {
    title,
    description,
    alternates: { canonical: listUrl },
    openGraph: {
      type:        'website',
      url:         listUrl,
      title,
      description,
      siteName:    'GiftHint',
      ...(ogImage && {
        images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
      }),
    },
    twitter: {
      card:        ogImage ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(ogImage && { images: [ogImage] }),
    },
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function Page({ params }: RouteProps) {
  const supabase = createServerClient()

  // 1. Resolve user by public_username
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, public_username, display_name, avatar_url, created_at')
    .eq('public_username', params.username)
    .maybeSingle()

  if (userError) {
    console.error('[GiftHint] list page user error:', userError.message)
  }

  if (!user) notFound()

  // 2. Resolve wishlist by slug
  const wishlist = await getWishlistBySlug(user.id, params.slug)

  if (!wishlist || !wishlist.is_public) notFound()

  // 3. Fetch items for this specific wishlist
  const { data: items, error: itemsError } = await supabase
    .from('wishlist_items')
    .select(`
      id,
      user_id,
      wishlist_id,
      title,
      price,
      currency,
      image_url,
      source_url,
      original_url,
      affiliate_url,
      retailer,
      hint,
      dna_tags,
      is_claimed,
      claimed_by,
      claimed_at,
      claimed_anonymous,
      sort_order,
      created_at
    `)
    .eq('wishlist_id', wishlist.id)
    .order('sort_order',  { ascending: true  })
    .order('created_at', { ascending: false })

  if (itemsError) {
    console.error('[GiftHint] list page items error:', itemsError.message)
  }

  // 4. Rewrite Amazon URLs with Associates tag — server-side only
  const associatesTag  = process.env.AMAZON_ASSOCIATES_TAG ?? ''
  const rewrittenItems = rewriteAmazonUrls(
    (items ?? []) as unknown as WishlistItem[],
    associatesTag,
    process.env.SKIMLINKS_PUBLISHER_ID,
  )

  return (
    <>
      {/* Fire-and-forget page view — client-side, after hydration */}
      <TrackPageView wishlistId={wishlist.id} />

      {/*
        Suspense boundary: GifterPage is a heavy 'use client' bundle.
        Showing the skeleton immediately keeps the layout stable while the
        client component hydrates and the Realtime WebSocket connects.
      */}
      <Suspense fallback={<GiftGridSkeleton count={8} />}>
        <GifterPage
          user={user}
          items={rewrittenItems}
          wishlist={wishlist}
        />
      </Suspense>
    </>
  )
}
