# GiftHint — Phase 2 Wrap & Phase 3 Brief

> **Document purpose:** Close out Phase 2 with a verified checklist and captured decisions;
> open Phase 3 with a prioritised feature backlog, a technical debt log, and a
> ready-to-paste Claude Code kickoff prompt.
>
> **Date written:** 2026-05-15
> **Stack at wrap:** Next.js 14.2 · Supabase 2.74 · Resend · Recharts · Skimlinks · Amazon Associates MV3 extension v1.1

---

## SECTION 1 — PHASE 2 COMPLETION CHECKLIST

Mark each item `[x]` when confirmed in production. Leave `[ ]` with a note if incomplete.

---

### 1.1 Revenue & Affiliate Engine

```
[x] Amazon Associates tag injected server-side in lib/affiliate.ts
    — CRITICAL comment block enforces extension-safe boundary (§4.4 compliance)
    — Rewrites amazon.com / amzn.to URLs; all other retailers left clean for Skimlinks
    — estimateCommission() provides category-level rate estimates for admin dashboard

[x] Skimlinks publisher script loaded on gifter page via SkimlinksScript component
    — Loaded with next/script strategy="afterInteractive" (does not block LCP)
    — NEXT_PUBLIC_SKIMLINKS_PUBLISHER_ID env var gates the script
    — shouldSkipSkimlinks() prevents double-rewriting Amazon URLs

[x] lib/affiliate-audit.ts — audit utility that scans wishlist items and flags
    items where affiliate_url is missing, malformed, or uses wrong tag

[x] 100% coverage policy: Amazon → Associates, everything else → Skimlinks eligible
    domains list in lib/skimlinks-eligible-retailers.ts; items on unsupported
    retailers retain source_url with no monetisation (acceptable edge case at beta scale)
```

---

### 1.2 Admin Revenue Dashboard

```
[x] /admin route protected by shared-secret middleware (middleware.ts)
    — Cookie-based: gh_admin cookie set on /admin?secret=<ADMIN_SECRET>
    — HttpOnly + SameSite=Strict — cannot be read by client JS
    NOTE: middleware comment documents the @supabase/ssr upgrade path for Phase 3

[x] Admin dashboard components live under components/admin/:
    — StatsGrid.tsx         total revenue, clicks, commission rate
    — RevenueChart.tsx      Recharts area chart, daily/weekly/monthly toggle
    — ReconciliationTable.tsx  rows: item | retailer | click date | commission status
    — RetailerLeaderboard.tsx  top retailers by click volume + estimated revenue
    — NetworkBreakdown.tsx  Associates vs Skimlinks split (pie + table)
    — RevenueFunnel.tsx     saves → gifter views → buy clicks → commissions
    — GrowthMetrics.tsx     user + item growth overlay on revenue trend

[x] /api/affiliate-report route feeds ReconciliationTable
    — Joins wishlist_items, click_events, users
    — Returns paginated rows with commission_status field

[x] /api/cron/sync-affiliate-data runs at 06:00 UTC daily (vercel.json)
    — lib/amazon-associates-api.ts: pulls Associates earnings report CSV
    — lib/skimlinks-api.ts: pulls Skimlinks publisher reporting API
    — Writes rows to affiliate_data table; ReconciliationTable reads from there
```

---

### 1.3 Real-Time Claim Sync

```
[x] /api/claim/[itemId]/route.ts — POST to claim, DELETE to unclaim
    — Writes claimed_at + claimed_by_session_id to wishlist_items
    — Returns updated item; client optimistically updates UI

[x] Supabase Realtime subscription in GifterPage.tsx — listens to
    wishlist_items table for the current wishlist_id
    — On INSERT/UPDATE: patches local items state → GiftCard re-renders
    — On channel error: falls back to 30s polling (resilience)

[x] ClaimModal.tsx — confirmation step before claim; shows item image +
    "You're buying this — others will see it's taken" copy

[x] tests/claim-system.test.ts — 100% passing
```

---

### 1.4 Gifter Coordination Panel

```
[x] GifterCoordinationPanel.tsx — shows count of claimed items in the list
    — "X of Y items already being bought"
    — Visible to all gifters; does NOT reveal who claimed what (privacy)
    — Hidden when claimedCount === 0 (no noise on fresh lists)

[x] Lazy-loaded behind Suspense in GifterPage.tsx — does not block initial render
    — fallback={null}: panel fades in when ready, no layout shift
```

---

### 1.5 Reminder Email System

```
[x] ReminderSignup.tsx component — rendered on gifter page
    — Collects email + occasion date
    — Posts to /api/reminder-signup → writes to gifter_reminders table
    — No account required for gifters

[x] /api/cron/send-reminders runs at 09:00 UTC daily (vercel.json)
    — Queries gifter_reminders WHERE remind_at <= now() AND sent_at IS NULL
    — Sends via Resend (lib/email.ts); marks sent_at on success
    — Hard cap: maximum 1 email per reminder row (idempotent)

[x] lib/email-templates/ — React Email components:
    — weekly-digest.tsx   wisher-facing activity summary
    — reminder.tsx        gifter-facing "occasion in X days" prompt
    — Both render to HTML via @react-email/components render()

[x] tests/email.test.ts, tests/weekly-digest.test.ts — all passing
    — WeeklyDigestEmail tested via jest.requireMock introspection
      (not render() args — mock returns null so JSX introspection fails)
```

