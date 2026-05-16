/**
 * lib/amazon-associates-api.ts — GiftHint
 *
 * Fetches confirmed earnings from the Amazon Associates reporting surface.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPORTANT: TWO SEPARATE AMAZON PROGRAMMES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 1. Amazon Product Advertising API (PA API v5)
 *    — Used to search/look up product data, rewrite affiliate links.
 *    — Does NOT provide earnings or clicks reports.
 *    — Requires separate approval AND $0 in sales after 30 days to stay active.
 *    — Credentials: ACCESS_KEY_ID + SECRET_ACCESS_KEY + ASSOCIATE_TAG
 *
 * 2. Amazon Associates Reporting API  ← this file uses this one
 *    — Provides daily earnings, clicks, ordered-items reports.
 *    — Accessed via the same AWS credentials as PA API.
 *    — Endpoint: https://webservices.amazon.com/paapi5/getbrowsenodes
 *      — Actually: Associates API uses a separate host per locale.
 *      — US:  https://affiliate-program.amazon.com/home/paymentstatus
 *      — The machine-readable version is via the Associates Central API:
 *        POST https://advertising-api.amazon.com/... (used for Amazon Ads)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * REAL-WORLD SETUP (read before using this module)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Amazon does NOT offer a public REST API for Associates earnings reports
 * as of 2025. The options are:
 *
 *   Option A — CSV download (this file implements a parser for it)
 *   ─────────────────────────────────────────────────────────────
 *   1. Go to Associates Central → Reports → Earnings Reports
 *   2. Download the Daily Summary report as CSV.
 *   3. Upload the CSV to Supabase Storage (bucket: 'affiliate-reports/amazon/')
 *      named 'YYYY-MM-DD.csv'.
 *   4. The cron job calls fetchAssociatesReport() which calls parseCsvFromStorage().
 *
 *   Option B — Screen-scrape via Puppeteer (fragile, not recommended for prod)
 *   ─────────────────────────────────────────────────────────────────────────
 *   Automate sign-in and CSV download. Brittle — Amazon changes the page often.
 *
 *   Option C — Amazon Attribution API (beta, invite-only as of 2025)
 *   ─────────────────────────────────────────────────────────────────
 *   For approved partners: POST https://advertising-api.amazon.com/v2/attribution/
 *   Requires separate Amazon Advertising API access and an approved Attribution tag.
 *   Contact: associates-api@amazon.com with your Associates ID to apply.
 *
 * ENV VARS NEEDED:
 *   AMAZON_PA_ACCESS_KEY   — AWS IAM access key (same account as PA API)
 *   AMAZON_PA_SECRET_KEY   — AWS IAM secret key
 *   AMAZON_ASSOCIATES_TAG  — Your Associates tracking ID (e.g. gifthint-20)
 *   SUPABASE_URL           — Used to fetch CSVs from storage (already in .env)
 *   SUPABASE_SERVICE_ROLE_KEY — Already in .env
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PA API v5 setup (separate — for product search, not reports)
 * ─────────────────────────────────────────────────────────────────────────────
 *   1. Log in to Associates Central → Tools → Product Advertising API
 *   2. Request access. You need qualifying sales FIRST (typically 3 in 180 days).
 *   3. Once approved, create IAM credentials under your AWS account.
 *   4. Credentials arrive as ACCESS_KEY_ID + SECRET_ACCESS_KEY.
 *   5. Sign all PA API requests using AWS Signature V4 (see signPaApiRequest below).
 *   6. Quota: 1 request/second initially; scales with sales volume.
 *
 * PA API DOCUMENTATION:
 *   https://webservices.amazon.com/paapi5/documentation/
 */

import { createServerClient } from '@/lib/supabase-server'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AssociatesReport {
  date:          string   // YYYY-MM-DD (start of range, or specific day)
  clicks:        number
  orderedItems:  number
  revenue:       number   // total ordered revenue (USD), not commission
  fees:          number   // your affiliate commission
  conversionPct: number   // orderedItems / clicks * 100
}

/**
 * Raw row shape from the Associates Central daily summary CSV.
 * Column names as they appear in the downloaded file (header row).
 *
 * Amazon uses a tab-separated or comma-separated file depending on locale.
 * The US locale uses comma-separated with these exact headers.
 */
interface AssociatesCsvRow {
  Date:                   string
  'Clicks Referred':      string
  'Ordered Items':        string
  'Ordered Revenue':      string
  'Ad Fees Earned':       string
}

// ── CSV parser ────────────────────────────────────────────────────────────────

