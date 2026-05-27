/**
 * apps/mobile/constants/Colors.ts — GiftHint Mobile
 *
 * Design tokens ported from tokens.ts in the web app.
 * All values are React Native compatible (no CSS variables or oklch).
 *
 * Usage:
 *   import { Colors } from '@/constants/Colors'
 *   <View style={{ backgroundColor: Colors.bg }} />
 *
 * NativeWind note: these values are also registered in tailwind.config.js,
 * so you can use className="bg-bg" or className="text-purple" in components.
 * Use this file for StyleSheet.create() or inline styles.
 */

export const Colors = {
  // ── Backgrounds ──────────────────────────────────────────────────────────────
  bg:       '#0C0C0E',   // page canvas — near black
  surface:  '#141418',   // card / elevated surface
  surface2: '#1C1C22',   // pill background, skeleton
  surface3: '#242430',   // hover / deeper inset

  // ── Text ─────────────────────────────────────────────────────────────────────
  text:  '#F0EEE8',   // primary — warm white
  muted: '#7A7870',   // secondary / captions

  // ── Accent — purple ───────────────────────────────────────────────────────────
  purple:     '#8B83F0',
  purpleDim:  'rgba(139,131,240,0.13)',
  purpleSoft: 'rgba(139,131,240,0.22)',
  purpleRing: 'rgba(139,131,240,0.28)',
  purpleGlow: 'rgba(139,131,240,0.18)',

  // ── Semantic ──────────────────────────────────────────────────────────────────
  green:     '#4EC99A',
  greenDim:  'rgba(78,201,154,0.12)',
  greenRing: 'rgba(78,201,154,0.28)',

  amber:     '#F5A94E',
  amberDim:  'rgba(245,169,78,0.12)',
  amberRing: 'rgba(245,169,78,0.28)',

  pink:    '#F472B6',
  pinkDim: 'rgba(244,114,182,0.12)',

  teal:    '#38BDF8',  // baby shower / info accent
  tealDim: 'rgba(56,189,248,0.12)',

  red: '#E24B4A',

  // ── Borders / dividers ────────────────────────────────────────────────────────
  border:     'rgba(240,238,232,0.07)',
  borderSoft: 'rgba(240,238,232,0.12)',

  // ── Shadows (React Native shadow props, not CSS) ──────────────────────────────
  // Use these values with shadowColor + elevation on individual components.
  shadowColor:     '#000000',
  shadowCardOpacity:  0.45,
  shadowPopOpacity:   0.55,
  shadowGlowColor: '#8B83F0',
  shadowGlowOpacity:  0.12,
} as const

export type ColorKey = keyof typeof Colors
