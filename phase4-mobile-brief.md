# GiftHint — Phase 4 Mobile App Architecture Brief

**Status:** Pre-development  
**Target:** iOS (primary) + Android  
**Stack:** React Native + Expo (managed workflow)  
**Backend:** Existing Supabase — zero new infrastructure  
**Date:** 2026-05-18

---

## 1. Why a Mobile App — Data-Driven Justification

### 1.1 Traffic Signal

> Fill in from Vercel Analytics before presenting to stakeholders.

| Metric | Value | Notes |
|--------|-------|-------|
| Mobile traffic % (overall) | `[X]%` | Vercel Analytics → Devices |
| Mobile traffic % on gifter pages (`/list/*`) | `[X]%` | Gifters are never desktop-only |
| Mobile traffic % on `/save` (save flow) | `[X]%` | Bookmarklet requires desktop |
| Bounce rate on mobile `/save` vs desktop | `[X]% vs [X]%` | Expect 2–3× higher on mobile |
| iOS vs Android split | `[X]% vs [X]%` | Informs release priority |

**Hypothesis:** 60–70% of gifter-page traffic is mobile. Wishers visiting from
a friend's shared link are overwhelmingly on phone. The add-to-wishlist flow
(bookmarklet + Chrome extension) is structurally desktop-only — creating a
permanent acquisition gap on the largest device segment.

### 1.2 iOS Share Sheet Signal

The `/save` page already accepts an `?source=ios_share` query parameter.
When this param is present the server performs a supplemental OG scrape to
fill gaps left by the restricted WKWebView context.

> Fill in from `/save` route analytics before sprint kick-off.

| Metric | Value |
|--------|-------|
| `/save` requests with `source=ios_share` per day | `[X]` |
| Completion rate (item saved vs page bounced) | `[X]%` |
| Drop-off point for mobile `/save` users | `[Step X of Y]` |
| Avg items saved per mobile session | `[X]` |

**Reading:** Any non-trivial `source=ios_share` volume proves users are *already
trying* to use GiftHint on iOS via Shortcuts — a high-friction workaround.
A native Share Extension with a single tap replaces the entire Shortcuts setup.

### 1.3 Save Channel Split

| Save method | Platform | User friction | Estimated use |
|-------------|----------|---------------|---------------|
| Chrome extension (popup) | Desktop Chrome | Low | `[X]%` |
| Bookmarklet | Desktop any browser | Medium | `[X]%` |
| iOS Shortcuts + `/save?source=ios_share` | Mobile Safari | Very high | `[X]%` |
| Direct URL paste in dashboard | Any | High | `[X]%` |

**Key insight:** Mobile users cannot install the Chrome extension. The
App Store does not distribute Chrome extensions. Safari on iOS does not
support Manifest V3 extensions in the same way. The Shortcuts workaround
requires users to set up a custom shortcut from a link — a step that loses
95%+ of casual users. A native Share Extension collapses this to a single
tap from any app.

### 1.4 The Strategic Case

```
Current save funnel on iOS:
  User sees product in Safari / Instagram / TikTok
    → Opens GiftHint app (separate step)
    → Pastes URL manually
    → Fills in title / price (often blank on mobile)
    → Saves

Native Share Extension funnel:
  User sees product in Safari / Instagram / TikTok
    → Taps Share → GiftHint
    → OG data prefilled by server scrape
    → One-tap save

Estimated conversion uplift: 8–12× (industry benchmark for
share-sheet vs manual save on e-commerce wishlist apps)
```

Beyond save mechanics, the mobile app closes the loop on the full gifter
journey: a friend receives a shareable link via iMessage, opens it in Safari,
and immediately sees a native "Open in GiftHint" banner — entering a chip-in
flow with Apple Pay in two taps rather than a web checkout with card entry.

---

## 2. Technology Decision: React Native + Expo (Managed Workflow)

### 2.1 Decision

**React Native with Expo Managed Workflow** — not bare React Native, not a
web wrapper (Capacitor/Ionic).

### 2.2 Justification

#### Why React Native over Flutter

- Team already fluent in TypeScript and React — zero new language ramp-up
- Share types, validators, and business logic from the web codebase
- Same Supabase JS client (`@supabase/supabase-js`) works in React Native
- Same Stripe React Native SDK surface area as the web SDK
- Extensive testing infrastructure is Jest-based — React Native tests use Jest too

