# GiftHint — Phase 3 Changelog

> **Phase 3 dates:** Months 4–6 (approximately Weeks 13–24)
> **Phase 3 goal:** Viral growth engine, monetisation, and production-grade infrastructure
> **Stack additions:** Stripe (group gifting + Pro billing) · Upstash Redis · Sentry · Resend additions · k6

---

## MONTH 4 — Growth Features

### Bookmarklet

- **`/app/bookmarklet/page.tsx`** — Install page with drag-to-bookmarks-bar instructions and animated demo
- **`/app/bookmarklet/BrowserInstructions.tsx`** — Browser-specific install steps (Chrome/Firefox/Safari/Edge tabs)
- **`lib/bookmarklet.js`** — Human-readable IIFE source; extracts `document.title`, `window.location.href`, first `og:image`
- **`lib/bookmarklet-minifier.ts`** — Zero-dependency server-side minifier; produces `javascript:void(...)` href at render time; strips comments, collapses whitespace, no external build step required
- Save pathway: bookmarklet IIFE → `POST /api/save?source=bookmarklet` → `lib/affiliate.ts` rewrites URL → `INSERT wishlist_items`
- Works on any retailer site without installing the extension

### iOS Share Flow

- **`/app/save/page.tsx`** — Server-rendered save page; reads `?url=<product_url>&source=ios_share` query param
- **`/app/save/SaveUI.tsx`** — Client component; renders pre-populated item form from OG scrape results
- **`/app/save/BrowserInstructions.tsx`** — Mobile-optimised "Add to Home Screen" instructions
- OG scrape runs server-side via `lib/scrape-og.ts`; title, image, and price pre-filled before first render
- `source=ios_share` forwarded to saved item for analytics attribution
- Phase 4 bridge: replaced by native Share Extension backed by `/api/v1/save`

### Firefox Extension

- **`extension/manifest.firefox.json`** — MV2 manifest; `browser_action`, `browser_specific_settings.gecko`, `data_collection_permissions`
- **`extension/auth.firefox.js`** — `browser.identity.launchWebAuthFlow` (Firefox API) instead of `chrome.identity`
- **`extension/compat.js`** — Normalises `chrome.*` / `browser.*` API differences at runtime (used by all targets)
- **`npm run build:firefox`** — Output to `dist-firefox/`; submit to `addons.mozilla.org`
- Add-on ID: `gifthint@gifthint.io`; minimum version: Firefox 109.0
- Submission documentation: `firefox-store-submission.md`

### Edge Extension

- **`extension/manifest.edge.json`** — MV3 manifest with `update_url` set to Edge Add-ons CDN
- **`npm run build:edge`** — Output to `dist-edge/`; submit to `microsoftedge.microsoft.com/addons`
- Functionally identical to Chrome build; separate manifest enables Edge-specific store metadata

### Group Gifting with Stripe

- **`supabase/migrations/20260517_group_gifting.sql`** — `gift_pools` and `gift_contributions` tables; `trg_gift_pool_collect` DB trigger auto-credits pool and sets `status = 'funded'` when target reached; extends `wishlist_items` with `is_group_gift` and `group_gift_target`
- **`app/api/group-gift/contribute/route.ts`** — `POST /api/group-gift/contribute`; creates Stripe PaymentIntent; returns `clientSecret` for Stripe Elements; inserts pending `gift_contributions` row
- **`app/api/group-gift/webhook/route.ts`** — Handles `payment_intent.succeeded` / `payment_intent.payment_failed`; updates `stripe_payment_status`; DB trigger handles pool crediting
- **`app/api/group-gift/refund/route.ts`** — Admin-only refund; protected by `ADMIN_REFUND_SECRET` header
- **`lib/stripe.ts`** — Stripe client singleton; `createPaymentIntent()`, `createSubscription()`, `cancelSubscription()`
- **`components/group-gift/ContributionForm.tsx`** — Stripe Elements wrapper; uses `@stripe/react-stripe-js`
- **`components/group-gift/PoolProgress.tsx`** — Real-time progress bar; subscribes to `gift_pools` via Supabase Realtime
- New env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

### Price Drop Alerts

