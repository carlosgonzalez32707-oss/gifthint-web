# GiftHint — Phase 4 Mobile Readiness Audit

**Date:** 2026-05-18  
**Prepared for:** Phase 4 React Native (Expo) development  
**Auditor:** Technical Debt Sprint (automated + manual review)

---

## Executive Summary

The GiftHint web API is broadly ready to serve a mobile client, with four
structural issues that **must be resolved before the React Native app ships**
and several medium-priority improvements that should be addressed in sprint.

| Severity | Count | Summary |
|----------|-------|---------|
| 🔴 Blocker | 4 | Auth strategy, response envelope, versioning, CORS |
| 🟡 Required | 5 | Rate limits, date handling, pagination, error codes, file uploads |
| 🟢 Advisory | 5 | Token refresh, deep links, analytics, push notifications, caching |

---

## 1. REST API Design Audit

### 1.1 Current Endpoint Inventory

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| POST | `/api/claim` | None | Gifter claims a wishlist item |
| GET | `/api/claimed-state/[username]` | None | Polling fallback for realtime claims |
| GET | `/api/claims/[username]` | None | Read claimed items |
| POST | `/api/wishlists` | userId in body ⚠️ | Create wishlist |
| PATCH | `/api/items/[id]` | Bearer JWT | Update item |
| DELETE | `/api/items/[id]` | Bearer JWT | Delete item |
| POST | `/api/group-gift/contribute` | None (Stripe handles) | Contribute to pool |
| POST | `/api/group-gift/create-pool` | Implicit | Create gift pool |
| POST | `/api/track-click` | None | Affiliate click attribution |
| POST | `/api/track-view` | None | Wishlist view tracking |
| POST | `/api/billing/create-checkout` | Implicit session | Stripe checkout |
| POST | `/api/auth/exchange` | None | OAuth code exchange (extension) |
| POST | `/api/reminder-signup` | None | Gifter email reminder |
| POST | `/api/scrape-og` | None | OG metadata scraping |
| GET | `/api/items/[id]/price-history` | None | Item price history |
| GET | `/api/analytics/wishlist/[wishlistId]` | None | Wishlist analytics |
| GET | `/api/dna-tags/popular` | None | Trending DNA tags |
| GET | `/api/username/available` | None | Username availability check |

### 1.2 Response Format Inconsistency 🔴 BLOCKER

**Problem:** Routes return different shapes. A React Native client cannot write
a single `apiFetch()` wrapper without knowing which shape to expect per route.

```
/api/claim          → { success: true, item: {...} }
/api/wishlists      → { wishlist: {...} }
/api/items/[id]     → { item: {...} }      (PATCH)
/api/items/[id]     → { ok: true }         (DELETE)
/api/claimed-state  → { items: [...] }
/api/track-click    → { ok: true }
/api/group-gift/contribute → { clientSecret, contributionId }
```

**Fix:** Migrate all routes to the `{ data, error, meta }` envelope from
`lib/api-response.ts`. Migration order (highest mobile impact first):

1. `POST /api/claim` — used on every gifter page
2. `PATCH /api/items/[id]` — used in the item editor
3. `GET /api/claimed-state/[username]` — polling fallback
4. `POST /api/wishlists` — onboarding
5. All remaining routes

```typescript
// BEFORE (inconsistent)
return NextResponse.json({ item }, { status: 200 })

// AFTER (standardised — use lib/api-response.ts)
import { ok } from '@/lib/api-response'
return ok({ item })
```

**Mobile client wrapper (write this in the RN app):**

```typescript
// app/src/lib/api.ts — React Native
const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://gifthint.io'

async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<{ data: T } | { error: { message: string; code: string } }> {
  const res  = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  return res.json()
}
```

---

## 2. Versioning Recommendation 🔴 BLOCKER

**Problem:** All routes live at `/api/*`. Once mobile clients are in production
(with users on App Store / Play Store versions you cannot force-update), you
cannot make breaking API changes without versioning. A user on an old app
version hitting a changed `/api/wishlists` will silently break.

**Decision required before Phase 4 ships:**

### Option A — Route prefix versioning (recommended)

```
/api/v1/wishlists
/api/v1/items/[id]
/api/v1/claim
```

