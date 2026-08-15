# GiftHint UI/UX Build Plan

10-prompt plan to address conversion gaps, gifter experience issues, and SEO.

---

## Phase 1 — Foundation fixes ✅ COMPLETE

| # | Change | Status |
|---|--------|--------|
| 1 | Fix broken demo CTA (`/list/carlos` → `/list/demo`); remove fabricated stats strip | ✅ Done |
| 2 | ViralCTABar dismiss: permanent localStorage → 7-day expiry; migrate legacy `'true'` value | ✅ Done |
| 3 | Dashboard share widget: fetch `public_username` from DB, show full URL with one-click copy | ✅ Done |
| 4 | Landing page group gifting banner in bento grid with chip social proof | ✅ Done |

---

## Phase 2 — Core UX gaps

| # | Change | Status |
|---|--------|--------|
| 5 | URL-paste add-item fallback — `app/api/save-url/route.ts` + dashboard UI input | ✅ Done |
| 6 | Email magic-link auth as fallback to Google OAuth in `app/signin/page.tsx` | ✅ Done |

---

## Phase 3 — Gifter experience

| # | Change | Status |
|---|--------|--------|
| 7 | Fix stale claim state — reduce `revalidate` to 10 + client-side claim re-fetch on mount in GifterPage | ✅ Done |
| 8 | Price-range filter on gifter page (GifterPage client component) | ✅ Done |

---

## Phase 4 — Discovery & polish

| # | Change | Status |
|---|--------|--------|
| 9 | Dashboard empty state: 3-path onboarding guidance replacing blank slate | ✅ Done |
| 10 | `app/sitemap.ts` — dynamic wishlist sitemap for SEO | ✅ Done |