- **`supabase/migrations/20260517_price_tracking.sql`** — `price_history` table (immutable price check log); extends `wishlist_items` with `price_alert_enabled`, `price_alert_threshold`, `last_checked_at`, `lowest_price`
- **`supabase/migrations/20260517_price_drop_alerts.sql`** — `price_drop_alerts` table; partial unique index prevents re-alerting within 7 days; extends `users` with `price_alerts_enabled` kill-switch
- **`lib/price-checker.ts`** — PA API price fetch with scrape fallback; returns `null` gracefully if PA API is not configured
- **`app/api/price-history/route.ts`** — `GET /api/price-history?itemId=<id>`; returns price trend for item detail modal
- **`app/api/cron/check-prices/route.ts`** — Daily cron at 02:00 UTC; batches eligible items; inserts `price_history`; triggers Resend email on qualifying drops
- Email template: `lib/email-templates/price-drop.tsx` — inline-styled React Email component

---

## MONTH 5 — Growth Engine

### SEO Landing Pages

- **`app/gifts/page.tsx`** — Hub page: "Best Gift Ideas" with occasion grid
- **`app/gifts/[occasion]/page.tsx`** — Per-occasion landing page (birthday, wedding, baby shower, Christmas, etc.) with structured data (`lib/structured-data.ts`), dynamic meta tags, and product showcase
- **`lib/occasion-seo.ts`** — Occasion metadata: titles, descriptions, canonical URLs, keyword targets
- **`lib/structured-data.ts`** — JSON-LD helpers for `WebPage`, `ItemList`, `BreadcrumbList`
- **`app/sitemap.ts`** — Dynamically generated sitemap including all occasion pages, public wishlists, partner pages, and blog posts
- **`app/robots.ts`** — `robots.txt` with sitemap reference; blocks `/admin`, `/api`, `/r`
- Keyword strategy: `keyword-strategy.md`; SEO audit checklist: `seo-audit-checklist.md`

### Blog

- **`app/blog/page.tsx`** — Blog index with tag filter
- **`app/blog/[slug]/page.tsx`** — MDX blog post renderer with `next-mdx-remote`
- **`lib/blog.ts`** — MDX frontmatter parser using `gray-matter`; `getAllPosts()`, `getPost(slug)`
- Posts stored in `content/blog/*.mdx` with frontmatter: `title`, `date`, `tags`, `excerpt`, `og_image`
- Content calendar: `content-calendar.md`
- OG image generation: dynamic OG images via `/api/og` (see below)

### Referral Program with Rewards

- **`supabase/migrations/20260518_referral_system.sql`** — Adds `referral_code`, `referred_by`, `referral_count` to `users`; creates `referral_events` table (`click | signup | first_save` event types); `increment_referral_count()` Postgres function; backfills codes for existing users
- **`supabase/migrations/20260518_referral_rewards.sql`** — Adds `premium_tier` (`free | plus | pro`), `custom_username_enabled`, `premium_themes_enabled`, `priority_support_enabled` to `users`
- **`lib/rewards.ts`** — Tier ladder logic; `checkAndApplyRewards(userId)` called after every `first_save` referral event; writes tier and feature flags atomically
- **`app/r/[code]/route.ts`** — Referral redirect: sets `gifthint_ref` cookie (30-day, SameSite=Lax); redirects to home with UTM params
- **`lib/referral.ts`** — `getReferralStats(userId)`, `getLeaderboard()`, `logReferralClick()`
- **`app/dashboard/[slug]/referral/page.tsx`** — Referral dashboard: share link, tier progress, earned rewards
- Reward tiers: 1 referral → custom username; 3 → premium themes; 5 → priority support badge; 10 → Pro tier + badge

### Dynamic OG Images

- **`app/api/og/route.tsx`** — Edge runtime; renders React to PNG via `@vercel/og`; accepts `title`, `username`, `theme`, `occasion` params
- OG image used by gifter page (`app/list/[username]/[slug]`), blog posts, and occasion landing pages
- Theme-aware: applies `midnight | cloud | forest | rose | slate` colour palettes to OG image background

### ProductHunt Launch

- **`producthunt-launch-package.md`** — Complete launch package: tagline variations, first comment scripts, maker comment templates, upvote ask DM templates, Ship preview copy, scheduled tweet thread
- **Launch strategy:** 48-hour pre-announce on social; queue community notifications; maker video posted the morning of launch
- **Metrics targets:** 300 upvotes; top 5 on launch day; 500 signups in 24 hours; 800 in 7 days

### Partnership Outreach

- **`partnership-outreach.md`** — Structured outreach program; 5 partner categories (wedding planners, baby shower organisers, corporate coordinators, pre-law tutoring communities, tennis club coordinators)
- **`supabase/migrations/20260518_partner_system.sql`** — `partners` table; `partner_payouts` table (monthly commission statements); `estimated_commission_pence` column on `click_events`; `partner_commission_summary` view
- **`app/partners/[slug]/page.tsx`** — Co-branded landing page server component; reads `partners` row by slug
- **`app/api/partners/route.ts`** — Admin API for partner CRUD
- **`lib/partners.ts`** — `getPartner(slug)`, `getPartnerByReferralCode()`, `listPartners()`; server-only
- Attribution: identical pipeline to user referrals — partner system user's `referral_code` in `gifthint_ref` cookie
- `docs/rejection-responses.md` — Pre-written responses for declined outreach

