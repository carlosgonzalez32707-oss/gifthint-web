/**
 * apps/mobile/components/ui/Button.tsx — GiftHint Mobile
 *
 * GhButton — primary action button matching the web purple CTA style.
 *
 * Variants:
 *   primary  (default) — purple fill, white label
 *   ghost              — transparent, purple border and label
 *   danger             — red fill, white label
 *
 * Usage:
 *   <GhButton onPress={fn}>Save</GhButton>
 *   <GhButton variant="ghost" onPress={fn}>Cancel</GhButton>
 *   <GhButton disabled>Saving…</GhButton>
 */

import { Pressable, ActivityIndicator, type ViewStyle } from 'react-native'
import { GhText }                                        from './Text'
import { Colors }                                        from '@/constants/Colors'

export type ButtonVariant = 'primary' | 'ghost' | 'danger'

interface GhButtonProps {
  children:   React.ReactNode
  onPress?:   () => void
  variant?:   ButtonVariant
  disabled?:  boolean
  loading?:   boolean
  style?:     ViewStyle
}

export function GhButton({
  children,
  onPress,
  variant = 'primary',
  disabled = false,
  loading  = false,
  style,
}: GhButtonProps) {
  const isDisabled = disabled || loading

  const baseStyle: ViewStyle = {
    borderRadius:     12,
    paddingVertical:  14,
    paddingHorizontal: 20,
    alignItems:       'center',
    justifyContent:   'center',
    flexDirection:    'row',
    gap:              8,
    opacity:          isDisabled ? 0.45 : 1,
  }

  const variantStyle: ViewStyle =
    variant === 'ghost'  ? {
      backgroundColor: 'transparent',
      borderWidth:     1,
      borderColor:     Colors.purpleRing,
    } :
    variant === 'danger' ? {
      backgroundColor: Colors.red,
    } : {
      backgroundColor: Colors.purple,
    }

  const labelColor =
    variant === 'ghost' ? Colors.purple : Colors.bg

  return (
    <Pressable
      onPress={isDisabled ? undefined : onPress}
      style={({ pressed }) => [
        baseStyle,
        variantStyle,
        pressed && !isDisabled && { opacity: 0.8 },
        style,
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
    >
      {loading && <ActivityIndicator color={labelColor} size="small" />}
      <GhText style={{ color: labelColor, fontWeight: '600', fontSize: 15 }}>
        {children}
      </GhText>
    </Pressable>
  )
}