/**
 * parseCsvRow
 * Handles quoted fields and comma delimiters. Amazon's CSV is clean enough
 * that this minimal parser is sufficient without a full library.
 */
function parseCsvRow(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  fields.push(current.trim())
  return fields
}

/**
 * parseAssociatesCsv
 *
 * Parses the Associates Central daily summary CSV into structured rows.
 * Sums across all rows that fall within [startDate, endDate].
 *
 * CSV format (US, comma-separated, UTF-8 BOM possible):
 *   Date, Clicks Referred, Ordered Items, Ordered Revenue, Ad Fees Earned
 *   2025-05-01, 142, 8, "$934.52", "$46.73"
 *   ...
 *   Total, 142, 8, "$934.52", "$46.73"  ← last row, skip
 */
export function parseAssociatesCsv(
  csvText: string,
  startDate: string,
  endDate: string,
): AssociatesReport {
  const lines  = csvText.replace(/^﻿/, '').split('\n').filter(Boolean)
  const header = parseCsvRow(lines[0])

  const colIdx = (name: string) => {
    const i = header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase())
    if (i === -1) throw new Error(`Amazon CSV: column "${name}" not found. Headers: ${header.join(', ')}`)
    return i
  }

  const idxDate     = colIdx('Date')
  const idxClicks   = colIdx('Clicks Referred')
  const idxItems    = colIdx('Ordered Items')
  const idxRevenue  = colIdx('Ordered Revenue')
  const idxFees     = colIdx('Ad Fees Earned')

  const parseMoney = (s: string) =>
    parseFloat(s.replace(/[$,"]/g, '').trim()) || 0

  let clicks       = 0
  let orderedItems = 0
  let revenue      = 0
  let fees         = 0
  let rowCount     = 0

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvRow(lines[i])
    const date = (cols[idxDate] ?? '').trim()

    // Skip the "Total" summary row and rows outside the date range
    if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) continue
    if (date < startDate || date > endDate)   continue

    clicks       += parseInt(cols[idxClicks]  ?? '0', 10) || 0
    orderedItems += parseInt(cols[idxItems]   ?? '0', 10) || 0
    revenue      += parseMoney(cols[idxRevenue] ?? '0')
    fees         += parseMoney(cols[idxFees]    ?? '0')
    rowCount++
  }

  if (rowCount === 0) {
    console.warn(`[amazon-associates] No rows found in CSV for ${startDate}–${endDate}`)
  }

  return {
    date:          startDate,
    clicks,
    orderedItems,
    revenue:       Math.round(revenue * 100) / 100,
    fees:          Math.round(fees    * 100) / 100,
    conversionPct: clicks === 0 ? 0 : Math.round((orderedItems / clicks) * 10000) / 100,
  }
}

// ── Supabase Storage CSV fetch ────────────────────────────────────────────────

/**
 * fetchCsvFromStorage
 *
 * Downloads a previously-uploaded Associates CSV from Supabase Storage.
 * Expected path: affiliate-reports/amazon/YYYY-MM-DD.csv
 * (where the filename is the start date of the report period)
 *
 * Upload the CSV manually:
 *   supabase storage cp ./amazon-2025-05-01.csv \
 *     supabase://affiliate-reports/amazon/2025-05-01.csv
 *
 * Or via the Supabase dashboard → Storage → affiliate-reports bucket.
 *
 * Returns null if the file doesn't exist (caller should handle gracefully).
 */