All existing web routes remain at `/api/*` (unchanged for the web app).
New `/api/v1/*` routes are added as thin wrappers or rewrites.

```typescript
// app/api/v1/wishlists/route.ts
// Thin re-export — one source of truth in the shared handler
export { POST } from '@/app/api/wishlists/route'
```

**Pros:** Cleanest for mobile; easy to sunset v1 later.  
**Cons:** Small duplication for initial setup.

### Option B — Header versioning

```
POST /api/wishlists
X-API-Version: 1
```

**Pros:** No URL change.  
**Cons:** Not REST-standard; harder to test in browsers; Vercel Edge cache
doesn't vary on custom headers by default.

**Recommendation: Option A.** Routes that the mobile app will call first:

| Priority | Route | Must version before |
|----------|-------|---------------------|
| 1 | `POST /api/claim` | Beta launch |
| 2 | `GET /api/claimed-state/[username]` | Beta launch |
| 3 | `POST /api/wishlists` | Beta launch |
| 4 | `PATCH /api/items/[id]` | Beta launch |
| 5 | `POST /api/group-gift/contribute` | Group-gift feature |
| 6 | All analytics routes | Post-launch |

---

## 3. Authentication — Google OAuth Is Not Mobile-Compatible 🔴 BLOCKER

**Problem:** The current auth flow is designed for the Chrome extension:

```
Extension → Google OAuth → /api/auth/exchange → Supabase session
```

This flow uses `chromiumapp.org` redirect URIs, which only work in Chromium-based
extensions. A React Native app **cannot** use this flow.

**Why it won't work in React Native:**
- `chromiumapp.org` is a Google-reserved domain for browser extensions only
- React Native has no concept of browser extension redirect URIs
- The `redirect_uri` allowlist in `/api/auth/exchange/route.ts` explicitly rejects
  non-chromiumapp.org URLs

**Required replacement: Expo AuthSession + Supabase OAuth**

```typescript
// app/src/screens/SignIn.tsx — React Native / Expo

import { makeRedirectUri } from 'expo-auth-session'
import * as WebBrowser    from 'expo-web-browser'
import { supabase }       from '@/lib/supabase'

WebBrowser.maybeCompleteAuthSession()

export async function signInWithGoogle() {
  const redirectTo = makeRedirectUri({ scheme: 'gifthint' })

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  })

  if (error || !data.url) throw error

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)

  if (result.type === 'success') {
    const { url } = result
    await supabase.auth.exchangeCodeForSession(url)
  }
}
```

**Required packages:**
```bash
npx expo install expo-auth-session expo-web-browser expo-crypto
```

**Required Supabase config:**
- Enable Google provider in Supabase Auth → Providers
- Add the Expo redirect URI to Google Cloud Console → Authorized redirect URIs:
  `https://<supabase-project>.supabase.co/auth/v1/callback`

**Required changes to web API:**
- Add a new `/api/auth/mobile-exchange` route (or expose a separate endpoint)
  that accepts Expo's redirect URI format — do NOT modify `/api/auth/exchange`
  (it's used by the extension)
- Or: rely entirely on Supabase Auth's built-in OAuth (recommended — no custom
  exchange endpoint needed for PKCE flows)

---

## 4. CORS Configuration 🔴 BLOCKER

**Problem:** Next.js API routes do not set CORS headers by default. Browser
security does not apply to native apps, but React Native's Fetch API **does**
check `Access-Control-Allow-Origin` headers in some environments (particularly
Expo Go and web builds).

**Current state:** No CORS headers on any route.

**Fix:** Add a `middleware.ts` (or extend the existing one) that adds CORS
headers to `/api/*` for mobile origins:

```typescript
// middleware.ts (add to existing middleware)
import { NextResponse, type NextRequest } from 'next/server'

const MOBILE_ORIGINS = [
  'https://gifthint.io',
  /^exp:\/\//,              // Expo Go
  /^gifthint:\/\//,         // Production app scheme
]

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true  // Non-browser requests (curl, native HTTP)
  return MOBILE_ORIGINS.some((allowed) =>
    typeof allowed === 'string'
      ? origin === allowed
      : allowed.test(origin),
  )
}

export function middleware(req: NextRequest) {
  const origin   = req.headers.get('origin')
  const response = NextResponse.next()

  if (req.nextUrl.pathname.startsWith('/api/')) {
    if (isAllowedOrigin(origin)) {
      response.headers.set('Access-Control-Allow-Origin', origin ?? '*')
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    }
  }

  return response
}
```