### Growth Metrics Dashboard

- **`supabase/migrations/20260518_growth_metrics_view.sql`** — `growth_metrics` view: weekly signups by channel (organic/referral/partner), cohort retention (W1/W2/W4/W8), viral K-factor, weekly active wishers, revenue per user, D30 retention
- **`app/admin/growth/page.tsx`** — Admin growth dashboard
- **`components/admin/GrowthChart.tsx`** — Recharts area chart; weekly signups stacked by channel
- **`components/admin/RetentionCohort.tsx`** — Cohort retention heatmap table
- **`components/admin/KPICards.tsx`** — Viral K / WAW / RPU / D30 scalar cards
- `phase3-metrics-review.md` — 10k milestone audit template with SQL queries for all metrics
- `growth-targets.md` — Phase 3 targets: 10k users, 50k items, 500 group gifts funded, 100 Pro subscribers

---

## MONTH 6 — Infrastructure and Monetisation

### Database Optimisation (10k+ users)

- **`supabase/migrations/20260518_db_optimisation.sql`** — 8 new partial/composite indices for hot query paths; `get_items_with_click_counts(uuid)` RPC function (eliminates N+1 in `/api/analytics/wishlist`); `archive_click_events(cutoff)` maintenance function
- Net-new indices:
  - `idx_wishlist_items_wishlist_id ON wishlist_items(wishlist_id, sort_order) WHERE is_claimed = false`
  - `idx_wishlist_items_user_id ON wishlist_items(user_id, sort_order)`
  - `wishlist_items_price_check_eligible_idx` (partial on `price_alert_enabled`)
  - `idx_users_subscription_status WHERE subscription_status = 'pro'`
  - `idx_click_events_item_id`, `idx_click_events_wisher` (existing gaps filled)
- `database-maintenance.md` — Yearly `click_events` archival procedure; VACUUM schedule; index health queries
- `infrastructure-audit.md` — Pre-10k infrastructure checklist (Supabase plan, PgBouncer, index verification, Vercel edge regions, Redis capacity)

### Rate Limiting with Upstash Redis

- **`lib/rate-limit.ts`** — Sliding-window rate limiting via `@upstash/ratelimit`; fails open on Redis unavailability; namespaced keys per route; `getClientIp()` with `x-forwarded-for` normalisation
- **`middleware.ts`** — Global 500 req/IP/min guard at the edge; O(1) Redis blocklist lookup; rate limit check before all `/api/*` routes
- **`lib/abuse-detection.ts`** — `detectClickFraud()`, `detectFakeViews()`, `detectClaimSpam()`, `detectEmailHarvest()`; writes `suspicious_events` rows; silently passes (returns 200) to avoid revealing detection
- **`supabase/migrations/20260518_security_tables.sql`** — `suspicious_events` and `blocked_ips` tables; admin review workflow columns
- New env vars: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- Fail-open policy: if Redis unreachable, all checks pass — legitimate users never blocked by infrastructure failure

### Sentry Error Monitoring

- SDK: `@sentry/nextjs` added to `package.json`
- Config files: `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`
- Source map upload configured via `SENTRY_AUTH_TOKEN` at build time
- 4 custom alert rules (see `docs/sentry-setup.md`):
  1. `[CRITICAL]` Group-gift payment exceptions — immediate notification
  2. `[HIGH]` Billing webhook failures — 5-minute notification
  3. `[WARN]` Price checker failure rate >10% in 15 min
  4. `[INFO]` Rate limit abuse spike (>100 429s from single IP in 5 min)
- PII scrubbing: emails, names, payment data scrubbed at SDK boundary via `beforeSend` hook
- New env vars: `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`

### Premium Pro Tier

