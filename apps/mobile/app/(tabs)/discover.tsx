/**
 * apps/mobile/app/(tabs)/discover.tsx — GiftHint Mobile
 *
 * Discover tab — gifter's entry point.
 * Accepts a username input and navigates to the public gifter page.
 */

import { useState }                        from 'react'
import { View, TextInput, KeyboardAvoidingView, Platform } from 'react-native'
import { router }                          from 'expo-router'
import { GhText }                          from '@/components/ui/Text'
import { GhButton }                        from '@/components/ui/Button'
import { Colors }                          from '@/constants/Colors'

export default function DiscoverScreen() {
  const [username, setUsername] = useState('')

  function handleView() {
    const slug = username.trim().toLowerCase()
    if (!slug) return
    router.push(`/list/${slug}`)
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 20 }}>
        <View style={{ gap: 8, alignItems: 'center' }}>
          <GhText style={{ fontSize: 48 }}>🎁</GhText>
          <GhText variant="title" style={{ textAlign: 'center' }}>
            Find a wishlist
          </GhText>
          <GhText variant="muted" style={{ textAlign: 'center' }}>
            Enter your friend's GiftHint username to view their list.
          </GhText>
        </View>

        <TextInput
          value={username}
          onChangeText={setUsername}
          placeholder="username"
          placeholderTextColor={Colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={handleView}
          style={{
            backgroundColor:  Colors.surface,
            color:            Colors.text,
            borderWidth:      1,
            borderColor:      Colors.border,
            borderRadius:     12,
            paddingHorizontal: 16,
            paddingVertical:  14,
            fontSize:         16,
          }}
        />

        <GhButton
          onPress={handleView}
          disabled={!username.trim()}
        >
          View wishlist
        </GhButton>
      </View>
    </KeyboardAvoidingView>
  )
}
