/**
 * lib/skimlinks-api.ts — GiftHint
 *
 * Fetches confirmed commission data from the Skimlinks Publisher API v2.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SETUP
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 1. Log in to Skimlinks dashboard → https://hub.skimlinks.com
 * 2. Go to Account → API Access and generate an API key.
 * 3. Note your Publisher ID (shown in Account → Publisher Settings).
 * 4. Add both to your environment:
 *      SKIMLINKS_API_KEY=sk_live_...
 *      SKIMLINKS_PUBLISHER_ID=123456
 *
 * API DOCUMENTATION:
 *   https://developers.skimlinks.com/publisher-api/
 *   Base URL: https://api.skimlinks.com/v2
 *
 * RATE LIMITS:
 *   100 requests/minute per API key.
 *   Commission endpoint returns up to 200 rows per page; auto-paginated below.
 *
 * COMMISSION STATUSES:
 *   'approved'  — confirmed, will be paid
 *   'pending'   — awaiting retailer confirmation (typically 30-90 days)
 *   'rejected'  — reversed (returns, fraud, etc.)
 *
 * For the reconciliation table we count only 'approved' commissions as
 * confirmed revenue. 'pending' is shown separately as a separate line so
 * operators understand the pipeline, but is excluded from the variance calc.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RESPONSE CACHING
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The cron job stores the result in `affiliate_reports`. Do NOT call this
 * function on every admin page load — call it once per day from the cron.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SkimlinksReport {
  date:             string   // YYYY-MM-DD (start of the requested range)
  clicks:           number   // total clicks Skimlinks tracked (from their JS)
  commissions:      number   // count of approved commission events
  revenue:          number   // sum of approved commission amounts (USD)
  pendingRevenue:   number   // sum of pending commission amounts (USD)
  rejectedRevenue:  number   // sum of rejected/reversed amounts (USD)
}

/** Raw commission object returned by the Skimlinks API */
interface SkimlinksCommission {
  id:              string
  status:          'approved' | 'pending' | 'rejected'
  commission:      string    // decimal string, e.g. "4.73"
  currency:        string    // e.g. "USD"
  date:            string    // ISO date of the click/sale
  merchant_name:   string
  order_value:     string    // sale amount before commission
}

/** Skimlinks /commissions response envelope */
interface SkimlinksCommissionsResponse {
  commissions: SkimlinksCommission[]
  pagination: {
    total:    number
    page:     number
    per_page: number
  }
}