- **`supabase/migrations/20260518_subscription.sql`** — Adds `stripe_customer_id`, `subscription_status`, `subscription_period_end` to `users`; partial indices for Pro subscriber lookups
- **`lib/permissions.ts`** — `isPro(user)` (subscription check, handles grace period for `cancelled` status); `hasFeature(user, featureKey)` (checks both subscription and referral unlock); `FeatureKey` union type
- **`app/api/billing/create-checkout/route.ts`** — Creates Stripe Checkout Session for Pro subscription; sets `subscription_data.metadata.userId`; reuses existing `stripe_customer_id` if present
- **`app/api/billing/webhook/route.ts`** — Handles `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`; separate `STRIPE_BILLING_WEBHOOK_SECRET`
- **`app/api/billing/cancel/route.ts`** — `POST /api/billing/cancel`; cancels at period end (not immediately)
- **`app/dashboard/upgrade/page.tsx`** — Upgrade page with monthly/annual toggle; feature comparison table; Stripe Checkout redirect
- **`app/api/username/route.ts`** — `PATCH /api/username`; gated behind `hasFeature(user, 'custom_username')`; updates `users.username`; validates uniqueness
- New env vars: `STRIPE_PRO_MONTHLY_PRICE_ID`, `STRIPE_PRO_ANNUAL_PRICE_ID`, `STRIPE_BILLING_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID`, `NEXT_PUBLIC_STRIPE_PRO_ANNUAL_PRICE_ID`

### 5 Premium Themes

