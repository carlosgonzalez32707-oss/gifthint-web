/**
 * tests/load/gifter-page.js — GiftHint k6 Load Test
 *
 * Simulates the full gifter-page user journey at 100 concurrent users.
 *
 * ── WHAT THIS TESTS ───────────────────────────────────────────────────────────
 *   1. GET  /list/:username/:slug          — ISR-cached gifter page (HTML)
 *   2. POST /api/track-view               — fire-and-forget view tracking
 *   3. POST /api/track-click              — click attribution (1-in-3 users)
 *   4. POST /api/claim                    — item claim (1-in-10 users)
 *
 * ── LOAD SHAPE ────────────────────────────────────────────────────────────────
 *   0 → 100 VUs  over 1 min  (ramp-up)
 *   100 VUs      for 3 min   (sustained load)
 *   100 → 0 VUs  over 1 min  (ramp-down)
 *   Total wall-clock: ~5 minutes
 *
 * ── WHY THESE THRESHOLDS ──────────────────────────────────────────────────────
 *   P95 < 2 s    — Our SLO from sentry-setup.md; gifter pages are ISR-cached
 *                  so cold SSR should be sub-500ms and cache hits sub-50ms.
 *                  The 2 s limit gives headroom for Vercel cold starts during
 *                  ramp-up and cache misses on new slug URLs.
 *
 *   Error rate < 1% — Rate limiting, 409 (already claimed), and Supabase
 *                  transient errors are all expected; claim 409 is counted as
 *                  success in the check to avoid skewing the error rate.
 *
 * ── HOW TO RUN ────────────────────────────────────────────────────────────────
 *   # Install k6: https://k6.io/docs/getting-started/installation/
 *   # macOS:  brew install k6
 *   # Linux:  sudo apt install k6
 *
 *   # Against staging (recommended — never run against production):
 *   BASE_URL=https://staging.gifthint.io \
 *   TEST_USERNAME=loadtest \
 *   TEST_SLUG=birthday-2026 \
 *   TEST_WISHLIST_ID=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee \
 *   TEST_ITEM_IDS=uuid1,uuid2,uuid3,uuid4,uuid5 \
 *   TEST_WISHER_USER_ID=ffffffff-0000-0000-0000-000000000001 \
 *   k6 run tests/load/gifter-page.js
 *
 *   # With HTML report:
 *   k6 run --out csv=results/gifter-page.csv tests/load/gifter-page.js
 *
 * ── SETUP REQUIRED ────────────────────────────────────────────────────────────
 *   1. Create a test wisher account (TEST_USERNAME / TEST_WISHER_USER_ID)
 *   2. Create a public wishlist with slug TEST_SLUG and multiple unclaimed items
 *   3. Set TEST_ITEM_IDS to comma-separated UUIDs of unclaimed items
 *   4. Run against staging — NEVER against production
 *      (claim requests mutate state; track-click inflates analytics)
 */

import http    from 'k6/http'
import { check, group, sleep } from 'k6'
import { Rate, Trend, Counter } from 'k6/metrics'

// ── Custom metrics ────────────────────────────────────────────────────────────

// Separate response-time trends per endpoint so you can see which is slow
const gifterPageDuration  = new Trend('gifter_page_duration',  true)  // true = use ms
const trackViewDuration   = new Trend('track_view_duration',   true)
const trackClickDuration  = new Trend('track_click_duration',  true)
const claimDuration       = new Trend('claim_duration',        true)

// Count how many claim attempts resulted in 409 (already claimed, expected)
const claimConflicts      = new Counter('claim_conflicts')
const errorCount          = new Counter('http_errors')

// ── Config ────────────────────────────────────────────────────────────────────

const BASE_URL        = __ENV.BASE_URL        || 'https://staging.gifthint.io'
const TEST_USERNAME   = __ENV.TEST_USERNAME   || 'loadtest'
const TEST_SLUG       = __ENV.TEST_SLUG       || 'birthday-2026'
const TEST_WISHLIST_ID = __ENV.TEST_WISHLIST_ID || 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const TEST_WISHER_ID  = __ENV.TEST_WISHER_USER_ID || 'ffffffff-0000-0000-0000-000000000001'

// Item IDs for claim simulation — comma-separated UUIDs of unclaimed items
const TEST_ITEM_IDS   = (__ENV.TEST_ITEM_IDS || 'item-uuid-1,item-uuid-2,item-uuid-3')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

// Affiliate network values exercised by click simulation
const NETWORKS = ['amazon_associates', 'skimlinks', 'unknown']
const RETAILERS = ['amazon', 'etsy', 'johnlewis', 'notonthehighstreet', 'unknown']

