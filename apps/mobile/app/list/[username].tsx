/**
 * apps/mobile/app/list/[username].tsx — GiftHint Mobile
 *
 * Public gifter page — shows a wisher's items to gift-givers.
 * Mirrors the web's /list/[username] page in functionality.
 */

import { View, FlatList, ActivityIndicator, Image, Pressable, Linking } from 'react-native'
import { useLocalSearchParams, Stack }  from 'expo-router'
import { useQuery }                     from '@tanstack/react-query'
import { supabase }                     from '@/lib/supabase'
import { GhText }                       from '@/components/ui/Text'
import { GhCard }                       from '@/components/ui/Card'
import { Colors }                       from '@/constants/Colors'
import type { WishlistItem, User }      from '@gifthint/shared/types'
import { timeAgo }                      from '@gifthint/shared/utils'

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchPublicList(username: string): Promise<{
  user:  User | null
  items: WishlistItem[]
}> {
  const { data: users } = await supabase
    .from('users')
    .select('id, display_name, avatar_url, public_username, created_at')
    .eq('public_username', username)
    .limit(1)

  if (!users || users.length === 0) return { user: null, items: [] }

  const user = users[0] as User

  const { data: items } = await supabase
    .from('wishlist_items')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_claimed', false)
    .order('sort_order', { ascending: true })

  return { user, items: (items ?? []) as WishlistItem[] }
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function GifterPage() {
  const { username } = useLocalSearchParams<{ username: string }>()

  const { data, isLoading } = useQuery({
    queryKey: ['public-list', username],
    queryFn:  () => fetchPublicList(username),
    enabled:  !!username,
  })

  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: `@${username}` }} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={Colors.purple} size="large" />
        </View>
      </>
    )
  }

  if (!data?.user) {
    return (
      <>
        <Stack.Screen options={{ title: 'Not found' }} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 }}>
          <GhText style={{ fontSize: 48 }}>🤔</GhText>
          <GhText variant="title">List not found</GhText>
          <GhText variant="muted" style={{ textAlign: 'center' }}>
            No GiftHint list found for @{username}.
          </GhText>
        </View>
      </>
    )
  }

  const { user, items } = data
  const displayName = user.display_name ?? username

  return (
    <>
      <Stack.Screen options={{ title: `${displayName}'s list` }} />
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        ListHeaderComponent={
          <ListHeader user={user} itemCount={items.length} />
        }
        renderItem={({ item }) => (
          <GiftItemCard item={item} />
        )}
        ListEmptyComponent={
          <View style={{ padding: 32, alignItems: 'center', gap: 12 }}>
            <GhText style={{ fontSize: 48 }}>🎁</GhText>
            <GhText variant="muted" style={{ textAlign: 'center' }}>
              {displayName} hasn't added any items yet.
            </GhText>
          </View>
        }
      />
    </>
  )
}

// ── List header ───────────────────────────────────────────────────────────────

function ListHeader({ user, itemCount }: { user: User; itemCount: number }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 24, gap: 12, marginBottom: 8 }}>
      {user.avatar_url && (
        <Image
          source={{ uri: user.avatar_url }}
          style={{ width: 72, height: 72, borderRadius: 36, borderWidth: 2, borderColor: Colors.purpleRing }}
        />
      )}
      <GhText variant="title">{user.display_name ?? user.public_username}</GhText>
      <GhText variant="muted">{itemCount} {itemCount === 1 ? 'item' : 'items'} on their list</GhText>
    </View>
  )
}

// ── Gift item card ────────────────────────────────────────────────────────────

function GiftItemCard({ item }: { item: WishlistItem }) {
  function openLink() {
    const url = item.affiliate_url ?? item.source_url
    Linking.openURL(url)
  }

  return (
    <GhCard>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {item.image_url && (
          <Image
            source={{ uri: item.image_url }}
            style={{
              width: 72, height: 72, borderRadius: 8,
              backgroundColor: Colors.surface2,
            }}
            resizeMode="cover"
          />
        )}
        <View style={{ flex: 1, gap: 4 }}>
          <GhText variant="label" numberOfLines={2}>{item.title}</GhText>

          {item.price != null && (
            <GhText style={{ color: Colors.green, fontWeight: '600', fontSize: 15 }}>
              ${item.price.toFixed(2)}
            </GhText>
          )}

          {item.hint && (
            <GhText variant="muted" numberOfLines={2} style={{ fontStyle: 'italic', fontSize: 12 }}>
              💡 {item.hint}
            </GhText>
          )}

          <GhText variant="muted" style={{ fontSize: 11 }}>
            Added {timeAgo(new Date(item.created_at))}
          </GhText>
        </View>
      </View>

      <Pressable
        onPress={openLink}
        style={({ pressed }) => ({
          marginTop: 12,
          backgroundColor: pressed ? Colors.purpleSoft : Colors.purpleDim,
          borderWidth: 1,
          borderColor: Colors.purpleRing,
          borderRadius: 8,
          paddingVertical: 10,
          alignItems: 'center',
        })}
      >
        <GhText style={{ color: Colors.purple, fontWeight: '600', fontSize: 14 }}>
          Buy this gift →
        </GhText>
      </Pressable>
    </GhCard>
  )
}