---

### 1.6 Occasion Tagging + Multi-List

```
[x] 8 occasion types in lib/wishlists.ts OCCASION_TYPES:
    birthday | christmas | wedding | baby_shower | graduation | housewarming |
    anniversary | other
    — Each has: key, label, emoji, dateGuidance string

[x] lib/occasion-themes.ts — per-occasion visual identity
    — accent / accentDim / accentSoft / accentRing colour variants
    — emoji, countdownLabel, heroTagline factory function
    — buildTheme() helper generates rgba variants from hex
    — getOccasionTheme(key) public API; falls back to 'other' theme

[x] OccasionThemeContext.tsx — React context; OccasionHero.tsx +
    CountdownBadge.tsx consume via useContext; no prop drilling

[x] CountdownBadge.tsx — visual states:
    tomorrow (green) | soon ≤7 days (amber) | upcoming ≤90 days (purple) | hidden

[x] extension/wishlists.js syncs OCCASION_LABELS with lib/wishlists.ts
    NOTE: these are two separate files — must be kept in sync manually.
    PHASE 3 DEBT: consider a build step that generates wishlists.js from
    the TypeScript source to eliminate the sync risk.
```

---

### 1.7 Wisher Dashboard

```
[x] /dashboard — protected (Supabase auth session check in layout.tsx)

[x] /dashboard/[slug] — per-list edit view
    — ItemEditor.tsx: edit title, price, hint, DNA tags, image URL
    — DnaTagEditor.tsx: tag autocomplete powered by searchTags() from lib/dna-tags.ts
    — BulkTagEditor.tsx: apply / remove tags across multiple items at once

[x] ListCard.tsx — dashboard list overview card
    — Shows item count, occasion badge, occasion date, share link copy button
    — Edit / delete actions (delete requires confirmation)

[x] CreateListModal.tsx — create new wishlist
    — Occasion picker, date picker (optional), title field
    — Calls /api/wishlists POST

[x] Drag-to-reorder via @hello-pangea/dnd — updates display_order column
    — Optimistic update; confirmed via PATCH /api/wishlists/[id]

[x] ListAnalyticsCard.tsx — per-list analytics block on dashboard
    — Views, buy clicks, claims (past 7 / 30 days)
    — Reads from /api/analytics/wishlist/[id]

[x] TopItemsAnalytics.tsx — top 5 items by click count for each list
```

---

### 1.8 DNA Tag Library

```
[x] lib/dna-tags.ts — 7 categories, 43 total tags:
    👗 Clothing/Fashion    — 10 tags (#NoSynthetics, #NoPink, #NoLogoVisible…)
    🔌 Electronics         — tags for connectivity, OS, brand preference
    🏠 Home & Living       — style/material preferences
    📚 Books & Media       — format (hardback/ebook), genre exclusions
    🧴 Beauty & Wellbeing  — fragrance-free, vegan, cruelty-free etc.
    🍽️ Food & Drink        — dietary restrictions, format preferences
    🎮 Toys & Games        — age appropriateness, format (physical/digital)

[x] suggestTagsForItem(title, retailer) — category-aware autocomplete seeding
    — detectionTerms arrays match against lowercased item title + retailer string
    — Returns top 5 most relevant tags for that item

[x] searchTags(query) — prefix + substring search for DnaTagEditor autocomplete
[x] validateTag() / validateTags() — format + length enforcement
[x] getTagCategory() — reverse lookup used by BulkTagEditor grouping

[x] tests/dna-tags.test.ts — passing
```

---

### 1.9 Alternative Gift Flow

```
[x] AlternativeGiftPanel.tsx — shown when a gifter views a claimed item
    — Renders alternative suggestions from lib/alternative-guidance.ts
    — Also surfaces other unclaimed items in the same list ("buy this instead")

[x] lib/alternative-guidance.ts — price-band + category logic for suggestions
    — Reads retailer-search-urls.ts to build "search for similar" links on
      Amazon, Etsy, John Lewis by category
    — search URLs do NOT have affiliate tags (clean search URLs only)
      NOTE: Skimlinks will monetise these click-throughs client-side

[x] Claim state shown inline on GiftCard — "Someone's buying this" badge
    — AlternativeGiftPanel shown as an expandable section below the card
```

---

### 1.10 Wisher-Facing Analytics

```
[x] /api/analytics route family:
    — /api/analytics/wishlist/[id]   views + clicks + claims for one list
    — /api/analytics (admin only)    cross-user aggregate

[x] lib/analytics.ts — shared query helpers used by both routes
[x] tests/track-view.test.ts — passing

[x] Dashboard surfaces: ListAnalyticsCard + TopItemsAnalytics (see §1.7)
```

---

### 1.11 Weekly Digest Email System

```
[x] /api/cron/weekly-digest runs at 09:00 UTC every Monday (vercel.json)
    — lib/digest.ts builds WeeklyDigestData from page_views, click_events,
      wishlist_items, wishlists for each subscriber
    — Skips send if totalViews === 0 (empty-digest policy prevents list fatigue)
    — Sends via Resend; marks last_digest_sent_at on users row

[x] WeeklyDigestEmail React Email component — sections:
    — Total views this week | top item | claims activity | occasion countdown
    — Unsubscribe link → /unsubscribe?token=[signed_token]

[x] /api/unsubscribe — verifies signed token, sets digest_opted_out = true
[x] tests/unsubscribe.test.ts — passing
[x] tests/weekly-digest.test.ts — 3 previously-failing tests now passing
    (CRON_SECRET missing → 401 not 500; component args via jest.requireMock)
```

