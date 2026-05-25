/**
 * app/api/cron/send-price-alerts/route.ts — GiftHint
 *
 * GET /api/cron/send-price-alerts
 *
 * Daily cron invoked by Vercel Cron at 07:00 UTC (1 hour after check-prices).
 *
 * Algorithm
 * ─────────
 * 1. Find wishlist_items where:
 *    - price_alert_enabled = true
 *    - price IS NOT NULL (needs a baseline)
 *    - last_checked_at is within the last 25 hours (freshly checked today)
 *    - Owner has price_alerts_enabled = true
 *    - No entry in price_drop_alerts for this item in the last 7 days
 *
 * 2. For each eligible item compare today's price against the previous
 *    price_history row. A drop qualifies when:
 *      new_price ≤ old_price × (threshold / 100)
 *    where threshold defaults to 90 (= ≥ 10% off).
 *
 * 3. Group qualifying drops by user (one email per user, not per item).
 *    Within each user's email, items are sorted by drop_pct desc.
 *
 * 4. Fetch the last 7 price_history rows per item for the sparkline.
 *
 * 5. Send one PriceDropEmail per user, record each sent alert in
 *    price_drop_alerts (the partial unique index prevents re-sends within 7 d).
 *
 * Security:
 *   Authorization: Bearer <CRON_SECRET>  (Vercel Cron sets this automatically)
 *
 * Response (200):
 *   { usersAlerted, itemsAlerting, skipped, errors, duration }
 */

import React                          from 'react'
import { NextRequest, NextResponse } from 'next/server'
import { render }                    from '@react-email/components'
import { createServerClient }        from '@/lib/supabase-server'
import { PriceDropEmail }            from '@/lib/email-templates/price-drop'
import type { PriceHistoryPoint }    from '@/lib/email-templates/price-drop'

// ── Resend helper (mirrors lib/email.ts private helper) ───────────────────────

async function buildResend() {
  if (process.env.RESEND_TEST_MODE === 'true') {
    return {
      emails: {
        send: async (_params: unknown) => ({ data: { id: 'test-noop' }, error: null }),
      },
    }
  }
  const { Resend } = await import('resend')
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('[send-price-alerts] RESEND_API_KEY not set')
  return new Resend(key)
}

// ── Constants ─────────────────────────────────────────────────────────────────

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://gifthint.io'

// ── Types ─────────────────────────────────────────────────────────────────────

interface EligibleItem {
  id:                    string
  title:                 string
  source_url:            string
  affiliate_url:         string | null
  image_url:             string | null
  price:                 number           // current (today's) price
  currency:              string
  lowest_price:          number | null
  price_alert_threshold: number | null
  user_id:               string
}

interface WisherRow {
  id:                   string
  email:                string | null
  display_name:         string | null
  public_username:      string | null
  unsubscribe_token:    string | null
  price_alerts_enabled: boolean
}

interface PriceHistoryRow {
  item_id:    string
  price:      number
  checked_at: string
}

