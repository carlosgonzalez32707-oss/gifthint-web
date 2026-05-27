/**
 * tests/occasion-themes.test.ts — GiftHint
 *
 * Tests for the occasion-aware theming system.
 *
 * Coverage:
 *   getOccasionTheme()   — correct theme for every occasion key, fallback for
 *                          unknown keys, alpha channel variants
 *   CountdownBadge       — "Today is the day!" when date = today (SSR render)
 *                          "Hope they loved their gifts!" when date is past
 *                          Correct urgency colour in the rendered span style
 *                          No output when occasionDate is null
 *
 * Rendering strategy:
 *   CountdownBadge is a 'use client' React component.  We render it with
 *   react-dom/server renderToStaticMarkup, which works in the Node test
 *   environment without jsdom.  useEffect is skipped (no animation), but the
 *   visible text and inline style colours are fully present in the HTML string.
 *
 * Run with: npm test
 */

import React                         from 'react'
import { renderToStaticMarkup }      from 'react-dom/server'
import {
  getOccasionTheme,
  DEFAULT_OCCASION_THEME,
  type OccasionTheme,
}                                    from '@/lib/occasion-themes'
import { CountdownBadge }            from '@/components/CountdownBadge'

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a UTC ISO date string (YYYY-MM-DD) offset by `days` from today.
 * Positive = future, negative = past, 0 = today.
 */
function utcDateOffset(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + days)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

/** Renders CountdownBadge to an HTML string (server-side, no browser needed). */
function renderBadge(props: {
  occasionDate:   string | null
  countdownLabel: string
  accent:         string
}): string {
  return renderToStaticMarkup(React.createElement(CountdownBadge, props))
}

// ─────────────────────────────────────────────────────────────────────────────
// getOccasionTheme() — correct theme per occasion key
// ─────────────────────────────────────────────────────────────────────────────

