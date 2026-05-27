/**
 * lib/occasion-themes.ts — GiftHint
 *
 * Visual identity per occasion type.
 * Each theme is a pure data object — no React, safe to import anywhere.
 *
 * Usage:
 *   import { getOccasionTheme } from '@/lib/occasion-themes'
 *   const theme = getOccasionTheme(wishlist.occasion)
 *
 * The theme is typically passed into OccasionThemeContext so every child
 * component can consume it without prop-drilling.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export interface OccasionTheme {
  /** The occasion key this theme was built from. */
  key: string

  // ── Colour palette ─────────────────────────────────────────────────────────
  /** Primary accent hex — used for borders, badges, buttons, CTAs. */
  accent:     string
  /** 13 % alpha fill — card and tag backgrounds. */
  accentDim:  string
  /** 22 % alpha fill — pill / badge fill. */
  accentSoft: string
  /** 28 % alpha border — ring around accented elements. */
  accentRing: string

  // ── Copy / identity ────────────────────────────────────────────────────────
  /** Large decorative emoji shown in the hero. */
  emoji: string
  /**
   * Countdown suffix, e.g. "until the birthday".
   * Full sentence: "21 days until the birthday".
   */
  countdownLabel: string
  /**
   * Optional hero tagline. Receives the wisher's first name and returns the
   * full sentence, e.g. (name) => `${name}'s birthday is coming up!`
   * Null for occasions without a specific tagline.
   */
  heroTagline: ((name: string) => string) | null
}

// ── Helper: build alpha variants from a hex colour ────────────────────────────

function alpha(hex: string, a: number): string {
  // Parse 6-digit hex, return rgba() string.
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}

function buildTheme(
  key:            string,
  accent:         string,
  emoji:          string,
  countdownLabel: string,
  heroTagline:    ((name: string) => string) | null,
): OccasionTheme {
  return {
    key,
    accent,
    accentDim:  alpha(accent, 0.13),
    accentSoft: alpha(accent, 0.22),
    accentRing: alpha(accent, 0.28),
    emoji,
    countdownLabel,
    heroTagline,
  }
}

// ── Catalogue ─────────────────────────────────────────────────────────────────

const THEMES: Readonly<Record<string, OccasionTheme>> = {
  birthday: buildTheme(
    'birthday',
    '#E872A0',
    '🎂',
    'until the birthday',
    (name) => `${name}'s birthday is coming up!`,
  ),

  christmas: buildTheme(
    'christmas',
    '#4EC99A',
    '🎄',
    'until Christmas',
    (name) => `Help ${name} have a magical Christmas`,
  ),

  wedding: buildTheme(
    'wedding',
    '#E8A84A',
    '💍',
    'until the wedding',
    (name) => `${name} is getting married!`,
  ),

  baby_shower: buildTheme(
    'baby_shower',
    '#38BDF8',
    '👶',
    'until the shower',
    null,
  ),

  graduation: buildTheme(
    'graduation',
    '#8B83F0',
    '🎓',
    'until graduation',
    null,
  ),

  housewarming: buildTheme(
    'housewarming',
    '#F5A94E',
    '🏠',
    'until the housewarming',
    null,
  ),

  anniversary: buildTheme(
    'anniversary',
    '#E872A0',
    '🥂',
    'until the anniversary',
    null,
  ),
}

/** Fallback used for 'other' and any unrecognised key. */
export const DEFAULT_OCCASION_THEME: OccasionTheme = buildTheme(
  'other',
  '#8B83F0',
  '🎁',
  'days away',
  null,
)

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the OccasionTheme for the given occasion key.
 * Falls back to DEFAULT_OCCASION_THEME for 'other' and unrecognised keys.
 */
export function getOccasionTheme(occasion: string): OccasionTheme {
  return THEMES[occasion] ?? DEFAULT_OCCASION_THEME
}
