/**
 * app/list/[username]/page.tsx — GiftHint public gifter page
 *
 * Server Component: fetches user + items on the server, passes to the
 * GifterPage client component. Never exposes the service-role key to the
 * browser — all Supabase calls here are server-side only.
 */

import type { Metadata, ResolvingMetadata } from 'next'
import { notFound }                          from 'next/navigation'
import { createServerClient }                from '@/lib/supabase-server'
import type { DbUser, DbWishlistItem }       from '@/lib/supabase-server'
import { rewriteAmazonUrls }                 from '@/lib/affiliate'
import GifterPage                            from './GifterPage'

// ── Shared prop types ─────────────────────────────────────────────────────────
// Exported so GifterPage.tsx can import them without a circular dependency.

export type WishUser = Pick<DbUser,
  | 'id'
  | 'public_username'
  | 'display_name'
  | 'avatar_url'
  | 'created_at'
>

export type WishItem = Pick<DbWishlistItem,
  | 'id'
  | 'user_id'
  | 'title'
  | 'price'
  | 'currency'
  | 'image_url'
  | 'source_url'
  | 'original_url'
  | 'affiliate_url'
  | 'retailer'
  | 'hint'
  | 'dna_tags'
  | 'is_claimed'
  | 'claimed_by'
  | 'claimed_at'
  | 'claimed_anonymous'
  | 'sort_order'
  | 'created_at'
>

// ── Route params ──────────────────────────────────────────────────────────────

type RouteProps = {
  params: { username: string }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract first name or fall back to raw username. */
function firstName(displayName: string | null, username: string): string {
  return displayName?.split(' ')[0] ?? username
}

// ── generateMetadata ──────────────────────────────────────────────────────────
// Runs independently of the Page render; Next.js deduplicates the underlying
// fetch if you switch to the native fetch() API or React cache().

export async function generateMetadata(
  { params }: RouteProps,
  _parent: ResolvingMetadata,
): Promise<Metadata> {
  const supabase = createServerClient()

  // Fetch just the fields we need for meta — lighter query than the full render
  const { data: user } = await supabase
    .from('users')
    .select('id, display_name, avatar_url')
    .eq('public_username', params.username)
    .maybeSingle()

  if (!user) {
    return {
      title: 'List not found — GiftHint',
    }
  }

  const name        = firstName(user.display_name, params.username)
  const title       = `${name}'s Gift List — GiftHint`
  const description = `Browse ${name}'s wishlist and find the perfect gift. Powered by GiftHint.`
  const siteUrl     = process.env.NEXT_PUBLIC_APP_URL ?? 'https://gifthint.io'
  const listUrl     = `${siteUrl}/list/${params.username}`

  // Use the first item with an image as the OG cover photo
  const { data: firstImageItem } = await supabase
    .from('wishlist_items')
    .select('image_url')
    .eq('user_id', user.id)
    .not('image_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const ogImage = firstImageItem?.image_url ?? null

  return {
    title,
    description,
    alternates: {
      canonical: listUrl,
    },
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
    .select(`
      id,
      public_username,
      display_name,
      avatar_url,
      created_at
    `)
    .eq('public_username', params.username)
    .maybeSingle()

  if (userError) {
    console.error('[GiftHint] page fetch user error:', userError.message)
  }

  // Unknown username → standard Next.js 404 page
  if (!user) notFound()

  // 2. Fetch all wishlist items for this user, newest first.
  //    "non-private" = no is_private column yet; fetching all items.
  //    Add .eq('is_private', false) once that column is added.
  const { data: items, error: itemsError } = await supabase
    .from('wishlist_items')
    .select(`
      id,
      user_id,
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
    .eq('user_id', user.id)
    .order('sort_order',  { ascending: true  })
    .order('created_at', { ascending: false })

  if (itemsError) {
    console.error('[GiftHint] page fetch items error:', itemsError.message)
  }

  // Rewrite Amazon URLs with Associates tag — server-side only.
  // See lib/affiliate.ts for the compliance rationale.
  const associatesTag = process.env.AMAZON_ASSOCIATES_TAG ?? ''
  const rewrittenItems = rewriteAmazonUrls(
    (items ?? []) as WishItem[],
    associatesTag,
  )

  return (
    <GifterPage
      user={user as WishUser}
      items={rewrittenItems}
    />
  )
}
