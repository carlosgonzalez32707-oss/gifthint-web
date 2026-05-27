/**
 * apps/mobile/app/_layout.tsx — GiftHint Mobile
 *
 * Root layout: wraps the app with React Query, auth session listener,
 * and the Expo Router Stack navigator.
 */

import '../global.css'

import { useEffect }                       from 'react'
import { Stack }                           from 'expo-router'
import { StatusBar }                       from 'expo-status-bar'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { supabase }                        from '@/lib/supabase'
import { Colors }                          from '@/constants/Colors'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry:       1,
      staleTime:   30_000,   // 30 s
    },
  },
})

export default function RootLayout() {
  // Keep the session alive — supabase-js fires SIGNED_IN / SIGNED_OUT events
  // and the SecureStore adapter persists the token automatically.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, _session) => {
        // Individual screens use useSession() to react to auth changes.
      },
    )
    return () => subscription.unsubscribe()
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" backgroundColor={Colors.bg} />
      <Stack
        screenOptions={{
          headerStyle:      { backgroundColor: Colors.surface },
          headerTintColor:  Colors.text,
          headerShadowVisible: false,
          contentStyle:     { backgroundColor: Colors.bg },
          animation:        'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)"      options={{ headerShown: false }} />
        <Stack.Screen name="auth/sign-in" options={{ title: 'Sign in', presentation: 'modal' }} />
        <Stack.Screen name="list/[username]" options={{ headerShown: false }} />
      </Stack>
    </QueryClientProvider>
  )
}