#### Why Expo Managed over bare React Native

| Feature | Expo Managed | Bare RN |
|---------|-------------|---------|
| OTA updates (no App Store review) | ✅ EAS Update | ❌ Requires full submission |
| CI/CD + code signing | ✅ EAS Build | Manual Fastlane setup |
| Share Extension (iOS) | ✅ `expo-share-intent` | Custom native module |
| Push notifications | ✅ `expo-notifications` | Manual APNS/FCM setup |
| In-app purchases (future) | ✅ `expo-in-app-purchases` | Manual StoreKit |
| Ejection possible if needed | ✅ `expo prebuild` | Already ejected |

Expo Managed is the right default at this scale. Eject to bare when (and only
when) a native capability is unavailable in the Expo SDK — which as of SDK 52
covers everything GiftHint Phase 4 needs.

### 2.3 Key Package Selections

#### Navigation — Expo Router

```
Same mental model as Next.js App Router.
File-based routing. Deep link support built-in. Type-safe routes.
```

```typescript
// apps/mobile/app/(wisher)/wishlist/[id].tsx
// → gifthint://wishlist/[id]
// → https://gifthint.io/wishlist/[id]  (Universal Link)
```

The team already knows App Router conventions from the web app. Expo Router
uses the same `app/` directory, `(group)/` route groups, and `[param]` dynamic
segments. Onboarding time for the routing layer is near zero.

#### Authentication — Expo AuthSession

Google OAuth via `chrome.identity` (used by the Chrome extension) is
browser-extension-only. React Native uses `expo-auth-session` with Supabase's
PKCE flow:

```typescript
// apps/mobile/lib/auth.ts
import * as WebBrowser    from 'expo-web-browser'
import { makeRedirectUri } from 'expo-auth-session'
import { supabase }        from '@/lib/supabase'

WebBrowser.maybeCompleteAuthSession()

export async function signInWithGoogle(): Promise<void> {
  const redirectTo = makeRedirectUri({ scheme: 'gifthint' })

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  })
  if (error || !data.url) throw error

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)
  if (result.type === 'success') {
    await supabase.auth.exchangeCodeForSession(result.url)
  }
}
```

The web's `/api/auth/exchange` route stays unchanged — it serves the Chrome
extension exclusively. Mobile auth never touches that endpoint.

#### Push Notifications — Expo Notifications

Replaces email alerts for price drops, claim events, and group gift milestones.
Industry open rates: push ~20-30% vs email ~22% — similar open rate, but push
arrives in under 5 seconds vs email latency of minutes.

```typescript
// apps/mobile/lib/push.ts
import * as Notifications from 'expo-notifications'
import Constants           from 'expo-constants'

export async function registerPushToken(userId: string): Promise<void> {
  const { status } = await Notifications.requestPermissionsAsync()
  if (status !== 'granted') return

  const token = (await Notifications.getExpoPushTokenAsync({
    projectId: Constants.expoConfig?.extra?.eas?.projectId,
  })).data

  // Store token server-side — see /api/v1/push-tokens
  await fetch('/api/v1/push-tokens', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body:    JSON.stringify({ token }),
  })
}
```

Server-side, add `lib/push.ts` that calls the Expo Push API whenever
`sendPriceDropAlertEmail()` currently fires — deliver to both channels.

#### CI/CD — EAS Build + EAS Update

```
EAS Build:   Manages code signing, provisioning profiles, and binary builds
             in Expo's cloud. No macOS CI runner required.
EAS Update:  OTA JS bundle delivery — fix bugs without App Store review.
             Restrictions: JS only, no native code changes.
             Target: < 24-hour patch turnaround for critical bugs.
```

#### Backend — Existing Supabase (no new infrastructure)

The same Supabase project, same tables, same RLS policies. Mobile app
connects via `@supabase/supabase-js` with AsyncStorage session persistence.
No new databases, no new auth providers, no new hosting.

```typescript
// apps/mobile/lib/supabase.ts
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@gifthint/shared/types/database'

export const supabase = createClient<Database>(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage:            AsyncStorage,
      autoRefreshToken:   true,
      persistSession:     true,
      detectSessionInUrl: false,  // MUST be false for React Native
    },
  },
)
```

---

## 3. Feature Set — Phase 4 Mobile MVP

MVP = the smallest set of features that provides clear value over the mobile
web experience AND differentiates from the web app.

### 3.1 Wisher App Features

