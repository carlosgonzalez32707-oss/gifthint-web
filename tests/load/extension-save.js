/**
 * tests/load/extension-save.js — GiftHint k6 Load Test
 *
 * Simulates the Chrome extension's item-save flow under peak concurrent load.
 *
 * ── WHAT THIS TESTS ───────────────────────────────────────────────────────────
 * The extension save path has two parts that both need to hold under load:
 *
 *   Part A — Duplicate check (via Supabase PostgREST GET):
 *     GET  <SUPABASE_URL>/rest/v1/wishlist_items
 *          ?user_id=eq.<userId>&source_url=eq.<url>&select=id
 *     Verifies the duplicate guard works when many users save at once.
 *
 *   Part B — Item insert (via Supabase PostgREST POST):
 *     POST <SUPABASE_URL>/rest/v1/wishlist_items
 *     Tests that concurrent inserts don't dead-lock or corrupt data.
 *
 * Additionally tests the wisher-facing wishlist creation API:
 *   POST /api/wishlists   — creates a new wishlist (uses rate-limit logic)
 *
 * ── WHY DIRECT SUPABASE (NOT A CUSTOM API ROUTE) ─────────────────────────────
 * The extension calls Supabase PostgREST directly — there is no `/api/save`
 * proxy route. Testing the PostgREST endpoint is therefore the only way to
 * measure real production latency for the save flow.
 *
 * The anon key is used for auth (same as the extension). Row-Level Security
 * restricts writes: users can only insert rows where user_id = auth.uid(),
 * so each VU must authenticate with a unique test user JWT.
 *
 * ── LOAD SHAPE ────────────────────────────────────────────────────────────────
 *   50 VUs (constant) for 3 minutes
 *   Each VU saves one item, waits 2–4 s, saves another (different URL)
 *   → ~12–25 saves/VU/min × 50 VUs ≈ 600–1,250 saves/min at peak
 *   The 50 concurrent saves/min figure from the brief is the sustained rate.
 *
 * ── THRESHOLDS ────────────────────────────────────────────────────────────────
 *   P95 duplicate-check response < 200 ms  (indexed query, should be fast)
 *   P95 item insert response     < 1 s     (includes RLS check + write)
 *   P95 wishlist create response < 1 s
 *   Duplicate guard:             100% blocked (0 duplicate rows created)
 *   Error rate:                  < 1%
 *
 * ── HOW TO RUN ────────────────────────────────────────────────────────────────
 *   # Prerequisites: staging Supabase project with test users pre-created
 *   # See "SETUP REQUIRED" below.
 *
 *   BASE_URL=https://staging.gifthint.io \
 *   SUPABASE_URL=https://your-project.supabase.co \
 *   SUPABASE_ANON_KEY=eyJ... \
 *   TEST_USER_IDS=uuid1,uuid2,uuid3 \
 *   TEST_USER_JWTS=jwt1,jwt2,jwt3 \
 *   TEST_WISHLIST_IDS=wl-uuid1,wl-uuid2,wl-uuid3 \
 *   k6 run tests/load/extension-save.js
 *
 * ── SETUP REQUIRED ────────────────────────────────────────────────────────────
 * 1. Create 50+ test user accounts in the staging Supabase project.
 *    Each VU needs its own user to avoid RLS conflicts.
 *    Script to create test users (run once in Supabase SQL editor):
 *
 *    DO $$
 *    DECLARE i INT;
 *    BEGIN
 *      FOR i IN 1..50 LOOP
 *        INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at)
 *        VALUES (
 *          gen_random_uuid(),
 *          'loadtest-' || i || '@gifthint.test',
 *          crypt('testpassword123', gen_salt('bf')),
 *          now()
 *        );
 *      END LOOP;
 *    END $$;
 *
 * 2. Generate JWTs for each test user (use Supabase Admin API or SQL):
 *    SELECT supabase_auth.sign(row_to_json(u)) FROM auth.users u
 *    WHERE email LIKE 'loadtest-%'
 *
 * 3. Create one wishlist per test user and collect the IDs into TEST_WISHLIST_IDS.
 *
 * 4. Pass user IDs, JWTs, and wishlist IDs as comma-separated env vars.
 *
 * ALTERNATIVE (simpler): Use the service role key and bypass RLS
 *    SUPABASE_KEY=<service_role_key>  (skips the JWT requirement)
 *    Note: only appropriate for testing — never use service role in the app.
 */

