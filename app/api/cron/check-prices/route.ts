/**
 * app/api/cron/check-prices/route.ts — GiftHint
 *
 * GET /api/cron/check-prices
 *
 * Daily cron job invoked by Vercel Cron at 06:00 UTC.
 *
 * For each wishlist item where:
 *   price_alert_enabled = true
 *   last_checked_at IS NULL OR last_checked_at < NOW() - INTERVAL '23 hours'
 *
 * The job:
 *   1. Calls checkPrice() from lib/price-checker.ts
 *   2. Inserts a row into price_history
 *   3. Updates last_checked_at (and lowest_price if a new low is found)
 *   4. If the new price is below the wisher's alert threshold AND below the
 *      previous price, sends a price-drop alert email to the item owner
 *
 * Batching:
 *   Items are processed in batches of 20 with a 500 ms pause between batches
 *   to avoid overwhelming retailers that rate-limit by IP.
 *   Within each batch, price scraping runs concurrently. Once all prices are
 *   collected, price_history rows are bulk-inserted in a single query (N items
 *   → 1 INSERT) rather than one INSERT per item. wishlist_items are updated
 *   individually via Promise.all because each row carries unique values.
 *
 * Security:
 *   Protected by Authorization: Bearer <CRON_SECRET> — Vercel Cron sends this
 *   automatically when the env var is set.
 *
 * Response (200):
 *   {
 *     checked:  number,  // items for which a price was found
 *     skipped:  number,  // items where price could not be detected
 *     alerts:   number,  // price-drop emails sent
 *     errors:   number,  // unexpected failures
 *     duration: string,  // wall-clock time e.g. "4.2s"
 *   }
 *
 * Errors:
 *   401  { error: 'unauthorized' }
 *   500  { error: 'server_error', message: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }        from '@/lib/supabase-server'
import { checkPrice }                from '@/lib/price-checker'
import { sendPriceDropAlert }        from '@/lib/email'

// ── Constants ─────────────────────────────────────────────────────────────────

const BATCH_SIZE       = 20
const BATCH_DELAY_MS   = 500

// ── Types ─────────────────────────────────────────────────────────────────────

interface EligibleItem {
  id:                   string
  title:                string
  source_url:           string
  retailer:             string | null
  price:                number | null
  currency:             string
  lowest_price:         number | null
  price_alert_threshold: number | null
  user_id:              string
}

interface WisherRow {
  id:    string
  email: string | null
  display_name: string | null
}

/** Row ready to be bulk-inserted into price_history after each batch. */
interface PriceHistoryRow {
  item_id:    string
  price:      number
  source:     string
  checked_at: string
}

/** Per-item update payload collected during scraping, applied after bulk insert. */
interface ItemUpdatePayload {
  id:              string
  last_checked_at: string
  lowest_price:    number
  price:           number
}

/** Pending price-drop alert, sent after DB writes are confirmed. */
interface PendingAlert {
  wisher:    WisherRow
  item:      EligibleItem
  newPrice:  number
  prevPrice: number
  newLowest: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const startMs = Date.now()

  // ── Auth ───────────────────────────────────────────────────────────────────
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[check-prices] CRON_SECRET is not configured')
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

  let checked = 0
  let skipped = 0
  let alerts  = 0
  let errors  = 0

  // ── 1. Fetch eligible items ────────────────────────────────────────────────
  const { data: items, error: fetchErr } = await supabase
    .from('wishlist_items')
    .select('id, title, source_url, retailer, price, currency, lowest_price, price_alert_threshold, user_id')
    .eq('price_alert_enabled', true)
    .or('last_checked_at.is.null,last_checked_at.lt.' + new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString())
    .not('source_url', 'is', null)

  if (fetchErr) {
    console.error('[check-prices] items query error:', fetchErr.message)
    return NextResponse.json(
      { error: 'server_error', message: fetchErr.message },
      { status: 500 },
    )
  }

  if (!items || items.length === 0) {
    console.log('[check-prices] no items eligible for price check')
    return NextResponse.json({ checked: 0, skipped: 0, alerts: 0, errors: 0, duration: '0s' })
  }

  console.log(`[check-prices] ${items.length} item(s) eligible`)

  // ── 2. Fetch wisher emails in bulk ────────────────────────────────────────
  const uniqueUserIds = Array.from(new Set((items as EligibleItem[]).map((i) => i.user_id)))

  const { data: wishers, error: wishersErr } = await supabase
    .from('users')
    .select('id, email, display_name')
    .in('id', uniqueUserIds)

  if (wishersErr) {
    console.error('[check-prices] wishers query error:', wishersErr.message)
    return NextResponse.json(
      { error: 'server_error', message: wishersErr.message },
      { status: 500 },
    )
  }

  const wisherMap = new Map<string, WisherRow>(
    (wishers ?? []).map((w) => [w.id, w as WisherRow]),
  )

  // ── 3. Process in batches ──────────────────────────────────────────────────
  //
  // Each batch runs in three phases to minimise DB round-trips:
  //
  //   Phase A — Concurrent price scraping (no DB writes)
  //             Returns structured results per item.
  //   Phase B — Bulk INSERT price_history (N items → 1 query per batch)
  //             Skipped-item last_checked_at stamps are still individual
  //             because they carry no price row.
  //   Phase C — Parallel wishlist_items UPDATE (individual, different values)
  //   Phase D — Send price-drop alert emails (after writes are confirmed)
  //
  const batches = chunk(items as EligibleItem[], BATCH_SIZE)

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    if (batchIdx > 0) await sleep(BATCH_DELAY_MS)

    const batch = batches[batchIdx]
    const batchLabel = `batch ${batchIdx + 1}/${batches.length} (${batch.length} items)`
    console.log(`[check-prices] ${batchLabel}`)

