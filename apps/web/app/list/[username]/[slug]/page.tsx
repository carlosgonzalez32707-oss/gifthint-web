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
import {
  generateWishlistSchema,
  generateBreadcrumbSchema,
  type SchemaItem,
}                                            from '@/lib/structured-data'

// ── ISR — revalidate cached page every 10 s so claim counts stay fresh ───────
export const revalidate = 10

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

  // Parallel-fetch item counts, top product images, and retailers in one round-trip
  const [totalResult, availableResult, topImagesResult, retailerResult] = await Promise.all([
    // Total item count
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

    // Top 3 product images (unclaimed first — they render un-greyed on the card)
    supabase
      .from('wishlist_items')
      .select('image_url')
      .eq('wishlist_id', wishlist.id)
      .not('image_url', 'is', null)
      .order('is_claimed', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(3),

    // Distinct retailer names for the meta description
    supabase
      .from('wishlist_items')
      .select('retailer')
      .eq('wishlist_id', wishlist.id)
      .not('retailer', 'is', null)
      .limit(20),
  ])

  const totalItems     = totalResult.count ?? 0
  const availableItems = availableResult.count ?? 0

  // Up to 3 HTTPS product image URLs for the OG card
  const topImageUrls = (topImagesResult.data ?? [])
    .map((r) => r.image_url as string | null)
    .filter((u): u is string => !!u && u.startsWith('https://'))
    .slice(0, 3)

  // Deduplicate and take up to 3 retailers for the description
  const retailers = Array.from(
    new Set(
      (retailerResult.data ?? [])
        .map((r) => r.retailer as string)
        .filter(Boolean),
    ),
  ).slice(0, 3)
  const retailerStr = retailers.length > 0 ? retailers.join(', ') : '500+ stores'

  // "[Name]'s [Occasion] Wish List — [X] gift ideas · GiftHint"
  const title =
    `${name}'s ${occasion.label} Wish List — ` +
    `${totalItems} gift idea${totalItems === 1 ? '' : 's'} · GiftHint`

  // "Help [Name] celebrate their [occasion]. [X] items saved from [retailers]. [Y] still available."
  const description =
    `Help ${name} celebrate their ${occasion.label.toLowerCase()}. ` +
    `${totalItems} item${totalItems === 1 ? '' : 's'} saved from ${retailerStr}. ` +
    `${availableItems} still available.`

  // ── Dynamic OG image URL ─────────────────────────────────────────────────────
  // /api/og renders a 1200×630 card server-side using next/og (Edge runtime).
  // We pass all visual data as query params; the route handles missing values gracefully.
  const ogParams = new URLSearchParams({
    username:       name,
    occasion:       wishlist.occasion ?? 'other',
    itemCount:      String(totalItems),
    availableCount: String(availableItems),
  })
  if (wishlist.occasion_date) ogParams.set('occasionDate', wishlist.occasion_date)
  topImageUrls.forEach((url, i) => ogParams.set(`img${i}`, url))

  const ogImageUrl = `${siteUrl}/api/og?${ogParams.toString()}`

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
      images:      [{ url: ogImageUrl, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card:        'summary_large_image',
      title,
      description,
      images:      [ogImageUrl],
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
      is_group_gift,
      group_gift_target,
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

  // 5. Build JSON-LD schemas — ItemList (top 5 unclaimed) + BreadcrumbList
  const occasionMeta = getOccasionMeta(wishlist.occasion)
  const wishlistSchema = generateWishlistSchema(
    user,
    wishlist,
    rewrittenItems as unknown as SchemaItem[],
  )
  const breadcrumbSchema = generateBreadcrumbSchema(
    user,
    wishlist,
    occasionMeta.label,
  )

  return (
    <>
      {/* Structured data — parsed by Google before page render */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(wishlistSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />

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