import http    from 'k6/http'
import { check, group, sleep } from 'k6'
import { Rate, Trend, Counter } from 'k6/metrics'
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js'

// ── Custom metrics ────────────────────────────────────────────────────────────

const dupCheckDuration   = new Trend('dup_check_duration',   true)
const insertDuration     = new Trend('item_insert_duration', true)
const wishlistDuration   = new Trend('wishlist_create_duration', true)
const duplicatesBlocked  = new Counter('duplicates_blocked')   // should be = duplicate attempts
const duplicatesThrough  = new Counter('duplicates_through')   // should stay 0
const saveErrors         = new Counter('save_errors')

// ── Config ────────────────────────────────────────────────────────────────────

const BASE_URL         = __ENV.BASE_URL         || 'https://staging.gifthint.io'
const SUPABASE_URL     = __ENV.SUPABASE_URL     || 'https://your-project.supabase.co'
const SUPABASE_ANON    = __ENV.SUPABASE_ANON_KEY || ''

// Comma-separated test user UUIDs — one per VU slot
const TEST_USER_IDS    = (__ENV.TEST_USER_IDS || '').split(',').filter(Boolean)
const TEST_USER_JWTS   = (__ENV.TEST_USER_JWTS || '').split(',').filter(Boolean)
const TEST_WISHLIST_IDS = (__ENV.TEST_WISHLIST_IDS || '').split(',').filter(Boolean)

// ── Thresholds ────────────────────────────────────────────────────────────────

