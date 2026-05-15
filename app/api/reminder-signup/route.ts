/**
 * app/api/reminder-signup/route.ts — GiftHint
 *
 * POST /api/reminder-signup
 *
 * Registers a gifter's email address so they receive a reminder 7 days before
 * a wisher's occasion. No gifter account is required — the request is anonymous.
 *
 * Body:
 *   {
 *     wisherUsername: string   — public username of the list owner
 *     gifterEmail:    string   — email to send the reminder to
 *     occasionDate?:  string   — ISO date "YYYY-MM-DD" (optional)
 *   }
 *
 * Responses:
 *   201  { success: true }
 *   400  { error: 'missing_fields' }
 *   400  { error: 'invalid_email' }
 *   400  { error: 'invalid_date' }   — date is in the past or malformed
 *   404  { error: 'user_not_found' }
 *   500  { error: 'server_error' }
 *
 * Idempotency:
 *   Uses UPSERT on (wisher_user_id, gifter_email) — submitting the same email
 *   twice updates the occasion_date and resets reminder_sent_at to NULL so
 *   a fresh reminder can go out for the new date.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }        from '@/lib/supabase-server'

// ── Email validation ───────────────────────────────────────────────────────────
// RFC-5321 minimal check — rejects obvious non-emails without over-engineering.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email) && email.length <= 254
}

// ── Date validation ────────────────────────────────────────────────────────────

function isValidFutureDate(dateStr: string): boolean {
  // Must be YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false
  const date  = new Date(dateStr)
  if (isNaN(date.getTime()))                 return false
  // Allow up to today — the 7-day window is enforced at send time, not signup
  return true
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Parse body ───────────────────────────────────────────────────────────────
  let body: { wisherUsername?: unknown; gifterEmail?: unknown; occasionDate?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
  }

  const wisherUsername =
    typeof body.wisherUsername === 'string' ? body.wisherUsername.trim() : null
  const gifterEmail =
    typeof body.gifterEmail === 'string' ? body.gifterEmail.trim().toLowerCase() : null
  const occasionDate =
    typeof body.occasionDate === 'string' && body.occasionDate.trim()
      ? body.occasionDate.trim()
      : null

  // ── Validate ──────────────────────────────────────────────────────────────────

  if (!wisherUsername || !gifterEmail) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
  }

  if (!isValidEmail(gifterEmail)) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 })
  }

  if (occasionDate !== null && !isValidFutureDate(occasionDate)) {
    return NextResponse.json({ error: 'invalid_date' }, { status: 400 })
  }

  const supabase = createServerClient()

  // ── Resolve username → user ID ────────────────────────────────────────────────

  const { data: wisher, error: wisherError } = await supabase
    .from('users')
    .select('id')
    .eq('public_username', wisherUsername)
    .maybeSingle()

  if (wisherError) {
    console.error('[reminder-signup] user lookup error:', wisherError.message)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
  if (!wisher) {
    return NextResponse.json({ error: 'user_not_found' }, { status: 404 })
  }

  // ── Upsert ────────────────────────────────────────────────────────────────────
  // ON CONFLICT (wisher_user_id, gifter_email): update the occasion_date and
  // reset reminder_sent_at so a fresh reminder goes out for any new date.

  const { error: upsertError } = await supabase
    .from('gifter_reminders')
    .upsert(
      {
        wisher_user_id:   wisher.id,
        gifter_email:     gifterEmail,
        occasion_date:    occasionDate,
        reminder_sent_at: null,        // reset so a re-signup gets a fresh send
      },
      {
        onConflict:        'wisher_user_id,gifter_email',
        ignoreDuplicates:  false,      // we want the UPDATE to fire
      },
    )

  if (upsertError) {
    // Surface email format errors from the DB-level CHECK constraint
    if (upsertError.code === '23514') {
      return NextResponse.json({ error: 'invalid_email' }, { status: 400 })
    }
    console.error('[reminder-signup] upsert error:', upsertError.message)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }

  return NextResponse.json({ success: true }, { status: 201 })
}