---

### 1.12 Affiliate Data Sync

```
[x] lib/amazon-associates-api.ts — Associates Reporting API client
    — Polls daily earnings CSV; parses into { date, clicks, ordered_items, revenue }
    — Rate limit: 1 request per day (hardcoded in the cron job guard)

[x] lib/skimlinks-api.ts — Skimlinks Publisher Reporting API client
    — OAuth2 client-credentials flow; token cached in memory for cron duration
    — Pulls daily summary + top merchant breakdown

[x] /api/cron/sync-affiliate-data — orchestrates both; writes to affiliate_data table
    — Idempotent: upserts on (date, network) composite key
    — On API error: logs to Vercel function logs, does NOT throw (cron stays healthy)
```

---

### 1.13 Performance — Gifter Page LCP < 2.5s

```
[x] export const revalidate = 60 on app/list/[username]/[slug]/page.tsx
    — ISR: page served from Vercel edge cache, revalidated in background
    — Cold miss → SSR; warm hit → edge-cached response in ~50ms

[x] next/image with fill + sizes + priority + placeholder="blur" on GiftCard images
    — priority={index < 2} for above-the-fold items
    — sizes tuned to grid breakpoints: 50vw (mobile) / 33vw (tablet) / 220px (desktop)
    — blurDataURL: inline SVG data URI (avoids extra network request)

[x] React Suspense + lazy() for below-fold components:
    — ReminderSignup (lazy)
    — GifterCoordinationPanel (lazy)
    — Both wrapped in <Suspense fallback={null}>

[x] generateMetadata() parallel-fetches with Promise.all:
    — total item count (head:true) + available count + OG image in one round-trip

[x] SkimlinksScript: next/script strategy="afterInteractive"
    — Does not appear in document head; never blocks LCP

[x] GiftGridSkeleton used as Suspense fallback on the page level
    — Prevents cumulative layout shift while server data loads

[x] app/sitemap.ts: export const revalidate = 3600 (1-hour ISR for sitemap)
[x] app/robots.ts: allows /, /list/; disallows /admin/, /dashboard/, /api/
```

---

### 1.14 Chrome Extension v1.1

```
[x] Manifest bumped to "version": "1.1.0"
    — MV3 with "type": "module" on content script (ES module imports in extension)

[x] popup.js rewritten with multi-list support:
    — Custom list-selector dropdown (occasion emoji + name + item count)
    — Countdown badge with urgency states (tomorrow/soon/upcoming)
    — Share button with "✓ Copied!" clipboard animation
    — Quick-actions row: Share Link + Open Dashboard + Open List

[x] popup.html additions:
    — .list-selector + .list-selector__menu custom dropdown CSS
    — .countdown-badge with .soon and .tomorrow modifier classes
    — .quick-actions + .quick-btn row

[x] extension/wishlists.js updated:
    — wishlist_items(count) PostgREST embed → itemCount normalised to integer
    — getPublicUsername(googleUserId, token) new export for share URL construction

[x] floating-button.js new content script:
    — Reads auth from chrome.storage.local (gh_user key) — NOT chrome.identity
      (identity API unavailable in content scripts — critical constraint)
    — Inline OG meta + JSON-LD product detection (no external script load)
    — Single-list path: saves directly, no picker friction
    — Multi-list path: animated mini picker card with last-used list highlighted
    — SPA-aware: popstate listener re-runs boot() on client-side navigation
    — Toast notifications (green success / amber error, 2800ms auto-dismiss)

[x] web_accessible_resources updated for new files
[x] Submitted to Chrome Web Store (review pending)
[x] docs/store-listing.md updated with v1.1 short description options,
    updated detailed description, and 2 new screenshot specs
```

---

### 1.15 Beta Campaign

```
[x] docs/beta-launch-campaign.md written:
    — Reddit posts × 3 (r/SideProject, r/GiftIdeas, r/ProductHunters) — full copy
    — ProductHunt taglines, description, founder first comment
    — Twitter/X 5-tweet thread
    — Personal email (20 contacts) + iMessage/WhatsApp × 3 variants
    — SQL views: beta_cohort, beta_funnel, beta_weekly
    — Week 4/8/12 milestone table with 7 metrics
    — 8-minute daily check ritual across Supabase + Associates + Skimlinks
    — 5-question feedback survey
    — In-app 3rd-item-save feedback prompt with chrome.storage.local dedup

[ ] 100 active beta users — IN PROGRESS (campaign launches Week 1)
```

---

## SECTION 2 — BETA DATA REVIEW TEMPLATE

*Complete this template at the end of Week 12 before writing the Phase 3 brief update.*

---

### 2.1 Metrics to Capture

Run all three SQL views from `beta-launch-campaign.md` and record here:

| Metric | Week 12 Target | Actual | Delta |
|--------|---------------|--------|-------|
| Total signups | 100 | — | — |
| Active users (≥1 item saved) | 80 | — | — |
| Activation rate (signups → active) | 80% | — | — |
| Total items saved | 300 | — | — |
| Avg items per active user | 3.75 | — | — |
| Wishlists shared (gifter view ≥1) | 60 | — | — |
| Affiliate buy clicks | 50 | — | — |
| Affiliate revenue | $5.00 | — | — |
| Weekly digest open rate | — | — | — |
| Viral CTA conversion (view → signup) | — | — | — |
| Feedback survey responses | 25 | — | — |
| Feedback NPS (Q1 avg, 1–10) | — | — | — |

---

### 2.2 Segmentation Queries

**Run in Supabase SQL Editor at Week 12:**

```sql
-- Which occasion type is most common?
SELECT
  w.occasion,
  COUNT(DISTINCT w.id)   AS wishlists,
  COUNT(DISTINCT u.id)   AS unique_users,
  COUNT(wi.id)           AS items_saved
FROM wishlists w
JOIN users u         ON u.id = w.user_id
LEFT JOIN wishlist_items wi ON wi.wishlist_id = w.id
GROUP BY w.occasion
ORDER BY wishlists DESC;

-- Which retailer drives the most buy clicks?
SELECT
  ce.retailer,
  COUNT(*)               AS clicks,
  COUNT(DISTINCT ce.wishlist_item_id) AS items_clicked,
  COUNT(DISTINCT w.user_id)           AS unique_wishers
FROM click_events ce
JOIN wishlist_items wi ON wi.id = ce.wishlist_item_id
JOIN wishlists w        ON w.id = wi.wishlist_id
GROUP BY ce.retailer
ORDER BY clicks DESC
LIMIT 20;

-- Do DNA tags increase buy clicks?
-- Compare click rate for items with vs without DNA tags
SELECT
  CASE WHEN array_length(wi.dna_tags, 1) > 0 THEN 'has_dna_tags'
       ELSE 'no_dna_tags' END                    AS tag_status,
  COUNT(DISTINCT wi.id)                          AS items,
  COUNT(ce.id)                                   AS total_clicks,
  ROUND(COUNT(ce.id)::numeric /
        NULLIF(COUNT(DISTINCT wi.id), 0), 2)     AS clicks_per_item
FROM wishlist_items wi
LEFT JOIN click_events ce ON ce.wishlist_item_id = wi.id
GROUP BY tag_status;

-- Does the reminder email drive return gifter visits?
-- Compare page_views in [0,7d] vs [7d,14d] windows for gifters with reminders
SELECT
  'with_reminder'                                   AS cohort,
  COUNT(DISTINCT pv.session_id)                     AS gifter_sessions,
  COUNT(pv.id)                                      AS page_views
FROM page_views pv
WHERE EXISTS (
  SELECT 1 FROM gifter_reminders gr
  WHERE gr.wishlist_id = pv.wishlist_id
  AND gr.sent_at IS NOT NULL
  AND gr.sent_at BETWEEN pv.viewed_at - interval '14 days'
                     AND pv.viewed_at
)
UNION ALL
SELECT
  'without_reminder',
  COUNT(DISTINCT pv.session_id),
  COUNT(pv.id)
FROM page_views pv
WHERE NOT EXISTS (
  SELECT 1 FROM gifter_reminders gr
  WHERE gr.wishlist_id = pv.wishlist_id
  AND gr.sent_at IS NOT NULL
);

-- Viral CTA conversion rate: gifter page views that resulted in a signup
-- (rough proxy: user created_at within 30 min of a page_view with no prior user)
SELECT
  COUNT(DISTINCT pv.id)       AS gifter_page_views,
  COUNT(DISTINCT u.id)        AS users_signed_up_within_30min,
  ROUND(COUNT(DISTINCT u.id)::numeric /
        NULLIF(COUNT(DISTINCT pv.id), 0) * 100, 2) AS viral_conversion_pct
FROM page_views pv
LEFT JOIN users u ON
  u.created_at BETWEEN pv.viewed_at AND pv.viewed_at + interval '30 minutes';
```

---

### 2.3 Qualitative Review Questions

Answer these from survey responses + any direct feedback before Phase 3 kickoff:

1. **Which occasion type is most common?**
   Hypothesis: birthday. If wedding is top-3, prioritise group gifting (chip-in) immediately.

2. **Which retailer drives the most buy clicks?**
   Hypothesis: Amazon. If Etsy is top-2, audit Skimlinks coverage for Etsy and verify image extraction works on Etsy product pages.

3. **Do DNA tags increase buy clicks?**
   Hypothesis: yes, ~30% higher click rate for tagged items. If the lift is <10%, reconsider the tag UI's discoverability.

4. **Does the reminder email drive return gifter visits?**
   Hypothesis: reminder cohort has 2× page views in the following week. If no lift, consider deepening the email copy rather than sending more reminders.

5. **What is the biggest gap (survey Q5)?**
   Top answers become the Phase 3 backlog inputs. Tally and rank before prioritisation.

6. **What is the activation blocker?**
   If signups → active rate is below 70%, review the popup's first-run experience and the floating button's product page detection. Low activation is more dangerous than low signups.

---

## SECTION 3 — PHASE 3 FEATURE PRIORITISATION

*Based on expected beta feedback and known user demand patterns from similar products.*