---

## 5. Rate Limit Adjustments for Mobile 🟡 REQUIRED

Mobile clients make requests from varying IP addresses (cellular carrier NAT,
Wi-Fi changes). Current limits are calibrated for browser clients behind stable
IPs.

| Route | Current limit | Mobile concern | Recommendation |
|-------|--------------|----------------|----------------|
| `POST /api/claim` | 20 / IP / hour | Multiple users behind carrier NAT | Add user-scoped rate limit as secondary gate |
| `POST /api/track-click` | 100 / IP / hour | High from popular lists | ✅ Fine |
| `POST /api/billing/create-checkout` | Not set | None | Add 5 / user / day |
| `GET /api/claimed-state` | Not set | Polling fallback | Add 60 / IP / min |

**Carrier NAT mitigation:** For routes that accept an auth token, use
`userId` as the rate limit identifier (already done in `/api/wishlists`).
For unauthenticated routes (claim, track-click), keep IP-based limits but
raise the ceiling for initial mobile launch.

---

## 6. Date/Time Handling 🟡 REQUIRED

**Problem:** Some routes return ISO 8601 timestamps, others return Unix
seconds (Stripe conventions), and some return null. Mobile clients need
consistent date handling.

**Audit:**

| Source | Format | Example |
|--------|--------|---------|
| Supabase `claimed_at` | ISO 8601 UTC | `"2026-01-15T10:30:00Z"` |
| Stripe `current_period_end` | Unix seconds | `1748563200` |
| Supabase `subscription_period_end` | ISO 8601 UTC | `"2026-06-18T00:00:00Z"` |
| `gift_pools.closes_at` | ISO 8601 UTC | `"2026-12-25T00:00:00Z"` |

**Decision:** All API responses should use **ISO 8601 UTC strings**. Never
return raw Unix seconds to mobile clients (React Native's `Date` constructor
accepts ISO 8601 directly; Unix seconds require multiplication by 1000 which
is a common bug).

The billing webhook already converts `current_period_end` from Stripe Unix
seconds to ISO when writing to the database. This is correct — no change needed
in the DB layer. Verify no routes leak raw Stripe unix timestamps.

---

## 7. Pagination 🟡 REQUIRED

**Problem:** Several routes return unbounded arrays. On mobile, large lists
cause memory pressure and slow rendering.

**Routes that need pagination before mobile launch:**

| Route | Risk | Recommended limit |
|-------|------|-------------------|
| `GET /api/claimed-state/[username]` | Wishlists with 200+ items | 100 items max, cursor-based |
| `GET /api/analytics/wishlist/[wishlistId]` | Unbounded event history | 50 events per page |
| `GET /api/price-history/[itemId]` | Can grow indefinitely | 90-day rolling window |

**Use `lib/api-response.ts`'s `paginated()` helper:**
```typescript
return paginated(items, total, page, limit)
// → { data: [...], error: null, meta: { total, page, limit, pages } }
```

Mobile client can then implement infinite scroll using `meta.pages` to know
when to stop loading.

---

## 8. Shared Business Logic — Monorepo Consideration 🟡 REQUIRED

The following modules in `lib/` contain business logic that the React Native
app will need. Three paths are available:

### Path A — API-only (simplest, no monorepo)

Mobile app calls the web API for everything. Zero code sharing.

**Pros:** Fastest to ship. No build tooling changes.  
**Cons:** Extra network round-trips for things that could run locally (e.g.
`isPro()`, `hasFeature()`, theme application).

**Verdict:** Acceptable for Phase 4 launch. Revisit for Phase 5.

### Path B — Shared `packages/` directory (recommended for Phase 5)

Extract pure-function modules into a shared package:

