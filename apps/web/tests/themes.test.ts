/**
 * tests/themes.test.ts — GiftHint
 *
 * Unit tests for the premium theme system (lib/themes.ts).
 *
 * Coverage:
 *   getTheme()
 *     — returns the correct ThemeTokens for each of the 5 premium themes
 *     — returns default tokens for null / undefined / empty-string input
 *     — returns default tokens for an unrecognised key
 *     — preserves the key field on every returned token set
 *
 *   Theme token structure (per theme)
 *     — all required color fields are non-empty strings
 *     — isLight is correct for light vs. dark themes
 *     — light themes have high-luminance bg (starts with #F or #f)
 *     — accent colors are unique per theme
 *     — fontBody / fontHead are non-empty strings
 *     — all six radius fields are present and end with "px"
 *     — all three shadow fields are present and non-empty
 *
 *   Theme-specific token assertions
 *     midnight — gold accent (#C9A84C), serif fonts, dark bg
 *     cloud    — light bg (#F7F7FC), isLight=true, indigo accent (#7B6EE8)
 *     forest   — deep green bg (#1A2E1A), copper accent (#B87333), cream text
 *     rose     — blush bg (#FDF0F0), isLight=true, serif fonts, rounder radii
 *     slate    — near-black blue bg (#0D1117), electric blue accent (#2F81F7), mono fonts
 *
 *   toCSSVars()
 *     — returns exactly 30 CSS custom property entries (all --theme-* keys)
 *     — all keys are prefixed with '--theme-'
 *     — values match the token object fields
 *     — works correctly for a light theme (cloud) and a dark theme (midnight)
 *
 *   DB constraint simulation
 *     — the set of valid theme keys exactly matches the SQL CHECK constraint
 *     — PREMIUM_THEME_KEYS contains exactly 5 entries (no 'default')
 *     — invalid theme names are not in the valid set
 *
 *   PREMIUM_THEME_KEYS export
 *     — contains the 5 expected keys in order
 *     — does NOT contain 'default'
 *
 * No mocks needed — all exports are pure functions with no I/O.
 * Run with: npm test -- themes
 */

import {
  getTheme,
  toCSSVars,
  THEMES,
  PREMIUM_THEME_KEYS,
} from '@/lib/themes'
import type { ThemeKey, ThemeTokens, ThemeColors } from '@/lib/themes'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The set of theme keys the SQL CHECK constraint allows.
 * Must stay in sync with supabase/migrations/20260518_wishlist_theme.sql:
 *   CHECK (theme IN ('default', 'midnight', 'cloud', 'forest', 'rose', 'slate'))
 */
const DB_ALLOWED_THEMES = new Set<string>([
  'default',
  'midnight',
  'cloud',
  'forest',
  'rose',
  'slate',
])

/** All required color keys that every ThemeColors must provide. */
const COLOR_KEYS: (keyof ThemeColors)[] = [
  'bg', 'surface', 'surface2', 'surface3',
  'text', 'muted',
  'accent', 'accentDim', 'accentSoft', 'accentRing', 'accentGlow',
  'green', 'greenDim', 'greenRing',
  'amber', 'amberDim', 'amberRing',
  'red',
  'border', 'borderSoft',
]

/** Returns true if a hex string looks like a plausible 6-digit hex color. */
function isHexColor(s: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(s)
}

/** Rough luminance heuristic: light themes start with high R/G/B values. */
function hexLooksLight(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (r + g + b) / 3 > 200
}

// ─────────────────────────────────────────────────────────────────────────────
// getTheme() — fallback behaviour
// ─────────────────────────────────────────────────────────────────────────────