---

### 3.1 Feature Candidates

---

#### FEATURE A — Group Gifting (Chip-In)
**Expected demand:** High — especially wedding registries and baby showers where individual items exceed a single gifter's budget. Survey Q5 will confirm.

**What it is:** Multiple gifters can contribute toward a single item. Each contribution is tracked as a partial claim. When the total reaches the item price, the item is marked as fully funded. The wisher sees a progress bar and knows who contributed.

**Why it matters for the business:** High-AOV items mean larger affiliate commissions. A £800 stand mixer bought as a group gift through a GiftHint chip-in link earns ~£30 commission vs ~£5 for a £150 individual item.

**Build complexity:** High.
- New `contributions` table: `(id, wishlist_item_id, session_id, amount_pct, contributed_at)`
- ChipInModal component replacing ClaimModal for eligible items
- Progress bar on GiftCard (new state: partially_funded)
- Coordination edge cases: concurrent contributions, what happens when item goes out of stock mid-funding
- No real money moves through GiftHint — contributors are directed to buy the item directly (we earn affiliate commission when total is reached and the wisher is prompted to buy)

**Phase 3 verdict:** Build in Phase 3 Week 1–4. Wedding + baby shower are the two highest-intent occasions and chip-in is the single feature most likely to generate word-of-mouth in those communities.

---

#### FEATURE B — Price Drop Alerts
**Expected demand:** High — strong retention driver. Users who saved an item months ago will re-engage when it drops into their price range.

**What it is:** When a saved item's price drops by ≥10% (or below a user-set threshold), the wisher gets an email: "The Dyson V15 on your birthday list dropped from £549 to £449."

**Why it matters:** Turns passive wishlists into active utility. Re-engagement emails convert better than cold acquisition. Also surfaces GiftHint at exactly the moment the user is most likely to share their list (item now affordable → tell people).

**Build complexity:** Moderate.
- Price snapshot table: `(wishlist_item_id, price, currency, captured_at)`
- Daily cron: re-fetch prices via product page scrape or retailer API (Amazon PA API has pricing)
- Price delta logic + threshold config per item
- PriceDropEmail template (React Email)
- Scraping at scale is fragile — start with Amazon PA API for Amazon items only; other retailers use OG meta refetch via a headless fetch

**Phase 3 verdict:** Build in Phase 3 Week 5–8 after chip-in ships. Amazon items first, then expand.

---

#### FEATURE C — Universal Bookmarklet (iOS / Safari Unblock)
**Expected demand:** Medium-high — every iOS user who tries the extension and discovers it only works on Chrome desktop is a lost user. This is a known coverage gap.

**What it is:** A JavaScript bookmarklet (a bookmark with `javascript:` code) that runs `product-extractor.js` logic on the current page and opens a GiftHint save sheet in a new tab. Works in Safari on iOS, Safari on Mac, Firefox, Edge — any browser.

**Why it matters:** iOS is ~55% of mobile web traffic. The current "install the Chrome extension" onboarding hard-blocks all iOS users and Mac users on Safari. A bookmarklet removes this blocker with one afternoon of work.

**Build complexity:** Low.
- `app/bookmarklet/page.tsx` — install instructions page with the one-click bookmarklet drag target
- `public/bookmarklet.js` — minified save script (same product extraction logic as floating-button.js, condensed to fit bookmarklet constraints)
- `app/save/page.tsx` — the target URL that receives product data as query params and presents the save UI (reuses popup.js save logic as a web page)
- No backend changes required

**Phase 3 verdict:** Build in Phase 3 Week 1–2 alongside chip-in planning. Small effort, unblocks ~50% of the audience that isn't currently reachable.

---

#### FEATURE D — Firefox + Edge Extensions
**Expected demand:** Medium. Firefox ~3.5% global market share, Edge ~5%. Combined ~8.5%. Not urgent but a long-tail acquisition channel with no marginal infrastructure cost once MV3 is the baseline.

**What it is:** Port the Chrome MV3 extension to Firefox (MV2 compatible, with minor API differences) and Edge (shares Chromium base — effectively zero changes needed for Edge).

**Build complexity:**
- **Edge:** Near-zero effort. Submit the same package to the Microsoft Add-ons store. The MV3 Chromium extension works as-is.
- **Firefox:** Low-medium effort. Firefox supports MV3 as of Firefox 109 but `chrome.identity` is not available — the extension's popup must fall back to a web-based OAuth flow (open gifthint.io/auth in a tab, postMessage the token back). Floating-button.js already avoids `chrome.identity` in the content script so that part works unchanged.

**Phase 3 verdict:** Edge submission in Week 1 (free, 30 minutes). Firefox port in Week 9–12 (last, lower priority than core feature gaps).

---

### 3.2 Impact vs Effort Prioritisation Matrix

```
HIGH IMPACT
    │
    │   [A] Group Gifting       [B] Price Drop Alerts
    │   (chip-in)
    │
    │                           [C] Bookmarklet
    │                           (iOS/Safari unblock)
    │
    │                                           [D] Firefox Extension
LOW IMPACT
    └────────────────────────────────────────────────────
         LOW EFFORT                          HIGH EFFORT
```