    // ── Phase A: concurrent price scraping ────────────────────────────────
    // Returns null for items where no price was detected.

    const batchTimestamp = new Date().toISOString()   // shared across the batch

    const scrapeResults = await Promise.all(
      batch.map(async (item) => {
        try {
          return {
            item,
            result: await checkPrice({
              id:         item.id,
              source_url: item.source_url,
              retailer:   item.retailer,
              price:      item.price,
            }),
          }
        } catch (err) {
          errors++
          console.error(
            `[check-prices] scrape error for item ${item.id}:`,
            err instanceof Error ? err.message : err,
          )
          return { item, result: null }
        }
      }),
    )

    // Classify results into skipped / successful
    const skippedIds:     string[]            = []
    const historyRows:    PriceHistoryRow[]   = []
    const itemUpdates:    ItemUpdatePayload[] = []
    const pendingAlerts:  PendingAlert[]      = []

    for (const { item, result } of scrapeResults) {
      if (!result) {
        // No price detectable — stamp last_checked_at to avoid re-hammering
        skipped++
        skippedIds.push(item.id)
        continue
      }

      const { price: newPrice, source } = result
      checked++

      const prevLowest = item.lowest_price ?? item.price ?? newPrice
      const newLowest  = Math.min(prevLowest, newPrice)
      const isNewLow   = newPrice < prevLowest

      // Collect for bulk price_history insert
      historyRows.push({
        item_id:    item.id,
        price:      newPrice,
        source,
        checked_at: batchTimestamp,
      })

      // Collect for parallel wishlist_items update
      itemUpdates.push({
        id:              item.id,
        last_checked_at: batchTimestamp,
        lowest_price:    newLowest,
        price:           newPrice,
      })

      if (isNewLow) {
        console.log(
          `[check-prices] 🏆 new low for "${item.title}": ` +
          `${item.currency} ${newPrice} (was ${prevLowest})`,
        )
      }

      // Collect alert if price-drop threshold met
      const prevPrice = item.price
      if (prevPrice !== null && prevPrice > 0 && newPrice < prevPrice) {
        const threshold      = item.price_alert_threshold ?? 90
        const thresholdPrice = prevPrice * (threshold / 100)

        if (newPrice <= thresholdPrice) {
          const wisher = wisherMap.get(item.user_id)
          if (wisher?.email) {
            pendingAlerts.push({ wisher, item, newPrice, prevPrice, newLowest })
          } else {
            console.warn(
              `[check-prices] drop detected on item ${item.id} but wisher has no email`,
            )
          }
        }
      }
    }

    // ── Phase B: bulk INSERT price_history ────────────────────────────────
    // N inserts collapsed to 1 per batch.

    // PromiseLike<void> covers Supabase's thenable PostgrestFilterBuilder
    const dbWrites: PromiseLike<void>[] = []

    if (historyRows.length > 0) {
      dbWrites.push(
        supabase
          .from('price_history')
          .insert(historyRows)
          .then(({ error }) => {
            if (error) {
              console.error(
                `[check-prices] bulk price_history insert failed (${batchLabel}):`,
                error.message,
              )
            }
          }),
      )
    }

    // Stamp skipped items with last_checked_at so the cron skips them tomorrow
    for (const id of skippedIds) {
      dbWrites.push(
        supabase
          .from('wishlist_items')
          .update({ last_checked_at: batchTimestamp })
          .eq('id', id)
          .then(({ error }) => {
            if (error) {
              console.error(`[check-prices] skipped-stamp failed for ${id}:`, error.message)
            }
          }),
      )
    }

    // ── Phase C: parallel wishlist_items UPDATEs ─────────────────────────
    // Each item has unique price / lowest_price values, so individual UPDATEs
    // are unavoidable. They run in parallel to minimise wall-clock time.

    for (const update of itemUpdates) {
      const { id, ...fields } = update
      dbWrites.push(
        supabase
          .from('wishlist_items')
          .update(fields)
          .eq('id', id)
          .then(({ error }) => {
            if (error) {
              console.error(
                `[check-prices] wishlist_items update failed for ${id}:`,
                error.message,
              )
            }
          }),
      )
    }

    await Promise.all(dbWrites)

    // ── Phase D: send price-drop alert emails ─────────────────────────────
    // Sent after DB writes are confirmed so a failed email doesn't block
    // the update commit.

    await Promise.all(
      pendingAlerts.map(async ({ wisher, item, newPrice, prevPrice, newLowest }) => {
        try {
          await sendPriceDropAlert({
            to:           wisher.email!,
            wisherName:   wisher.display_name ?? 'there',
            itemTitle:    item.title,
            itemUrl:      item.source_url,
            itemImageUrl: null,    // not fetched in bulk — avoids extra queries
            oldPrice:     prevPrice,
            newPrice,
            lowestPrice:  newLowest,
            currency:     item.currency || 'GBP',
          })

          alerts++
          console.log(
            `[check-prices] 📉 alert sent → ${wisher.email} ` +
            `(${item.title}: ${prevPrice} → ${newPrice})`,
          )
        } catch (emailErr) {
          console.error(
            `[check-prices] alert email failed for item ${item.id}:`,
            emailErr instanceof Error ? emailErr.message : emailErr,
          )
          // Don't increment errors — price was checked successfully
        }
      }),
    )
  }

  const duration = ((Date.now() - startMs) / 1000).toFixed(1) + 's'

  console.log(
    `[check-prices] done — checked: ${checked}, skipped: ${skipped}, ` +
    `alerts: ${alerts}, errors: ${errors}, duration: ${duration}`,
  )

  return NextResponse.json({ checked, skipped, alerts, errors, duration })
}