```
gifthint/
├── apps/
│   ├── web/          (current Next.js app)
│   └── mobile/       (Expo React Native app)
└── packages/
    └── core/
        ├── lib/permissions.ts     ← isPro(), hasFeature()
        ├── lib/themes.ts          ← theme tokens, toCSSVars
        ├── lib/validators.ts      ← request body schemas
        └── types/
            ├── WishlistItem.ts
            ├── User.ts
            ├── GiftPool.ts
            └── Contribution.ts
```

**Tooling:** Turborepo + pnpm workspaces (most compatible with Expo).

**Candidates for immediate extraction (pure functions, zero dependencies):**

| File | Reason |
|------|--------|
| `lib/permissions.ts` | `isPro()` and `hasFeature()` needed in mobile gating |
| `lib/themes.ts` | Theme tokens needed for RN StyleSheet generation |
| `lib/validators.ts` | Shared validation for offline-first form inputs |
| `lib/time.ts` | Date formatting utilities |

**Files that must stay web-only (Next.js / Node.js APIs):**

| File | Reason |
|------|--------|
| `lib/supabase-server.ts` | Uses `@supabase/ssr`, Node.js only |
| `lib/email.ts` | Resend SDK, server-only |
| `lib/stripe.ts` | Stripe Node SDK, server-only |
| `lib/rate-limit.ts` | Upstash Redis client, server-only |
| `lib/scrape-og.ts` | Node.js `fetch` + server-only |

### Path C — React Native SDK

Publish `@gifthint/sdk` to npm (private package or scoped). Mobile app installs
via package registry. Overkill for Phase 4.

**For Phase 4: use Path A. Plan Path B tooling setup as a Phase 5 epic.**

---

## 9. TypeScript Types — Cross-Platform Compatibility ✅ READY

The core domain types are already clean TypeScript interfaces with no
server-side dependencies. They can be used directly in React Native:

```typescript
// These types are safe to import in React Native — no Next.js dependencies

export interface WishlistItem {
  id:               string
  user_id:          string
  wishlist_id:      string | null
  title:            string
  url:              string
  price:            number | null
  image_url:        string | null
  hint:             string | null
  is_claimed:       boolean
  claimed_by:       string | null
  claimed_at:       string | null
  claimed_anonymous: boolean
  sort_order:       number
  dna_tags:         string[]
  created_at:       string
}

export interface User {
  id:                      string
  email:                   string
  public_username:         string | null
  display_name:            string | null
  avatar_url:              string | null
  subscription_status:     'free' | 'pro' | 'cancelled'
  subscription_period_end: string | null
  premium_themes_enabled:  boolean
  priority_support_enabled: boolean
  custom_username_enabled: boolean
  premium_tier:            'free' | 'plus' | 'pro'
  created_at:              string
}

export interface GiftPool {
  id:               string
  item_id:          string
  target_amount:    number
  collected_amount: number
  status:           'open' | 'funded' | 'closed' | 'refunded'
  closes_at:        string | null
}

export interface Contribution {
  id:                     string
  pool_id:                string
  contributor_name:       string | null
  amount:                 number
  anonymous:              boolean
  stripe_payment_status:  string
  created_at:             string
}
```

**Action:** Create `types/index.ts` (or `types/domain.ts`) exporting these
interfaces. Reference them consistently across all API routes and React
components. This replaces any remaining `any` types in component props.

---

## 10. Authentication Token Flow for React Native 🟢 ADVISORY

Once Expo AuthSession is wired up (section 3), the Supabase client handles
token refresh automatically via `supabase.auth.onAuthStateChange()`. However,
React Native has no persistent cookie jar, so the session must be stored in
`AsyncStorage` (or `expo-secure-store` for the JWT, which is more secure):

```typescript
// app/src/lib/supabase.ts — React Native

import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

export const supabase = createClient<Database>(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage:          AsyncStorage,
      autoRefreshToken: true,
      persistSession:   true,
      detectSessionInUrl: false,  // MUST be false for React Native
    },
  },
)
```

**Required packages:**
```bash
npx expo install @react-native-async-storage/async-storage
```

The web API routes accept the Supabase JWT in `Authorization: Bearer <token>`.
This already works — `/api/items/[id]` uses `supabase.auth.getUser(token)`.
No server-side changes needed for the auth header pattern.