- **`supabase/migrations/20260518_wishlist_theme.sql`** — Adds `theme` column to `wishlists`; `CHECK` constraint: `default | midnight | cloud | forest | rose | slate`
- **`lib/themes.ts`** — Full token set per theme (colours, typography, spacing, radii, shadows); `getTheme(key)`, `toCSSVars(theme)` (converts to `CSSProperties` inline style object); `DB_ALLOWED_THEMES` set
- Theme catalogue:
  - `default` — dark canvas, purple accent; free tier
  - `midnight` — near-black warm canvas, gold (#C9A84C) accent, serif fonts; luxury feel
  - `cloud` — white/light-grey canvas, soft indigo accent; minimal/airy
  - `forest` — deep green (#1A2E1A) canvas, cream text, copper accent; organic/wellness
  - `rose` — blush-pink (#FDF0F0) canvas, deep rose accent, serif; wedding/anniversary
  - `slate` — dark blue-grey canvas, electric blue accent, monospace; tech/modern
- **`components/ThemeSelector.tsx`** — Pro-gated theme picker; calls `hasFeature(user, 'custom_themes')` before allowing selection; non-Pro users see preview modal with upgrade CTA
- **`components/ThemeProvider.tsx`** — Applies `toCSSVars(theme)` as inline style on gifter page root; server-rendered (no flash of unstyled content)
- `tests/themes.test.ts` — All 6 themes pass token validation; `DB_ALLOWED_THEMES` set covers all theme keys

### Retailer Partnerships

- **`lib/partners.ts`** — `getPartner(slug)`, `listPartners()`, partner types and category constants; server-only
- **`app/partners/[slug]/page.tsx`** — Dynamic co-branded landing page; renders partner `name`, `category`, `tagline`; CTA sets `gifthint_ref` cookie before redirecting to signup
- **`app/partners/page.tsx`** — Partner directory (for SEO and partner discovery)
- `partnership-outreach.md` — Outreach templates for 5 partner categories
- `docs/commission-rates-guide.md` — Amazon Associates rate schedule; marketing priority tiers; negotiated direct rate placeholders (to be updated when direct partnerships are signed)
- `docs/rejection-responses.md` — Pre-written responses for declined or deferred outreach
- Attribution: co-branded page sets `gifthint_ref=<partner_referral_code>`; standard referral pipeline handles the rest

### API Standardisation (Technical Debt Sprint)

- **`lib/api-response.ts`** — Standardised `{ data, error, meta }` response envelope; 11 HTTP status helpers (`ok`, `created`, `paginated`, `badRequest`, `unauthorized`, `forbidden`, `notFound`, `conflict`, `unprocessable`, `tooManyRequests`, `serverError`); 3 type guards
- **`lib/validators.ts`** — Zero-dependency Zod-compatible request body validation; `ParseResult<T>` type; `parseBody<T>()` generic parser; schemas for all 8 POST/PATCH endpoints
- **`app/startup-check.ts`** — Singleton env var validation on server cold-start; structured error output listing all missing required vars by group; `getEnvStatus()` for health-check endpoints
- **`tests/api-layer.test.ts`** — 92 tests across 5 suites (api-response, validators, startup-check, track-click, claimed-state)
- Fixed TypeScript errors: `TS2345` in `tests/premium.test.ts`; `TS2802` in `tests/themes.test.ts`

### Pre-Phase 4 Readiness

- **`mobile-readiness.md`** — REST API audit for React Native consumption; 4 blockers identified (response envelope, versioning, Google OAuth incompatibility, missing CORS); migration path documented
- **`phase4-mobile-brief.md`** — Full React Native + Expo architecture brief; 6 sections + 3 appendices; kickoff prompt for Phase 4 Claude Code session
- `.env.local.example` updated with Phase 3 vars, Phase History header, Phase 4 `EXPO_PUBLIC_*` preview section
- **`gifthint-sop-v3.md`** — This document: updated SOP incorporating all Phase 3 decisions

---

## Phase 3 — New File Inventory

### Supabase migrations

| File | Contents |
|------|---------|
| `20260517_group_gifting.sql` | `gift_pools`, `gift_contributions`, DB trigger |
| `20260517_price_tracking.sql` | `price_history`, `wishlist_items` additions |
| `20260517_price_drop_alerts.sql` | `price_drop_alerts`, `users.price_alerts_enabled` |
| `20260518_subscription.sql` | Stripe billing columns on `users` |
| `20260518_referral_system.sql` | `referral_events`, `users` referral columns |
| `20260518_referral_rewards.sql` | `premium_tier`, feature flag columns on `users` |
| `20260518_wishlist_theme.sql` | `wishlists.theme` column |
| `20260518_db_optimisation.sql` | 8 indices, 2 RPC functions |
| `20260518_security_tables.sql` | `suspicious_events`, `blocked_ips` |
| `20260518_partner_system.sql` | `partners`, `partner_payouts` tables |
| `20260518_growth_metrics_view.sql` | `growth_metrics` view |
| `20260518_extension_errors.sql` | `extension_errors` table (error reporting) |

### New `lib/` modules

| File | Purpose |
|------|---------|
| `lib/api-response.ts` | Standardised HTTP response helpers |
| `lib/validators.ts` | Request body validation (zero-dep Zod-compatible) |
| `lib/bookmarklet-minifier.ts` | Bookmarklet minifier (server-side) |
| `lib/bookmarklet.js` | Bookmarklet source |
| `lib/price-checker.ts` | PA API price fetch with scrape fallback |
| `lib/rewards.ts` | Referral milestone → tier and feature flag logic |
| `lib/referral.ts` | Referral stats and event logging |
| `lib/partners.ts` | Partner data access |
| `lib/themes.ts` | Premium theme token sets and helpers |
| `lib/permissions.ts` | `isPro()`, `hasFeature()` feature gating |
| `lib/rate-limit.ts` | Upstash sliding-window rate limiting |
| `lib/abuse-detection.ts` | Click fraud, fake views, claim spam detection |
| `lib/blog.ts` | MDX frontmatter parser |
| `lib/structured-data.ts` | JSON-LD helpers |
| `lib/occasion-seo.ts` | SEO metadata per occasion |
| `lib/skimlinks-api.ts` | Skimlinks publisher reporting API client |
| `lib/amazon-associates-api.ts` | PA API v5 client |

### New API routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/group-gift/contribute` | POST | Create Stripe PaymentIntent for contribution |
| `/api/group-gift/webhook` | POST | Stripe group-gift webhook handler |
| `/api/group-gift/refund` | POST | Admin refund (ADMIN_REFUND_SECRET) |
| `/api/billing/create-checkout` | POST | Create Stripe Checkout Session for Pro |
| `/api/billing/webhook` | POST | Stripe billing webhook handler |
| `/api/billing/cancel` | POST | Cancel Pro subscription at period end |
| `/api/cron/check-prices` | POST | Daily price check cron |
| `/api/og` | GET | Dynamic OG image generation |
| `/api/username` | PATCH | Update custom username (Pro/referral gated) |
| `/api/partners` | GET/POST | Partner CRUD (admin) |

---

## Phase 3 — Dependency Additions

| Package | Version | Purpose |
|---------|---------|---------|
| `stripe` | ^22.1.1 | Group gifting + Pro billing |
| `@stripe/react-stripe-js` | ^6.3.0 | Stripe Elements in the browser |
| `@stripe/stripe-js` | ^9.5.0 | Stripe browser SDK |
| `@upstash/ratelimit` | ^2.0.8 | Sliding-window rate limiting |
| `@upstash/redis` | ^1.38.0 | Redis client (Edge Runtime compatible) |
| `@sentry/nextjs` | ^10.53.1 | Error monitoring + performance tracing |
| `gray-matter` | ^4.0.3 | MDX frontmatter parsing |
| `next-mdx-remote` | ^6.0.0 | MDX rendering in Next.js |
| `@react-email/components` | ^1.0.12 | Email template components |
| `react-email` | ^6.1.4 | Email preview and rendering |
