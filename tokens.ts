/**
 * tokens.ts — GiftHint design system
 *
 * Single source of truth for colours, radii, and shadows.
 * Mirrors the CSS custom properties in popup.css so the web app and
 * extension stay visually in sync.
 *
 * Usage (React):
 *   import { tokens } from '@/tokens'
 *   <div style={{ background: tokens.colors.bg }} />
 *
 * Usage (Tailwind arbitrary values):
 *   className="bg-[#0C0C0E] text-[#F0EEE8]"
 */

export const tokens = {
  colors: {
    // ── Backgrounds ───────────────────────────────────────────────────────────
    bg:       '#0C0C0E',   // page canvas — near black
    surface:  '#141418',   // card / elevated surface
    surface2: '#1C1C22',   // pill background, skeleton
    surface3: '#242430',   // hover state / deeper inset

    // ── Text ──────────────────────────────────────────────────────────────────
    text:     '#F0EEE8',   // primary text — warm white
    muted:    '#7A7870',   // secondary / captions

    // ── Accent — purple ───────────────────────────────────────────────────────
    purple:      '#8B83F0',
    purpleDim:   'rgba(139, 131, 240, 0.13)',
    purpleSoft:  'rgba(139, 131, 240, 0.22)',
    purpleRing:  'rgba(139, 131, 240, 0.28)',
    purpleGlow:  'rgba(139, 131, 240, 0.18)',

    // ── Semantic ──────────────────────────────────────────────────────────────
    green:      '#4EC99A',   // price, success, claimed
    greenDim:   'rgba(78, 201, 154, 0.12)',
    greenRing:  'rgba(78, 201, 154, 0.28)',

    amber:      '#F5A94E',   // warning, special tags
    amberDim:   'rgba(245, 169, 78, 0.12)',
    amberRing:  'rgba(245, 169, 78, 0.28)',

    pink:       '#F472B6',   // hearts, branding accents
    pinkDim:    'rgba(244, 114, 182, 0.12)',
    pinkRing:   'rgba(244, 114, 182, 0.28)',

    red:        '#E24B4A',   // errors, destructive

    // ── Borders / dividers ────────────────────────────────────────────────────
    border:     'rgba(240, 238, 232, 0.07)',
    borderSoft: 'rgba(240, 238, 232, 0.12)',
  },

  radius: {
    xs:   '4px',
    sm:   '6px',
    md:   '12px',
    lg:   '16px',
    xl:   '20px',
    pill: '999px',
  },

  shadow: {
    card: '0 4px 24px rgba(0, 0, 0, 0.45)',
    pop:  '0 8px 40px rgba(0, 0, 0, 0.55)',
    glow: '0 0 0 1px rgba(139, 131, 240, 0.18), 0 4px 16px rgba(139, 131, 240, 0.12)',
  },

  font: {
    sans: "var(--font-inter), system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    mono: "'SF Mono', 'Fira Code', 'Fira Mono', 'Roboto Mono', monospace",
  },
} as const

export type Tokens = typeof tokens
export type ColorKey = keyof typeof tokens.colors
