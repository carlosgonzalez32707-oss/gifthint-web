/**
 * apps/mobile/components/ui/Card.tsx — GiftHint Mobile
 *
 * GhCard — the core surface container used across lists, items, and modals.
 * Matches the web's `surface` background (#141418), 12px radius, and border.
 *
 * Usage:
 *   <GhCard>
 *     <GhText variant="label">Title</GhText>
 *   </GhCard>
 *
 *   <GhCard style={{ padding: 20 }} onPress={handlePress}>
 *     …tappable card…
 *   </GhCard>
 */

import { Pressable, View, type ViewStyle } from 'react-native'
import { Colors }                          from '@/constants/Colors'

interface GhCardProps {
  children:  React.ReactNode
  onPress?:  () => void
  style?:    ViewStyle
}

const cardStyle: ViewStyle = {
  backgroundColor: Colors.surface,
  borderRadius:    12,
  borderWidth:     1,
  borderColor:     Colors.border,
  padding:         16,
  // iOS shadow
  shadowColor:    Colors.shadowColor,
  shadowOffset:   { width: 0, height: 2 },
  shadowOpacity:  0.25,
  shadowRadius:   8,
  // Android elevation
  elevation:      3,
}

export function GhCard({ children, onPress, style }: GhCardProps) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          cardStyle,
          pressed && { backgroundColor: Colors.surface2 },
          style,
        ]}
        accessibilityRole="button"
      >
        {children}
      </Pressable>
    )
  }

  return (
    <View style={[cardStyle, style]}>
      {children}
    </View>
  )
}