| Feature | Impact | Effort | Phase 3 Sprint | Priority |
|---------|--------|--------|----------------|----------|
| C — Bookmarklet | High | Low | Week 1–2 | **1 — Ship first** |
| D — Edge extension | Medium | Minimal | Week 1 | **2 — Ship alongside C** |
| A — Group gifting | High | High | Week 2–6 | **3 — Main Phase 3 build** |
| B — Price drop alerts | High | Moderate | Week 7–10 | **4 — Ship after group gifting** |
| D — Firefox extension | Medium | Low-medium | Week 10–12 | **5 — End of phase** |

**Intentionally deferred to Phase 4:**
- Mobile apps (React Native / Expo) — significant investment; bookmarklet + PWA covers mobile until user base justifies it
- Gifter group coordination ("see who claimed what without revealing") — complexity high, demand uncertain until beta data confirms
- AI gift recommendations — infrastructure not yet warranted at beta scale

---

## SECTION 4 — TECHNICAL DEBT LOG

*Shortcuts taken during Phase 1–2 that are acceptable now but must be addressed before Phase 3 ships to a larger audience.*

---

### 4.1 Authentication & Middleware

**Debt:** Admin route protection uses a shared-secret cookie (`gh_admin`), not a proper Supabase session check. The `middleware.ts` comment documents this explicitly.

**Risk:** If `ADMIN_SECRET` leaks (env var exposure, git history), admin panel is fully open. At single-founder scale with one admin this is acceptable. At any team size it is not.

**Phase 3 fix:**
```typescript
// Replace verifyCookie() with @supabase/ssr session check:
import { createServerClient } from '@supabase/ssr'

const supabase = createServerClient(...)
const { data: { session } } = await supabase.auth.getSession()
if (!session || session.user.email !== process.env.ADMIN_EMAIL) {
  return NextResponse.redirect(new URL('/', req.url))
}
```
**Effort:** 2 hours. Do before Phase 3 beta grows beyond 50 users.

---

### 4.2 TypeScript Errors in Pre-existing Files

**Debt:** Two known TypeScript errors exist in files not touched during Phase 2:

```
app/api/track-view/route.ts:52
  — Map iteration requires --downlevelIteration (or target ES2015+)

app/page.tsx:679
  — Property 'price' does not exist on type '{...}'
```

These were pre-existing and confirmed not introduced by any Phase 2 changes. The build succeeds because `next build` only type-checks changed files in CI, but `tsc --noEmit` fails project-wide.

**Phase 3 fix:**
- `tsconfig.json`: add `"downlevelIteration": true` (or bump `"target"` to `"ES2017"`)
- `app/page.tsx`: add the missing `price` field to the item type or use a type assertion with a comment

**Effort:** 30 minutes. Fix in the Phase 3 kickoff commit.

---

### 4.3 Occasion Labels Duplicated Between Server and Extension

**Debt:** `lib/wishlists.ts` `OCCASION_TYPES` and `extension/wishlists.js` `OCCASION_LABELS` are manually kept in sync. They diverged once during Phase 2 (baby_shower key capitalisation).

**Risk:** Adding a new occasion type requires two edits; one will be forgotten.

**Phase 3 fix:** Add a `scripts/generate-extension-wishlists.ts` build script that reads `OCCASION_TYPES` from the TypeScript source and writes the JS constants file. Add to `package.json` `postbuild` or as a standalone `sync:extension` script.

**Effort:** 3 hours including tests.

---

### 4.4 Database Indices

**Debt:** The following query patterns are used in hot paths (gifter page load, cron jobs) but lack explicit indices. At beta scale (<1,000 rows) full scans are imperceptible. At 10,000+ rows they will show.

```sql
-- Add before Phase 3 scale testing:

-- Gifter page: fetch all items for a wishlist
CREATE INDEX IF NOT EXISTS idx_wishlist_items_wishlist_id
  ON wishlist_items (wishlist_id);

-- Analytics queries: group by wishlist and date
CREATE INDEX IF NOT EXISTS idx_page_views_wishlist_id_viewed_at
  ON page_views (wishlist_id, viewed_at DESC);

CREATE INDEX IF NOT EXISTS idx_click_events_wishlist_item_id_clicked_at
  ON click_events (wishlist_item_id, clicked_at DESC);

-- Reminder cron: find reminders due today
CREATE INDEX IF NOT EXISTS idx_gifter_reminders_remind_at_sent_at
  ON gifter_reminders (remind_at, sent_at)
  WHERE sent_at IS NULL;

-- Weekly digest cron: find users opted in with activity
CREATE INDEX IF NOT EXISTS idx_users_digest_opted_out_last_digest
  ON users (digest_opted_out, last_digest_sent_at)
  WHERE digest_opted_out = false;

-- Sitemap: fetch all public wishlists with usernames
CREATE INDEX IF NOT EXISTS idx_wishlists_is_public_created_at
  ON wishlists (is_public, created_at DESC)
  WHERE is_public = true;
```

**Run in Supabase SQL Editor during Phase 3 Week 1.** Use `CONCURRENTLY` if data is already present to avoid table locks.

---

### 4.5 Supabase RLS Policies Audit

**Debt:** RLS policies were written during Phase 1 and expanded incrementally. They have not been reviewed as a complete set.

**Known gaps to audit:**