#### 3.1.1 Share Extension — Save from Any App ⭐ Core differentiator

Save products from Safari, Instagram, TikTok Shop, Amazon, Pinterest, and
any other iOS app with a share sheet — in one tap.

**Implementation:** iOS Share Extension via `expo-share-intent`. The extension
receives the shared URL, passes it to the host app via App Group shared
storage, triggers a foreground open, and the app scrapes OG data server-side
via `POST /api/v1/save`.

```
User flow:
  Product page in Instagram → Share → GiftHint
    → Modal: product image, title, price prefilled
    → Choose wishlist (default pre-selected)
    → Tap "Save" → item added, modal dismisses
    Total time: ~3 seconds
```

```typescript
// Server-side save — apps/mobile processes, web API handles
// POST /api/v1/save
// Body: { url: string, wishlistId: string }
// Auth: Authorization: Bearer <supabase_jwt>
//
// Server:
//   1. Scrapes OG data via lib/scrape-og.ts
//   2. Rewrites affiliate URL via lib/affiliate.ts (server-side, policy-safe)
//   3. Inserts wishlist_items row
//   4. Returns the created item
```

Android: handled via Intents — Expo Router's deep link + intent filter on
`gifthint://save?url=<encoded>` receives shares from Chrome for Android and
Samsung Browser.

#### 3.1.2 Wishlist Management

- View all wishlists with item counts and occasion date countdown
- Browse items in a list (virtualized, handles 200+ items without jank)
- Drag-to-reorder items (`react-native-draggable-flatlist`)
- Edit item: title, price, hint, DNA tags, image
- Delete item (swipe left → confirm)
- Move item to another wishlist
- Create new wishlist (occasion picker, date picker)
- Set default wishlist

**No new API needed.** All operations use existing:
- `GET /api/v1/wishlists` (new v1 alias)
- `POST /api/v1/wishlists` (new v1 alias)
- `PATCH /api/v1/items/[id]` (new v1 alias)
- `DELETE /api/v1/items/[id]` (new v1 alias)

#### 3.1.3 Price Drop Push Notifications

Replace email price drop alerts with push notifications. Higher immediacy,
higher engagement, no inbox competition.

| Alert type | Current | Phase 4 |
|-----------|---------|---------|
| Price drop ≥ threshold | Email via Resend | Push + email (user preference) |
| Item claimed | Realtime web only | Push notification |
| Group gift pool funded | Email via Resend | Push + email |

The existing cron job `app/api/cron/send-price-alerts/route.ts` fires
`sendPriceDropAlertEmail()`. Extend it to call the new `lib/push.ts` module:

```typescript
// lib/push.ts — new server-side push delivery module
import type { ExpoPushMessage } from 'expo-server-sdk'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

export async function sendPriceDrop(
  expoPushToken: string,
  itemTitle:     string,
  oldPrice:      number,
  newPrice:      number,
): Promise<void> {
  const message: ExpoPushMessage = {
    to:    expoPushToken,
    sound: 'default',
    title: '📉 Price drop on your list',
    body:  `${itemTitle} dropped from £${oldPrice} to £${newPrice}`,
    data:  { type: 'price_drop' },
  }
  await fetch(EXPO_PUSH_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(message),
  })
}
```

DB change: add `expo_push_token TEXT` column to `users` table.

```sql
-- supabase/migrations/20260601_expo_push_tokens.sql
ALTER TABLE users ADD COLUMN expo_push_token TEXT;
CREATE INDEX idx_users_push_token ON users (expo_push_token) WHERE expo_push_token IS NOT NULL;
```

#### 3.1.4 Native Share Sheet for Gifter Page

Wisher shares their list URL via iOS Share Sheet — iMessage, WhatsApp,
Instagram DMs, AirDrop. Triggers Universal Link opening on recipients' phones.

