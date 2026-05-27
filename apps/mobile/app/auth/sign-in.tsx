/**
 * apps/mobile/app/auth/sign-in.tsx — GiftHint Mobile
 *
 * Google OAuth sign-in via expo-auth-session + Supabase PKCE.
 *
 * Flow:
 *   1. Call supabase.auth.signInWithOAuth → get authUrl
 *   2. Open authUrl in a browser via expo-web-browser
 *   3. User authenticates → browser redirects to gifthint://auth/callback?code=…
 *   4. Expo Router captures the deep link → this screen handles it
 *   5. Exchange code for session → navigate to tabs
 */

import { useEffect, useState }     from 'react'
import { View, ActivityIndicator } from 'react-native'
import { router }                  from 'expo-router'
import * as WebBrowser             from 'expo-web-browser'
import { makeRedirectUri }         from 'expo-auth-session'
import { supabase }                from '@/lib/supabase'
import { GhText }                  from '@/components/ui/Text'
import { GhButton }                from '@/components/ui/Button'
import { Colors }                  from '@/constants/Colors'

// Required: complete auth session when browser redirects back
WebBrowser.maybeCompleteAuthSession()

export default function SignInScreen() {
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const redirectUri = makeRedirectUri({ scheme: 'gifthint', path: 'auth/callback' })

  async function signInWithGoogle() {
    setLoading(true)
    setError(null)

    const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo:   redirectUri,
        skipBrowserRedirect: true,
      },
    })

    if (oauthError || !data.url) {
      setError(oauthError?.message ?? 'Could not start sign-in.')
      setLoading(false)
      return
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri)

    if (result.type === 'success' && result.url) {
      const url = new URL(result.url)
      const code = url.searchParams.get('code')

      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
        if (exchangeError) {
          setError(exchangeError.message)
          setLoading(false)
          return
        }
        router.replace('/(tabs)')
        return
      }
    }

    setLoading(false)
  }

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 24 }}>
      <GhText style={{ fontSize: 56 }}>🎁</GhText>

      <View style={{ gap: 8, alignItems: 'center' }}>
        <GhText variant="title">Welcome to GiftHint</GhText>
        <GhText variant="muted" style={{ textAlign: 'center' }}>
          Create your wishlist and share it with everyone who wants to get you the perfect gift.
        </GhText>
      </View>

      {error && (
        <GhText style={{ color: Colors.red, textAlign: 'center', fontSize: 13 }}>
          {error}
        </GhText>
      )}

      {loading ? (
        <ActivityIndicator color={Colors.purple} />
      ) : (
        <GhButton onPress={signInWithGoogle} style={{ width: '100%' }}>
          Continue with Google
        </GhButton>
      )}
    </View>
  )
}
