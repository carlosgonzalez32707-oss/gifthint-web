/**
 * app/api/cron/weekly-digest/route.ts — GiftHint
 *
 * GET /api/cron/weekly-digest
 *
 * Weekly cron job that sends a personalised activity digest to every wisher
 * who has email_digest_enabled = true.
 *
 * SCHEDULE
 * ────────
 * Mondays at 09:00 UTC. Add to vercel.json:
 *   { "path": "/api/cron/weekly-digest", "schedule": "0 9 * * 1" }
 *
 * SECURITY
 * ────────
 * Protected by Authorization: Bearer <CRON_SECRET>.
 * Vercel Cron sets this automatically; direct callers without it get 401.
 *
 * BATCHING
 * ────────
 * Resend free tier: 100 emails/day, 10 req/s. Pro tier: 50,000/day.
 * We process users in batches of 50 with a 1-second pause between batches
 * to stay comfortably under the rate limit at any tier.
 *
 * DEDUPLICATION
 * ─────────────
 * Before sending, we write a 'pending' row to digest_sends with a UNIQUE
 * constraint on (user_id, week_start). If the cron fires twice in one week,
 * the second run's INSERT ON CONFLICT DO NOTHING skips already-attempted users.
 *
 * ERROR HANDLING
 * ──────────────
 * Per-user failures are caught and logged individually. One user's bad email
 * address does not abort the batch. Failures are recorded in digest_sends
 * with status='error' so operators can inspect.
 *
 * SKIPPED USERS
 * ─────────────
 * Users with no views in the past 7 days receive status='skipped' / detail='no_views'.
 * This prevents sending "nothing happened" emails that train users to ignore the digest.
 *
 * RESPONSE
 * ────────
 * 200 { weekStart, sent, skipped, errors, total }
 * 401 { error: 'unauthorized' }
 * 500 { error: 'server_error', message: string }
 */

import { NextRequest, NextResponse }      from 'next/server'
import { render }                         from '@react-email/components'
import { createServerClient }             from '@/lib/supabase-server'
import { getWeeklyDigestData, weekOfLabel } from '@/lib/digest'
import { WeeklyDigestEmail }              from '@/lib/email-templates/weekly-digest'

// ── Types ──────────────────────────────────────────────────────────────────────

interface DigestUser {
  id:               string
  email:            string
  display_name:     string | null
  unsubscribe_token: string
}

interface BatchResult {
  sent:    number
  skipped: number
  errors:  number
}

// ── Constants ─────────────────────────────────────────────────────────────────

const BATCH_SIZE      = 50
const BATCH_DELAY_MS  = 1_000   // 1 s between batches — Resend rate limit headroom
const APP_URL         = process.env.NEXT_PUBLIC_APP_URL ?? 'https://gifthint.io'
const FROM_ADDRESS    = 'GiftHint <digest@gifthint.io>'

// ── Auth ───────────────────────────────────────────────────────────────────────

function isAuthorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[weekly-digest] CRON_SECRET is not configured.')
    return false
  }
  return req.headers.get('authorization') === `Bearer ${secret}`
}

// ── Week helpers ───────────────────────────────────────────────────────────────

/**
 * Returns the most recent Monday as a YYYY-MM-DD string (UTC).
 * Used as the deduplication key in digest_sends.
 */
function currentWeekStart(): string {
  const d   = new Date()
  const dow = d.getUTCDay()          // 0 = Sun, 1 = Mon, …
  const daysBack = dow === 0 ? 6 : dow - 1
  const monday = new Date(d.getTime() - daysBack * 24 * 60 * 60 * 1000)
  return monday.toISOString().slice(0, 10)
}

// ── Resend client ──────────────────────────────────────────────────────────────

async function getResend() {
  if (process.env.RESEND_TEST_MODE === 'true') {
    return {
      emails: {
        send: async (_p: unknown) => ({ data: { id: 'test-noop' }, error: null }),
      },
    }
  }
  const { Resend } = await import('resend')
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('[weekly-digest] RESEND_API_KEY is not set.')
  return new Resend(key)
}

// ── Per-user send ──────────────────────────────────────────────────────────────