---

## 11. Push Notifications — Phase 4 Feature Gap 🟢 ADVISORY

The current web app has no push notification infrastructure. For Phase 4, the
following gifter-facing events should trigger push notifications in the mobile app:

| Event | Current | Phase 4 |
|-------|---------|---------|
| Item claimed | Realtime + polling | Push via Expo Notifications |
| Price drop | Email only | Push via Expo Notifications |
| Group pool funded | Email only | Push via Expo Notifications |
| Weekly digest | Email only | Push (optional, user preference) |

**Recommended stack:**
- Expo Push Notification Service (free, handles APNS + FCM)
- Store `expo_push_token` on the `users` table (add a migration)
- Add `lib/push.ts` server module that calls the Expo push API
- Wire into existing event hooks: `markPurchased`, price alert cron, pool funded trigger

---

## 12. Deep Links — Phase 4 Requirement 🟢 ADVISORY

The mobile app needs deep links for:
- Gifter page: `gifthint://list/[username]/[slug]`
- Claim confirmation: `gifthint://claim/success/[itemId]`
- Upgrade prompt: `gifthint://upgrade`

**Expo config (`app.json`):**
```json
{
  "expo": {
    "scheme": "gifthint",
    "ios": {
      "bundleIdentifier": "io.gifthint.app",
      "associatedDomains": ["applinks:gifthint.io"]
    },
    "android": {
      "package": "io.gifthint.app",
      "intentFilters": [
        {
          "action": "VIEW",
          "data": [{ "scheme": "https", "host": "gifthint.io" }],
          "category": ["BROWSABLE", "DEFAULT"]
        }
      ]
    }
  }
}
```

**Server action required:** Add `apple-app-site-association` (AASA) and
`assetlinks.json` to the public directory for Universal Links / App Links:

```
public/.well-known/apple-app-site-association
public/.well-known/assetlinks.json
```

---

## Phase 4 Pre-Launch Checklist

### Must be done before beta (Blockers)

- [ ] **Response envelope** — migrate top-5 mobile routes to `{ data, error, meta }` (lib/api-response.ts)
- [ ] **API versioning** — add `/api/v1/*` route aliases for all routes the mobile app calls
- [ ] **Auth replacement** — implement Expo AuthSession + Supabase OAuth; add `/api/auth/mobile-exchange` if needed
- [ ] **CORS** — add `Access-Control-Allow-*` headers to `/api/*` in middleware

### Must be done before GA (Required)

- [ ] **Rate limit tuning** — add user-scoped fallback for cellular NAT; add limit to `/api/billing/create-checkout`
- [ ] **Date normalisation** — audit all routes for Unix timestamp leakage; enforce ISO 8601 only
- [ ] **Pagination** — add cursor pagination to `/api/claimed-state`, price-history, analytics routes
- [ ] **Domain types** — create `types/domain.ts` with `WishlistItem`, `User`, `GiftPool`, `Contribution`
- [ ] **Supabase client** — write `supabase.ts` for Expo with AsyncStorage session persistence

### Advisory (Phase 5)

- [ ] **Push notifications** — Expo push + `expo_push_token` column on `users`
- [ ] **Deep links** — AASA + assetlinks.json; Expo scheme config
- [ ] **Monorepo** — Turborepo setup; extract `lib/permissions`, `lib/themes`, `lib/validators` to shared package
- [ ] **Offline support** — React Query with `persistQueryClient`; optimistic UI for claims

---

## Summary Risk Matrix

| Area | Risk if not addressed | Effort | When |
|------|----------------------|--------|------|
| Response envelope inconsistency | Mobile client breaks on first release | 2 days | Before beta |
| No API versioning | Cannot ship app updates without coordinating web deploys | 1 day | Before beta |
| Google OAuth incompatibility | Users cannot sign in on mobile | 2 days | Before beta |
| Missing CORS headers | Expo web build breaks; Expo Go may break | 2 hours | Before beta |
| Unbounded list responses | OOM crashes on large wishlists | 1 day | Before GA |
| No push notifications | Poor UX for claim events | 3 days | Phase 5 |
| No monorepo | Duplicate logic drift over time | 3 days | Phase 5 |