async function fetchCsvFromStorage(date: string): Promise<string | null> {
  const supabase = createServerClient()
  const path     = `amazon/${date}.csv`

  const { data, error } = await supabase.storage
    .from('affiliate-reports')
    .download(path)

  if (error) {
    if ((error as { status?: number }).status === 404 || error.message?.includes('not found')) {
      return null
    }
    throw new Error(`[amazon-associates] Storage download failed: ${error.message}`)
  }

  return data ? await (data as Blob).text() : null
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * fetchAssociatesReport
 *
 * Retrieves confirmed earnings data from Amazon Associates.
 *
 * STRATEGY (in priority order):
 *
 * 1. Look for a manually-uploaded CSV in Supabase Storage for the start date.
 *    Path: affiliate-reports/amazon/YYYY-MM-DD.csv
 *    If found, parse and return.
 *
 * 2. If no CSV is found, throw a descriptive error that explains what to do.
 *    We do NOT silently return zero data — a missing file should be visible
 *    in the cron logs so the operator knows to upload the CSV.
 *
 * WHY NO DIRECT API CALL:
 *   Amazon's Associates earnings reports are only available via Associates
 *   Central's website or CSV export. There is no public REST endpoint as of
 *   2025. This function is built to accept CSV files once you download them.
 *
 * @param startDate  ISO date string 'YYYY-MM-DD' (inclusive)
 * @param endDate    ISO date string 'YYYY-MM-DD' (inclusive)
 */
export async function fetchAssociatesReport(
  startDate: string,
  endDate: string,
): Promise<AssociatesReport> {
  // Try to fetch a CSV for the start date from Supabase Storage
  const csvText = await fetchCsvFromStorage(startDate)

  if (csvText !== null) {
    return parseAssociatesCsv(csvText, startDate, endDate)
  }

  // No CSV found — surface a clear error for the operator
  throw new Error(
    `[amazon-associates] No report CSV found for ${startDate}. ` +
    `Upload a CSV from Associates Central to Supabase Storage at ` +
    `affiliate-reports/amazon/${startDate}.csv and re-run the sync. ` +
    `See setup instructions in lib/amazon-associates-api.ts.`
  )
}

// ── PA API v5 helper (product lookup, NOT reports) ────────────────────────────

/**
 * signPaApiRequest
 *
 * Signs a PA API v5 request using AWS Signature V4.
 * This is used for PRODUCT SEARCH / LOOKUP, not for earnings reports.
 *
 * Required env vars:
 *   AMAZON_PA_ACCESS_KEY  — IAM access key ID
 *   AMAZON_PA_SECRET_KEY  — IAM secret access key
 *   AMAZON_ASSOCIATES_TAG — Associates tracking ID
 *
 * Usage example (product lookup):
 *   const headers = await signPaApiRequest({
 *     host:      'webservices.amazon.com',
 *     region:    'us-east-1',
 *     payload:   JSON.stringify({ ... }),
 *   })
 *   const res = await fetch('https://webservices.amazon.com/paapi5/searchitems', {
 *     method:  'POST',
 *     headers: { ...headers, 'Content-Type': 'application/json' },
 *     body:    JSON.stringify({ ... }),
 *   })
 *
 * DOCUMENTATION:
 *   https://webservices.amazon.com/paapi5/documentation/signing-requests.html
 */
export async function signPaApiRequest({
  host,
  region,
  path = '/paapi5/searchitems',
  payload,
}: {
  host:     string
  region:   string
  path?:    string
  payload:  string
}): Promise<Record<string, string>> {
  const accessKey = process.env.AMAZON_PA_ACCESS_KEY
  const secretKey = process.env.AMAZON_PA_SECRET_KEY

  if (!accessKey || !secretKey) {
    throw new Error(
      '[amazon-associates] AMAZON_PA_ACCESS_KEY and AMAZON_PA_SECRET_KEY must be set. ' +
      'Apply for PA API access at: Associates Central → Tools → Product Advertising API'
    )
  }

  const now      = new Date()
  const dateStr  = now.toISOString().replace(/[:\-]|\.\d{3}/g, '').slice(0, 15) + 'Z'
  const dateOnly = dateStr.slice(0, 8)

  const encoder = new TextEncoder()

  const hmac = async (key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> => {
    const cryptoKey = await crypto.subtle.importKey(
      'raw', key as BufferSource,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data))
  }

  const sha256Hex = async (data: string): Promise<string> => {
    const buf = await crypto.subtle.digest('SHA-256', encoder.encode(data))
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
  }

  const payloadHash  = await sha256Hex(payload)
  const canonicalUri = path
  const headers      = {
    'content-encoding': 'amz-1.0',
    'content-type':     'application/json; charset=UTF-8',
    'host':             host,
    'x-amz-date':       dateStr,
    'x-amz-target':     'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems',
  }

  const signedHeaders = Object.keys(headers).sort().join(';')
  const canonicalHeaders = Object.entries(headers)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}\n`)
    .join('')

  const canonicalRequest = [
    'POST',
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')

  const credentialScope  = `${dateOnly}/${region}/ProductAdvertisingAPI/aws4_request`
  const canonicalHash    = await sha256Hex(canonicalRequest)
  const stringToSign     = `AWS4-HMAC-SHA256\n${dateStr}\n${credentialScope}\n${canonicalHash}`

  const kDate    = await hmac(encoder.encode(`AWS4${secretKey}`), dateOnly)
  const kRegion  = await hmac(kDate, region)
  const kService = await hmac(kRegion, 'ProductAdvertisingAPI')
  const kSigning = await hmac(kService, 'aws4_request')
  const sigBuf   = await hmac(kSigning, stringToSign)
  const signature = Array.from(new Uint8Array(sigBuf)).map((b) => b.toString(16).padStart(2, '0')).join('')

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`

  return { ...headers, Authorization: authorization }
}