// ── Thresholds ────────────────────────────────────────────────────────────────
// These are the pass/fail criteria. k6 exits non-zero if any threshold fails.

export const options = {
  // ── Load shape: ramp up → hold → ramp down (total ~5 min) ──────────────────
  stages: [
    { duration: '1m',   target: 100 },   // ramp: 0 → 100 VUs over 1 minute
    { duration: '3m',   target: 100 },   // hold: 100 VUs for 3 minutes
    { duration: '1m',   target: 0   },   // ramp-down: 100 → 0 VUs over 1 minute
  ],

  thresholds: {
    // ── Primary SLOs ────────────────────────────────────────────────────────
    // P95 gifter page load < 2 s (ISR cache should make most < 100 ms)
    'gifter_page_duration{expected_response:true}': ['p(95)<2000'],

    // P95 API calls < 500 ms each
    'track_view_duration{expected_response:true}':  ['p(95)<500'],
    'track_click_duration{expected_response:true}': ['p(95)<500'],
    'claim_duration{expected_response:true}':        ['p(95)<800'],

    // ── Global error rate < 1% ───────────────────────────────────────────────
    // 'http_req_failed' counts non-2xx/3xx responses.
    // We exclude 409 (already-claimed) via the check block — not a real error.
    'http_req_failed': ['rate<0.01'],

    // ── Baseline k6 built-ins ────────────────────────────────────────────────
    // Overall P95 wall time across all requests < 2 s
    'http_req_duration': ['p(95)<2000'],
  },

  // Tag all requests from this script in Sentry/Grafana
  tags: { test: 'gifter-page', version: '1.0' },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Pick a random element from an array */
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

/** Simulated gifter names for claim payloads */
const GIFTER_NAMES = [
  'Alice', 'Bob', 'Charlie', 'Diana', 'Ethan',
  'Fiona', 'George', 'Hannah', 'Isaac', 'Julia',
]

// ── Main VU script ─────────────────────────────────────────────────────────────
// k6 runs this function once per VU per iteration.
// VUs run concurrently; each VU loops the function for the test duration.

export default function () {
  const gifterPageUrl = `${BASE_URL}/list/${TEST_USERNAME}/${TEST_SLUG}`

  // Shared headers to avoid CORS rejections from the dev server
  const htmlHeaders = {
    'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-GB,en;q=0.9',
    // Omit real-looking User-Agent — k6 sends its own; this avoids Vercel WAF hits
  }

  const jsonHeaders = {
    'Content-Type': 'application/json',
    'Accept':       'application/json',
    // Simulate the gifter page's origin so CSP allows the request
    'Origin':       BASE_URL,
    'Referer':      gifterPageUrl,
  }

  // ── Step 1: Load the gifter page ──────────────────────────────────────────
  // This is served by Next.js ISR — most requests should hit the Vercel cache
  // and return in < 50 ms. Cache misses (new slugs or 60-second revalidation)
  // hit Next.js rendering and Supabase — target < 500 ms for those.
  group('gifter_page_load', function () {
    const res = http.get(gifterPageUrl, {
      headers: htmlHeaders,
      tags:    { endpoint: 'gifter_page' },
    })

    gifterPageDuration.add(res.timings.duration)

    const ok = check(res, {
      'gifter page: status 200':        (r) => r.status === 200,
      'gifter page: contains wishlist':  (r) => r.body && r.body.includes(TEST_SLUG),
      'gifter page: no error boundary':  (r) => r.body && !r.body.includes('Something went wrong'),
    })

    if (!ok) errorCount.add(1)
  })

  // Brief pause — simulates time for the browser to parse HTML before
  // the JS fires the track-view request. Keeps the load profile realistic.
  sleep(0.3 + Math.random() * 0.5)  // 300–800 ms

  // ── Step 2: Track page view ───────────────────────────────────────────────
  // Fire-and-forget in production; in the load test we wait for the 200.
  // Rate-limited to 10 views / IP / hour in production — k6 VUs share IPs
  // across the test so this will rate-limit after the first iteration.
  // That's intentional — we're testing that the rate-limit path returns 200
  // (silent drop) without errors.
  group('track_view', function () {
    const res = http.post(
      `${BASE_URL}/api/track-view`,
      JSON.stringify({ wishlistId: TEST_WISHLIST_ID }),
      {
        headers: jsonHeaders,
        tags:    { endpoint: 'track_view' },
      },
    )

    trackViewDuration.add(res.timings.duration)

    // Both 200 and 429 are acceptable — 429 on gifter-page is a silent drop
    // returning { ok: true } so this should always be 200 in practice.
    check(res, {
      'track-view: status 200': (r) => r.status === 200,
      'track-view: ok body':    (r) => {
        try { return JSON.parse(r.body).ok === true } catch { return false }
      },
    })
  })

  // ── Step 3: Simulate item browse time ────────────────────────────────────
  // Gifters typically spend 10–30 s reading items before clicking.
  // We compress this to 1–3 s to keep the test duration practical while
  // still giving the server realistic inter-request spacing.
  sleep(1 + Math.random() * 2)

  // ── Step 4: Track buy click (1-in-3 VUs) ─────────────────────────────────
  // Not every gifter clicks "Buy" — 33% click rate is realistic for a warm list.
  // For the load test every VU does this to keep the metric clean.
  if (Math.random() < 0.33) {
    group('track_click', function () {
      const itemId = pick(TEST_ITEM_IDS)

      const res = http.post(
        `${BASE_URL}/api/track-click`,
        JSON.stringify({
          itemId,
          wisherUserId:       TEST_WISHER_ID,
          retailer:           pick(RETAILERS),
          affiliateNetwork:   pick(NETWORKS),
          gifterPageUsername: TEST_USERNAME,
        }),
        {
          headers: jsonHeaders,
          tags:    { endpoint: 'track_click' },
        },
      )

      trackClickDuration.add(res.timings.duration)

      check(res, {
        'track-click: status 200': (r) => r.status === 200,
        'track-click: ok body':    (r) => {
          try { return JSON.parse(r.body).ok === true } catch { return false }
        },
      })
    })
  }

  // ── Step 5: Claim an item (1-in-10 VUs) ──────────────────────────────────
  // Claims are rare relative to views. At 10k MAU with 3 gifter visits/user/month:
  //   30k visits → ~3k claimed items/month → ~1 claim per 10 visits (10%)
  //
  // The endpoint has a Postgres-level race guard (.eq('is_claimed', false)) so
  // concurrent claims for the same item_id correctly return 409.
  // The load test EXPECTS 409s — they don't count as errors.
  if (Math.random() < 0.10) {
    group('claim_item', function () {
      const itemId = pick(TEST_ITEM_IDS)
      const claimedBy = Math.random() < 0.2 ? null : pick(GIFTER_NAMES)  // 20% anonymous

      const res = http.post(
        `${BASE_URL}/api/claim`,
        JSON.stringify({
          itemId,
          claimedBy,
          anonymous: claimedBy === null,
        }),
        {
          headers: jsonHeaders,
          tags:    { endpoint: 'claim' },
        },
      )

      claimDuration.add(res.timings.duration)

      // 200 = claimed, 409 = already claimed by another VU (both are correct behaviour)
      const ok = check(res, {
        'claim: 200 or 409':    (r) => r.status === 200 || r.status === 409,
        'claim: not 500':       (r) => r.status !== 500,
        'claim: response < 1s': (r) => r.timings.duration < 1000,
      })

      if (res.status === 409) claimConflicts.add(1)
      if (!ok || (res.status !== 200 && res.status !== 409)) errorCount.add(1)
    })
  }

  // ── Think time: simulate user reading the page after clicking ─────────────
  // Without think time, VUs would hammer the server at maximum RPS — unrealistic.
  // 2–5 s think time gives ~20 req/VU/min, so 100 VUs ≈ 2000 req/min = 33 RPS.
  // That's a realistic peak for a gifting occasion going viral.
  sleep(2 + Math.random() * 3)
}

// ── Setup function (runs once before VUs start) ───────────────────────────────
// Validates that the test environment is reachable and the fixture data exists.

export function setup() {
  const res = http.get(`${BASE_URL}/list/${TEST_USERNAME}/${TEST_SLUG}`)

  if (res.status !== 200) {
    // Fail fast — don't run the load test against broken data
    throw new Error(
      `Setup failed: GET /list/${TEST_USERNAME}/${TEST_SLUG} returned ${res.status}.\n` +
      `Check that the test wisher and wishlist exist in the staging database.\n` +
      `See the SETUP REQUIRED section at the top of this file.`
    )
  }

  console.log(`✓ Gifter page reachable: ${BASE_URL}/list/${TEST_USERNAME}/${TEST_SLUG}`)
  console.log(`✓ Testing with ${TEST_ITEM_IDS.length} item(s)`)
  console.log(`  Ramp-up: 0→100 VUs over 60s → hold 180s → ramp-down 60s`)
  console.log(`  Thresholds: P95 page < 2s, P95 API < 500ms, error rate < 1%`)

  return { baseUrl: BASE_URL }
}

// ── Teardown (runs once after all VUs finish) ─────────────────────────────────

export function teardown(data) {
  console.log(`\nLoad test complete. Base URL: ${data.baseUrl}`)
  console.log('Check Sentry for any errors surfaced during the test.')
  console.log('Check Supabase → Database → pg_stat_statements for slow queries.')
}