interface QualifyingDrop {
  item:      EligibleItem
  oldPrice:  number
  newPrice:  number
  dropPct:   number
  history:   PriceHistoryPoint[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function unsubUrl(token: string | null): string {
  const base = token
    ? `${APP_URL}/unsubscribe?token=${encodeURIComponent(token)}`
    : `${APP_URL}/dashboard`
  return `${base}&type=price_alerts`
}

function itemBuyUrl(item: EligibleItem): string {
  return item.affiliate_url ?? item.source_url
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const startMs = Date.now()

  // ── Auth ───────────────────────────────────────────────────────────────────
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[send-price-alerts] CRON_SECRET not configured')
    return NextResponse.json(
      { error: 'server_error', message: 'CRON_SECRET not configured' },
      { status: 500 },
    )
  }

  const authHeader = req.headers.get('authorization') ?? ''
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()

  let usersAlerted = 0
  let itemsAlerting = 0
  let skipped  = 0
  let errors   = 0

  // ── 1. Eligible items: price-checked today, no recent alert ───────────────
  const cutoff25h = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
  const cutoff7d  = new Date(Date.now() -  7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: items, error: itemsErr } = await supabase
    .from('wishlist_items')
    .select(
      'id, title, source_url, affiliate_url, image_url, price, currency, ' +
      'lowest_price, price_alert_threshold, user_id',
    )
    .eq('price_alert_enabled', true)
    .not('price', 'is', null)
    .gte('last_checked_at', cutoff25h)

  if (itemsErr) {
    console.error('[send-price-alerts] items query failed:', itemsErr.message)
    return NextResponse.json(
      { error: 'server_error', message: itemsErr.message },
      { status: 500 },
    )
  }

  if (!items || items.length === 0) {
    console.log('[send-price-alerts] no freshly-checked items found')
    return NextResponse.json({ usersAlerted: 0, itemsAlerting: 0, skipped: 0, errors: 0, duration: '0s' })
  }

  const itemIds = (items as unknown as EligibleItem[]).map((i) => i.id)

  // ── 2. Already-alerted items in the last 7 days ───────────────────────────
  const { data: recentAlerts } = await supabase
    .from('price_drop_alerts')
    .select('item_id')
    .in('item_id', itemIds)
    .gte('alert_sent_at', cutoff7d)

  const alreadyAlertedSet = new Set((recentAlerts ?? []).map((r: { item_id: string }) => r.item_id))

  // ── 3. Fetch wishers (respect price_alerts_enabled) ───────────────────────
  const uniqueUserIds = Array.from(new Set((items as unknown as EligibleItem[]).map((i) => i.user_id)))

  const { data: wishers, error: wishersErr } = await supabase
    .from('users')
    .select('id, email, display_name, public_username, unsubscribe_token, price_alerts_enabled')
    .in('id', uniqueUserIds)

  if (wishersErr) {
    console.error('[send-price-alerts] wishers query failed:', wishersErr.message)
    return NextResponse.json(
      { error: 'server_error', message: wishersErr.message },
      { status: 500 },
    )
  }

  const wisherMap = new Map<string, WisherRow>(
    (wishers ?? []).map((w) => [w.id, w as WisherRow]),
  )

  // ── 4. Fetch previous price_history row per item ──────────────────────────
  // We need the second-most-recent row (the row before today's check).
  // Strategy: fetch the last 2 rows per item, use the older one as prev.
  const { data: historyRows, error: historyErr } = await supabase
    .from('price_history')
    .select('item_id, price, checked_at')
    .in('item_id', itemIds)
    .order('checked_at', { ascending: false })
    .limit(itemIds.length * 8)   // 8 rows/item max — enough for sparkline + prev

  if (historyErr) {
    console.warn('[send-price-alerts] price_history query warning:', historyErr.message)
  }

  // Group history by item_id, sorted desc (already sorted by query)
  const historyByItem = new Map<string, PriceHistoryRow[]>()
  for (const row of (historyRows ?? []) as PriceHistoryRow[]) {
    const arr = historyByItem.get(row.item_id) ?? []
    arr.push(row)
    historyByItem.set(row.item_id, arr)
  }

  // ── 5. Qualify drops, group by user ───────────────────────────────────────
  const dropsByUser = new Map<string, QualifyingDrop[]>()

  for (const item of items as unknown as EligibleItem[]) {
    // Skip if already alerted this week
    if (alreadyAlertedSet.has(item.id)) {
      skipped++
      continue
    }

    const wisher = wisherMap.get(item.user_id)
    if (!wisher?.email || !wisher.price_alerts_enabled) {
      skipped++
      continue
    }

    const rows = historyByItem.get(item.id) ?? []
    // rows[0] = most recent (today), rows[1] = previous
    if (rows.length < 2) {
      skipped++
      continue
    }

    const newPrice = rows[0].price
    const oldPrice = rows[1].price

    if (newPrice >= oldPrice) {
      skipped++
      continue
    }

    const threshold  = item.price_alert_threshold ?? 90
    const thresholdPrice = oldPrice * (threshold / 100)

    if (newPrice > thresholdPrice) {
      skipped++
      continue
    }

    const dropPct = ((oldPrice - newPrice) / oldPrice) * 100

    // Build sparkline data (oldest-first, up to 7 points)
    const sparkRows = rows.slice(0, 7).reverse()
    const history: PriceHistoryPoint[] = sparkRows.map((r) => ({
      price:      r.price,
      checked_at: r.checked_at,
    }))

    const drop: QualifyingDrop = { item, oldPrice, newPrice, dropPct, history }

    const arr = dropsByUser.get(item.user_id) ?? []
    arr.push(drop)
    dropsByUser.set(item.user_id, arr)
  }

  if (dropsByUser.size === 0) {
    const duration = ((Date.now() - startMs) / 1000).toFixed(1) + 's'
    console.log(`[send-price-alerts] no qualifying drops — skipped: ${skipped}, duration: ${duration}`)
    return NextResponse.json({ usersAlerted: 0, itemsAlerting: 0, skipped, errors: 0, duration })
  }

  // ── 6. Send one email per user ────────────────────────────────────────────
  let resend: Awaited<ReturnType<typeof buildResend>>
  try {
    resend = await buildResend()
  } catch (err) {
    console.error('[send-price-alerts] failed to init Resend:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'server_error', message: 'Resend init failed' }, { status: 500 })
  }

  for (const [userId, drops] of Array.from(dropsByUser.entries())) {
    const wisher = wisherMap.get(userId)
    if (!wisher?.email) continue

    // Sort by biggest drop first
    drops.sort((a: QualifyingDrop, b: QualifyingDrop) => b.dropPct - a.dropPct)

    // For a single-item drop, send the dedicated template.
    // For multiple items, use the first (biggest) drop as the hero and note
    // the others in a secondary section. A future iteration could build a
    // multi-item digest template; for now we send the hero item email and
    // mention the count.
    const primary = drops[0]
    const isAllTimeLow =
      primary.item.lowest_price !== null
        ? primary.newPrice <= primary.item.lowest_price
        : false

    const shareUrl = wisher.public_username
      ? `${APP_URL}/list/${wisher.public_username}`
      : APP_URL

    const html = await render(
      React.createElement(PriceDropEmail, {
        wisherName:     wisher.display_name ?? 'there',
        itemTitle:      primary.item.title,
        itemUrl:        itemBuyUrl(primary.item),
        itemImageUrl:   primary.item.image_url,
        oldPrice:       primary.oldPrice,
        newPrice:       primary.newPrice,
        currency:       primary.item.currency || 'GBP',
        isAllTimeLow,
        priceHistory:   primary.history,
        shareUrl,
        unsubscribeUrl: unsubUrl(wisher.unsubscribe_token),
      }),
    )

    const dropPctRounded = Math.round(primary.dropPct)
    const subject =
      drops.length === 1
        ? `📉 Price drop: "${primary.item.title.slice(0, 50)}" is now cheaper`
        : `📉 ${drops.length} items on your wishlist just dropped in price`

    try {
      await resend.emails.send({
        from:    'GiftHint <alerts@gifthint.io>',
        to:      wisher.email,
        subject,
        html,
      })

      // Record each alerted item in price_drop_alerts
      for (const drop of drops) {
        const dropPctVal = Math.round(drop.dropPct * 100) / 100
        const { error: insertErr } = await supabase
          .from('price_drop_alerts')
          .insert({
            item_id:   drop.item.id,
            user_id:   userId,
            old_price: drop.oldPrice,
            new_price: drop.newPrice,
            drop_pct:  dropPctVal,
          })

        if (insertErr) {
          // Unique partial index violation = already sent — treat as benign
          if (!insertErr.message.includes('unique') && !insertErr.message.includes('duplicate')) {
            console.warn(
              `[send-price-alerts] price_drop_alerts insert failed for item ${drop.item.id}:`,
              insertErr.message,
            )
          }
        }
      }

      usersAlerted++
      itemsAlerting += drops.length

      console.log(
        `[send-price-alerts] 📉 sent → ${wisher.email} ` +
        `(${drops.length} item${drops.length === 1 ? '' : 's'}, ` +
        `top drop: "${primary.item.title}" −${dropPctRounded}%)`,
      )
    } catch (emailErr) {
      errors++
      console.error(
        `[send-price-alerts] email failed for user ${userId}:`,
        emailErr instanceof Error ? emailErr.message : emailErr,
      )
    }
  }

  const duration = ((Date.now() - startMs) / 1000).toFixed(1) + 's'
  console.log(
    `[send-price-alerts] done — usersAlerted: ${usersAlerted}, ` +
    `itemsAlerting: ${itemsAlerting}, skipped: ${skipped}, errors: ${errors}, duration: ${duration}`,
  )

  return NextResponse.json({ usersAlerted, itemsAlerting, skipped, errors, duration })
}
