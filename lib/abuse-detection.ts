/**
 * lib/abuse-detection.ts — GiftHint
 *
 * Suspicious activity detection for click fraud, view inflation, and more.
 *
 * PHILOSOPHY
 * ──────────
 * These checks flag anomalous behaviour for manual admin review — they do NOT
 * block requests automatically. The thresholds are set conservatively so that
 * power users (e.g. a wisher sharing their list in a group chat causing a burst
 * of near-simultaneous views) are not penalised unfairly.
 *
 * Detection vs. Rate Limiting
 * ───────────────────────────
 * Rate limiting (lib/rate-limit.ts) enforces hard caps per route.
 * Abuse detection uses its own separate Redis counters with its own thresholds
 * to identify patterns that are suspicious but not necessarily at the hard cap.
 *
 *   Route rate limit:  100 clicks / IP / hour  (blocks at 101+)
 *   Fraud detection:   3 clicks / IP / item / hour  (flags at 4+, still allows)
 *
 * Detected events are written to the `suspicious_events` Supabase table so the
 * admin security panel (/admin/security) can review and act on them.
 *
 * Both functions are async and non-throwing — they catch their own errors so
 * that a detection failure never breaks the parent route handler.
 */

import { rateLimit }          from '@/lib/rate-limit'
import { createServerClient } from '@/lib/supabase-server'

// ── Types ──────────────────────────────────────────────────────────────────────

export type AbuseEventType = 'click_fraud' | 'fake_views' | 'claim_spam' | 'email_harvest'

export interface AbuseResult {
  flagged: boolean
  reason?: string
}

// ── Internal: write to suspicious_events ──────────────────────────────────────

async function logSuspiciousEvent(
  eventType: AbuseEventType,
  ip:        string,
  metadata:  Record<string, string>,
): Promise<void> {
  try {
    const supabase = createServerClient()
    const { error } = await supabase
      .from('suspicious_events')
      .insert({ event_type: eventType, ip_address: ip, metadata })

    if (error) {
      console.error('[abuse-detection] failed to insert suspicious_event:', error.message)
    }
  } catch (err) {
    // Never let a logging failure surface to the caller
    console.error('[abuse-detection] unexpected error logging event:', err)
  }
}

// ── Click fraud detection ──────────────────────────────────────────────────────

/**
 * Flags when the same IP clicks the same wishlist item more than 3 times
 * within a 1-hour window. This is a strong signal for click-fraud (artificially
 * inflating affiliate click counts or wisher analytics).
 *
 * Uses a dedicated Redis counter (separate from the route rate limit bucket)
 * so the abuse signal is independent of whether the IP is already rate-limited.
 *
 * @param itemId  UUID of the wishlist item that was clicked
 * @param ip      Client IP address
 * @returns       { flagged: true, reason } if the threshold was exceeded,
 *                { flagged: false } otherwise
 */
export async function detectClickFraud(
  itemId: string,
  ip:     string,
): Promise<AbuseResult> {
  try {
    // 3 clicks from the same IP on the same item within 1 hour = suspicious
    const result = await rateLimit(`click_fraud:${ip}:${itemId}`, 3, 3_600)

    if (!result.success) {
      console.warn(
        `[abuse-detection] click_fraud flagged — ip=${ip} itemId=${itemId}`,
      )
      // Fire-and-forget: don't await the DB write on the hot click path
      void logSuspiciousEvent('click_fraud', ip, { itemId })
      return { flagged: true, reason: 'same_ip_repeated_clicks' }
    }

    return { flagged: false }
  } catch (err) {
    // Detection errors must never break the parent route
    console.error('[abuse-detection] detectClickFraud error:', err)
    return { flagged: false }
  }
}

// ── Fake view detection ────────────────────────────────────────────────────────

/**
 * Flags when the same IP views the same gifter page more than 5 times within
 * a 60-second window. Normal human behaviour involves at most a handful of
 * page loads in quick succession (hard refresh, mobile/desktop switch).
 * Bot traffic typically hits the page many times per minute.
 *
 * Note: this check runs AFTER the per-route rate limit (10/hr) has already
 * passed, so by the time this is called the request is within the hourly cap.
 * This targets rapid burst patterns within that allowed window.
 *
 * @param wishlistId  UUID of the wishlist being viewed
 * @param ip          Client IP address
 */
export async function detectFakeViews(
  wishlistId: string,
  ip:         string,
): Promise<AbuseResult> {
  try {
    // 5 views from the same IP on the same page within 60 seconds = suspicious
    const result = await rateLimit(`fake_views:${ip}:${wishlistId}`, 5, 60)

    if (!result.success) {
      console.warn(
        `[abuse-detection] fake_views flagged — ip=${ip} wishlistId=${wishlistId}`,
      )
      void logSuspiciousEvent('fake_views', ip, { wishlistId })
      return { flagged: true, reason: 'rapid_successive_views' }
    }

    return { flagged: false }
  } catch (err) {
    console.error('[abuse-detection] detectFakeViews error:', err)
    return { flagged: false }
  }
}

// ── Claim spam detection ───────────────────────────────────────────────────────

/**
 * Flags when the same IP submits more than 5 claim attempts in 10 minutes.
 * Bot-driven claim spam (squatting items to block legitimate gifters) shows
 * up as many claims from one IP in a short window.
 *
 * The route rate limit (20/hr) already blocks persistent spam; this detection
 * catches bursts that stay under the hourly cap but are still suspicious.
 *
 * @param ip  Client IP address
 */
export async function detectClaimSpam(ip: string): Promise<AbuseResult> {
  try {
    // 5 claims from the same IP within 10 minutes = suspicious
    const result = await rateLimit(`claim_spam:${ip}`, 5, 600)

    if (!result.success) {
      console.warn(`[abuse-detection] claim_spam flagged — ip=${ip}`)
      void logSuspiciousEvent('claim_spam', ip, {})
      return { flagged: true, reason: 'rapid_claim_attempts' }
    }

    return { flagged: false }
  } catch (err) {
    console.error('[abuse-detection] detectClaimSpam error:', err)
    return { flagged: false }
  }
}

// ── Email harvest detection ────────────────────────────────────────────────────

/**
 * Flags when the same IP submits reminder-signup requests with more than 3
 * unique-looking email addresses in 10 minutes. This pattern suggests
 * automated email harvesting (submitting a list of emails to see which ones
 * "work" for a given wisher).
 *
 * @param ip  Client IP address
 */
export async function detectEmailHarvest(ip: string): Promise<AbuseResult> {
  try {
    // 3 reminder signups from the same IP within 10 minutes = suspicious
    const result = await rateLimit(`email_harvest:${ip}`, 3, 600)

    if (!result.success) {
      console.warn(`[abuse-detection] email_harvest flagged — ip=${ip}`)
      void logSuspiciousEvent('email_harvest', ip, {})
      return { flagged: true, reason: 'rapid_email_submissions' }
    }

    return { flagged: false }
  } catch (err) {
    console.error('[abuse-detection] detectEmailHarvest error:', err)
    return { flagged: false }
  }
}