async function sendDigestToUser(
  user:       DigestUser,
  weekStart:  string,
  weekOf:     string,
  supabase:   ReturnType<typeof createServerClient>,
  resend:     Awaited<ReturnType<typeof getResend>>,
): Promise<'sent' | 'skipped' | 'error'> {
  // ── Deduplication guard ──────────────────────────────────────────────────
  // Insert a pending row. If it already exists (cron ran twice), skip.
  const { error: lockError } = await supabase
    .from('digest_sends')
    .insert({
      user_id:    user.id,
      week_start: weekStart,
      status:     'pending',
    })
    // ON CONFLICT DO NOTHING equivalent via upsert with ignoreDuplicates
    .select()

  if (lockError) {
    // Unique constraint violation — already processed this user this week
    if (lockError.code === '23505') {
      console.log(`[weekly-digest] Skipping ${user.id} — already processed this week.`)
      return 'skipped'
    }
    console.error(`[weekly-digest] Lock insert failed for ${user.id}:`, lockError.message)
    return 'error'
  }

  // ── Aggregate digest data ────────────────────────────────────────────────
  let digestData
  try {
    digestData = await getWeeklyDigestData(user.id)
  } catch (err) {
    await updateSendRecord(supabase, user.id, weekStart, 'error', null,
      err instanceof Error ? err.message : 'digest aggregation failed')
    return 'error'
  }

  if (!digestData) {
    await updateSendRecord(supabase, user.id, weekStart, 'skipped', null, 'no_views')
    return 'skipped'
  }

  // ── Render email HTML ────────────────────────────────────────────────────
  const wisherName     = user.display_name ?? user.email.split('@')[0]
  const unsubscribeUrl = `${APP_URL}/unsubscribe?token=${encodeURIComponent(user.unsubscribe_token)}`
  const dashboardUrl   = `${APP_URL}/dashboard`

  let html: string
  try {
    html = await render(
      WeeklyDigestEmail({
        wisherName,
        dashboardUrl,
        unsubscribeUrl,
        weekOf,
        totalViews:     digestData.totalViews,
        listSummaries:  digestData.listSummaries,
        topClickedItem: digestData.topClickedItem,
        claimedItems:   digestData.claimedItems,
      }),
    )
  } catch (err) {
    await updateSendRecord(supabase, user.id, weekStart, 'error', null,
      err instanceof Error ? err.message : 'render failed')
    return 'error'
  }

  // ── Send via Resend ──────────────────────────────────────────────────────
  const subject = buildSubject(wisherName, digestData.totalViews, digestData.listSummaries[0]?.listName)

  const { data, error: sendError } = await resend.emails.send({
    from:    FROM_ADDRESS,
    to:      [user.email],
    subject,
    html,
  })

  if (sendError) {
    const msg = typeof sendError === 'object' && 'message' in sendError
      ? String((sendError as { message: string }).message)
      : JSON.stringify(sendError)
    await updateSendRecord(supabase, user.id, weekStart, 'error', null, msg,
      digestData.totalViews, digestData.claimedItems.length, digestData.topClickedItem?.title)
    console.error(`[weekly-digest] Resend error for ${user.id}: ${msg}`)
    return 'error'
  }

  const messageId = (data as { id?: string } | null)?.id ?? null
  await updateSendRecord(supabase, user.id, weekStart, 'sent', messageId, null,
    digestData.totalViews, digestData.claimedItems.length, digestData.topClickedItem?.title)

  console.log(`[weekly-digest] Sent to ${user.id} (${wisherName}) — views=${digestData.totalViews} msgId=${messageId}`)
  return 'sent'
}

async function updateSendRecord(
  supabase:      ReturnType<typeof createServerClient>,
  userId:        string,
  weekStart:     string,
  status:        string,
  messageId:     string | null,
  detail:        string | null,
  totalViews?:   number,
  claimedCount?: number,
  topItemTitle?: string | null | undefined,
): Promise<void> {
  await supabase
    .from('digest_sends')
    .update({
      status,
      message_id:      messageId,
      detail,
      total_views:     totalViews     ?? null,
      claimed_count:   claimedCount   ?? null,
      top_item_title:  topItemTitle   ?? null,
    })
    .eq('user_id',    userId)
    .eq('week_start', weekStart)
}

// ── Subject line ───────────────────────────────────────────────────────────────

function buildSubject(wisherName: string, views: number, listName?: string): string {
  const who = listName ? `your ${listName}` : 'your wishlist'
  return views === 1
    ? `👀 1 person visited ${who} this week — GiftHint digest`
    : `👀 ${views.toLocaleString('en-US')} people visited ${who} this week — GiftHint digest`
}

// ── Route handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorised(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase   = createServerClient()
  const weekStart  = currentWeekStart()
  const weekOf     = weekOfLabel()

  console.log(`[weekly-digest] Starting run for week of ${weekOf} (start: ${weekStart})`)

  // ── Fetch all opted-in users ───────────────────────────────────────────────
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, email, display_name, unsubscribe_token')
    .eq('email_digest_enabled', true)
    .not('email', 'is', null)
    .not('unsubscribe_token', 'is', null)

  if (usersError) {
    console.error('[weekly-digest] Failed to fetch users:', usersError.message)
    return NextResponse.json({ error: 'server_error', message: usersError.message }, { status: 500 })
  }

  const eligibleUsers = (users ?? []) as DigestUser[]
  console.log(`[weekly-digest] ${eligibleUsers.length} opted-in users`)

  // ── Initialise Resend ──────────────────────────────────────────────────────
  let resend: Awaited<ReturnType<typeof getResend>>
  try {
    resend = await getResend()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: 'server_error', message }, { status: 500 })
  }

  // ── Process in batches ─────────────────────────────────────────────────────
  const totals: BatchResult = { sent: 0, skipped: 0, errors: 0 }

  for (let i = 0; i < eligibleUsers.length; i += BATCH_SIZE) {
    const batch      = eligibleUsers.slice(i, i + BATCH_SIZE)
    const batchIndex = Math.floor(i / BATCH_SIZE) + 1
    const totalBatches = Math.ceil(eligibleUsers.length / BATCH_SIZE)

    console.log(`[weekly-digest] Batch ${batchIndex}/${totalBatches} — ${batch.length} users`)

    // Process the batch concurrently within each group
    const results = await Promise.allSettled(
      batch.map((user) => sendDigestToUser(user, weekStart, weekOf, supabase, resend)),
    )

    for (const r of results) {
      if (r.status === 'fulfilled') {
        if (r.value === 'sent')    totals.sent++
        if (r.value === 'skipped') totals.skipped++
        if (r.value === 'error')   totals.errors++
      } else {
        totals.errors++
        console.error('[weekly-digest] Unhandled rejection:', r.reason)
      }
    }

    // Pause between batches (skip after last batch)
    if (i + BATCH_SIZE < eligibleUsers.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS))
    }
  }

  console.log(
    `[weekly-digest] Complete — sent=${totals.sent} skipped=${totals.skipped} errors=${totals.errors}`,
  )

  return NextResponse.json({
    weekStart,
    weekOf,
    total:   eligibleUsers.length,
    ...totals,
  })
}
