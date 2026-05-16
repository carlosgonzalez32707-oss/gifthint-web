/**
 * app/list/[username]/page.tsx — GiftHint wishlist profile
 *
 * Handles two scenarios:
 *
 *   1. User has exactly one public list (the common case):
 *      Transparently redirects to /list/<username>/<slug> so
 *      existing bookmarks and share links continue to work.
 *
 *   2. User has multiple public lists:
 *      Renders a profile page listing all their lists so gifters
 *      can pick which occasion they're shopping for.
 *
 * This is a Server Component — no 'use client'.
 */

import type { Metadata, ResolvingMetadata } from 'next'
import { notFound, redirect }               from 'next/navigation'
import Link                                 from 'next/link'
import { createServerClient }               from '@/lib/supabase-server'
import type { DbUser, DbWishlistItem }      from '@/lib/supabase-server'
import { getWishlists, getOccasionMeta }    from '@/lib/wishlists'

// ── Shared types (re-exported for child components) ───────────────────────────
// GifterPage.tsx and [slug]/page.tsx import these from here.

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
  | 'wishlist_id'
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function firstName(displayName: string | null, username: string): string {
  return displayName?.split(' ')[0] ?? username
}

// ── Route params ──────────────────────────────────────────────────────────────

type RouteProps = {
  params: { username: string }
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

  if (!user) {
    return { title: 'List not found — GiftHint' }
  }

  const name        = firstName(user.display_name, params.username)
  const title       = `${name}'s Wishlists — GiftHint`
  const description = `Browse ${name}'s wishlists and find the perfect gift.`
  const siteUrl     = process.env.NEXT_PUBLIC_APP_URL ?? 'https://gifthint.io'
  const listUrl     = `${siteUrl}/list/${params.username}`

  return {
    title,
    description,
    alternates: { canonical: listUrl },
    openGraph: {
      type: 'website', url: listUrl, title, description, siteName: 'GiftHint',
    },
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function Page({ params }: RouteProps) {
  const supabase = createServerClient()

  // 1. Resolve user
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, public_username, display_name, avatar_url, created_at')
    .eq('public_username', params.username)
    .maybeSingle()

  if (userError) {
    console.error('[GiftHint] profile page user error:', userError.message)
  }

  if (!user) notFound()

  // 2. Fetch all public wishlists for this user
  const wishlists = await getWishlists(user.id)

  // 3. Single list → redirect directly (preserves old share-link behaviour)
  if (wishlists.length === 1) {
    redirect(`/list/${params.username}/${wishlists[0].slug}`)
  }

  // 4. No lists at all (edge case: user exists but hasn't set up lists yet)
  if (wishlists.length === 0) {
    return (
      <main style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0C0C0E',
        color: '#7A7870',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        textAlign: 'center',
        padding: '40px 24px',
      }}>
        <div>
          <p style={{ fontSize: '48px', margin: '0 0 16px' }}>🎁</p>
          <h1 style={{ color: '#F0EEE8', fontSize: '22px', fontWeight: 800, margin: '0 0 8px' }}>
            {firstName(user.display_name, params.username)} hasn&apos;t added any lists yet.
          </h1>
          <p style={{ fontSize: '15px', margin: 0 }}>Check back soon!</p>
        </div>
      </main>
    )
  }

  // 5. Multiple lists → render profile
  const name    = firstName(user.display_name, params.username)
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://gifthint.io'

  return (
    <main style={{
      minHeight: '100vh',
      background: '#0C0C0E',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      padding: '40px 24px 80px',
    }}>
      <div style={{ maxWidth: '560px', margin: '0 auto' }}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          {user.avatar_url && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={user.avatar_url}
              alt={name}
              width={72}
              height={72}
              style={{ borderRadius: '50%', marginBottom: '16px', display: 'block', margin: '0 auto 16px' }}
            />
          )}
          <h1 style={{
            margin: '0 0 6px',
            fontSize: '26px',
            fontWeight: 800,
            color: '#F0EEE8',
            letterSpacing: '-0.03em',
          }}>
            {name}&apos;s Wishlists
          </h1>
          <p style={{ margin: 0, fontSize: '14px', color: '#7A7870' }}>
            Pick the occasion you&apos;re shopping for 🎁
          </p>
        </div>

        {/* ── List cards ──────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {wishlists.map((list) => {
            const meta    = getOccasionMeta(list.occasion)
            const listUrl = `${siteUrl}/list/${params.username}/${list.slug}`

            return (
              <Link
                key={list.id}
                href={`/list/${params.username}/${list.slug}`}
                style={{ textDecoration: 'none' }}
              >
                <div style={{
                  background:   '#141418',
                  border:       '1px solid rgba(240,238,232,0.07)',
                  borderRadius: '16px',
                  padding:      '20px 24px',
                  display:      'flex',
                  alignItems:   'center',
                  gap:          '16px',
                  cursor:       'pointer',
                  transition:   'border-color 0.15s',
                }}>
                  {/* Occasion emoji badge */}
                  <div style={{
                    width:        '48px',
                    height:       '48px',
                    borderRadius: '12px',
                    background:   'rgba(139,131,240,0.12)',
                    display:      'flex',
                    alignItems:   'center',
                    justifyContent: 'center',
                    fontSize:     '24px',
                    flexShrink:   0,
                  }}>
                    {meta.emoji}
                  </div>

                  {/* Title + occasion */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      margin:      '0 0 2px',
                      fontSize:    '16px',
                      fontWeight:  700,
                      color:       '#F0EEE8',
                      letterSpacing: '-0.01em',
                      overflow:    'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace:  'nowrap',
                    }}>
                      {list.title}
                    </p>
                    <p style={{ margin: 0, fontSize: '13px', color: '#7A7870' }}>
                      {meta.label}
                      {list.occasion_date && (
                        <> · {new Date(list.occasion_date + 'T00:00:00Z').toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
                        })}</>
                      )}
                    </p>
                  </div>

                  {/* Arrow */}
                  <span style={{ color: '#8B83F0', fontSize: '18px', flexShrink: 0 }}>›</span>
                </div>
              </Link>
            )
          })}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <p style={{
          marginTop: '40px',
          textAlign: 'center',
          fontSize:  '12px',
          color:     '#7A7870',
        }}>
          Powered by{' '}
          <a href={siteUrl} style={{ color: '#8B83F0', textDecoration: 'none' }}>
            GiftHint ✨
          </a>
        </p>

      </div>
    </main>
  )
}
