/**
 * apps/mobile/components/ui/Text.tsx — GiftHint Mobile
 *
 * GhText — base text component with design-system variants.
 * Wraps React Native Text with GiftHint typography tokens.
 *
 * Usage:
 *   <GhText>Default body text</GhText>
 *   <GhText variant="title">Screen heading</GhText>
 *   <GhText variant="muted">Secondary caption</GhText>
 *   <GhText variant="label">Card label</GhText>
 *   <GhText variant="caption">Tiny helper text</GhText>
 */

import { Text, type TextProps } from 'react-native'
import { Colors }               from '@/constants/Colors'

export type TextVariant = 'body' | 'title' | 'subtitle' | 'label' | 'muted' | 'caption'

interface GhTextProps extends TextProps {
  variant?: TextVariant
}

const variantStyles: Record<TextVariant, object> = {
  body: {
    fontSize:   15,
    lineHeight: 22,
    color:      Colors.text,
    fontWeight: '400',
  },
  title: {
    fontSize:   22,
    lineHeight: 28,
    color:      Colors.text,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize:   17,
    lineHeight: 24,
    color:      Colors.text,
    fontWeight: '600',
  },
  label: {
    fontSize:   15,
    lineHeight: 20,
    color:      Colors.text,
    fontWeight: '600',
  },
  muted: {
    fontSize:   14,
    lineHeight: 20,
    color:      Colors.muted,
    fontWeight: '400',
  },
  caption: {
    fontSize:   12,
    lineHeight: 16,
    color:      Colors.muted,
    fontWeight: '400',
  },
}

export function GhText({ variant = 'body', style, ...props }: GhTextProps) {
  return (
    <Text
      style={[variantStyles[variant], style]}
      {...props}
    />
  )
}
