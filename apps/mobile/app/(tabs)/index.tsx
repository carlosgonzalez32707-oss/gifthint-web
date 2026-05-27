/**
 * apps/mobile/app/(tabs)/index.tsx — GiftHint Mobile
 *
 * "My List" tab — the wisher's own wishlist dashboard.
 * Fetches wishlists via Supabase and shows items grouped by list.
 */

import { useEffect, useState }              from 'react'
import { View, FlatList, RefreshControl, ActivityIndicator } from 'react-native'
import { router }                           from 'expo-router'
import { useQuery }                         from '@tanstack/react-query'
import { supabase }                         from '@/lib/supabase'
import { GhText }                           from '@/components/ui/Text'
import { GhButton }                         from '@/components/ui/Button'
import { GhCard }                           from '@/components/ui/Card'
import { Colors }                           from '@/constants/Colors'
import type { WishlistItem, Wishlist }      from '@gifthint/shared/types'

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchMyWishlists(): Promise<Wishlist[]> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return []

  const { data, error } = await supabase
    .from('wishlists')
    .select('*')
    .eq('user_id', session.user.id)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })

  if (error) throw error
  return data as Wishlist[]
}

async function fetchMyItems(): Promise<WishlistItem[]> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return []

  const { data, error } = await supabase
    .from('wishlist_items')
    .select('*')
    .eq('user_id', session.user.id)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return data as WishlistItem[]
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function MyListScreen() {
  const [session, setSession] = useState<boolean | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(!!data.session)
    })
  }, [])

  const { data: wishlists = [], isLoading, refetch } = useQuery({
    queryKey: ['my-wishlists'],
    queryFn:  fetchMyWishlists,
    enabled:  session === true,
  })

  // Not signed in
  if (session === false) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 }}>
        <GhText variant="title">Your wishlist awaits</GhText>
        <GhText variant="muted" style={{ textAlign: 'center' }}>
          Sign in with Google to create your list and share it with friends and family.
        </GhText>
        <GhButton onPress={() => router.push('/auth/sign-in')} style={{ marginTop: 8 }}>
          Sign in with Google
        </GhButton>
      </View>
    )
  }

  // Loading
  if (session === null || isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={Colors.purple} size="large" />
      </View>
    )
  }

  // Empty state
  if (wishlists.length === 0) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 }}>
        <GhText variant="title">No lists yet</GhText>
        <GhText variant="muted" style={{ textAlign: 'center' }}>
          Create your first wishlist and start adding items to share.
        </GhText>
        <GhButton onPress={() => {/* TODO: open create list modal */}}>
          Create a list
        </GhButton>
      </View>
    )
  }

  return (
    <FlatList
      data={wishlists}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      refreshControl={
        <RefreshControl
          refreshing={isLoading}
          onRefresh={refetch}
          tintColor={Colors.purple}
        />
      }
      renderItem={({ item }) => (
        <WishlistCard wishlist={item} />
      )}
    />
  )
}

// ── Wishlist card ─────────────────────────────────────────────────────────────

function WishlistCard({ wishlist }: { wishlist: Wishlist }) {
  const { data: items = [] } = useQuery({
    queryKey: ['wishlist-items', wishlist.id],
    queryFn:  fetchMyItems,
  })

  const listItems = items.filter((i) => i.wishlist_id === wishlist.id)

  return (
    <GhCard>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <GhText variant="label">{wishlist.title}</GhText>
          <GhText variant="muted" style={{ marginTop: 2 }}>
            {listItems.length} {listItems.length === 1 ? 'item' : 'items'}
            {wishlist.is_default ? '  ·  Default list' : ''}
          </GhText>
        </View>
        <GhText style={{ fontSize: 24 }}>
          {occasionEmoji(wishlist.occasion)}
        </GhText>
      </View>
    </GhCard>
  )
}

function occasionEmoji(occasion: string): string {
  const map: Record<string, string> = {
    birthday: '🎂', christmas: '🎄', wedding: '💍',
    baby_shower: '🍼', graduation: '🎓',
    housewarming: '🏠', anniversary: '🥂', other: '🎁',
  }
  return map[occasion] ?? '🎁'
}