| Table | Risk | Check |
|-------|------|-------|
| `wishlist_items` | Can a non-owner upsert items? | Verify `user_id = auth.uid()` check on INSERT |
| `gifter_reminders` | Anyone can insert a reminder (no auth). Is rate-limiting in the API route? | Confirm `/api/reminder-signup` validates email format and dedupes per wishlist |
| `click_events` | Writable without auth (gifters aren't signed in). Bot traffic possible. | Add rate limiting in route handler; consider `pg_net` IP-level throttle |
| `affiliate_data` | Should be service-role only (written by cron). | Confirm no authenticated-user SELECT or INSERT is permitted |
| `users` | `public_username` is publicly readable for share URLs. Email address must not be readable by any anonymous role. | Verify RLS SELECT policy excludes `email` column for anon role |

**Phase 3 fix:** Write a `tests/rls-audit.md` document that maps each table to its expected anon/authenticated/service-role permissions and verifies with `supabase test db`.

---

### 4.6 Rate Limiting on API Routes

**Debt:** No explicit rate limiting is applied to any API route. The following routes are callable by unauthenticated users and are vulnerable to abuse:

- `/api/claim/[itemId]` — spamming claims would fill the claimed_by table
- `/api/reminder-signup` — spamming email collection
- `/api/track-view` — inflating analytics
- `/api/track-click` — inflating affiliate click counts (potential Associates ToS risk)

**Phase 3 fix:** Use Vercel's built-in rate limiting (available on Pro plan) or add an IP-based token bucket using Upstash Redis (free tier: 10,000 requests/day). Priority order: `track-click` first (affiliate integrity), then `reminder-signup` (PII collection), then `claim`.

```typescript
// Pattern for Upstash-based rate limiting in a Route Handler:
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(20, '1 m'),  // 20 req/min per IP
})

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  const { success } = await ratelimit.limit(ip)
  if (!success) return Response.json({ error: 'Too many requests' }, { status: 429 })
  // ... handler logic
}
```

---

### 4.7 next.config.js remotePatterns Coverage

**Debt:** `images.remotePatterns` in `next.config.js` covers Amazon, Etsy, Walmart, Target, Sephora, CloudFront, Shopify. Missing:

- John Lewis (`johnlewis.scene7.com`)
- ASOS (`images.asos-media.com`)
- Apple (`store.storeimages.cdn-apple.com`)
- IKEA (`www.ikea.com/us/en/images/...`)
- Nike (`static.nike.com`)

**Risk:** `next/image` throws and falls back to a broken image placeholder for items from these retailers. The broken image is visible to gifters.

**Phase 3 fix:** Add patterns as retailers appear in the `beta_weekly` top-retailer report. Use wildcard hostname patterns where safe.

---

## SECTION 5 — PHASE 3 KICKOFF PROMPT

*Copy the block below and paste it as the first message in a new Claude Code session to start Phase 3 with full context.*

---

```
You are continuing development on GiftHint — a Next.js + Supabase + Chrome Extension
product that allows users to save gift ideas from any online store, organise them into
occasion-tagged wishlists, and share a public gifter page where friends and family can
browse and claim items. Affiliate links (Amazon Associates + Skimlinks) monetise gifter
click-throughs.

────────────────────────────────────────────────────────────
REPOSITORY
────────────────────────────────────────────────────────────
Path: /Users/carlos/Downloads/gifthint-web

Key directories:
  app/                     Next.js 14.2 App Router pages and API routes
  app/list/[username]/[slug]/  gifter page (public, SSR + ISR revalidate=60)
  app/dashboard/           wisher dashboard (protected, Supabase auth)
  app/admin/               admin revenue dashboard (shared-secret cookie auth)
  app/api/                 route handlers: claim, wishlists, analytics, cron, items
  components/              React components (admin/, dashboard/ subdirs)
  components/admin/        StatsGrid, RevenueChart, ReconciliationTable, etc.
  components/dashboard/    ItemEditor, DnaTagEditor, ListCard, CreateListModal, etc.
  extension/               Chrome MV3 extension (v1.1.0 — submitted to Web Store)
  lib/                     Server-side utilities (affiliate, dna-tags, digest, email, etc.)
  tests/                   Jest unit tests + Playwright E2E
  docs/                    Planning docs, SQL migrations, campaign materials
  vercel.json              3 cron jobs: send-reminders (daily 09:00), sync-affiliate-data
                           (daily 06:00), weekly-digest (Monday 09:00)

────────────────────────────────────────────────────────────
STACK
────────────────────────────────────────────────────────────
  Framework:    Next.js 14.2.3 (App Router, TypeScript, Tailwind 3.4)
  Database:     Supabase (PostgreSQL + Realtime + Auth)
  Auth:         Supabase Google OAuth for wishers; anon for gifters
  Email:        Resend + @react-email/components
  Analytics:    Recharts (admin + dashboard charts)
  Drag/drop:    @hello-pangea/dnd (dashboard list reordering)
  Extension:    Chrome MV3, ES modules, chrome.storage.local for session cache
  Affiliate:    Amazon Associates (server-side URL rewriting) + Skimlinks (client JS)
  Testing:      Jest (unit), Playwright (E2E, playwright.config.ts)
  Hosting:      Vercel (Pro — cron jobs require Pro plan)

────────────────────────────────────────────────────────────
CRITICAL ARCHITECTURE DECISIONS (do not reverse without discussion)
────────────────────────────────────────────────────────────
1. AFFILIATE LINK REWRITING IS SERVER-SIDE ONLY.
   lib/affiliate.ts has a CRITICAL comment block explaining why. Chrome Web Store
   §4.4 prohibits extensions from injecting affiliate codes. The extension saves the
   clean source URL; the gifter page server rewrites Amazon URLs to Associates links;
   Skimlinks JS rewrites all other eligible URLs client-side on the gifter page.
   Never move affiliate rewriting into the extension.

2. EXTENSION CONTENT SCRIPTS CANNOT USE chrome.identity.
   floating-button.js reads auth from chrome.storage.local (key: gh_user) because
   chrome.identity is unavailable in content script context. auth.js (popup context)
   writes gh_user on sign-in. This is the established pattern for all content
   script auth reads.

3. SUPABASE REALTIME ON THE GIFTER PAGE.
   GifterPage.tsx subscribes to wishlist_items for the current wishlist_id. The
   subscription is torn down in the useEffect cleanup. Do not add additional
   subscriptions without considering the channel limit per Supabase project.

4. EMPTY DIGEST POLICY.
   lib/digest.ts returns null when totalViews === 0. The weekly-digest cron MUST
   check for null and skip sending. Violating this trains users to ignore the email
   and increases unsubscribes. See weekly-digest.test.ts for the test that enforces this.

5. OCCASION_LABELS DUPLICATION.
   lib/wishlists.ts (OCCASION_TYPES) and extension/wishlists.js (OCCASION_LABELS)
   are manually synced. When adding a new occasion type, update BOTH files.
   Phase 3 task: automate this with a generate script.

6. ADMIN AUTH IS A SHARED SECRET — NOT SUPABASE SSR.
   middleware.ts uses a cookie-based shared secret (ADMIN_SECRET env var) for /admin/*.
   The comment in middleware.ts documents the @supabase/ssr upgrade path. Do not
   add new admin-only features without noting this debt.

7. ISR ON GIFTER PAGE.
   app/list/[username]/[slug]/page.tsx has export const revalidate = 60. The page
   is edge-cached and revalidated in the background. Changes to wishlist items
   appear on the gifter page within ~60 seconds, not instantly. This is intentional
   and acceptable. Real-time claim state is handled by the Supabase Realtime
   subscription in GifterPage.tsx (client-side), which IS instant.

────────────────────────────────────────────────────────────
KNOWN TECHNICAL DEBT (fix before Phase 3 scales)
────────────────────────────────────────────────────────────
1. Two TypeScript errors in pre-existing files:
   - app/api/track-view/route.ts:52 — Map iteration (add downlevelIteration to tsconfig)
   - app/page.tsx:679 — missing 'price' property on item type

2. No rate limiting on any API route. Priority: track-click → reminder-signup → claim.
   Use Upstash Redis (@upstash/ratelimit) or Vercel rate limiting.

3. next.config.js remotePatterns missing: John Lewis, ASOS, Apple, IKEA, Nike.
   Add as these retailers appear in analytics.

4. Missing DB indices — run the CREATE INDEX block in docs/phase2-wrap-and-phase3-brief.md
   Section 4.4 in Supabase SQL Editor before Phase 3 load testing.

5. RLS policies not audited as a complete set — see Section 4.5 for audit checklist.

────────────────────────────────────────────────────────────
PHASE 3 PRIORITIES (in order)
────────────────────────────────────────────────────────────
1. Bookmarklet (iOS / Safari / Firefox unblock) — Week 1–2
   app/bookmarklet/page.tsx + public/bookmarklet.js + app/save/page.tsx
   No backend changes. Reuses product extraction + save logic as a web flow.

2. Edge extension submission — Week 1 (30 min, same package, different store)

3. Group gifting / chip-in — Week 2–6
   New contributions table. ChipInModal. Progress bar on GiftCard.
   Priority occasion types: wedding, baby_shower.

4. Price drop alerts — Week 7–10
   Price snapshot table. Daily cron re-fetches prices.
   Amazon items via PA API first; other retailers via OG meta refetch.

5. Firefox extension port — Week 10–12
   Main delta: replace chrome.identity popup flow with web-based OAuth tab.

────────────────────────────────────────────────────────────
BETA CONTEXT (Week 12 target)
────────────────────────────────────────────────────────────
  100 active users (≥1 item saved)
  300 items saved
  50 affiliate buy clicks
  $5 estimated affiliate revenue

  Campaign materials: docs/beta-launch-campaign.md
  Store listing: docs/store-listing.md (v1.1 updated)
  Performance budget: docs/performance-budget.md
  Monitoring: docs/monitoring-checklist.md

────────────────────────────────────────────────────────────
WHAT I WANT TO WORK ON IN THIS SESSION
────────────────────────────────────────────────────────────
[PASTE YOUR SPECIFIC PHASE 3 TASK HERE — e.g.:]
"Build the bookmarklet install page and the /save web flow."
"Start the group gifting chip-in feature — begin with the contributions table schema."
"Fix the two TypeScript errors and add the missing DB indices."
```

---

*End of Phase 2 Wrap & Phase 3 Brief.*
*Next review: after Week 12 beta data is collected. Update Section 2 with actuals before Phase 3 kickoff.*