describe('getTheme() — fallback for unknown / missing keys', () => {
  it('returns default tokens for null', () => {
    expect(getTheme(null).key).toBe('default')
  })

  it('returns default tokens for undefined', () => {
    expect(getTheme(undefined).key).toBe('default')
  })

  it('returns default tokens for an empty string', () => {
    expect(getTheme('').key).toBe('default')
  })

  it('returns default tokens for an unrecognised key', () => {
    expect(getTheme('neon-brutalism').key).toBe('default')
  })

  it('returns default tokens when key is whitespace', () => {
    expect(getTheme('  ').key).toBe('default')
  })

  it('key field on the returned object matches the key argument', () => {
    const t = getTheme('midnight')
    expect(t.key).toBe('midnight')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getTheme() — identity: each key returns its own tokens
// ─────────────────────────────────────────────────────────────────────────────

describe('getTheme() — returns correct token set for each theme key', () => {
  const allKeys: ThemeKey[] = ['default', 'midnight', 'cloud', 'forest', 'rose', 'slate']

  for (const key of allKeys) {
    it(`"${key}" — returned tokens have key="${key}"`, () => {
      expect(getTheme(key).key).toBe(key)
    })

    it(`"${key}" — returned tokens match THEMES["${key}"] exactly`, () => {
      expect(getTheme(key)).toBe(THEMES[key])
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Token structure — every theme must satisfy these invariants
// ─────────────────────────────────────────────────────────────────────────────

describe('ThemeTokens structure — invariants across all themes', () => {
  const allKeys: ThemeKey[] = ['default', 'midnight', 'cloud', 'forest', 'rose', 'slate']

  for (const key of allKeys) {
    describe(`"${key}" theme`, () => {
      let t: ThemeTokens

      beforeAll(() => { t = getTheme(key) })

      it('has non-empty label and tagline', () => {
        expect(t.label.trim().length).toBeGreaterThan(0)
        expect(t.tagline.trim().length).toBeGreaterThan(0)
      })

      it('has a boolean isLight field', () => {
        expect(typeof t.isLight).toBe('boolean')
      })

      it('has non-empty fontBody and fontHead strings', () => {
        expect(t.fontBody.trim().length).toBeGreaterThan(0)
        expect(t.fontHead.trim().length).toBeGreaterThan(0)
      })

      it('has all required color fields as non-empty strings', () => {
        for (const colorKey of COLOR_KEYS) {
          const value = t.colors[colorKey]
          expect(typeof value).toBe('string')
          expect((value as string).trim().length).toBeGreaterThan(0)
        }
      })

      it('has all six radius fields ending with "px"', () => {
        for (const rk of ['xs', 'sm', 'md', 'lg', 'xl', 'pill'] as const) {
          expect(t.radius[rk]).toMatch(/px$/)
        }
      })

      it('has all three shadow fields as non-empty strings', () => {
        expect(t.shadow.card.trim().length).toBeGreaterThan(0)
        expect(t.shadow.pop.trim().length).toBeGreaterThan(0)
        expect(t.shadow.glow.trim().length).toBeGreaterThan(0)
      })

      it('bg is a valid 6-digit hex color', () => {
        expect(isHexColor(t.colors.bg)).toBe(true)
      })

      it('accent is a valid 6-digit hex color', () => {
        expect(isHexColor(t.colors.accent)).toBe(true)
      })

      it('isLight=true → bg has high average luminance', () => {
        if (t.isLight) {
          expect(hexLooksLight(t.colors.bg)).toBe(true)
        }
      })

      it('isLight=false → bg has low average luminance', () => {
        if (!t.isLight) {
          expect(hexLooksLight(t.colors.bg)).toBe(false)
        }
      })
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Theme-specific assertions — guard against accidental token regressions
// ─────────────────────────────────────────────────────────────────────────────

describe('midnight theme — luxury gold serif', () => {
  const t = getTheme('midnight')

  it('has warm near-black bg (#0A0908)', () => {
    expect(t.colors.bg).toBe('#0A0908')
  })

  it('has gold accent (#C9A84C)', () => {
    expect(t.colors.accent).toBe('#C9A84C')
  })

  it('is not a light theme', () => {
    expect(t.isLight).toBe(false)
  })

  it('uses serif fonts for both body and headings', () => {
    expect(t.fontBody.toLowerCase()).toContain('georgia')
    expect(t.fontHead.toLowerCase()).toContain('georgia')
  })

  it('uses DEFAULT_RADIUS values (md=12px, lg=16px, xl=20px)', () => {
    expect(t.radius.md).toBe('12px')
    expect(t.radius.lg).toBe('16px')
    expect(t.radius.xl).toBe('20px')
  })

  it('glow shadow references the gold accent color', () => {
    // The glow shadow is built from alpha(accent, ...) — should contain the RGB values of #C9A84C
    // RGB: 201, 168, 76
    expect(t.shadow.glow).toContain('201,168,76')
  })
})

describe('cloud theme — light minimal', () => {
  const t = getTheme('cloud')

  it('has a light off-white bg (#F7F7FC)', () => {
    expect(t.colors.bg).toBe('#F7F7FC')
  })

  it('has soft indigo accent (#7B6EE8)', () => {
    expect(t.colors.accent).toBe('#7B6EE8')
  })

  it('is a light theme', () => {
    expect(t.isLight).toBe(true)
  })

  it('has dark text suitable for a white background (#1A1830)', () => {
    expect(t.colors.text).toBe('#1A1830')
  })

  it('uses sans-serif fonts', () => {
    // Cloud uses SANS which includes system-ui and Roboto, not Georgia/Mono
    expect(t.fontBody.toLowerCase()).not.toContain('georgia')
    expect(t.fontBody.toLowerCase()).not.toContain('monospace')
  })

  it('uses accessibility-adjusted green for success states on white bg', () => {
    // Darker than SEMANTIC green (#4EC99A) to maintain contrast on white
    expect(t.colors.green).toBe('#1E9966')
  })

  it('uses accessibility-adjusted amber on white bg', () => {
    expect(t.colors.amber).toBe('#D97706')
  })
})

describe('forest theme — organic deep green', () => {
  const t = getTheme('forest')

  it('has deep forest green bg (#1A2E1A)', () => {
    expect(t.colors.bg).toBe('#1A2E1A')
  })

  it('has warm copper accent (#B87333)', () => {
    expect(t.colors.accent).toBe('#B87333')
  })

  it('is not a light theme', () => {
    expect(t.isLight).toBe(false)
  })

  it('has cream text (#F2EDD8) to complement the dark green canvas', () => {
    expect(t.colors.text).toBe('#F2EDD8')
  })

  it('uses sans-serif fonts', () => {
    expect(t.fontBody.toLowerCase()).toContain('system-ui')
  })

  it('glow shadow references the copper accent color', () => {
    // RGB of #B87333 = 184, 115, 51
    expect(t.shadow.glow).toContain('184,115,51')
  })
})

describe('rose theme — wedding blush', () => {
  const t = getTheme('rose')

  it('has blush pink bg (#FDF0F0)', () => {
    expect(t.colors.bg).toBe('#FDF0F0')
  })

  it('has deep rose accent (#C44569)', () => {
    expect(t.colors.accent).toBe('#C44569')
  })

  it('is a light theme', () => {
    expect(t.isLight).toBe(true)
  })

  it('uses serif fonts for body and headings', () => {
    expect(t.fontBody.toLowerCase()).toContain('georgia')
    expect(t.fontHead.toLowerCase()).toContain('georgia')
  })

  it('has rounder radii than the default set (md=14px, lg=20px, xl=24px)', () => {
    expect(t.radius.md).toBe('14px')
    expect(t.radius.lg).toBe('20px')
    expect(t.radius.xl).toBe('24px')
  })

  it('still has default xs, sm, pill values', () => {
    expect(t.radius.xs).toBe('4px')
    expect(t.radius.sm).toBe('6px')
    expect(t.radius.pill).toBe('999px')
  })

  it('uses accessibility-adjusted red for errors on warm bg', () => {
    // Darker red than SEMANTIC red for warm light canvas
    expect(t.colors.red).toBe('#B91C1C')
  })
})

describe('slate theme — dark technical', () => {
  const t = getTheme('slate')

  it('has dark blue-grey bg (#0D1117)', () => {
    expect(t.colors.bg).toBe('#0D1117')
  })

  it('has electric blue accent (#2F81F7)', () => {
    expect(t.colors.accent).toBe('#2F81F7')
  })

  it('is not a light theme', () => {
    expect(t.isLight).toBe(false)
  })

  it('uses monospace fonts for body and headings', () => {
    expect(t.fontBody.toLowerCase()).toContain('monospace')
    expect(t.fontHead.toLowerCase()).toContain('monospace')
  })

  it('has sharper radii than default (md=8px, lg=12px, xl=14px)', () => {
    expect(t.radius.md).toBe('8px')
    expect(t.radius.lg).toBe('12px')
    expect(t.radius.xl).toBe('14px')
  })

  it('glow shadow references the electric blue accent', () => {
    // RGB of #2F81F7 = 47, 129, 247
    expect(t.shadow.glow).toContain('47,129,247')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Accent uniqueness — each theme must have a distinct primary accent
// ─────────────────────────────────────────────────────────────────────────────

describe('accent colors — unique per theme', () => {
  it('no two themes share the same accent hex', () => {
    const allKeys: ThemeKey[] = ['default', 'midnight', 'cloud', 'forest', 'rose', 'slate']
    const accents = allKeys.map(k => getTheme(k).colors.accent)
    const unique  = new Set(accents)
    expect(unique.size).toBe(allKeys.length)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// toCSSVars() — CSS custom property output
// ─────────────────────────────────────────────────────────────────────────────

describe('toCSSVars() — CSS custom property map', () => {
  /**
   * The full set of expected CSS custom property keys.
   * Must stay in sync with the toCSSVars() implementation in lib/themes.ts.
   */
  const EXPECTED_CSS_VAR_KEYS = [
    '--theme-bg', '--theme-surface', '--theme-surface2', '--theme-surface3',
    '--theme-text', '--theme-muted',
    '--theme-accent', '--theme-accent-dim', '--theme-accent-soft',
    '--theme-accent-ring', '--theme-accent-glow',
    '--theme-green', '--theme-green-dim', '--theme-green-ring',
    '--theme-amber', '--theme-amber-dim', '--theme-amber-ring',
    '--theme-red',
    '--theme-border', '--theme-border-soft',
    '--theme-font-body', '--theme-font-head',
    '--theme-radius-xs', '--theme-radius-sm', '--theme-radius-md',
    '--theme-radius-lg', '--theme-radius-xl', '--theme-radius-pill',
    '--theme-shadow-card', '--theme-shadow-pop', '--theme-shadow-glow',
  ]

  it('returns exactly 31 CSS variable entries', () => {
    const vars = toCSSVars(getTheme('default'))
    expect(Object.keys(vars).length).toBe(31)
  })

  it('all keys are prefixed with --theme-', () => {
    const vars = toCSSVars(getTheme('default'))
    for (const key of Object.keys(vars)) {
      expect(key.startsWith('--theme-')).toBe(true)
    }
  })

  it('contains all expected CSS variable keys', () => {
    const vars = toCSSVars(getTheme('default'))
    for (const expectedKey of EXPECTED_CSS_VAR_KEYS) {
      expect(vars).toHaveProperty(expectedKey)
    }
  })

  it('--theme-bg matches t.colors.bg for midnight', () => {
    const t    = getTheme('midnight')
    const vars = toCSSVars(t)
    expect(vars['--theme-bg']).toBe(t.colors.bg)
  })

  it('--theme-accent matches t.colors.accent for midnight', () => {
    const t    = getTheme('midnight')
    const vars = toCSSVars(t)
    expect(vars['--theme-accent']).toBe('#C9A84C')
  })

  it('--theme-font-body matches t.fontBody', () => {
    const t    = getTheme('slate')
    const vars = toCSSVars(t)
    expect(vars['--theme-font-body']).toBe(t.fontBody)
  })

  it('--theme-radius-md reflects per-theme overrides (rose = 14px)', () => {
    const vars = toCSSVars(getTheme('rose'))
    expect(vars['--theme-radius-md']).toBe('14px')
  })

  it('--theme-radius-md reflects per-theme overrides (slate = 8px)', () => {
    const vars = toCSSVars(getTheme('slate'))
    expect(vars['--theme-radius-md']).toBe('8px')
  })

  it('works for a light theme — --theme-bg has high luminance (cloud)', () => {
    const vars = toCSSVars(getTheme('cloud'))
    expect(vars['--theme-bg']).toBe('#F7F7FC')
  })

  it('all values are non-empty strings', () => {
    for (const key of ['default', 'midnight', 'cloud', 'forest', 'rose', 'slate'] as ThemeKey[]) {
      const vars = toCSSVars(getTheme(key))
      for (const [prop, val] of Object.entries(vars)) {
        expect(typeof val).toBe('string')
        expect(val.trim().length).toBeGreaterThan(0)
      }
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// DB constraint simulation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The wishlists.theme column has a CHECK constraint:
 *   CHECK (theme IN ('default', 'midnight', 'cloud', 'forest', 'rose', 'slate'))
 *
 * These tests validate that the set of keys exported from lib/themes.ts
 * exactly matches the constraint's allow-list.  If you add a theme to one but
 * not the other, these tests will catch the mismatch before it hits production.
 */
describe('DB CHECK constraint alignment', () => {
  /** Simulates what Postgres CHECK (theme IN (...)) does for a given value. */
  function isAllowedByDbConstraint(value: string): boolean {
    return DB_ALLOWED_THEMES.has(value)
  }

  it('DB_ALLOWED_THEMES contains exactly 6 values (default + 5 premium)', () => {
    expect(DB_ALLOWED_THEMES.size).toBe(6)
  })

  it('every key in THEMES is allowed by the DB constraint', () => {
    for (const key of Object.keys(THEMES)) {
      expect(isAllowedByDbConstraint(key)).toBe(true)
    }
  })

  it('every value in DB_ALLOWED_THEMES exists as a key in THEMES', () => {
    // Array.from() avoids TS2802 — Set<string> for...of requires --target es2015+
    for (const allowed of Array.from(DB_ALLOWED_THEMES)) {
      expect(THEMES).toHaveProperty(allowed)
    }
  })

  it('rejects common invalid theme names', () => {
    const invalid = ['neon', 'dark', 'light', 'custom', 'premium', 'gold', 'pink', '']
    for (const name of invalid) {
      expect(isAllowedByDbConstraint(name)).toBe(false)
    }
  })

  it('rejects SQL injection attempts', () => {
    const malicious = ["'; DROP TABLE wishlists; --", "default' OR '1'='1", '<script>']
    for (const attempt of malicious) {
      expect(isAllowedByDbConstraint(attempt)).toBe(false)
    }
  })

  it('constraint is case-sensitive (uppercase variant rejected)', () => {
    expect(isAllowedByDbConstraint('Default')).toBe(false)
    expect(isAllowedByDbConstraint('MIDNIGHT')).toBe(false)
    expect(isAllowedByDbConstraint('CLOUD')).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// PREMIUM_THEME_KEYS export
// ─────────────────────────────────────────────────────────────────────────────

describe('PREMIUM_THEME_KEYS export', () => {
  it('contains exactly 5 entries', () => {
    expect(PREMIUM_THEME_KEYS).toHaveLength(5)
  })

  it('does NOT contain "default"', () => {
    expect(PREMIUM_THEME_KEYS).not.toContain('default')
  })

  it('contains all 5 premium theme keys', () => {
    expect(PREMIUM_THEME_KEYS).toContain('midnight')
    expect(PREMIUM_THEME_KEYS).toContain('cloud')
    expect(PREMIUM_THEME_KEYS).toContain('forest')
    expect(PREMIUM_THEME_KEYS).toContain('rose')
    expect(PREMIUM_THEME_KEYS).toContain('slate')
  })

  it('is ordered: midnight, cloud, forest, rose, slate', () => {
    expect(PREMIUM_THEME_KEYS).toEqual(['midnight', 'cloud', 'forest', 'rose', 'slate'])
  })

  it('every key in PREMIUM_THEME_KEYS resolves to its own token set via getTheme()', () => {
    for (const key of PREMIUM_THEME_KEYS) {
      expect(getTheme(key).key).toBe(key)
    }
  })

  it('every PREMIUM_THEME_KEY is allowed by the DB CHECK constraint', () => {
    for (const key of PREMIUM_THEME_KEYS) {
      expect(DB_ALLOWED_THEMES.has(key)).toBe(true)
    }
  })
})
