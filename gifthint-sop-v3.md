# GiftHint — Standard Operating Procedures v3

> **Version history**
> v1 — Phase 1 (Supabase, Chrome extension, core wishlist)
> v2 — Phase 2 (Affiliate engine, admin dashboard, claim sync, cross-browser QA)
> v3 — Phase 3 (Group gifting, price alerts, SEO, blog, referral program, premium tiers, themes, retailer partnerships, monitoring)
>
> **Stack at v3:** Next.js 14.2 · Supabase 2.74 · Stripe 22 · Resend · Upstash Redis · Sentry · Recharts · Skimlinks · Amazon Associates · MV3 Chrome · MV2 Firefox · MV3 Edge · Bookmarklet
>
> **Supabase project ref:** `pxegvviakrjhldtwtobi`
> **Production URL:** https://gifthint.io
> **Chrome Web Store listing:** `NEXT_PUBLIC_CHROME_STORE_URL` env var
> **Firefox Add-on ID:** `gifthint@gifthint.io`
> **Stripe dashboard:** https://dashboard.stripe.com

---

## TABLE OF CONTENTS

1. [Project overview and principles](#1-project-overview-and-principles)
2. [Architecture and save pathways](#2-architecture-and-save-pathways)
3. [Database schema](#3-database-schema)
4. [Affiliate and monetisation system](#4-affiliate-and-monetisation-system)
5. [Browser extension builds](#5-browser-extension-builds)
6. [Environment variables](#6-environment-variables)
7. [Cron jobs and background tasks](#7-cron-jobs-and-background-tasks)
8. [Architecture decision record](#8-architecture-decision-record)
9. [Troubleshooting runbook](#9-troubleshooting-runbook)
10. [Pre-merge checklist](#10-pre-merge-checklist)

---

## 1. PROJECT OVERVIEW AND PRINCIPLES

GiftHint is a universal gift wishlist platform. Wishers save products from any retailer; gifters see the list, claim items, and chip into group gifts — without duplicating purchases or spoiling surprises.

### Revenue model (Phase 3)

| Stream | Mechanism | Status |
|--------|-----------|--------|
| Affiliate — Amazon | Associate tag injected server-side | Live |
| Affiliate — Other retailers | Skimlinks publisher script on gifter page | Live |
| Group gift fees | Stripe PaymentIntent per contribution; platform fee TBD | Live (test mode) |
| Pro subscription | £4.99/month or £47.88/year; Stripe Billing | Live (test mode) |
| Retailer partnerships | Co-branded partner pages; referral commission split | Live |

### Guiding principles (non-negotiable)

1. **Affiliate rewriting is server-only.** Chrome Web Store Policy §4.4 prohibits extension-side rewriting. `lib/affiliate.ts` must never be imported in any client bundle, extension, or mobile client.
2. **RLS everywhere.** Every new table gets `ALTER TABLE … ENABLE ROW LEVEL SECURITY`. Service-role-only tables have no public policies — silence is the policy.
3. **Fail open on infrastructure.** Rate limiting, Redis, and price checking all fail open. Real users are never blocked by an Upstash or scraper outage.
4. **No PII in client errors.** Sentry scrubs emails, names, and payment data at the SDK boundary. `serverError()` in `lib/api-response.ts` logs the raw error server-side and returns a generic message to the client.
5. **Stripe test mode until launch.** Switch to live keys (`sk_live_`/`pk_live_`) as a deliberate production milestone, never accidentally.

---

## 2. ARCHITECTURE AND SAVE PATHWAYS

### 2.1 Chrome extension (MV3)

**Files:** `extension/` directory
**Build output:** `extension/dist/`
**Manifest:** `extension/manifest.json`

The popup (`popup.html` + `popup.js`) authenticates via Google OAuth using `chrome.identity.launchWebAuthFlow`. The auth code is sent to `/api/auth/exchange`, which completes the PKCE flow server-side and returns a Supabase session token. This design keeps `GOOGLE_CLIENT_SECRET` out of the extension bundle entirely.

Product data is extracted by `extension/product-extractor.js` (runs as a content script). The floating save button is injected by `extension/floating-button.js`.

**Extension save pathway:**
```
User clicks "Save" → popup.js extracts product → POST /api/items (with session JWT)
→ lib/affiliate.ts rewrites URL server-side → INSERT wishlist_items
```

### 2.2 Firefox extension (MV2)

**Files:** `extension/` (same source, different manifest)
**Manifest:** `extension/manifest.firefox.json`
**Auth file:** `extension/auth.firefox.js` (uses `browser.identity` instead of `chrome.identity`)
**Add-on ID:** `gifthint@gifthint.io`
**Minimum Firefox version:** 109.0

Key difference from Chrome: Firefox MV2 uses `browser_action` (not `action`) and `browser_specific_settings.gecko`. The `browser.identity.launchWebAuthFlow` API works identically to `chrome.identity.launchWebAuthFlow` — the auth flow to `/api/auth/exchange` is unchanged.

Compatibility shim: `extension/compat.js` normalises `chrome.*` / `browser.*` API differences at runtime.

**Build:** `npm run build:firefox` → outputs to `dist-firefox/`
**Submit to:** https://addons.mozilla.org/developers/

### 2.3 Edge extension (MV3)

**Files:** `extension/` (same source as Chrome)
**Manifest:** `extension/manifest.edge.json`
**Update URL:** `https://edge.microsoft.com/extensionwebstorebase/v1/crx`

Edge uses Chromium MV3 — functionally identical to the Chrome build. The separate manifest exists to set the Edge-specific `update_url` and allows Edge-specific store metadata if needed.

**Build:** `npm run build:edge` → outputs to `dist-edge/`
**Submit to:** https://microsoftedge.microsoft.com/addons/

### 2.4 Bookmarklet

**Route:** `/app/bookmarklet/page.tsx` — install page with drag-to-bookmarks-bar instructions
**Logic:** `lib/bookmarklet.js` — human-readable source; `lib/bookmarklet-minifier.ts` — zero-dependency minifier that produces the `javascript:` href at server render time

The bookmarklet is a self-contained IIFE that:
1. Reads `document.title`, `window.location.href`, and the first `og:image` meta tag
2. POSTs to `https://gifthint.io/api/save` with the product data and a `source=bookmarklet` param
3. Shows a brief toast confirmation

**Bookmarklet save pathway:**
```
User clicks bookmark → IIFE extracts product → POST /api/save?source=bookmarklet
→ lib/affiliate.ts rewrites URL → INSERT wishlist_items
```

No auth token is stored in the bookmarklet itself. The save endpoint reads the Supabase session cookie from the browser's cookie jar — works on any origin where the user is logged in to gifthint.io.

**Minification:** `lib/bookmarklet-minifier.ts` strips comments, collapses whitespace, wraps in `javascript:void(...)`. Zero external dependencies. When updating `lib/bookmarklet.js`, paste the new IIFE body into the `SOURCE` constant in the minifier.

### 2.5 iOS share flow (`/app/save`)

**Route:** `app/save/page.tsx`
**Client component:** `app/save/SaveUI.tsx`
**Server instructions:** `app/save/BrowserInstructions.tsx`

The iOS save flow is triggered by the Safari "Share → GiftHint" shortcut (implemented as an iOS Shortcut or the share sheet `?source=ios_share` param). The user arrives at `gifthint.io/save?url=<product_url>&source=ios_share`.

The page:
1. Reads `url` from the query string
2. Calls `lib/scrape-og.ts` server-side to fetch title, image, and price
3. Renders the standard item-save UI pre-populated with the scraped data
4. On save, calls `POST /api/items` — same endpoint as the extension

The `source=ios_share` query param is forwarded as `source` on the saved item for analytics attribution.

**No app required.** The `/save` route is the Phase 3 mobile bridge; Phase 4 replaces it with a native Share Extension backed by `/api/v1/save`.

---

## 3. DATABASE SCHEMA

### 3.1 Core tables (Phase 1–2)

| Table | Purpose |
|-------|---------|
| `users` | One row per authenticated user; Supabase Auth UID as PK |
| `wishlists` | One wishlist per occasion per user; title + slug + occasion + theme |
| `wishlist_items` | One row per saved product; all affiliate-rewritten URLs live here |
| `click_events` | Immutable log of every "Buy" click on the gifter page |
| `page_views` | Daily gifter page view counts (coarse; privacy-safe) |
| `digest_sends` | Weekly email digest send log; prevents re-sending |

### 3.2 Phase 3 tables

#### `gift_pools`
One pool per group-gift wishlist item. Created when the wisher marks an item `is_group_gift = true`.

```sql
gift_pools (
  id                   uuid PRIMARY KEY,
  item_id              uuid NOT NULL REFERENCES wishlist_items(id) ON DELETE CASCADE,
  target_amount        numeric(10,2) NOT NULL,
  collected_amount     numeric(10,2) NOT NULL DEFAULT 0,
  status               text CHECK (status IN ('open','funded','purchased','cancelled')),
  organiser_name       text NOT NULL,
  organiser_email      text NOT NULL,
  payout_instructions  text,
  funded_at            timestamptz,
  stripe_transfer_id   text,
  created_at           timestamptz DEFAULT now()
)
```

RLS: public SELECT (gifters must read pool state); no public INSERT/UPDATE/DELETE (service role only).

DB trigger `trg_gift_pool_collect` fires on `gift_contributions` UPDATE: when `stripe_payment_status` flips to `'succeeded'`, credits `collected_amount` and auto-sets `status = 'funded'` when target is reached.

#### `gift_contributions`
One row per contribution attempt. Lifecycle follows the Stripe PaymentIntent.

```sql
gift_contributions (
  id                       uuid PRIMARY KEY,
  pool_id                  uuid NOT NULL REFERENCES gift_pools(id) ON DELETE CASCADE,
  contributor_name         text,
  contributor_email        text,
  amount                   numeric(10,2) NOT NULL,
  stripe_payment_intent_id text UNIQUE,
  stripe_payment_status    text CHECK (status IN ('pending','succeeded','failed')),
  anonymous                boolean DEFAULT false,
  contributed_at           timestamptz DEFAULT now()
)
```

RLS: no public policies (service role only). Email/amount are private.

#### `price_history`
Immutable price check log. One row per `lib/price-checker.ts` invocation per item.

```sql
price_history (
  id          uuid PRIMARY KEY,
  item_id     uuid NOT NULL REFERENCES wishlist_items(id) ON DELETE CASCADE,
  price       numeric(10,2) NOT NULL,
  checked_at  timestamptz DEFAULT now(),
  source      text CHECK (source IN ('scrape','api'))
)
```

Index: `price_history_item_checked_idx ON (item_id, checked_at DESC)` — fast latest-price query.

#### `price_drop_alerts`
One row per alert email sent. Partial unique index prevents re-alerting within 7 days.

```sql
price_drop_alerts (
  id             uuid PRIMARY KEY,
  item_id        uuid REFERENCES wishlist_items(id) ON DELETE CASCADE,
  user_id        uuid REFERENCES users(id) ON DELETE CASCADE,
  old_price      numeric(10,2),
  new_price      numeric(10,2),
  drop_pct       numeric(5,2),
  alert_sent_at  timestamptz DEFAULT now(),
  email_opened   boolean DEFAULT false
)
```

#### `referral_events`
Attribution log for the referral program.

```sql
referral_events (
  id             uuid PRIMARY KEY,
  referrer_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  referee_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  event_type     text CHECK (event_type IN ('click','signup','first_save')),
  referral_code  text NOT NULL,
  metadata       jsonb DEFAULT '{}',
  created_at     timestamptz DEFAULT now()
)
```

#### `partners`
One row per partner organisation. Each partner maps to a system `users` row whose `referral_code` drives attribution.

```sql
partners (
  id             uuid PRIMARY KEY,
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  slug           text NOT NULL UNIQUE,
  name           text NOT NULL,
  category       text CHECK (category IN ('wedding','baby_shower','corporate','sports_club','education','other')),
  referral_code  text NOT NULL,
  tagline        text,
  created_at     timestamptz DEFAULT now()
)
```

Partner co-branded pages live at `/partners/[slug]`. Attribution pipeline is identical to user-to-user referrals — the `gifthint_ref` cookie carries the partner's `referral_code`.

#### `suspicious_events`
Abuse detection audit log. Written by `lib/abuse-detection.ts`.

```sql
suspicious_events (
  id           uuid PRIMARY KEY,
  event_type   text CHECK (event_type IN ('click_fraud','fake_views','claim_spam','email_harvest')),
  ip_address   text NOT NULL,
  metadata     jsonb DEFAULT '{}',
  created_at   timestamptz DEFAULT now(),
  reviewed     boolean DEFAULT false,
  reviewed_at  timestamptz,
  review_notes text
)
```

#### `blocked_ips`
Permanent record of banned IPs. Redis-backed live blocklist (checked in `middleware.ts`) reads from this table on cold-start and on admin panel actions.

### 3.3 Users table additions (Phase 3)

All added via migrations in `supabase/migrations/2026051*`:

| Column | Type | Default | Migration |
|--------|------|---------|-----------|
| `stripe_customer_id` | text | NULL | `20260518_subscription.sql` |
| `subscription_status` | text | `'free'` | `20260518_subscription.sql` |
| `subscription_period_end` | timestamptz | NULL | `20260518_subscription.sql` |
| `referral_code` | text UNIQUE | auto-generated 8-char | `20260518_referral_system.sql` |
| `referred_by` | uuid → users.id | NULL | `20260518_referral_system.sql` |
| `referral_count` | int | 0 | `20260518_referral_system.sql` |
| `premium_tier` | text | `'free'` | `20260518_referral_rewards.sql` |
| `custom_username_enabled` | boolean | false | `20260518_referral_rewards.sql` |
| `premium_themes_enabled` | boolean | false | `20260518_referral_rewards.sql` |
| `priority_support_enabled` | boolean | false | `20260518_referral_rewards.sql` |
| `price_alerts_enabled` | boolean | true | `20260517_price_drop_alerts.sql` |

### 3.4 Wishlists table additions (Phase 3)

| Column | Type | Values | Migration |
|--------|------|--------|-----------|
| `theme` | text | `default \| midnight \| cloud \| forest \| rose \| slate` | `20260518_wishlist_theme.sql` |

### 3.5 Wishlist items additions (Phase 3)

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `is_group_gift` | boolean | false | Activates group-gift contribution UI |
| `group_gift_target` | numeric(10,2) | NULL | Denormalised from gift_pools for display |
| `price_alert_enabled` | boolean | true | Per-item opt-in to price alerts |
| `price_alert_threshold` | numeric(5,2) | 90 | Alert when price drops below this % of saved price |
| `last_checked_at` | timestamptz | NULL | Used by cron eligibility query |
| `lowest_price` | numeric(10,2) | NULL | Rolling minimum; updated on each new low |

### 3.6 Views (Phase 3)

| View | Route that reads it | Purpose |
|------|---------------------|---------|
| `growth_metrics` | `/admin/growth` | Weekly signups by channel, cohort retention, viral K, WAW, RPU |
| `partner_commission_summary` | `/admin/partners` | Aggregated referral counts and estimated payout per partner |

### 3.7 Performance indices (Phase 3)

Applied by `supabase/migrations/20260518_db_optimisation.sql`. Run the verification query in `infrastructure-audit.md §1.2` to confirm all 11 indices are present.

Key net-new indices:
- `idx_wishlist_items_wishlist_id ON wishlist_items(wishlist_id, sort_order) WHERE is_claimed = false`
- `idx_wishlist_items_user_id ON wishlist_items(user_id, sort_order)`
- `wishlist_items_price_check_eligible_idx ON wishlist_items(price_alert_enabled, last_checked_at) WHERE price_alert_enabled = true`
- `price_history_item_checked_idx ON price_history(item_id, checked_at DESC)`
- `idx_users_subscription_status ON users(subscription_status) WHERE subscription_status = 'pro'`

---

## 4. AFFILIATE AND MONETISATION SYSTEM

### 4.1 Amazon Associates

**Tag:** `gifthint-20` (US) — set in both `AMAZON_ASSOCIATES_TAG` (server) and `NEXT_PUBLIC_AMAZON_ASSOCIATES_TAG` (client, appears in search deep-link URLs only).

**Rewriting:** `lib/affiliate.ts` — server-only. Rewrites `amazon.com`, `amzn.to`, and regional Amazon domains. Never call from any client bundle, extension script, or mobile client.

**Commission rates** (as of May 2026 — verify against [Associates Fee Schedule](https://affiliate-program.amazon.com/help/node/topic/GRXPHT8U84RAYDXZ)):

| Category | Rate | GiftHint priority |
|----------|------|-------------------|
| Luxury Beauty | 10% | 🟢 Lead acquisition messaging |
| Headphones | 6% | 🟢 High volume, holiday peak |
| Musical Instruments | 6% | 🟢 Underserved niche |
| Books | 4.5% | 🟢 High volume |
| Kitchen | 4.5% | 🟢 Very common on wishlists |
| Amazon Fashion | 4% | 🟢 High volume |
| Jewellery | 4% | 🟢 High AOV |
| Home | 3% | 🟢 Dominant wishlist category |
| Baby Products | 3% | 🟢 Baby shower channel |
| Pet Products | 3% | 🟢 Pet owners are dedicated gifters |
| Toys & Games | 3% | 🟢 Birthday/holiday peak |
| Electronics | 1% | 🔴 Large AOV only saves it |
| Health & Personal Care | 1% | 🔴 Cut from 4.5% in 2020 |
| Video Games | 0% | ❌ Never attribute as Amazon revenue |
| Gift Cards | 0% | ❌ Always zero |

Full rate table in `docs/commission-rates-guide.md` and `lib/amazon-categories.ts → AMAZON_COMMISSION_RATES`.

**PA API:** `lib/price-checker.ts` and `lib/amazon-associates-api.ts` share `AMAZON_ACCESS_KEY`, `AMAZON_SECRET_KEY`, `AMAZON_PARTNER_TAG`. PA API access requires ≥ 3 qualifying sales in 180 days. If absent, price checks return `null` gracefully.

### 4.2 Skimlinks

**Publisher ID:** `NEXT_PUBLIC_SKIMLINKS_PUBLISHER_ID` (browser-safe) and `SKIMLINKS_PUBLISHER_ID` (server-side).
**API key:** `SKIMLINKS_API_KEY` — used by `lib/skimlinks-api.ts` to fetch commission reports.

Skimlinks script loads on the gifter page via `SkimlinksScript` component (`strategy="afterInteractive"` — does not block LCP). `shouldSkipSkimlinks()` in `lib/affiliate.ts` prevents double-rewriting Amazon URLs.

Commission data is fetched daily by the `/api/cron/sync-affiliate-data` cron and written to the `affiliate_data` table. The admin reconciliation table reads from there.

### 4.3 Group gifting fees

Group gift contributions flow through Stripe PaymentIntent. Current platform fee: none (Phase 3 is proving the flow; add `application_fee_amount` to `createPaymentIntent()` in `lib/stripe.ts` before launch).

**Critical path:** `POST /api/group-gift/contribute` → Stripe PI created → client renders Stripe Elements → payment succeeds → `/api/group-gift/webhook` receives `payment_intent.succeeded` → DB trigger credits pool → Realtime broadcast updates gifter page.

**Refund endpoint:** `POST /api/group-gift/refund` — protected by `ADMIN_REFUND_SECRET` header.

### 4.4 Pro subscription

**Monthly price:** £4.99 (`STRIPE_PRO_MONTHLY_PRICE_ID` / `NEXT_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID`)
**Annual price:** £47.88 (`STRIPE_PRO_ANNUAL_PRICE_ID` / `NEXT_PUBLIC_STRIPE_PRO_ANNUAL_PRICE_ID`)
**Webhook:** `POST /api/billing/webhook` — uses `STRIPE_BILLING_WEBHOOK_SECRET` (separate from group-gift secret).

Lifecycle events handled:
- `checkout.session.completed` → set `subscription_status = 'pro'`, write `stripe_customer_id`
- `customer.subscription.updated` → update `subscription_status`, `subscription_period_end`
- `customer.subscription.deleted` → set `subscription_status = 'cancelled'`
- `invoice.payment_failed` → trigger dunning email via Resend

Feature gating: `lib/permissions.ts` — `isPro(user)` and `hasFeature(user, featureKey)`. Two unlock paths: paid subscription and referral milestones (see §4.5).

### 4.5 Referral reward tiers (non-subscription Pro)

Computed and applied by `lib/rewards.ts` after each successful `first_save` referral event.

| Referrals | Tier | Unlocks |
|-----------|------|---------|
| 0 | free | — |
| 1 | plus | custom username |
| 3 | plus | + premium themes |
| 5 | plus | + priority support badge |
| 10 | pro | + Pro badge + verified checkmark |

DB columns: `premium_tier`, `custom_username_enabled`, `premium_themes_enabled`, `priority_support_enabled`.

### 4.6 Retailer partnerships

Partners are organisations (wedding planners, NCT groups, tennis clubs, corporate PA networks) with co-branded landing pages at `/partners/[slug]`.

**Attribution pipeline:** visitor arrives at `/partners/[slug]` → `gifthint_ref` cookie set to partner's `referral_code` → signup → `referral_events` row written → `users.referral_count` incremented for the partner system user.

**Partner categories:** `wedding | baby_shower | corporate | sports_club | education | other`

Adding a partner (manual process until partner onboarding UI is built):
1. Create a system user account for the partner in Supabase Auth
2. Note the auto-generated `referral_code` on the `users` row
3. INSERT into `partners` table with the `user_id`, `slug`, `name`, `category`, `referral_code`
4. Deploy — the page at `/partners/[slug]` renders automatically

Revenue split: not yet implemented. Phase 4 goal: automated monthly payout calculation via `partner_payouts` table (migration present in `20260518_partner_system.sql`).

---

## 5. BROWSER EXTENSION BUILDS

### 5.1 Build commands

| Target | Command | Output directory | Store |
|--------|---------|-----------------|-------|
| Chrome | `npm run build:chrome` | `dist-chrome/` | Chrome Web Store |
| Firefox | `npm run build:firefox` | `dist-firefox/` | Firefox Add-ons (AMO) |
| Edge | `npm run build:edge` | `dist-edge/` | Microsoft Edge Add-ons |
| All | `npm run build:ext` | all three | — |

All commands call `browser-build.sh <target>`. The script copies the source, injects the correct manifest, runs `esbuild` to bundle `dist/` assets, and zips the output.

### 5.2 Source file map

| File | Purpose | Chrome | Firefox | Edge |
|------|---------|--------|---------|------|
| `manifest.json` | Chrome MV3 manifest | ✅ | — | — |
| `manifest.firefox.json` | Firefox MV2 manifest | — | ✅ | — |
| `manifest.edge.json` | Edge MV3 manifest (adds `update_url`) | — | — | ✅ |
| `auth.js` | Google OAuth via `chrome.identity` | ✅ | — | ✅ |
| `auth.firefox.js` | Google OAuth via `browser.identity` | — | ✅ | — |
| `compat.js` | `chrome.*`/`browser.*` normalisation shim | All | All | All |
| `background.js` | Service worker (MV3) / background page (MV2) | ✅ | ✅ | ✅ |
| `popup.html` + `popup.js` | Extension popup | All | All | All |
| `floating-button.js` | Injected save button (content script) | All | All | All |
| `hint-sheet.js` | Slide-up product detail panel | All | All | All |
| `product-extractor.js` | OG/JSON-LD scraper | All | All | All |
| `items.js` + `wishlists.js` | Wishlist state management | All | All | All |
| `supabase.js` | Supabase client (anon key only) | All | All | All |

### 5.3 Firefox-specific notes

- Firefox MV2 uses `browser_action` (not `action`). The manifest.firefox.json sets `"manifest_version": 2`.
- `browser.identity.getRedirectURL()` is used in `auth.firefox.js` instead of `chrome.identity.getRedirectURL()`.
- Firefox requires `"data_collection_permissions"` in `browser_specific_settings.gecko` for AMO review.
- Minimum supported version: Firefox 109.0 (first release with stable MV3 — we use MV2 for broader compatibility).
- AMO review typically takes 3–10 business days. See `firefox-store-submission.md` for the submission checklist.

### 5.4 Edge-specific notes

- Edge uses Chromium MV3 — the build is functionally identical to Chrome.
- The separate manifest adds `"update_url": "https://edge.microsoft.com/extensionwebstorebase/v1/crx"` for Edge Add-ons auto-update.
- Edge review is typically faster than Chrome (1–3 business days).

### 5.5 Bookmarklet (no build step)

The bookmarklet install page at `/bookmarklet` serves the minified `javascript:` href generated at render time by `lib/bookmarklet-minifier.ts`. No build step required. To update the bookmarklet behaviour, edit `lib/bookmarklet.js` and update the `SOURCE` constant in `lib/bookmarklet-minifier.ts`.

---

## 6. ENVIRONMENT VARIABLES

All variables are documented in `.env.local.example`. `app/startup-check.ts` validates required vars on server cold-start — call `validateEnv()` from `app/layout.tsx`.

### 6.1 Required variables

| Variable | Group | Notes |
|----------|-------|-------|
| `SUPABASE_URL` | Supabase | Server-only project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | Bypasses RLS; never expose to browser |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase | Browser-safe; must match server URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase | Browser-safe anon key |
| `NEXT_PUBLIC_APP_URL` | App | Canonical base URL; no trailing slash |
| `STRIPE_SECRET_KEY` | Stripe (group-gift) | `sk_test_` in dev, `sk_live_` in prod |
| `STRIPE_WEBHOOK_SECRET` | Stripe (group-gift) | `whsec_` from `/api/group-gift/webhook` endpoint |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe (group-gift) | Browser-safe; used by Stripe Elements |
| `STRIPE_PRO_MONTHLY_PRICE_ID` | Stripe (billing) | `price_` ID for £4.99/month plan |
| `STRIPE_PRO_ANNUAL_PRICE_ID` | Stripe (billing) | `price_` ID for £47.88/year plan |
| `STRIPE_BILLING_WEBHOOK_SECRET` | Stripe (billing) | `whsec_` — **separate** from group-gift secret |
| `NEXT_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID` | Stripe (billing) | Browser-safe copy for upgrade page toggle |
| `NEXT_PUBLIC_STRIPE_PRO_ANNUAL_PRICE_ID` | Stripe (billing) | Browser-safe copy for upgrade page toggle |
| `RESEND_API_KEY` | Email | `re_` API key from Resend dashboard |
| `GOOGLE_CLIENT_ID` | Google OAuth | Web application client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth | Server-only; never in extension bundle |
| `ADMIN_SECRET` | Admin | Protects `/admin` dashboard route |
| `ADMIN_REFUND_SECRET` | Admin | Protects `POST /api/group-gift/refund` |
| `CRON_SECRET` | Cron | Bearer token Vercel attaches to cron requests |

### 6.2 Optional variables (feature-degraded if absent)

| Variable | Group | Degradation if absent |
|----------|-------|----------------------|
| `UPSTASH_REDIS_REST_URL` | Redis | Rate limiting skipped; app fails open |
| `UPSTASH_REDIS_REST_TOKEN` | Redis | Rate limiting skipped; app fails open |
| `AMAZON_ASSOCIATES_TAG` | Affiliate | Links work; no commission |
| `AMAZON_ACCESS_KEY` | Affiliate | Price checks return null |
| `AMAZON_SECRET_KEY` | Affiliate | Price checks return null |
| `AMAZON_PARTNER_TAG` | Affiliate | Same as `AMAZON_ASSOCIATES_TAG` |
| `NEXT_PUBLIC_AMAZON_ASSOCIATES_TAG` | Affiliate | Search deep-links lack attribution |
| `SKIMLINKS_PUBLISHER_ID` | Affiliate | Commission attribution skipped |
| `SKIMLINKS_API_KEY` | Affiliate | Commission report API unavailable |
| `NEXT_PUBLIC_SKIMLINKS_PUBLISHER_ID` | Affiliate | Skimlinks script not loaded |
| `NEXT_PUBLIC_CHROME_STORE_URL` | App | Install CTAs show placeholder link |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry | Client-side errors not captured |
| `SENTRY_DSN` | Sentry | Server-side errors not captured |
| `SENTRY_ORG` | Sentry | Source map upload skipped at build |
| `SENTRY_PROJECT` | Sentry | Source map upload skipped at build |
| `SENTRY_AUTH_TOKEN` | Sentry | Source map upload skipped at build |
| `RESEND_TEST_MODE` | Email | Set `true` in development; logs instead of sending |
| `SUPABASE_TIMEOUT_MS` | Supabase | Defaults to 10 000 ms |

### 6.3 Local development setup

```bash
cp .env.local.example .env.local
# Fill in values; all REQUIRED vars must be present.
# For email in dev: RESEND_TEST_MODE=true — emails log to console.
# For Stripe in dev: use sk_test_ keys and run:
#   stripe listen --forward-to localhost:3000/api/group-gift/webhook
#   stripe listen --forward-to localhost:3000/api/billing/webhook
```

### 6.4 Sentry setup (Phase 3)

```bash
npx @sentry/wizard@latest -i nextjs
```

Required Sentry alert rules (configure in Sentry dashboard → Alerts):
1. `[CRITICAL] Group-gift payment error` — `payment_intent.create` exception; notify immediately
2. `[HIGH] Billing webhook failure` — webhook 400/500 responses; notify within 5 min
3. `[WARN] Price checker failure rate` — >10% PA API errors in 15 min
4. `[INFO] Rate limit abuse spike` — >100 rate-limit 429s from single IP in 5 min

See `docs/sentry-setup.md` for full alert configuration instructions.

---

## 7. CRON JOBS AND BACKGROUND TASKS

All crons are registered in `vercel.json` and protected by `Authorization: Bearer $CRON_SECRET`.

| Endpoint | Schedule | Purpose |
|----------|----------|---------|
| `POST /api/cron/send-reminders` | Daily 09:00 UTC | Wishlist item reminder emails |
| `POST /api/cron/send-digest` | Weekly Monday 08:00 UTC | Weekly digest emails |
| `POST /api/cron/sync-affiliate-data` | Daily 06:00 UTC | Pull Amazon + Skimlinks commission reports |
| `POST /api/cron/check-prices` | Daily 02:00 UTC | PA API price checks; insert `price_history`; trigger alerts |
| `POST /api/cron/apply-rewards` | On signup event (event-driven) | Called by auth signup route; applies referral tier via `lib/rewards.ts` |

**Price check cron flow:**
1. Query `wishlist_items WHERE price_alert_enabled = true AND (last_checked_at IS NULL OR last_checked_at < NOW() - INTERVAL '23 hours')` using `wishlist_items_price_check_eligible_idx`
2. Batch-fetch prices via PA API or scrape fallback (`lib/price-checker.ts`)
3. INSERT into `price_history`; update `wishlist_items.last_checked_at` and `lowest_price`
4. If `new_price < saved_price * (threshold/100)` AND no `price_drop_alerts` row within 7 days: send email via Resend; INSERT `price_drop_alerts`

---

## 8. ARCHITECTURE DECISION RECORD

### ADR-001 · Affiliate rewriting is server-only (Phase 1 — permanent)

**Decision:** `lib/affiliate.ts` is server-only and must never be imported in any client bundle, browser extension, or mobile app.

**Rationale:** Chrome Web Store Developer Program Policy §4.4 prohibits extensions from injecting affiliate codes. The same principle applies to any client-side code. Violating this causes immediate removal from the Chrome Web Store.

**Consequence:** The bookmarklet, iOS save flow, and future React Native Share Extension all call server-side API endpoints to save items. The server endpoint calls `lib/affiliate.ts` before the database write.

---

### ADR-002 · Supabase session via PKCE server-side exchange (Phase 1 — permanent)

**Decision:** The Chrome extension sends the Google OAuth auth code to `/api/auth/exchange`. The server completes the PKCE flow and returns the Supabase session. `GOOGLE_CLIENT_SECRET` is never in the extension bundle.

**Rationale:** Extensions cannot safely store secrets. The exchange endpoint validates the origin and the auth code before completing the PKCE flow.

**Phase 4 note:** The React Native app uses `supabase.auth.signInWithOAuth()` + `expo-auth-session` directly. The `/api/auth/exchange` endpoint is extension-only; mobile does not call it.

---

### ADR-003 · Rate limiting fails open (Phase 2 — permanent)

**Decision:** If Upstash Redis is unavailable, all rate limit checks return `{ success: true }`. The app never blocks legitimate users due to an infrastructure failure.

**Rationale:** False positives (blocking real users) are more damaging than false negatives (passing bots). Abuse is monitored via `suspicious_events` and the Sentry alert for IP abuse spikes.

---

### ADR-004 · Two separate Stripe webhook endpoints (Phase 3)

**Decision:** Group-gift payments use `POST /api/group-gift/webhook` with `STRIPE_WEBHOOK_SECRET`. Pro subscription billing uses `POST /api/billing/webhook` with `STRIPE_BILLING_WEBHOOK_SECRET`. These are registered as separate endpoints in the Stripe Dashboard.

**Rationale:** Separating concerns prevents a billing webhook misconfiguration from affecting group-gift payments and vice versa. The secrets are different, so a leaked secret for one flow does not compromise the other.

---

### ADR-005 · Premium tiers: two parallel unlock paths (Phase 3)

**Decision:** A user can access premium features via (a) a paid Pro subscription or (b) referral milestones. Both paths write to the same `users` columns. `lib/permissions.ts` checks both paths in a single function.

**Rationale:** Referral unlocks drive viral growth without requiring payment. Paid subscriptions provide reliable MRR. The feature set is slightly different: `unlimited_lists` and `advanced_analytics` are paid-only; `custom_themes` and `priority_support` can be earned via referrals.

**Consequence:** Never check `subscription_status` directly in UI components. Always call `isPro()` or `hasFeature()` from `lib/permissions.ts` to correctly handle the referral path.

---

### ADR-006 · Theme system uses CSS custom properties (Phase 3)

**Decision:** `lib/themes.ts` exports a token set per theme. `toCSSVars()` converts the token set to a `CSSProperties` object. The gifter page applies themes via inline `style={{ ...toCSSVars(theme) }}` on the root wrapper — no class toggling, no CSS-in-JS runtime.

**Rationale:** Inline CSS custom properties avoid flash-of-unstyled-content because the style is set in the initial server render. No JavaScript must execute before the theme appears.

**Consequence:** Adding a new theme requires: (1) adding the token set in `lib/themes.ts`, (2) adding the key to the `CHECK` constraint in `wishlists.theme`, (3) regenerating Supabase TypeScript types, (4) adding the key to `ThemeSelector` gating logic.

---

### ADR-007 · Group-gift pool status managed by DB trigger (Phase 3)

**Decision:** The `trg_gift_pool_collect` Postgres trigger on `gift_contributions` automatically credits `gift_pools.collected_amount` and sets `status = 'funded'` when the target is reached — without any application-level code.

**Rationale:** The Stripe webhook and the group-gift contribute API both modify contributions. Centralising the pool update logic in a trigger prevents a race condition where two near-simultaneous succeeded-payment webhooks both read the same `collected_amount` and over-credit.

---

### ADR-008 · Referral attribution uses a single shared pipeline (Phase 3)

**Decision:** User-to-user referrals and partner referrals share exactly the same attribution pipeline: `gifthint_ref` cookie → `users.referral_code` lookup → `users.referred_by` write → `referral_events` INSERT → `lib/rewards.ts` call. Partners have a system user account; their `referral_code` is the cookie value.

**Rationale:** One code path means one place to debug and one place to add anti-fraud logic. Adding a new partner type (e.g., influencer) requires only an INSERT into `partners`, not a new code path.

---

### ADR-009 · `/api/v1/*` versioning reserved for mobile (Phase 3 → Phase 4)

**Decision:** No Phase 3 API routes use the `/api/v1/` prefix. This prefix is reserved for the React Native app's stable contract. Web routes continue using `/api/*`. When Phase 4 begins, thin re-export routes are created at `/api/v1/*` that call the same handlers.

**Rationale:** Freezing the v1 contract separately from web API routes allows the web app to iterate without breaking the mobile app. Breaking changes go to `/api/v2/*`.

---

## 9. TROUBLESHOOTING RUNBOOK

### 9.1 Stripe webhook failures (Phase 3)

**Symptom:** Group-gift pool does not update after payment succeeds; Pro subscription not activated.

**Diagnosis checklist:**
1. Stripe Dashboard → Webhooks → [your endpoint] → check for failed deliveries with error detail
2. Verify the correct secret is set: group-gift uses `STRIPE_WEBHOOK_SECRET`; billing uses `STRIPE_BILLING_WEBHOOK_SECRET` — they must match the endpoint registered in Stripe
3. Check Sentry for `[stripe.webhooks.constructEvent failed]` errors — indicates signature mismatch
4. Check that the endpoint URL in Stripe matches production exactly (trailing slash matters)
5. For group-gift: verify `trg_gift_pool_collect` trigger exists in Supabase → Database → Functions

**Local debugging:**
```bash
# Group-gift webhook
stripe listen --forward-to localhost:3000/api/group-gift/webhook

# Billing webhook
stripe listen --forward-to localhost:3000/api/billing/webhook \
  --events checkout.session.completed,customer.subscription.updated,\
           customer.subscription.deleted,invoice.payment_failed
```

**Common failure: two endpoints registered for the same events.** Each webhook event must have exactly one registered endpoint. Duplicate endpoints cause both to fire; if one fails, Stripe retries both.

### 9.2 Upstash rate limit edge cases (Phase 3)

**Symptom:** Legitimate users receiving 429 responses; rate limit not applying to known abusive IPs.

**Upstash Redis connection issues:**
Rate limiting fails open by design. Check `console.warn('[rate-limit]')` entries in Vercel function logs. If Redis is consistently unreachable, check `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in Vercel environment.

**Window reset confusion:**
`lib/rate-limit.ts` uses a sliding window, not a fixed window. A burst of 99 requests in 1 second, then 1 request at 61 seconds, will be rate-limited — the window slides, not resets. Use Upstash console → Data Browser to inspect `click:127.0.0.1` keys directly.

**IP blocklist not taking effect:**
The Redis blocklist is written by the admin panel but read in `middleware.ts` at edge runtime. Verify:
1. `blocked_ips` row exists in Supabase for the target IP
2. Admin panel correctly writes to Redis (`UPSTASH_REDIS_REST_*` env vars must be set for middleware)
3. Hard-reload after blocking — Vercel edge middleware caches for up to 30 seconds

**Rate limit key collisions:**
All keys are namespaced by route. Verify you are not sharing a key across routes by checking `lib/rate-limit.ts → identifier conventions` comment block.

### 9.3 k6 load test setup (Phase 3)

GiftHint has been load tested against the gifter page (heaviest read path) using [k6](https://k6.io).

**Install:**
```bash
brew install k6
```

**Minimal gifter page test** (save as `load-test.js`):
```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus:      50,   // 50 virtual users
  duration: '30s',
};

export default function () {
  const res = http.get('https://gifthint.io/list/testuser/birthday');
  check(res, {
    'status 200': (r) => r.status === 200,
    'response < 2s': (r) => r.timings.duration < 2000,
  });
  sleep(1);
}
```

**Run:**
```bash
k6 run load-test.js
```

**Targets:** p95 response < 2s; error rate < 1%; no 5xx responses.

**Pre-test checklist:**
- Run against staging, not production
- Confirm `wishlist_items_price_check_eligible_idx` and `idx_wishlist_items_wishlist_id` indices are applied (see §3.7)
- Confirm Supabase connection pooling is enabled (PgBouncer, port 6543)
- Rate limiting may kick in at high VU counts — whitelist the k6 runner IP in Upstash or temporarily increase the `global:{ip}` limit

### 9.4 Price drop alerts not sending (Phase 3)

1. Check `price_alerts_enabled = true` on the user row
2. Check `price_alert_enabled = true` on the wishlist item
3. Check `price_drop_alerts` table for a recent row — partial unique index blocks re-sends within 7 days
4. Check cron logs in Vercel for the `check-prices` function — PA API errors return null and skip the alert
5. Check Resend dashboard for bounced or blocked emails

### 9.5 Theme not applying on gifter page (Phase 3)

1. Verify `wishlists.theme` column value is not `'default'` (default renders no CSS var override)
2. Check that the `CHECK` constraint includes the theme key — a value outside the constraint will cause a DB insert error, not a silent failure
3. Verify the user has `subscription_status = 'pro'` OR `premium_themes_enabled = true` — `ThemeSelector` should gate the save, but check the DB row directly if uncertain
4. Hard-reload the gifter page — theme is applied in the server render; no hydration needed

### 9.6 Referral code not attributed (Phase 3)

1. Check `gifthint_ref` cookie is set in the browser for the domain `gifthint.io` (HttpOnly — inspect via Application → Cookies in DevTools)
2. Cookie must be present when `/api/auth/signup` is called — it expires after 30 days
3. Check `referral_events` table for a `click` row first — if the click was not logged, the cookie was not set
4. Verify `/r/[code]` route correctly redirects and sets the cookie before bouncing to the CTA

---

## 10. PRE-MERGE CHECKLIST

Run through all items before merging any PR to `main`.

### 10.1 Code quality

- [ ] `tsc --noEmit` — zero TypeScript errors
- [ ] `npm run lint` — zero ESLint errors
- [ ] No `console.log` statements in production code (Sentry handles error logging)
- [ ] No hardcoded secrets, API keys, or credentials
- [ ] All new API routes return `NextResponse` via helpers from `lib/api-response.ts`
- [ ] All new POST/PATCH routes validate the request body via `lib/validators.ts`

### 10.2 Database changes

- [ ] New tables include `ALTER TABLE … ENABLE ROW LEVEL SECURITY`
- [ ] New tables have explicit policies (or a comment stating service-role-only intent)
- [ ] Migration filename follows `YYYYMMDD_<descriptor>.sql` convention
- [ ] Migration is idempotent (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`)
- [ ] Any new `CHECK` constraints are reflected in TypeScript types and `lib/` constants

### 10.3 Affiliate compliance

- [ ] `lib/affiliate.ts` is not imported in any client component, extension file, or `NEXT_PUBLIC_` module
- [ ] New save pathways (bookmarklet, iOS, etc.) call a server API route that applies affiliate rewriting
- [ ] No affiliate tag appears in the browser bundle (verify via `next build` output or `grep -r "gifthint-20" .next/`)

### 10.4 Premium feature gating *(Phase 3)*

- [ ] New premium features call `isPro(user)` or `hasFeature(user, featureKey)` from `lib/permissions.ts` — never check `subscription_status` directly
- [ ] Features earnable via referral milestones use `hasFeature()`, not `isPro()`
- [ ] Premium-only features are tested with both `subscription_status = 'pro'` AND `premium_*_enabled = true` user states in unit tests
- [ ] Free-tier behaviour is verified when both flags are false

### 10.5 Theme rendering *(Phase 3)*

- [ ] Any new themed component wraps style application in `toCSSVars()` from `lib/themes.ts`
- [ ] New theme keys are added to the `wishlists.theme CHECK` constraint AND `lib/themes.ts`
- [ ] Supabase TypeScript types are regenerated after schema changes (`npx supabase gen types typescript --project-id pxegvviakrjhldtwtobi > types/supabase.ts`)
- [ ] Visual spot-check: all 6 themes render correctly on the gifter page (see `cross-browser-qa-checklist.md`)

### 10.6 Stripe changes

- [ ] Group-gift and billing webhook secrets are not swapped — grep for `STRIPE_BILLING_WEBHOOK_SECRET` vs `STRIPE_WEBHOOK_SECRET` in the changed routes
- [ ] New Stripe event types handled in webhook are registered in the Stripe Dashboard endpoint configuration
- [ ] Test mode keys (`sk_test_`, `pk_test_`, `whsec_`) are used in all environments except production

### 10.7 Tests

- [ ] `npm test` — all tests pass
- [ ] New critical paths have tests (target: `lib/*` at ≥ 70% coverage)
- [ ] Startup check passes: `validateEnv()` does not throw with the current `.env.local`

### 10.8 Deployment

- [ ] All new environment variables are added to `.env.local.example` with description and severity
- [ ] New Vercel environment variables are set in the Vercel dashboard before the deploy
- [ ] New cron jobs are registered in `vercel.json`
- [ ] Any Supabase migration is applied to the production project before the deploy (not after)