/** Skimlinks /clicks response envelope (separate endpoint) */
interface SkimlinksClicksResponse {
  clicks: {
    total: number
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SKIMLINKS_API_BASE = 'https://api.skimlinks.com/v2'
const PAGE_SIZE          = 200   // max per Skimlinks API docs

// ── Auth ──────────────────────────────────────────────────────────────────────

function getCredentials(): { apiKey: string; publisherId: string } {
  const apiKey      = process.env.SKIMLINKS_API_KEY
  const publisherId = process.env.SKIMLINKS_PUBLISHER_ID

  if (!apiKey) {
    throw new Error(
      '[skimlinks] SKIMLINKS_API_KEY is not set. ' +
      'Get yours at: https://hub.skimlinks.com → Account → API Access'
    )
  }
  if (!publisherId) {
    throw new Error(
      '[skimlinks] SKIMLINKS_PUBLISHER_ID is not set. ' +
      'Find it at: https://hub.skimlinks.com → Account → Publisher Settings'
    )
  }

  return { apiKey, publisherId }
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function skimGet<T>(
  path: string,
  params: Record<string, string>,
  apiKey: string,
): Promise<T> {
  const url = new URL(`${SKIMLINKS_API_BASE}${path}`)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }

  const res = await fetch(url.toString(), {
    method:  'GET',
    headers: {
      Authorization:  `Bearer ${apiKey}`,
      Accept:         'application/json',
      'User-Agent':   'GiftHint-Sync/1.0',
    },
    // Never cache — always fetch fresh data for the cron job
    cache: 'no-store',
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      `[skimlinks] API error ${res.status} on ${path}: ${body.slice(0, 200)}`
    )
  }

  return res.json() as Promise<T>
}

// ── Commissions fetcher (auto-paginated) ──────────────────────────────────────

/**
 * fetchAllCommissions
 *
 * Paginates through the Skimlinks commissions endpoint until all rows for
 * the date range are retrieved. Skimlinks returns max 200 rows per page.
 */
async function fetchAllCommissions(
  publisherId: string,
  apiKey: string,
  startDate: string,
  endDate: string,
): Promise<SkimlinksCommission[]> {
  const all: SkimlinksCommission[] = []
  let page = 1

  while (true) {
    const data = await skimGet<SkimlinksCommissionsResponse>(
      `/publishers/${publisherId}/commissions`,
      {
        start_date: startDate,
        end_date:   endDate,
        page:       String(page),
        per_page:   String(PAGE_SIZE),
      },
      apiKey,
    )

    all.push(...(data.commissions ?? []))

    const { total, per_page } = data.pagination ?? { total: 0, per_page: PAGE_SIZE }
    if (all.length >= total || (data.commissions ?? []).length < per_page) break

    page++
  }

  return all
}

// ── Clicks fetcher ────────────────────────────────────────────────────────────

/**
 * fetchClickCount
 *
 * Fetches the total click count tracked by the Skimlinks JS for the period.
 * This is different from commission count — Skimlinks tracks every click on
 * a monetisable link, only a fraction of which convert to commissions.
 *
 * Endpoint: GET /publishers/{id}/clicks
 * Docs: https://developers.skimlinks.com/publisher-api/#tag/Analytics/operation/getClicks
 */
async function fetchClickCount(
  publisherId: string,
  apiKey: string,
  startDate: string,
  endDate: string,
): Promise<number> {
  try {
    const data = await skimGet<SkimlinksClicksResponse>(
      `/publishers/${publisherId}/clicks`,
      { start_date: startDate, end_date: endDate },
      apiKey,
    )
    return data.clicks?.total ?? 0
  } catch (err) {
    // Click count is nice-to-have — don't fail the whole sync if it errors
    console.warn('[skimlinks] Could not fetch click count:', err)
    return 0
  }
}

// ── Currency normalisation ────────────────────────────────────────────────────

/**
 * normaliseToUsd
 *
 * Skimlinks pays in the currency of the sale. For simplicity, GiftHint
 * records everything in USD. Non-USD amounts are marked with a warning and
 * stored at face value (1:1 exchange rate) — add real FX if needed.
 */
function normaliseToUsd(amount: string, currency: string): number {
  const value = parseFloat(amount) || 0
  if (currency !== 'USD') {
    console.warn(
      `[skimlinks] Non-USD commission (${currency} ${amount}) stored at 1:1 rate. ` +
      'Consider adding FX conversion via an exchange rate API.'
    )
  }
  return Math.round(value * 100) / 100
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * fetchSkimlinksReport
 *
 * Fetches confirmed commission data from the Skimlinks Publisher API.
 *
 * Returns aggregate totals for the requested date range broken down by
 * commission status (approved / pending / rejected).
 *
 * For storage in affiliate_reports:
 *   - revenue = approvedRevenue (confirmed, countable)
 *   - raw_data = full SkimlinksReport object for audit trail
 *
 * @param startDate  ISO date 'YYYY-MM-DD' (inclusive)
 * @param endDate    ISO date 'YYYY-MM-DD' (inclusive)
 */
export async function fetchSkimlinksReport(
  startDate: string,
  endDate: string,
): Promise<SkimlinksReport> {
  const { apiKey, publisherId } = getCredentials()

  // Fetch commissions and clicks in parallel
  const [commissions, clicks] = await Promise.all([
    fetchAllCommissions(publisherId, apiKey, startDate, endDate),
    fetchClickCount(publisherId, apiKey, startDate, endDate),
  ])

  // Aggregate by status
  let approvedRevenue  = 0
  let pendingRevenue   = 0
  let rejectedRevenue  = 0
  let approvedCount    = 0

  for (const c of commissions) {
    const amount = normaliseToUsd(c.commission, c.currency)
    switch (c.status) {
      case 'approved':
        approvedRevenue += amount
        approvedCount++
        break
      case 'pending':
        pendingRevenue += amount
        break
      case 'rejected':
        rejectedRevenue += amount
        break
    }
  }

  return {
    date:            startDate,
    clicks,
    commissions:     approvedCount,
    revenue:         Math.round(approvedRevenue  * 100) / 100,
    pendingRevenue:  Math.round(pendingRevenue   * 100) / 100,
    rejectedRevenue: Math.round(rejectedRevenue  * 100) / 100,
  }
}