describe('getOccasionTheme() — theme identity', () => {

  /** All 7 distinct occasion keys and their expected accent colours. */
  const EXPECTATIONS: Array<{ key: string; accent: string; emoji: string }> = [
    { key: 'birthday',    accent: '#E872A0', emoji: '🎂' },
    { key: 'christmas',   accent: '#4EC99A', emoji: '🎄' },
    { key: 'wedding',     accent: '#E8A84A', emoji: '💍' },
    { key: 'baby_shower', accent: '#38BDF8', emoji: '👶' },
    { key: 'graduation',  accent: '#8B83F0', emoji: '🎓' },
    { key: 'housewarming',accent: '#F5A94E', emoji: '🏠' },
    { key: 'anniversary', accent: '#E872A0', emoji: '🥂' },
  ]

  for (const { key, accent, emoji } of EXPECTATIONS) {
    it(`"${key}" returns accent ${accent} and emoji ${emoji}`, () => {
      const theme = getOccasionTheme(key)
      expect(theme.key).toBe(key)
      expect(theme.accent).toBe(accent)
      expect(theme.emoji).toBe(emoji)
    })
  }

  it('"other" returns the default purple theme', () => {
    const theme = getOccasionTheme('other')
    expect(theme.key).toBe('other')
    expect(theme.accent).toBe('#8B83F0')
    expect(theme.emoji).toBe('🎁')
  })

  it('unknown key falls back to DEFAULT_OCCASION_THEME', () => {
    const theme = getOccasionTheme('doesnotexist')
    expect(theme).toEqual(DEFAULT_OCCASION_THEME)
    expect(theme.key).toBe('other')
  })

  it('empty string falls back to DEFAULT_OCCASION_THEME', () => {
    expect(getOccasionTheme('')).toEqual(DEFAULT_OCCASION_THEME)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// getOccasionTheme() — alpha channel variants
// ─────────────────────────────────────────────────────────────────────────────

describe('getOccasionTheme() — alpha variants', () => {

  it('accentDim is rgba at 0.13 alpha', () => {
    const theme = getOccasionTheme('birthday')
    // Birthday accent is #E872A0 = rgb(232, 114, 160)
    expect(theme.accentDim).toBe('rgba(232,114,160,0.13)')
  })

  it('accentSoft is rgba at 0.22 alpha', () => {
    const theme = getOccasionTheme('birthday')
    expect(theme.accentSoft).toBe('rgba(232,114,160,0.22)')
  })

  it('accentRing is rgba at 0.28 alpha', () => {
    const theme = getOccasionTheme('birthday')
    expect(theme.accentRing).toBe('rgba(232,114,160,0.28)')
  })

  it('all three alpha variants are distinct', () => {
    const theme = getOccasionTheme('christmas')
    const variants = new Set([theme.accentDim, theme.accentSoft, theme.accentRing])
    expect(variants.size).toBe(3)
  })

  it('accentDim is darker (lower alpha) than accentRing', () => {
    const theme = getOccasionTheme('wedding')
    const extractAlpha = (rgba: string) => parseFloat(rgba.split(',')[3])
    expect(extractAlpha(theme.accentDim)).toBeLessThan(extractAlpha(theme.accentRing))
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// getOccasionTheme() — countdownLabel and heroTagline
// ─────────────────────────────────────────────────────────────────────────────

describe('getOccasionTheme() — copy fields', () => {

  it('birthday heroTagline includes the provided name', () => {
    const theme = getOccasionTheme('birthday')
    expect(theme.heroTagline).not.toBeNull()
    const tagline = theme.heroTagline!('Sarah')
    expect(tagline).toContain('Sarah')
  })

  it('christmas heroTagline references Christmas', () => {
    const theme = getOccasionTheme('christmas')
    expect(theme.heroTagline!('Tom')).toContain('Tom')
    expect(theme.countdownLabel).toContain('Christmas')
  })

  it('wedding heroTagline includes the name and marriage context', () => {
    const theme = getOccasionTheme('wedding')
    const tagline = theme.heroTagline!('Alex')
    expect(tagline).toContain('Alex')
    expect(tagline.toLowerCase()).toContain('married')
  })

  it('baby_shower has null heroTagline', () => {
    expect(getOccasionTheme('baby_shower').heroTagline).toBeNull()
  })

  it('graduation has null heroTagline', () => {
    expect(getOccasionTheme('graduation').heroTagline).toBeNull()
  })

  it('each occasion has a non-empty countdownLabel', () => {
    for (const key of ['birthday','christmas','wedding','baby_shower','graduation','housewarming','anniversary','other']) {
      const { countdownLabel } = getOccasionTheme(key)
      expect(countdownLabel.length).toBeGreaterThan(0)
    }
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// CountdownBadge — SSR rendering
// ─────────────────────────────────────────────────────────────────────────────

describe('CountdownBadge — today is the day', () => {

  it('renders "Today is the day!" when occasion_date equals today (UTC)', () => {
    const html = renderBadge({
      occasionDate:   utcDateOffset(0),
      countdownLabel: 'until the birthday',
      accent:         '#E872A0',
    })

    expect(html).toContain('Today is the day!')
  })

  it('today badge has role="status" for live region accessibility', () => {
    const html = renderBadge({
      occasionDate:   utcDateOffset(0),
      countdownLabel: 'until the birthday',
      accent:         '#E872A0',
    })

    expect(html).toContain('role="status"')
  })

  it('today badge does not contain a day count number', () => {
    const html = renderBadge({
      occasionDate:   utcDateOffset(0),
      countdownLabel: 'until the birthday',
      accent:         '#E872A0',
    })

    // Should not show "0 days until …"
    expect(html).not.toMatch(/\b0\s+day/)
  })

})

describe('CountdownBadge — past date', () => {

  it('renders "Hope they loved their gifts!" when date is in the past', () => {
    const html = renderBadge({
      occasionDate:   utcDateOffset(-1),   // yesterday
      countdownLabel: 'until the birthday',
      accent:         '#E872A0',
    })

    expect(html).toContain('Hope they loved their gifts!')
  })

  it('renders past message for a date 30 days ago', () => {
    const html = renderBadge({
      occasionDate:   utcDateOffset(-30),
      countdownLabel: 'until the birthday',
      accent:         '#E872A0',
    })

    expect(html).toContain('Hope they loved their gifts!')
  })

  it('past badge is not a timer element', () => {
    const html = renderBadge({
      occasionDate:   utcDateOffset(-5),
      countdownLabel: 'until the birthday',
      accent:         '#E872A0',
    })

    expect(html).not.toContain('role="timer"')
  })

})

describe('CountdownBadge — urgency colours', () => {

  it('uses red (#E24B4A) when fewer than 7 days remain', () => {
    const html = renderBadge({
      occasionDate:   utcDateOffset(3),   // 3 days → urgent
      countdownLabel: 'until the birthday',
      accent:         '#E872A0',
    })

    // Red accent appears as the text colour and in the rgba border
    expect(html).toContain('#E24B4A')
  })

  it('uses red for exactly 1 day remaining', () => {
    const html = renderBadge({
      occasionDate:   utcDateOffset(1),
      countdownLabel: 'until the birthday',
      accent:         '#E872A0',
    })

    expect(html).toContain('#E24B4A')
  })

  it('uses amber (#F5A94E) for 7 days remaining (boundary)', () => {
    const html = renderBadge({
      occasionDate:   utcDateOffset(7),
      countdownLabel: 'until the birthday',
      accent:         '#E872A0',
    })

    expect(html).toContain('#F5A94E')
    expect(html).not.toContain('#E24B4A')
  })

  it('uses amber for 14 days remaining (boundary)', () => {
    const html = renderBadge({
      occasionDate:   utcDateOffset(14),
      countdownLabel: 'until the birthday',
      accent:         '#E872A0',
    })

    expect(html).toContain('#F5A94E')
  })

  it('uses green (#4EC99A) for more than 14 days remaining', () => {
    const html = renderBadge({
      occasionDate:   utcDateOffset(30),
      countdownLabel: 'until the birthday',
      accent:         '#E872A0',
    })

    expect(html).toContain('#4EC99A')
    expect(html).not.toContain('#E24B4A')
    expect(html).not.toContain('#F5A94E')
  })

  it('urgency animation class is present only when fewer than 7 days remain', () => {
    const urgentHtml = renderBadge({ occasionDate: utcDateOffset(4), countdownLabel: 'x', accent: '#E872A0' })
    const calmHtml   = renderBadge({ occasionDate: utcDateOffset(20), countdownLabel: 'x', accent: '#E872A0' })

    expect(urgentHtml).toContain('gh-pulse')
    expect(calmHtml).not.toContain('gh-pulse')
  })

})

describe('CountdownBadge — null date', () => {

  it('renders nothing when occasionDate is null', () => {
    const html = renderBadge({
      occasionDate:   null,
      countdownLabel: 'until the birthday',
      accent:         '#E872A0',
    })

    expect(html).toBe('')
  })

  it('renders nothing when occasionDate is undefined', () => {
    const html = renderBadge({
      occasionDate:   undefined as unknown as null,
      countdownLabel: 'until the birthday',
      accent:         '#E872A0',
    })

    expect(html).toBe('')
  })

})

describe('CountdownBadge — future date copy', () => {

  it('includes the day count in the rendered output', () => {
    const html = renderBadge({
      occasionDate:   utcDateOffset(10),
      countdownLabel: 'until the birthday',
      accent:         '#E872A0',
    })

    expect(html).toContain('10')
    expect(html).toContain('days')
  })

  it('uses singular "day" when exactly 1 day remains', () => {
    const html = renderBadge({
      occasionDate:   utcDateOffset(1),
      countdownLabel: 'until the birthday',
      accent:         '#E872A0',
    })

    // "1 day" not "1 days"
    expect(html).toMatch(/\b1\s+day\b/)
    expect(html).not.toMatch(/\b1\s+days\b/)
  })

  it('includes the countdownLabel in the rendered output', () => {
    const html = renderBadge({
      occasionDate:   utcDateOffset(20),
      countdownLabel: 'until Christmas',
      accent:         '#4EC99A',
    })

    expect(html).toContain('until Christmas')
  })

  it('future badge has role="timer" for semantic accessibility', () => {
    const html = renderBadge({
      occasionDate:   utcDateOffset(20),
      countdownLabel: 'until the birthday',
      accent:         '#E872A0',
    })

    expect(html).toContain('role="timer"')
  })

})
