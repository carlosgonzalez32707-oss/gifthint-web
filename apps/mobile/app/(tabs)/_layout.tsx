/**
 * apps/mobile/app/(tabs)/_layout.tsx — GiftHint Mobile
 *
 * Tab bar: My List | Discover | Account
 */

import { Tabs }        from 'expo-router'
import { Colors }      from '@/constants/Colors'

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor:    Colors.purple,
        tabBarInactiveTintColor:  Colors.muted,
        tabBarStyle: {
          backgroundColor:  Colors.surface,
          borderTopColor:   Colors.border,
          borderTopWidth:   1,
          paddingBottom:    4,
        },
        tabBarLabelStyle: {
          fontSize:   11,
          fontWeight: '500',
        },
        headerStyle:       { backgroundColor: Colors.surface },
        headerTintColor:   Colors.text,
        headerShadowVisible: false,
        contentStyle:      { backgroundColor: Colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title:        'My List',
          tabBarIcon:   ({ color }) => <TabIcon label="🎁" color={color} />,
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title:        'Discover',
          tabBarIcon:   ({ color }) => <TabIcon label="✨" color={color} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title:        'Account',
          tabBarIcon:   ({ color }) => <TabIcon label="👤" color={color} />,
        }}
      />
    </Tabs>
  )
}

// ── Emoji-based tab icon (replace with vector icons in production) ────────────
import { Text } from 'react-native'

function TabIcon({ label, color }: { label: string; color: string }) {
  return (
    <Text style={{ fontSize: 20, opacity: color === Colors.purple ? 1 : 0.5 }}>
      {label}
    </Text>
  )
}