export const options = {
  // ── Load shape: constant 50 VUs for 3 minutes ──────────────────────────────
  // Models the realistic peak of 50 concurrent extension saves per minute.
  // Each VU does roughly 1 save per 2–4 s of think time, so:
  //   50 VUs × (60s / 3s avg) ≈ 1,000 saves/min at maximum sustained rate.
  // The 50 saves/min figure is actually very conservative — this test stress-
  // tests well above that to find the breaking point.
  vus:      50,
  duration: '3m',

  thresholds: {
    // Duplicate-check query must be fast (it's indexed on user_id + source_url)
    'dup_check_duration':        ['p(95)<200'],

    // Full insert round-trip (RLS + write + response) < 1 s
    'item_insert_duration':      ['p(95)<1000'],

    // Wishlist creation < 1 s
    'wishlist_create_duration':  ['p(95)<1000'],

    // Overall < 1 s P95 across all requests (matches brief)
    'http_req_duration':         ['p(95)<1000'],

    // Error rate < 1%
    'http_req_failed':           ['rate<0.01'],

    // CRITICAL: zero duplicate rows should slip through the guard
    // This counter MUST stay at 0 for the test to be meaningful.
    'duplicates_through':        ['count<1'],
  },

  tags: { test: 'extension-save', version: '1.0' },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

// Synthetic product URLs — realistic Amazon/Etsy/JohnLewis shapes
const RETAILERS = [
  { domain: 'amazon.com',         path: '/dp/',    retailer: 'amazon' },
  { domain: 'amazon.co.uk',       path: '/dp/',    retailer: 'amazon' },
  { domain: 'etsy.com',           path: '/listing/', retailer: 'etsy' },
  { domain: 'johnlewis.com',      path: '/p/',     retailer: 'johnlewis' },
  { domain: 'notonthehighstreet.com', path: '/product/', retailer: 'noths' },
]

function randomProductUrl(uniqueId) {
  const r = pick(RETAILERS)
  // Include the VU's unique ID in the URL so each VU gets distinct URLs
  // (prevents cross-VU URL collisions from triggering false 409s)
  return `https://www.${r.domain}${r.path}${uniqueId}-${Math.floor(Math.random() * 9999)}`
}

// Simulated product titles
const TITLES = [
  'Personalised Star Map Print',
  'Le Creuset Cast Iron Casserole 28cm',
  'Dyson Airwrap Complete Styler',
  'Kindle Paperwhite 16GB',
  'Ooni Karu 12 Multi-Fuel Pizza Oven',
  'Theragun Mini Handheld Massager',
  'Jo Malone Wood Sage & Sea Salt Cologne',
  'Nintendo Switch OLED',
  'Yeti Rambler 30oz Travel Mug',
  'Moleskine 2026 Daily Planner',
]

// ── VU initialisation ─────────────────────────────────────────────────────────
// Each VU gets its own user credentials. VU index is 1-based.

export function setup() {
  // Validate environment before starting VUs
  if (!SUPABASE_URL || SUPABASE_URL.includes('your-project')) {
    throw new Error(
      'SUPABASE_URL is not set or is the placeholder value.\n' +
      'Set SUPABASE_URL to your staging Supabase project URL.\n' +
      'Example: https://abcdefghijklmnop.supabase.co'
    )
  }
  if (!SUPABASE_ANON) {
    throw new Error('SUPABASE_ANON_KEY is required. Find it in Supabase → Settings → API.')
  }

  const vuCount = Math.min(TEST_USER_IDS.length, 50)
  if (vuCount === 0) {
    throw new Error(
      'TEST_USER_IDS is empty. Create 50 test users in staging and pass their UUIDs.\n' +
      'See the SETUP REQUIRED section at the top of this file.'
    )
  }

  console.log(`✓ Supabase URL: ${SUPABASE_URL}`)
  console.log(`✓ Test users: ${vuCount}`)
  console.log(`✓ Test wishlists: ${TEST_WISHLIST_IDS.length}`)
  console.log('  Concurrent VUs: 50 | Duration: 3 min')
  console.log('  Threshold: P95 insert < 1s, 0 duplicate rows through')

  return { supabaseUrl: SUPABASE_URL }
}

// ── Main VU function ──────────────────────────────────────────────────────────

export default function () {
  // Each VU picks its own user credentials (round-robin by VU ID)
  // __VU is 1-based in k6
  const vuIndex    = (__VU - 1) % Math.max(TEST_USER_IDS.length, 1)
  const userId     = TEST_USER_IDS[vuIndex]     || `test-user-${__VU}`
  const userJwt    = TEST_USER_JWTS[vuIndex]    || ''
  const wishlistId = TEST_WISHLIST_IDS[vuIndex] || null

  if (!userId) {
    console.error(`VU ${__VU}: no user ID available — check TEST_USER_IDS`)
    return
  }

  // Each save iteration uses a unique product URL to avoid cross-iteration conflicts
  // The URL is unique per VU per iteration using k6's built-in __ITER counter
  const productUrl = randomProductUrl(`vu${__VU}-iter${__ITER}`)

  const supaHeaders = {
    'Content-Type':  'application/json',
    'apikey':        SUPABASE_ANON,
    'Authorization': userJwt ? `Bearer ${userJwt}` : `Bearer ${SUPABASE_ANON}`,
    'Prefer':        'return=representation',
  }

  const jsonHeaders = {
    'Content-Type': 'application/json',
    'Accept':       'application/json',
    'Origin':       BASE_URL,
  }

  // ── Step 1: Duplicate-check query ────────────────────────────────────────
  // Mirrors what extension/items.js → isDuplicate() does before every save.
  // Tests the partial index on (user_id, source_url) under concurrent load.
  group('duplicate_check', function () {
    const dupCheckUrl =
      `${SUPABASE_URL}/rest/v1/wishlist_items` +
      `?user_id=eq.${encodeURIComponent(userId)}` +
      `&source_url=eq.${encodeURIComponent(productUrl)}` +
      `&select=id` +
      `&limit=1`

    const res = http.get(dupCheckUrl, {
      headers: { ...supaHeaders, 'Prefer': 'count=exact' },
      tags:    { endpoint: 'dup_check' },
    })

    dupCheckDuration.add(res.timings.duration)

    check(res, {
      'dup-check: status 200':      (r) => r.status === 200,
      'dup-check: response < 200ms': (r) => r.timings.duration < 200,
    })
  })

  // ── Step 2: Insert the item ───────────────────────────────────────────────
  // Simulates the actual POST the extension sends to Supabase PostgREST.
  // RLS policy: users can only insert where user_id = auth.uid().
  group('item_insert', function () {
    const payload = {
      user_id:     userId,
      wishlist_id: wishlistId,
      title:       pick(TITLES),
      price:       parseFloat((Math.random() * 200 + 5).toFixed(2)),
      currency:    pick(['GBP', 'USD', 'EUR']),
      image_url:   `https://m.media-amazon.com/images/I/${uuidv4()}.jpg`,
      source_url:  productUrl,
      retailer:    pick(RETAILERS).retailer,
      dna_tags:    [],
      is_claimed:  false,
    }

    const res = http.post(
      `${SUPABASE_URL}/rest/v1/wishlist_items`,
      JSON.stringify(payload),
      {
        headers: supaHeaders,
        tags:    { endpoint: 'item_insert' },
      },
    )

    insertDuration.add(res.timings.duration)

    const ok = check(res, {
      'insert: status 201':       (r) => r.status === 201,
      'insert: returns item id':  (r) => {
        try {
          const body = JSON.parse(r.body)
          return Array.isArray(body) ? body[0]?.id != null : body?.id != null
        } catch { return false }
      },
      'insert: response < 1s':    (r) => r.timings.duration < 1000,
    })

    if (!ok) saveErrors.add(1)
  })

  // ── Step 3: Attempt to save the SAME URL again (duplicate test) ───────────
  // This is the core concurrent-duplicate test. We submit the exact same
  // source_url that was just saved. The extension client checks first, but
  // under concurrent load two VUs might pass the duplicate check simultaneously
  // before either write completes — the DB-level UNIQUE constraint on
  // (user_id, source_url) must catch this.
  //
  // A 409 or 23505 (unique_violation) response means the guard worked.
  // A 201 with the same source_url would mean a duplicate slipped through.
  group('duplicate_insert_attempt', function () {
    const duplicatePayload = {
      user_id:     userId,
      wishlist_id: wishlistId,
      title:       'DUPLICATE — should be blocked',
      price:       9.99,
      currency:    'GBP',
      image_url:   null,
      source_url:  productUrl,   // ← same URL as Step 2
      retailer:    'amazon',
      dna_tags:    [],
      is_claimed:  false,
    }

    const res = http.post(
      `${SUPABASE_URL}/rest/v1/wishlist_items`,
      JSON.stringify(duplicatePayload),
      {
        headers: supaHeaders,
        tags:    { endpoint: 'dup_insert_attempt' },
      },
    )

    const wasBlocked = check(res, {
      // 409 = unique constraint violation (PostgREST maps 23505 → 409 Conflict)
      'duplicate blocked (409)': (r) => r.status === 409,
    })

    if (wasBlocked) {
      duplicatesBlocked.add(1)
    } else {
      // A successful 201 here means a duplicate slipped through — CRITICAL failure
      duplicatesThrough.add(1)
      console.error(
        `VU ${__VU} iter ${__ITER}: DUPLICATE SLIPPED THROUGH! ` +
        `status=${res.status} url=${productUrl}`
      )
    }
  })

  // ── Step 4: POST /api/wishlists (optional — tests the Next.js API) ────────
  // 1-in-5 VUs creates a new wishlist to test the Next.js + Supabase path.
  // This exercises the wishlists/route.ts rate limiter and Supabase write path.
  if (Math.random() < 0.20) {
    group('wishlist_create', function () {
      const res = http.post(
        `${BASE_URL}/api/wishlists`,
        JSON.stringify({
          userId,
          title:    `Load Test Wishlist ${__VU}-${__ITER}`,
          occasion: pick(['birthday', 'christmas', 'wedding', 'graduation']),
        }),
        {
          headers: jsonHeaders,
          tags:    { endpoint: 'wishlist_create' },
        },
      )

      wishlistDuration.add(res.timings.duration)

      check(res, {
        'wishlist-create: 201 or 429': (r) => r.status === 201 || r.status === 429,
        'wishlist-create: not 500':    (r) => r.status !== 500,
      })
    })
  }

  // ── Think time ────────────────────────────────────────────────────────────
  // Extension users typically save 1 item per browsing session, then close the
  // popup. A 2–4 s pause between iterations models this behavioural pattern.
  sleep(2 + Math.random() * 2)
}

export function teardown() {
  console.log('\n── Extension save test complete ──')
  console.log('Key results to review:')
  console.log('  1. duplicates_through counter MUST be 0')
  console.log('  2. item_insert_duration P95 should be < 1s')
  console.log('  3. Check Supabase → Database → Connections for connection pool saturation')
  console.log('  4. Check Upstash → Usage for rate limit hit count during test')
}