```typescript
import { Share } from 'react-native'

await Share.share({
  url:     `https://gifthint.io/list/${username}/${slug}`,
  message: `Here's my gift wishlist 🎁`,
})
```

#### 3.1.5 Group Gift Management

- View all group gift pools the user has created
- Track total collected vs target, contributor names (non-anonymous)
- Share pool link (same Share Sheet)
- Mark item as purchased when funded
- Request refund (admin flow — same as web)

---

### 3.2 Gifter App Features (same app, gifter mode)

The app detects whether the current user owns the viewed wishlist. If they
don't, it renders in gifter mode. No separate app binary.

#### 3.2.1 Browse a Friend's List — Mobile-Optimised

- Full-screen product card stack (swipe through items)
- Filter: All / Needed / Under £50 / Group Gifts
- Item detail sheet: larger image, full hint, DNA tags
- Realtime claim state via Supabase channel subscription

The web's `useRealtimeClaims` hook logic is replicated in React Native using
`@supabase/supabase-js` channel subscriptions — the same Supabase Realtime
infrastructure, no server changes.

#### 3.2.2 Apple Pay / Google Pay via Stripe Payment Sheet ⭐ Core differentiator

The web group-gift contribution flow requires card entry (Stripe Elements in
a web view). Native replaces this with Stripe's Payment Sheet, which:

- Presents Apple Pay / Google Pay as the primary option
- Falls back to card entry if wallet is unavailable
- Never requires the user to type a card number on mobile

```typescript
// apps/mobile/screens/Contribute.tsx
import { useStripe } from '@stripe/stripe-react-native'

const { initPaymentSheet, presentPaymentSheet } = useStripe()

