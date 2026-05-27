/**
 * app/api/cron/sync-affiliate-data/route.ts — GiftHint
 *
 * GET /api/cron/sync-affiliate-data
 *
 * Daily cron job that fetches yesterday's confirmed earnings from both
 * Amazon Associates and Skimlinks, then upserts the results into the
 * affiliate_reports table.
 *
 * SCHEDULE
 * ────────
 * Recommended: 06:00 UTC daily. Skimlinks finalises the previous day's data
 * by ~03:00 UTC; Amazon CSV exports are available by ~05:00 UTC.
 *
 * Add to vercel.json:
 *   {
 *     "crons": [
 *       { "path": "/api/cron/sync-affiliate-data", "schedule": "0 6 * * *" },
 *       { "path": "/api/cron/send-reminders",      "schedule": "0 9 * * *" }
 *     ]
 *   }
 *
 * SECURITY
 * ────────
 * Protected by Authorization: Bearer <CRON_SECRET> header.
 * Vercel Cron sends this automatically when CRON_SECRET is set in the
 * project environment variables. Direct callers without the header get 401.
 *
 * IDEMPOTENCY
 * ───────────
 * The upsert uses ON CONFLICT (network, report_date) DO UPDATE, so re-running
 * for the same date (e.g. to pick up a late-arriving Amazon CSV) is safe.
 *
 * ERROR HANDLING
 * ──────────────
 * Network failures are caught individually — a Skimlinks API outage does not
 * prevent Amazon data from being stored, and vice versa. Each failure is
 * logged and reported in the response body but does not return a 5xx.
 * Vercel Cron retries on non-2xx; we return 200 with an errors array instead
 * so partial success is recorded and does not trigger infinite retries.
 *
 * AMAZON CSV NOTE
 * ───────────────
 * Amazon Associates does not have a public earnings report API. The Amazon
 * sync expects a CSV to have been uploaded to Supabase Storage at:
 *   affiliate-reports/amazon/YYYY-MM-DD.csv
 * If the file is missing, the Amazon sync is skipped (logged as a warning,
 * not an error) and only Skimlinks data is written for that day.
 *
 * See lib/amazon-associates-api.ts for full setup instructions.
 *
 * RESPONSE
 * ────────
 * 200 { synced: string[], skipped: string[], errors: { network: string, message: string }[] }
 * 401 { error: 'unauthorized' }
 * 500 { error: 'server_error', message: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }         from '@/lib/supabase-server'
import { fetchAssociatesReport }      from '@/lib/amazon-associates-api'
import { fetchSkimlinksReport }       from '@/lib/skimlinks-api'
import type { AssociatesReport }      from '@/lib/amazon-associates-api'
import type { SkimlinksReport }       from '@/lib/skimlinks-api'

// ── Types ──────────────────────────────────────────────────────────────────────

interface SyncResult {
  synced:  string[]
  skipped: string[]
  errors:  Array<{ network: string; message: string }>
}

// ── Date helpers ───────────────────────────────────────────────────────────────

/** Returns 'YYYY-MM-DD' for yesterday in UTC. */
function yesterdayUtc(): string {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 10)
}

// ── Auth ───────────────────────────────────────────────────────────────────────

function isAuthorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[sync-affiliate-data] CRON_SECRET is not configured.')
    return false
  }
  const header = req.headers.get('authorization') ?? ''
  return header === `Bearer ${secret}`
}

// ── Upsert helpers ─────────────────────────────────────────────────────────────

async function upsertAmazon(
  supabase: ReturnType<typeof createServerClient>,
  date: string,
  report: AssociatesReport,
): Promise<void> {
  const { error } = await supabase
    .from('affiliate_reports')
    .upsert(
      {
        network:     'amazon',
        report_date: date,
        clicks:      report.clicks,
        revenue:     report.fees,          // fees = your commission, not gross revenue
        raw_data:    report as unknown as Record<string, unknown>,
        synced_at:   new Date().toISOString(),
      },
      { onConflict: 'network,report_date' },
    )

  if (error) {
    throw new Error(`Supabase upsert failed: ${error.message}`)
  }
}

async function upsertSkimlinks(
  supabase: ReturnType<typeof createServerClient>,
  date: string,
  report: SkimlinksReport,
): Promise<void> {
  const { error } = await supabase
    .from('affiliate_reports')
    .upsert(
      {
        network:     'skimlinks',
        report_date: date,
        clicks:      report.clicks,
        revenue:     report.revenue,
        raw_data:    report as unknown as Record<string, unknown>,
        synced_at:   new Date().toISOString(),
      },
      { onConflict: 'network,report_date' },
    )

  if (error) {
    throw new Error(`Supabase upsert failed: ${error.message}`)
  }
}

// ── Route handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  // ── Auth ─────────────────────────────────────────────────────────────────────
  if (!isAuthorised(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const date     = yesterdayUtc()
  const supabase = createServerClient()
  const result: SyncResult = { synced: [], skipped: [], errors: [] }

  console.log(`[sync-affiliate-data] Starting sync for ${date}`)

  // ── Amazon Associates ─────────────────────────────────────────────────────────
  try {
    const report = await fetchAssociatesReport(date, date)
    await upsertAmazon(supabase, date, report)
    result.synced.push('amazon')
    console.log(
      `[sync-affiliate-data] Amazon synced: clicks=${report.clicks} fees=$${report.fees}`,
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    // Missing CSV is a known-expected state (operator hasn't uploaded yet).
    // Log as a warning rather than an error so the cron doesn't look broken
    // on days when Amazon data hasn't been manually downloaded yet.
    if (message.includes('No report CSV found')) {
      result.skipped.push('amazon')
      console.warn(`[sync-affiliate-data] Amazon skipped — ${message}`)
    } else {
      result.errors.push({ network: 'amazon', message })
      console.error(`[sync-affiliate-data] Amazon error: ${message}`)
    }
  }

  // ── Skimlinks ─────────────────────────────────────────────────────────────────
  try {
    const report = await fetchSkimlinksReport(date, date)
    await upsertSkimlinks(supabase, date, report)
    result.synced.push('skimlinks')
    console.log(
      `[sync-affiliate-data] Skimlinks synced: clicks=${report.clicks} revenue=$${report.revenue} pending=$${report.pendingRevenue}`,
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    result.errors.push({ network: 'skimlinks', message })
    console.error(`[sync-affiliate-data] Skimlinks error: ${message}`)
  }

  // ── Summary log ───────────────────────────────────────────────────────────────
  console.log(
    `[sync-affiliate-data] Done. synced=${result.synced.join(',')} ` +
    `skipped=${result.skipped.join(',') || 'none'} ` +
    `errors=${result.errors.length}`,
  )

  return NextResponse.json({ date, ...result }, { status: 200 })
}
