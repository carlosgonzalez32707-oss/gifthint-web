/**
 * apps/mobile/lib/supabase.ts — GiftHint Mobile
 *
 * Supabase client configured for React Native / Expo.
 *
 * Key differences from the web client:
 *   - Uses expo-secure-store for session persistence (not localStorage)
 *   - detectSessionInUrl: false (PKCE handled via expo-auth-session)
 *   - flowType: 'pkce' for secure OAuth on mobile
 *
 * Usage:
 *   import { supabase } from '@/lib/supabase'
 */

import 'react-native-url-polyfill/auto'
import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'

// ── Secure storage adapter ────────────────────────────────────────────────────
// Supabase uses a key-value adapter interface; SecureStore implements it.
// Keys are sanitised because SecureStore rejects certain characters.

const SecureStoreAdapter = {
  getItem: (key: string): Promise<string | null> => {
    return SecureStore.getItemAsync(sanitiseKey(key))
  },
  setItem: (key: string, value: string): Promise<void> => {
    return SecureStore.setItemAsync(sanitiseKey(key), value)
  },
  removeItem: (key: string): Promise<void> => {
    return SecureStore.deleteItemAsync(sanitiseKey(key))
  },
}

/** SecureStore keys must be alphanumeric + hyphens, max 256 chars. */
function sanitiseKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 256)
}

// ── Client ────────────────────────────────────────────────────────────────────

const supabaseUrl   = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '[supabase] EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set.\n' +
    'Add them to your .env.local file.',
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage:             SecureStoreAdapter,
    autoRefreshToken:    true,
    persistSession:      true,
    flowType:            'pkce',
    detectSessionInUrl:  false,   // we exchange manually via expo-auth-session
  },
})