async function contribute(poolId: string, amount: number) {
  // 1. Create PaymentIntent on server (existing endpoint)
  const { clientSecret, contributionId } = await apiFetch<{
    clientSecret:   string
    contributionId: string
  }>('/api/v1/group-gift/contribute', {
    method: 'POST',
    body:   JSON.stringify({ poolId, amount, contributorName, contributorEmail }),
  })

  // 2. Init Stripe Payment Sheet with Apple Pay / Google Pay
  await initPaymentSheet({
    paymentIntentClientSecret: clientSecret,
    merchantDisplayName:       'GiftHint',
    applePay:  { merchantCountryCode: 'GB' },
    googlePay: { merchantCountryCode: 'GB', testEnv: __DEV__ },
    style:     'alwaysDark',
  })

  // 3. Present — user taps Pay with Apple Pay
  const { error } = await presentPaymentSheet()
  if (error) throw new Error(error.message)
  // Stripe webhook confirms, pool updates — realtime arrives in < 2 s
}
```

**No server changes.** The existing `POST /api/group-gift/contribute` endpoint
already creates a `PaymentIntent` and returns a `clientSecret`. The native SDK
consumes this identically to Stripe Elements.

#### 3.2.3 Claim Items with One Tap

```typescript
// Existing POST /api/v1/claim — same request body as web
await apiFetch('/api/v1/claim', {
  method: 'POST',
  body:   JSON.stringify({ itemId, claimedBy: displayName, anonymous: false }),
})
```

Real-time update arrives to all other viewers via Supabase channel — same as
web. No changes to the claim API.

---

## 4. API Versioning Plan

### 4.1 Strategy: Route Prefix Versioning

All mobile-client routes are prefixed `/api/v1/*`. Existing web routes at
`/api/*` remain untouched — the web app continues to use them directly.

**Why this matters:** App Store apps cannot be force-updated. Once GiftHint
Mobile v1.0 is in the wild, `/api/v1/claim` must remain stable indefinitely.
Breaking changes go to `/api/v2/*`, which ships with a new app version.
The web app is always at the current version — no versioning needed there.

### 4.2 Implementation Pattern

Thin re-export wrapper — one source of truth, no logic duplication:

```
apps/web/app/
├── api/
│   ├── claim/route.ts               ← web app calls this directly
│   └── v1/
│       ├── claim/route.ts           ← re-exports from ../claim/route.ts
│       ├── wishlists/route.ts
│       ├── items/[id]/route.ts
│       ├── group-gift/
│       │   └── contribute/route.ts
│       ├── save/route.ts            ← NEW: mobile-only endpoint
│       └── push-tokens/route.ts    ← NEW: mobile-only endpoint
```

```typescript
// app/api/v1/claim/route.ts — zero logic, just re-export
export { POST } from '@/app/api/claim/route'
```

When the mobile app needs a v2 change to `/claim` (e.g. adding a `quantity`
field), create `app/api/v2/claim/route.ts` with the new logic. The `v1` route
stays frozen. No migration required for app users on old versions.

### 4.3 Mobile-Specific Endpoints

These endpoints do not exist in the current web API — they are new and mobile-only.

#### `POST /api/v1/save` — Server-side save from Share Extension

```typescript
// Request
{
  url:        string  // raw URL from share sheet
  wishlistId: string  // target wishlist UUID
}
// Auth: Authorization: Bearer <supabase_jwt>

// Server:
//   1. Authenticate JWT → get userId
//   2. scrapeOG(url) → { title, image, price, currency }
//   3. rewriteAffiliateUrl(url) → { source_url, affiliate_url, retailer }
//   4. INSERT INTO wishlist_items → return created item
//
// Response (201):
// { data: { item: WishlistItem }, error: null }
```

**Why it can't reuse the existing bookmarklet/save flow:** The web `app/save/page.tsx`
is a Server Component — it requires a browser rendering context and is not
callable from an API client. A clean `POST /api/v1/save` endpoint wraps the
same `scrapeOG` + `affiliate` logic in a route handler.

#### `POST /api/v1/push-tokens` — Register / update Expo push token

```typescript
// Request
{ token: string }  // ExponentPushToken[...]
// Auth: Authorization: Bearer <supabase_jwt>

// Server:
//   1. Authenticate JWT → get userId
//   2. UPDATE users SET expo_push_token = $token WHERE id = $userId
//   3. Return 200 { data: { ok: true }, error: null }
```

#### `DELETE /api/v1/push-tokens` — Deregister on app uninstall / sign-out

```typescript
// No body required
// Auth: Authorization: Bearer <supabase_jwt>
// UPDATE users SET expo_push_token = NULL WHERE id = $userId
```

### 4.4 Authentication: JWT Bearer Token

Web app: Supabase session stored in cookies (Next.js `@supabase/ssr`).  
Mobile app: Supabase session stored in AsyncStorage, sent as `Authorization: Bearer <access_token>`.

The existing `PATCH /api/items/[id]` and `DELETE /api/items/[id]` routes
already accept this pattern — they call `supabase.auth.getUser(token)` from
the `Authorization` header. All v1 routes will use this same pattern. No
session cookies — those are a web-only construct.

```typescript
// apps/mobile/lib/api.ts — shared fetch wrapper
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://gifthint.io'

export async function apiFetch<T>(
  path:  string,
  init?: RequestInit,
): Promise<{ data: T; error: null } | { data: null; error: { message: string; code: string } }> {
  const { data: { session } } = await supabase.auth.getSession()

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type':  'application/json',
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...init?.headers,
    },
  })

  return res.json()
}
```

---

## 5. Monorepo Structure — Phase 4

### 5.1 Target Structure

```
gifthint/                            ← monorepo root
├── package.json                     ← pnpm workspace config
├── turbo.json                       ← Turborepo pipeline
├── apps/
│   ├── web/                         ← current Next.js app (moved here)
│   │   ├── app/
│   │   ├── lib/                     ← web-only server libs
│   │   ├── components/
│   │   └── package.json
│   └── mobile/                      ← new Expo app
│       ├── app/                     ← Expo Router (same convention as web)
│       │   ├── (auth)/
│       │   │   ├── sign-in.tsx
│       │   │   └── sign-up.tsx
│       │   ├── (wisher)/
│       │   │   ├── _layout.tsx
│       │   │   ├── index.tsx        ← dashboard
│       │   │   ├── wishlist/
│       │   │   │   └── [id].tsx
│       │   │   └── item/
│       │   │       └── [id].tsx
│       │   ├── (gifter)/
│       │   │   ├── _layout.tsx
│       │   │   └── list/
│       │   │       └── [username]/
│       │   │           └── [slug].tsx
│       │   └── _layout.tsx          ← root layout with providers
│       ├── components/
│       ├── lib/
│       │   ├── supabase.ts          ← mobile Supabase client
│       │   ├── api.ts               ← apiFetch() wrapper
│       │   ├── auth.ts              ← Expo AuthSession
│       │   ├── push.ts              ← push token registration
│       │   └── stripe.ts            ← Stripe Payment Sheet init
│       ├── app.json                 ← Expo config
│       └── package.json
└── packages/
    └── shared/                      ← extracted shared modules
        ├── src/
        │   ├── types/
        │   │   ├── wishlist.ts      ← WishlistItem, WishUser, DbWishlist
        │   │   ├── pool.ts          ← GiftPool, Contribution
        │   │   ├── user.ts          ← User, PermissionsUser
        │   │   └── index.ts
        │   ├── lib/
        │   │   ├── permissions.ts   ← isPro(), hasFeature() — pure functions
        │   │   ├── themes.ts        ← theme tokens, ThemeKey — pure functions
        │   │   ├── dna-tags.ts      ← tag library, validation — pure functions
        │   │   ├── validators.ts    ← request body schemas — pure functions
        │   │   └── time.ts          ← date formatting — pure functions
        │   └── index.ts
        └── package.json             ← name: @gifthint/shared
```

### 5.2 Extraction Migration Plan

**Phase 4 launch (extract before writing any mobile code):**

| Module | Current location | Destination | Blocker? |
|--------|-----------------|-------------|---------|
| `types/wishlist.ts` | `apps/web/types/` | `packages/shared/src/types/` | ✅ Zero deps |
| `lib/permissions.ts` | `apps/web/lib/` | `packages/shared/src/lib/` | ✅ Zero deps |
| `lib/dna-tags.ts` | `apps/web/lib/` | `packages/shared/src/lib/` | ✅ Zero deps |
| `lib/validators.ts` | `apps/web/lib/` | `packages/shared/src/lib/` | ✅ Zero deps |
| `lib/time.ts` | `apps/web/lib/` | `packages/shared/src/lib/` | ✅ Zero deps |

**Phase 5 (after mobile launches, when patterns are clear):**

| Module | Current location | Notes |
|--------|-----------------|-------|
| `lib/themes.ts` | `apps/web/lib/` | CSS vars are web-only; extract token definitions, keep `toCSSVars` web-side |
| `lib/affiliate.ts` | `apps/web/lib/` | **Server-only.** Must NOT move to shared — Chrome Web Store policy. Keep in web. |
| `lib/referral.ts` | `apps/web/lib/` | Server-only (uses `createServerClient`). Keep in web. |

### 5.3 Turborepo Pipeline

```json
// turbo.json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "lint": {}
  }
}
```

```json
// package.json (root)
{
  "name": "gifthint",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev:web":    "turbo run dev --filter=web",
    "dev:mobile": "turbo run dev --filter=mobile",
    "build":      "turbo run build",
    "test":       "turbo run test",
    "typecheck":  "turbo run typecheck"
  },
  "devDependencies": {
    "turbo": "^2.0.0"
  }
}
```

### 5.4 `@gifthint/shared` Package

```typescript
// packages/shared/src/index.ts
export * from './types'
export * from './lib/permissions'
export * from './lib/dna-tags'
export * from './lib/validators'
export * from './lib/time'
```

```json
// packages/shared/package.json
{
  "name": "@gifthint/shared",
  "version": "1.0.0",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./types": "./src/types/index.ts"
  }
}
```

Both apps import from `@gifthint/shared`:

```typescript
// apps/web/lib/permissions.ts — after migration
export { isPro, hasFeature } from '@gifthint/shared'

// apps/mobile/lib/permissions.ts
export { isPro, hasFeature } from '@gifthint/shared'
```

---

## 6. Phase 4 Kickoff Prompt

Copy-paste this as the first message in a new Claude Code session when
starting Phase 4. It provides complete context without re-reading every
prior file.

---

```
You are starting Phase 4 of GiftHint — a React Native + Expo mobile app.
Here is the full architecture context from Phases 1-3.

━━━ PRODUCT CONTEXT ━━━

GiftHint is a wishlist platform. Wishers save items from any retailer and
share a public gifter page. Gifters claim items, contribute to group gifts,
and pay via Stripe. The web app is live at https://gifthint.io.

Phase 1: Core wishlist + gifter page + Chrome extension (bookmarklet save)
Phase 2: Group gift pools + Stripe PaymentIntents + price drop email alerts
Phase 3: Stripe Pro subscription ($4.99/month) + 5 premium themes + referral
         unlock system (3 referrals → themes, 5 referrals → priority support)

━━━ TECH STACK ━━━

Backend (existing, shared with mobile):
  Database:     Supabase (Postgres + RLS + Realtime)
  Auth:         Supabase Auth (Google OAuth) — Chrome extension uses
                /api/auth/exchange; mobile will use Expo AuthSession
  Email:        Resend
  Payments:     Stripe (group-gift PaymentIntents + Pro subscription billing)
  Rate limiting: Upstash Redis (sliding-window)
  Media:        No storage yet — image URLs are external
  Hosting:      Vercel (web) + EAS Build (mobile, to set up)

Web app (Next.js 14, App Router):
  Repo root:   /Users/carlos/Downloads/gifthint-web/
  Key libs:
    lib/api-response.ts    — standardised { data, error, meta } responses
    lib/validators.ts      — request body schemas (Zod-compatible)
    lib/permissions.ts     — isPro(), hasFeature() — pure functions
    lib/themes.ts          — 6 themes (default, midnight, cloud, forest, rose, slate)
    lib/dna-tags.ts        — DNA tag library + validation
    lib/affiliate.ts       — SERVER-ONLY affiliate URL rewriting (Chrome policy)
    lib/supabase-server.ts — service-role Supabase client (server only)
    lib/rate-limit.ts      — Upstash Redis rateLimit() helper
    lib/scrape-og.ts       — OG metadata scraper (zero deps, 64KB limit)
    types/wishlist.ts      — WishlistItem, WishUser, FilterKey types

━━━ DATABASE SCHEMA (key tables) ━━━

users:            id, email, public_username, display_name, avatar_url,
                  google_id, referral_code, referral_count,
                  subscription_status ('free'|'pro'|'cancelled'),
                  subscription_period_end, stripe_customer_id,
                  premium_themes_enabled, priority_support_enabled,
                  custom_username_enabled, premium_tier ('free'|'plus'|'pro'),
                  expo_push_token (ADD THIS MIGRATION FIRST)

wishlist_items:   id, user_id, wishlist_id, title, price, currency,
                  image_url, source_url, original_url, affiliate_url,
                  retailer, hint, dna_tags[], is_claimed, claimed_by,
                  claimed_at, claimed_anonymous, is_group_gift,
                  price_alert_enabled, price_alert_threshold,
                  last_checked_at, lowest_price, sort_order, created_at

wishlists:        id, user_id, title, occasion, occasion_date, slug,
                  is_default, is_public, theme ('default'|'midnight'|etc.)

gift_pools:       id, item_id, target_amount, collected_amount,
                  status ('open'|'funded'|'closed'|'refunded'), closes_at

gift_contributions: id, pool_id, contributor_name, contributor_email,
                    amount, stripe_payment_intent_id, stripe_payment_status,
                    anonymous

click_events:     id, item_id, wisher_user_id, retailer, affiliate_network,
                  gifter_page_username, clicked_at

referral_events:  id, referrer_id, type, metadata (JSONB for UTM params)

━━━ API LAYER ━━━

All mobile-client calls use /api/v1/* routes. These are thin re-exports of
the existing /api/* handlers with frozen contracts. The web app continues
calling /api/* directly.

Mobile-specific new endpoints (create these first):
  POST /api/v1/save          — scrape OG + insert item (replaces bookmarklet)
  POST /api/v1/push-tokens   — register Expo push token
  DELETE /api/v1/push-tokens — deregister on sign-out

Auth: JWT Bearer token in Authorization header (no cookies in React Native).
All existing routes that read auth from Authorization header work immediately.

Response format: { data: T, error: null } | { data: null, error: { message, code } }
Use lib/api-response.ts helpers: ok(), created(), badRequest(), etc.

━━━ MOBILE APP LOCATION ━━━

Create the Expo app at:   apps/mobile/
Shared package at:        packages/shared/

First step: set up the monorepo structure (pnpm workspaces + Turborepo).
Extract these pure-function modules to packages/shared BEFORE writing any
mobile code:
  1. types/wishlist.ts → packages/shared/src/types/wishlist.ts
  2. lib/permissions.ts → packages/shared/src/lib/permissions.ts
  3. lib/dna-tags.ts → packages/shared/src/lib/dna-tags.ts
  4. lib/validators.ts → packages/shared/src/lib/validators.ts
  5. lib/time.ts → packages/shared/src/lib/time.ts

━━━ MOBILE MVP FEATURE PRIORITY ━━━

Sprint 1 (Weeks 23-24): Foundation
  - Monorepo setup (pnpm + Turborepo)
  - Expo app scaffold with Expo Router
  - Supabase client (AsyncStorage, no cookies)
  - Google OAuth via Expo AuthSession
  - Migration: ADD COLUMN expo_push_token TEXT to users
  - POST /api/v1/save + POST /api/v1/push-tokens

Sprint 2 (Weeks 25-26): Wisher core
  - Dashboard: list all wishlists with item counts
  - Wishlist detail: virtualized item list
  - Item edit: title, price, hint, DNA tag picker
  - Share Extension (iOS): expo-share-intent
  - Push notification permission + token registration

Sprint 3 (Weeks 27-28): Gifter flow
  - Gifter page: browse a friend's wishlist (mobile-optimised card view)
  - Realtime claim state via Supabase channel subscription
  - One-tap item claim
  - Group gift contribution via Stripe Payment Sheet (Apple Pay / Google Pay)

Sprint 4 (Weeks 29-30): Polish + launch
  - Price drop push notifications (extend cron to call lib/push.ts)
  - Universal Links (apple-app-site-association)
  - EAS Build CI/CD
  - TestFlight beta → App Store submission

━━━ CONSTRAINTS ━━━

1. lib/affiliate.ts is SERVER-ONLY. Never import it in the mobile app or
   packages/shared. Chrome Web Store policy prohibits extension-side
   affiliate rewriting; the same principle applies to any client-side code.
   All affiliate URL rewriting must happen in /api/v1/save on the server.

2. /api/auth/exchange is Chrome extension only. Never call it from mobile.
   Mobile auth = Expo AuthSession + supabase.auth.signInWithOAuth.

3. All API responses must use the { data, error, meta } envelope from
   lib/api-response.ts. The mobile apiFetch() wrapper expects this shape.

4. RLS is enabled on all Supabase tables. The mobile Supabase client uses
   the anon key + user JWT — it respects the same RLS policies as the web.
   Never use the service role key in the mobile app.

5. Expo push tokens are Expo-specific strings (ExponentPushToken[...]). 
   They are NOT APNS or FCM tokens. Use the Expo Push API on the server,
   not APNS/FCM directly. Install expo-server-sdk in the web app.

━━━ FIRST ACTION ━━━

Start with: "Set up the monorepo. Move the existing Next.js app to apps/web/,
create the pnpm workspace config, add Turborepo, initialise the packages/shared
package, and extract the five pure-function modules listed above. Then scaffold
the Expo app at apps/mobile/ with Expo Router, Supabase client, and Google OAuth."
```

---

## Appendix A — Dependency Manifest (mobile app)

```json
{
  "dependencies": {
    "expo":                           "~52.0.0",
    "expo-router":                    "~4.0.0",
    "expo-auth-session":              "~6.0.0",
    "expo-web-browser":               "~14.0.0",
    "expo-notifications":             "~0.29.0",
    "expo-share-intent":              "^2.0.0",
    "expo-secure-store":              "~14.0.0",
    "@react-native-async-storage/async-storage": "^2.0.0",
    "@supabase/supabase-js":          "^2.45.0",
    "@stripe/stripe-react-native":    "^0.38.0",
    "react-native-draggable-flatlist": "^4.0.1",
    "@gifthint/shared":               "workspace:*"
  },
  "devDependencies": {
    "@types/react":          "~18.3.0",
    "@types/react-native":   "^0.73.0",
    "typescript":            "^5.3.0",
    "jest":                  "^29.0.0",
    "jest-expo":             "~52.0.0"
  }
}
```

## Appendix B — Environment Variables (mobile)

```bash
# apps/mobile/.env
EXPO_PUBLIC_API_URL=https://gifthint.io
EXPO_PUBLIC_SUPABASE_URL=               # same as NEXT_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY=          # same as NEXT_PUBLIC_SUPABASE_ANON_KEY
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=     # same as NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
```

Note: `EXPO_PUBLIC_*` is Expo's equivalent of Next.js's `NEXT_PUBLIC_*`. These
values are inlined at build time and visible in the app bundle — never put
secrets here. All secrets stay server-side.

## Appendix C — Blockers from Mobile Readiness Audit

From `mobile-readiness.md` (completed 2026-05-18):

| Blocker | Fix | Status |
|---------|-----|--------|
| Response envelope inconsistency | `lib/api-response.ts` created | ✅ Infrastructure ready |
| No API versioning | Create `/api/v1/*` re-exports | 🔲 Sprint 1 |
| Google OAuth incompatible with mobile | Expo AuthSession | 🔲 Sprint 1 |
| No CORS headers | Extend `middleware.ts` | 🔲 Sprint 1 |
| No Expo push token column | `ALTER TABLE users ADD COLUMN expo_push_token` | 🔲 Sprint 1 |
| `lib/affiliate.ts` must stay server-side | `/api/v1/save` wraps it | 🔲 Sprint 1 |
