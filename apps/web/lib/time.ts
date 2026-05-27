/**
 * lib/time.ts — GiftHint
 *
 * Vanilla relative-time formatting. No external dependencies.
 *
 * Usage:
 *   import { timeAgo } from '@/lib/time'
 *   timeAgo(new Date('2025-05-13T10:00:00Z')) // "2 hours ago"
 *
 * Breakpoints (all comparisons are against `now` at call time):
 *   < 45 s       → "just now"
 *   < 90 s       → "1 minute ago"
 *   < 45 min     → "N minutes ago"
 *   < 90 min     → "1 hour ago"
 *   < 22 h       → "N hours ago"
 *   < 36 h       → "yesterday"
 *   < 26 days    → "N days ago"
 *   < 46 days    → "1 month ago"
 *   < 345 days   → "N months ago"
 *   < 545 days   → "1 year ago"
 *   ≥ 545 days   → "N years ago"
 *
 * These thresholds mirror moment.js / date-fns defaults so the output
 * feels idiomatic — "2 hours ago" not "1.8 hours ago".
 */

export function timeAgo(date: Date, now: Date = new Date()): string {
  const diffMs  = now.getTime() - date.getTime()
  const diffSec = Math.round(diffMs / 1_000)

  if (diffSec < 0) {
    // Future date — shouldn't happen in normal usage but handle gracefully
    return 'just now'
  }

  if (diffSec < 45) {
    return 'just now'
  }

  const diffMin = Math.round(diffSec / 60)

  if (diffSec < 90) {
    return '1 minute ago'
  }

  if (diffMin < 45) {
    return `${diffMin} minutes ago`
  }

  const diffHr = Math.round(diffMin / 60)

  if (diffMin < 90) {
    return '1 hour ago'
  }

  if (diffHr < 22) {
    return `${diffHr} hours ago`
  }

  if (diffHr < 36) {
    return 'yesterday'
  }

  const diffDays = Math.round(diffHr / 24)

  if (diffDays < 26) {
    return `${diffDays} days ago`
  }

  const diffMonths = Math.round(diffDays / 30)

  if (diffDays < 46) {
    return '1 month ago'
  }

  if (diffDays < 345) {
    return `${diffMonths} months ago`
  }

  if (diffDays < 545) {
    return '1 year ago'
  }

  const diffYears = Math.round(diffDays / 365)
  return `${diffYears} years ago`
}
