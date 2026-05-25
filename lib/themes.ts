/**
 * lib/themes.ts — GiftHint premium theme system
 *
 * Five premium themes for gifter pages.  Each theme ships a complete design
 * token set that parallels the shape of tokens.ts, plus typography and CSS
 * custom-property helpers so ThemeProvider can apply the theme with a single
 * inline-style assignment.
 *
 * ── Theme catalogue ───────────────────────────────────────────────────────────
 *
 *  'default'   Dark canvas, purple accent — the standard GiftHint look.
 *              Identical to tokens.ts; used when no theme is selected.
 *
 *  'midnight'  Near-black warm canvas, gold (#C9A84C) accent, serif fonts.
 *              Feels like a luxury jewellery catalogue or premium hotel.
 *
 *  'cloud'     White/light-grey canvas, soft indigo accent, airy and minimal.
 *              Great for everyday wishlists and modern shoppers.
 *
 *  'forest'    Deep green canvas (#1A2E1A), cream text, copper accent.
 *              Organic, grounded — works well for wellness and home gifts.
 *
 *  'rose'      Blush-pink canvas (#FDF0F0), deep rose accent, serif touches.
 *              Built for weddings, anniversaries, and romantic occasions.
 *
 *  'slate'     Dark blue-grey canvas, electric blue accent, monospace type.
 *              Modern/tech aesthetic — sharp, precise, no-nonsense.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 *
 *   import { getTheme, toCSSVars } from '@/lib/themes'
 *
 *   const t = getTheme('midnight')
 *   <div style={{ ...toCSSVars(t), background: 'var(--theme-bg)' }}>...</div>
 *
 * ── Gating ────────────────────────────────────────────────────────────────────
 *
 *   'default' is free.  'midnight' | 'cloud' | 'forest' | 'rose' | 'slate'
 *   require either a paid Pro subscription or the referral-milestone unlock
 *   (premium_themes_enabled = true).  Gating is enforced in ThemeSelector and
 *   the PATCH /api/wishlists/[id] endpoint.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type ThemeKey = 'default' | 'midnight' | 'cloud' | 'forest' | 'rose' | 'slate'

export interface ThemeColors {
  // ── Backgrounds ─────────────────────────────────────────────────────────────
  bg:       string
  surface:  string
  surface2: string
  surface3: string

  // ── Text ────────────────────────────────────────────────────────────────────
  text:  string
  muted: string

  // ── Accent (primary brand colour for this theme) ─────────────────────────
  accent:     string
  accentDim:  string   // 13 % alpha — subtle fills
  accentSoft: string   // 22 % alpha — pill / badge fills
  accentRing: string   // 28 % alpha — border rings
  accentGlow: string   // 18 % alpha — glow shadows

  // ── Semantic (mostly constant; adjusted for light themes) ────────────────
  green:     string
  greenDim:  string
  greenRing: string

  amber:     string
  amberDim:  string
  amberRing: string

  red: string

  // ── Borders ─────────────────────────────────────────────────────────────────
  border:     string
  borderSoft: string
}

export interface ThemeTokens {
  key:       ThemeKey
  label:     string
  /** Short description shown in ThemeSelector cards. */
  tagline:   string
  /** Whether this theme has a light (white/pastel) background. */
  isLight:   boolean
  colors:    ThemeColors
  /** Font stack for body text. */
  fontBody:  string
  /** Font stack for headings (may match fontBody or be more expressive). */
  fontHead:  string
  /** Radius set — themes keep the same shape vocabulary but may differ. */
  radius: {
    xs:   string
    sm:   string
    md:   string
    lg:   string
    xl:   string
    pill: string
  }
  shadow: {
    card: string
    pop:  string
    glow: string
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function alpha(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}

const DEFAULT_RADIUS = {
  xs:   '4px',
  sm:   '6px',
  md:   '12px',
  lg:   '16px',
  xl:   '20px',
  pill: '999px',
}

const SANS =
  "var(--font-inter), system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

const SERIF =
  "Georgia, 'Palatino Linotype', Palatino, 'Book Antiqua', 'Times New Roman', serif"

const MONO =
  "'SF Mono', 'Fira Code', 'Fira Mono', 'Cascadia Code', Consolas, 'Roboto Mono', monospace"

// Semantic colours — same across all themes; they're feedback colours, not brand.
const SEMANTIC = {
  green:     '#4EC99A',
  greenDim:  'rgba(78,201,154,0.12)',
  greenRing: 'rgba(78,201,154,0.28)',
  amber:     '#F5A94E',
  amberDim:  'rgba(245,169,78,0.12)',
  amberRing: 'rgba(245,169,78,0.28)',
  red:       '#E24B4A',
}

// ── Theme definitions ─────────────────────────────────────────────────────────

export const THEMES: Record<ThemeKey, ThemeTokens> = {

  // ── default ─────────────────────────────────────────────────────────────────
  default: {
    key:     'default',
    label:   'Default',
    tagline: 'The classic GiftHint look.',
    isLight: false,
    colors: {
      bg:         '#0C0C0E',
      surface:    '#141418',
      surface2:   '#1C1C22',
      surface3:   '#242430',
      text:       '#F0EEE8',
      muted:      '#7A7870',
      accent:     '#8B83F0',
      accentDim:  alpha('#8B83F0', 0.13),
      accentSoft: alpha('#8B83F0', 0.22),
      accentRing: alpha('#8B83F0', 0.28),
      accentGlow: alpha('#8B83F0', 0.18),
      border:     'rgba(240,238,232,0.07)',
      borderSoft: 'rgba(240,238,232,0.12)',
      ...SEMANTIC,
    },
    fontBody: SANS,
    fontHead: SANS,
    radius: DEFAULT_RADIUS,
    shadow: {
      card: '0 4px 24px rgba(0,0,0,0.45)',
      pop:  '0 8px 40px rgba(0,0,0,0.55)',
      glow: `0 0 0 1px ${alpha('#8B83F0', 0.18)}, 0 4px 16px ${alpha('#8B83F0', 0.12)}`,
    },
  },

  // ── midnight ─────────────────────────────────────────────────────────────────
  // Warm near-black with gold accents and serif typography.
  // Evokes premium jewellery catalogues and luxury hotel branding.
  midnight: {
    key:     'midnight',
    label:   'Midnight',
    tagline: 'Warm black canvas, gold accents, serif elegance.',
    isLight: false,
    colors: {
      bg:         '#0A0908',
      surface:    '#131110',
      surface2:   '#1E1B19',
      surface3:   '#2C2825',
      text:       '#F5F0E4',
      muted:      '#7A7060',
      accent:     '#C9A84C',
      accentDim:  alpha('#C9A84C', 0.13),
      accentSoft: alpha('#C9A84C', 0.22),
      accentRing: alpha('#C9A84C', 0.28),
      accentGlow: alpha('#C9A84C', 0.18),
      border:     'rgba(245,240,228,0.07)',
      borderSoft: 'rgba(245,240,228,0.12)',
      ...SEMANTIC,
    },
    fontBody: SERIF,
    fontHead: SERIF,
    radius: DEFAULT_RADIUS,
    shadow: {
      card: '0 4px 24px rgba(0,0,0,0.60)',
      pop:  '0 8px 40px rgba(0,0,0,0.70)',
      glow: `0 0 0 1px ${alpha('#C9A84C', 0.22)}, 0 4px 20px ${alpha('#C9A84C', 0.15)}`,
    },
  },

  // ── cloud ────────────────────────────────────────────────────────────────────
  // White / light-grey canvas with a soft indigo accent.
  // Bright, clean, accessible — good for everyday everyday gift ideas.
  cloud: {
    key:     'cloud',
    label:   'Cloud',
    tagline: 'Bright and airy — light, minimal, welcoming.',
    isLight: true,
    colors: {
      bg:         '#F7F7FC',
      surface:    '#FFFFFF',
      surface2:   '#EEEEF8',
      surface3:   '#E4E4F2',
      text:       '#1A1830',
      muted:      '#7870A0',
      accent:     '#7B6EE8',
      accentDim:  alpha('#7B6EE8', 0.10),
      accentSoft: alpha('#7B6EE8', 0.18),
      accentRing: alpha('#7B6EE8', 0.25),
      accentGlow: alpha('#7B6EE8', 0.14),
      border:     'rgba(26,24,48,0.08)',
      borderSoft: 'rgba(26,24,48,0.14)',
      // Semantic slightly adjusted — darker greens readable on white
      green:     '#1E9966',
      greenDim:  'rgba(30,153,102,0.10)',
      greenRing: 'rgba(30,153,102,0.25)',
      amber:     '#D97706',
      amberDim:  'rgba(217,119,6,0.10)',
      amberRing: 'rgba(217,119,6,0.25)',
      red:       '#DC2626',
    },
    fontBody: SANS,
    fontHead: SANS,
    radius: DEFAULT_RADIUS,
    shadow: {
      card: '0 2px 16px rgba(26,24,48,0.08)',
      pop:  '0 6px 32px rgba(26,24,48,0.14)',
      glow: `0 0 0 1px ${alpha('#7B6EE8', 0.20)}, 0 4px 16px ${alpha('#7B6EE8', 0.10)}`,
    },
  },

  // ── forest ───────────────────────────────────────────────────────────────────
  // Deep green background with cream text and warm copper accents.
  // Organic, grounded — wellness gifts, home, garden, and outdoor items.
  forest: {
    key:     'forest',
    label:   'Forest',
    tagline: 'Deep green, cream text, copper warmth.',
    isLight: false,
    colors: {
      bg:         '#1A2E1A',
      surface:    '#213521',
      surface2:   '#2C4A2C',
      surface3:   '#375937',
      text:       '#F2EDD8',
      muted:      '#8A9A78',
      accent:     '#B87333',
      accentDim:  alpha('#B87333', 0.13),
      accentSoft: alpha('#B87333', 0.22),
      accentRing: alpha('#B87333', 0.28),
      accentGlow: alpha('#B87333', 0.18),
      border:     'rgba(242,237,216,0.07)',
      borderSoft: 'rgba(242,237,216,0.13)',
      ...SEMANTIC,
    },
    fontBody: SANS,
    fontHead: SANS,
    radius: DEFAULT_RADIUS,
    shadow: {
      card: '0 4px 24px rgba(0,0,0,0.50)',
      pop:  '0 8px 40px rgba(0,0,0,0.60)',
      glow: `0 0 0 1px ${alpha('#B87333', 0.22)}, 0 4px 20px ${alpha('#B87333', 0.14)}`,
    },
  },

  // ── rose ─────────────────────────────────────────────────────────────────────
  // Blush-pink background, deep rose accent, serif softness.
  // Built for weddings, anniversaries, Valentine's, and romantic occasions.
  rose: {
    key:     'rose',
    label:   'Rose',
    tagline: 'Blush pink and deep rose — perfect for weddings.',
    isLight: true,
    colors: {
      bg:         '#FDF0F0',
      surface:    '#FFFFFF',
      surface2:   '#FAE6E6',
      surface3:   '#F5D5D5',
      text:       '#2D1515',
      muted:      '#9A6868',
      accent:     '#C44569',
      accentDim:  alpha('#C44569', 0.09),
      accentSoft: alpha('#C44569', 0.16),
      accentRing: alpha('#C44569', 0.24),
      accentGlow: alpha('#C44569', 0.13),
      border:     'rgba(45,21,21,0.08)',
      borderSoft: 'rgba(45,21,21,0.14)',
      // Semantic adjusted for warm light canvas
      green:     '#1E7A55',
      greenDim:  'rgba(30,122,85,0.10)',
      greenRing: 'rgba(30,122,85,0.25)',
      amber:     '#B45309',
      amberDim:  'rgba(180,83,9,0.10)',
      amberRing: 'rgba(180,83,9,0.25)',
      red:       '#B91C1C',
    },
    fontBody: SERIF,
    fontHead: SERIF,
    radius: {
      ...DEFAULT_RADIUS,
      // Slightly rounder — matches the softer aesthetic
      md:   '14px',
      lg:   '20px',
      xl:   '24px',
    },
    shadow: {
      card: '0 2px 20px rgba(45,21,21,0.07)',
      pop:  '0 6px 36px rgba(45,21,21,0.12)',
      glow: `0 0 0 1px ${alpha('#C44569', 0.20)}, 0 4px 16px ${alpha('#C44569', 0.10)}`,
    },
  },

  // ── slate ────────────────────────────────────────────────────────────────────
  // Dark blue-grey background, electric blue accent, monospace typography.
  // Modern / tech aesthetic — precise, intentional, no ornamentation.
  slate: {
    key:     'slate',
    label:   'Slate',
    tagline: 'Dark blue-grey, electric blue, monospace vibes.',
    isLight: false,
    colors: {
      bg:         '#0D1117',
      surface:    '#161B22',
      surface2:   '#1C2128',
      surface3:   '#22272E',
      text:       '#E6EDF3',
      muted:      '#6E7681',
      accent:     '#2F81F7',
      accentDim:  alpha('#2F81F7', 0.12),
      accentSoft: alpha('#2F81F7', 0.20),
      accentRing: alpha('#2F81F7', 0.28),
      accentGlow: alpha('#2F81F7', 0.16),
      border:     'rgba(230,237,243,0.07)',
      borderSoft: 'rgba(230,237,243,0.12)',
      ...SEMANTIC,
    },
    fontBody: MONO,
    fontHead: MONO,
    radius: {
      ...DEFAULT_RADIUS,
      // Slightly less round — a sharper, more technical feel
      md:   '8px',
      lg:   '12px',
      xl:   '14px',
    },
    shadow: {
      card: '0 4px 24px rgba(0,0,0,0.55)',
      pop:  '0 8px 40px rgba(0,0,0,0.65)',
      glow: `0 0 0 1px ${alpha('#2F81F7', 0.22)}, 0 4px 20px ${alpha('#2F81F7', 0.14)}`,
    },
  },
}

// ── API ───────────────────────────────────────────────────────────────────────

/**
 * Returns the ThemeTokens for the given key.
 * Falls back to 'default' for unknown / undefined values.
 */
export function getTheme(key: string | null | undefined): ThemeTokens {
  if (key && key in THEMES) return THEMES[key as ThemeKey]
  return THEMES.default
}

/**
 * Converts a ThemeTokens object into a flat CSS custom-property map
 * suitable for spreading into a React `style` prop.
 *
 * Every property is prefixed with `--theme-` so there's no collision with
 * global CSS variables or Next.js built-in properties.
 *
 * Example output:
 *   { '--theme-bg': '#0A0908', '--theme-accent': '#C9A84C', … }
 */
export function toCSSVars(t: ThemeTokens): Record<string, string> {
  return {
    // Backgrounds
    '--theme-bg':       t.colors.bg,
    '--theme-surface':  t.colors.surface,
    '--theme-surface2': t.colors.surface2,
    '--theme-surface3': t.colors.surface3,

    // Text
    '--theme-text':  t.colors.text,
    '--theme-muted': t.colors.muted,

    // Accent
    '--theme-accent':      t.colors.accent,
    '--theme-accent-dim':  t.colors.accentDim,
    '--theme-accent-soft': t.colors.accentSoft,
    '--theme-accent-ring': t.colors.accentRing,
    '--theme-accent-glow': t.colors.accentGlow,

    // Semantic
    '--theme-green':      t.colors.green,
    '--theme-green-dim':  t.colors.greenDim,
    '--theme-green-ring': t.colors.greenRing,
    '--theme-amber':      t.colors.amber,
    '--theme-amber-dim':  t.colors.amberDim,
    '--theme-amber-ring': t.colors.amberRing,
    '--theme-red':        t.colors.red,

    // Borders
    '--theme-border':      t.colors.border,
    '--theme-border-soft': t.colors.borderSoft,

    // Typography
    '--theme-font-body': t.fontBody,
    '--theme-font-head': t.fontHead,

    // Radius
    '--theme-radius-xs':   t.radius.xs,
    '--theme-radius-sm':   t.radius.sm,
    '--theme-radius-md':   t.radius.md,
    '--theme-radius-lg':   t.radius.lg,
    '--theme-radius-xl':   t.radius.xl,
    '--theme-radius-pill': t.radius.pill,

    // Shadows
    '--theme-shadow-card': t.shadow.card,
    '--theme-shadow-pop':  t.shadow.pop,
    '--theme-shadow-glow': t.shadow.glow,
  }
}

/**
 * The full ordered list of premium themes shown in ThemeSelector.
 * 'default' is excluded here — it's handled separately as "no theme".
 */
export const PREMIUM_THEME_KEYS: Exclude<ThemeKey, 'default'>[] = [
  'midnight',
  'cloud',
  'forest',
  'rose',
  'slate',
]
