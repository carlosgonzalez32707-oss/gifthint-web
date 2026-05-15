/**
 * app/api/cron/send-reminders/route.ts — GiftHint
 *
 * GET /api/cron/send-reminders
 *
 * Daily cron job invoked by Vercel Cron at 09:00 UTC.
 * Finds gifter_reminders rows where:
 *   occasion_date  = today + 7 days
 *   reminder_sent_at IS NULL       (not yet sent)
 *
 * For each matching row it:
 *   1. Fetches the wisher's display name and public list URL
 *   2. Fetches the top 3 unclaimed items from that list (cheapest first so
 *      gifters see achievable options, falling back to any price)
 *   3. Sends a reminder email via Resend (lib/email.ts)
 *   4. Stamps reminder_sent_at = now() so duplicates are never sent
 *
 * Batching:
 *   Items are fetched once per unique wisher and reused across all gifters
 *   signed up for the same list — avoids N queries for N reminders on a
 *   popular wishlist.
 *
 * Security:
 *   Protected by a CRON_SECRET header check. Vercel Cron sends this
 *   automatically when configured in vercel.json alongside the env var.
 *   Without it, any caller could trigger bulk email sends.
 *
 * Error policy:
 *   Per-email failures are logged and counted but do NOT abort the batch.
 *   The row's reminder_sent_at is only stamped on success so failed rows
 *   remain eligible for a retry on the next invocation.
 *
 * Response (200):
 *   { sent: number, skipped: number, errors: number }
 *
 * Errors:
 *   401  { error: 'unauthorized' }
 *   500  { error: 'server_error', message: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }        from '@/lib/supabase-server'
import {
  sendReminderEmail,
  type ReminderEmailItem,
} from '@/lib/email'

// ── Types ──────────────────────────────────────────────────────────────────────

interface GifterReminderRow {
  id:             string
  wisher_user_id: string
  gifter_email:   string
  occasion_date:  string | null
}

interface WishlistItemRow {
  id:        string
  title:     string
  image_url: string | null
  price:     number | null
  currency:  string
  source_url: string
}

// ── Target date ───────────────────────────────────────────────────────────────

/** Returns the date 7 days from now as an ISO string "YYYY-MM-DD" in UTC. */
function targetDateString(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + 7)
  return d.toISOString().split('T')[0]
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // ── Auth — CRON_SECRET header ────────────────────────────────────────────────
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[send-reminders] CRON_SECRET env var is not set — refusing to run')
    return NextResponse.json({ error: 'server_error', message: 'CRON_SECRET not configured' }, { status: 500 })
  }

  const authHeader = req.headers.get('authorization') ?? ''
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase   = createServerClient()
  const appUrl     = process.env.NEXT_PUBLIC_APP_URL ?? 'https://gifthint.io'
  const targetDate = targetDateString()

  let sent    = 0
  let skipped = 0
  let errors  = 0

  // ── 1. Fetch due reminders ────────────────────────────────────────────────────

  const { data: reminders, error: remindersError } = await supabase
    .from('gifter_reminders')
    .select('id, wisher_user_id, gifter_email, occasion_date')
    .eq('occasion_date', targetDate)
    .is('reminder_sent_at', null)

  if (remindersError) {
    console.error('[send-reminders] reminders query error:', remindersError.message)
    return NextResponse.json(
      { error: 'server_error', message: remindersError.message },
      { status: 500 },
    )
  }

  if (!reminders || reminders.length === 0) {
    console.log(`[send-reminders] no reminders due on ${targetDate}`)
    return NextResponse.json({ sent: 0, skipped: 0, errors: 0 })
  }

  console.log(`[send-reminders] ${reminders.length} reminder(s) due for ${targetDate}`)

  // ── 2. Batch: fetch wisher info + items per unique wisher ──────────────────

  const uniqueWisherIds = Array.from(new Set(
    (reminders as GifterReminderRow[]).map((r) => r.wisher_user_id),
  ))

  // Wisher metadata (name + username)
  const { data: wishers, error: wishersError } = await supabase
    .from('users')
    .select('id, display_name, public_username')
    .in('id', uniqueWisherIds)

  if (wishersError) {
    console.error('[send-reminders] wishers query error:', wishersError.message)
    return NextResponse.json(
      { error: 'server_error', message: wishersError.message },
      { status: 500 },
    )
  }

  const wisherMap = new Map(
    (wishers ?? []).map((w) => [
      w.id,
      {
        name:     w.display_name ?? w.public_username ?? 'Someone',
        username: w.public_username ?? '',
      },
    ]),
  )

  // Top-3 unclaimed items per wisher — one query per wisher (small N)
  const itemsMap = new Map<string, ReminderEmailItem[]>()

  await Promise.all(
    uniqueWisherIds.map(async (wisherId) => {
      const { data: items, error: itemsError } = await supabase
        .from('wishlist_items')
        .select('id, title, image_url, price, currency, source_url')
        .eq('user_id', wisherId)
        .eq('is_claimed', false)
        .order('price', { ascending: true, nullsFirst: false })
        .limit(3)

      if (itemsError) {
        console.warn(`[send-reminders] items query error for wisher ${wisherId}:`, itemsError.message)
        itemsMap.set(wisherId, [])
        return
      }

      const emailItems: ReminderEmailItem[] = (items as WishlistItemRow[]).map((item) => ({
        title:     item.title,
        imageUrl:  item.image_url,
        price:     item.price,
        currency:  item.currency || 'USD',
        sourceUrl: item.source_url,
      }))

      itemsMap.set(wisherId, emailItems)
    }),
  )

  // ── 3. Send emails ────────────────────────────────────────────────────────────

  await Promise.all(
    (reminders as GifterReminderRow[]).map(async (reminder) => {
      const wisher = wisherMap.get(reminder.wisher_user_id)

      if (!wisher || !wisher.username) {
        console.warn(`[send-reminders] no wisher found for id ${reminder.wisher_user_id} — skipping`)
        skipped++
        return
      }

      const listUrl  = `${appUrl}/list/${wisher.username}`
      const topItems = itemsMap.get(reminder.wisher_user_id) ?? []

      try {
        await sendReminderEmail({
          to:           reminder.gifter_email,
          wisherName:   wisher.name,
          occasionDate: reminder.occasion_date,
          listUrl,
          topItems,
        })

        // Stamp sent timestamp — only on success so failures can be retried
        const { error: stampError } = await supabase
          .from('gifter_reminders')
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq('id', reminder.id)

        if (stampError) {
          console.error(
            `[send-reminders] failed to stamp reminder ${reminder.id}:`,
            stampError.message,
          )
          // Don't increment errors — email was sent, stamp is best-effort
        }

        sent++
        console.log(
          `[send-reminders] sent → ${reminder.gifter_email} (wisher: ${wisher.username})`,
        )
      } catch (err) {
        errors++
        console.error(
          `[send-reminders] email send failed for ${reminder.gifter_email}:`,
          err instanceof Error ? err.message : err,
        )
      }
    }),
  )

  console.log(`[send-reminders] done — sent: ${sent}, skipped: ${skipped}, errors: ${errors}`)

  return NextResponse.json({ sent, skipped, errors })
}
