/**
 * packages/shared/src/utils/index.ts — @gifthint/shared
 *
 * Pure utility functions shared across web, mobile, and any future surface.
 * No platform-specific APIs — safe to bundle anywhere.
 */

import type { OccasionKey } from '../types/index.js'

// ── Time formatting ───────────────────────────────────────────────────────────

/**
 * Returns a human-readable relative-time string, mirroring moment.js thresholds.
 *
 * @example
 *   timeAgo(new Date('2025-05-13T10:00:00Z')) // "2 hours ago"
 */
export function timeAgo(date: Date, now: Date = new Date()): string {
  const diffMs  = now.getTime() - date.getTime()
  const diffSec = Math.round(diffMs / 1_000)

  if (diffSec < 0)  return 'just now'
  if (diffSec < 45) return 'just now'

  const diffMin = Math.round(diffSec / 60)
  if (diffSec < 90)  return '1 minute ago'
  if (diffMin < 45)  return `${diffMin} minutes ago`

  const diffHr = Math.round(diffMin / 60)
  if (diffMin < 90)  return '1 hour ago'
  if (diffHr < 22)   return `${diffHr} hours ago`
  if (diffHr < 36)   return 'yesterday'

  const diffDays = Math.round(diffHr / 24)
  if (diffDays < 26)  return `${diffDays} days ago`

  const diffMonths = Math.round(diffDays / 30)
  if (diffDays < 46)  return '1 month ago'
  if (diffDays < 345) return `${diffMonths} months ago`
  if (diffDays < 545) return '1 year ago'

  const diffYears = Math.round(diffDays / 365)
  return `${diffYears} years ago`
}

// ── Slug generation ───────────────────────────────────────────────────────────

/**
 * Converts a list title into a URL-safe slug (lowercase, hyphens, max 60 chars).
 *
 * @example
 *   generateSlug('Birthday 2026')   // "birthday-2026"
 *   generateSlug('Baby Shower 🍼') // "baby-shower"
 */
export function generateSlug(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')   // strip diacritics
      .replace(/[^a-z0-9\s-]/g, '')      // remove non-alphanumeric
      .trim()
      .replace(/\s+/g, '-')              // spaces → hyphens
      .replace(/-{2,}/g, '-')            // collapse double-hyphens
      .slice(0, 60)
      .replace(/-$/, '')                 // trim trailing hyphen
    || 'my-list'
  )
}

// ── DNA tag validation ────────────────────────────────────────────────────────

const DNA_TAG_RE = /^#[A-Za-z0-9]{1,19}$/

/**
 * Returns true when `tag` matches the DNA tag format: #[A-Za-z0-9]{1,19}
 */
export function validateTag(tag: string): boolean {
  if (typeof tag !== 'string') return false
  return DNA_TAG_RE.test(tag)
}

// ── Occasion themes ───────────────────────────────────────────────────────────

export interface OccasionTheme {
  key:            string
  accent:         string
  accentDim:      string   // 13% alpha
  accentSoft:     string   // 22% alpha
  accentRing:     string   // 28% alpha
  emoji:          string
  countdownLabel: string
  heroTagline:    ((name: string) => string) | null
}

function alpha(hex: string, a: number): string {
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

const OCCASION_THEMES: Readonly<Record<string, OccasionTheme>> = {
  birthday:    buildTheme('birthday',    '#E872A0', '🎂', 'until the birthday',    (n) => `${n}'s birthday is coming up!`),
  christmas:   buildTheme('christmas',   '#4EC99A', '🎄', 'until Christmas',       (n) => `Help ${n} have a magical Christmas`),
  wedding:     buildTheme('wedding',     '#E8A84A', '💍', 'until the wedding',     (n) => `${n} is getting married!`),
  baby_shower: buildTheme('baby_shower', '#38BDF8', '🍼', 'until the shower',      null),
  graduation:  buildTheme('graduation',  '#8B83F0', '🎓', 'until graduation',      null),
  housewarming:buildTheme('housewarming','#F5A94E', '🏠', 'until the housewarming',null),
  anniversary: buildTheme('anniversary', '#E872A0', '🥂', 'until the anniversary', null),
}

const DEFAULT_OCCASION_THEME: OccasionTheme = buildTheme(
  'other', '#8B83F0', '🎁', 'until the occasion', null,
)

/**
 * Returns the visual theme for a given occasion key.
 * Falls back to the default purple theme for unknown occasions.
 */
export function getOccasionTheme(occasion: OccasionKey | string): OccasionTheme {
  return OCCASION_THEMES[occasion] ?? DEFAULT_OCCASION_THEME
}
