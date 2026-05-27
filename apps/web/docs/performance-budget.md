# GiftHint — Performance Budget

Target page: **Gifter page** (`/list/[username]/[slug]`)  
Last updated: May 2026

---

## Core Web Vitals Targets

| Metric | Target | What breaks it on GiftHint |
|--------|--------|---------------------------|
| **LCP** (Largest Contentful Paint) | < 2.5 s | First product image not preloaded |
| **INP** (Interaction to Next Paint) | < 200 ms | Claim modal re-render on large lists |
| **CLS** (Cumulative Layout Shift)  | < 0.1   | Product images without explicit dimensions |
| FCP (First Contentful Paint)        | < 1.5 s | Skimlinks script blocking paint |
| TBT (Total Blocking Time)           | < 200 ms | Large `GifterPage` bundle on first load |

---

## JS Bundle Budget

| Chunk | Gzipped target | Notes |
|-------|---------------|-------|
| Initial gifter page JS | < 150 KB | Reduced by lazy-loading `ReminderSignup` and `GifterCoordinationPanel` |
| `GifterCoordinationPanel` chunk | < 15 KB | Loaded only on first expand |
| `ReminderSignup` chunk | < 10 KB | Loaded after LCP |
| Supabase Realtime SDK | < 40 KB | Shared across all lazy chunks |

Measure with:
```bash
ANALYZE=true pnpm build   # next-bundle-analyzer output
```

---

## Top Two Risks

### 1. Product Images → LCP regression

**Why it matters:**  
The first product image is the LCP element on most gifter pages. If it
arrives late or shifts the layout, LCP and CLS both fail.

**Mitigations already applied:**
- `next/image` with `fill` on all product images (`GiftCard.tsx`) — Next.js
  generates optimised WebP/AVIF variants and serves them from `/_next/image`.
- `priority={true}` on the first two cards (above the fold) — injects a
  `<link rel="preload">` in the `<head>` so the image request starts before
  React hydrates.
- `placeholder="blur"` with a surface-coloured SVG data URI — fills the image
  slot immediately, preventing CLS while the real photo loads.
- `sizes` prop tuned to the auto-fill grid (`50vw` on mobile, `33vw` on
  tablet, `220px` max) so Next.js generates appropriately sized variants.

**How to verify:**
```
Lighthouse > Performance > LCP element → should be a product <img>
Lighthouse > Diagnostics > Properly sized images → no warnings
```

---

### 2. Skimlinks Script → FCP/TBT regression

**Why it matters:**  
Skimlinks is a third-party script (~80 KB) that rewrites affiliate links in
the DOM. If it loads synchronously it blocks the main thread and delays FCP.

**Mitigations already applied (`SkimlinksScript.tsx`):**
- `strategy="afterInteractive"` on the main bundle — Next.js defers the
  download until after the page is interactive.
- A tiny `beforeInteractive` inline script sets `window.skimlinks_pub_id`
  so the bundle initialises correctly when it does load.
- Amazon links carry `data-skimlinks-excluded="true"` to prevent double-
  monetisation and Associates ToS violations.

**How to verify:**
```
Lighthouse > Performance > Reduce JavaScript execution time
→ skimlinks.js should NOT appear in the critical path waterfall
```

---

## How to Measure

### Vercel Analytics (always-on)
Vercel captures real-user Core Web Vitals automatically once Analytics is
enabled in the dashboard. View per-page breakdowns at:
`vercel.com → [project] → Analytics → Web Vitals → Filter: /list/**`

Key things to watch:
- LCP p75 > 2.5 s → investigate image preloading or ISR cache miss
- CLS > 0.1 → product image dimensions or OccasionHero layout shift
- INP spikes → GiftCard claim form re-render or Realtime reconnect flood

### Lighthouse CI (CI gate)

Add to `.github/workflows/lighthouse.yml`:

```yaml
name: Lighthouse CI
on: [push]
jobs:
  lhci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm install -g @lhci/cli
      - run: pnpm build && pnpm start &
      - run: lhci autorun
```

`.lighthouserc.json`:
```json
{
  "ci": {
    "collect": {
      "url": ["http://localhost:3000/list/demo/birthday-2026"],
      "numberOfRuns": 3
    },
    "assert": {
      "preset": "lighthouse:recommended",
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.85 }],
        "largest-contentful-paint": ["error", { "maxNumericValue": 2500 }],
        "cumulative-layout-shift":  ["error", { "maxNumericValue": 0.1 }],
        "total-blocking-time":      ["warn",  { "maxNumericValue": 200 }]
      }
    }
  }
}
```

### Local spot-check

```bash
# Build and start prod server
pnpm build && pnpm start

# Run Lighthouse on a real gifter page
npx lighthouse http://localhost:3000/list/emma/birthday-2026 \
  --output html --output-path lh-report.html --view
```

---

## ISR Cache Behaviour

Gifter pages use `export const revalidate = 60` (60-second stale-while-
revalidate). This means:

- First visitor after the cache expires triggers a background regeneration.
- Subsequent visitors within 60 s get the cached (fast) response.
- After a claim is made, the page may show the pre-claim state for up to 60 s
  for new visitors — this is acceptable; realtime subscribers see the live
  state immediately via the WebSocket hook.

To force an immediate cache purge after a high-traffic event:
```bash
curl -X POST "https://gifthint.io/api/revalidate?path=/list/emma/birthday-2026&secret=$REVALIDATE_SECRET"
```
(Requires a `/api/revalidate` route using `revalidatePath()` — future work.)

---

## Checklist Before Each Deploy

- [ ] `pnpm build` completes with no size warnings
- [ ] `next-bundle-analyzer` shows no unexpected > 50 KB first-load chunks
- [ ] Lighthouse score ≥ 85 on the gifter page
- [ ] LCP < 2.5 s on a throttled 4G Lighthouse run
- [ ] No CLS > 0.1 in Vercel Analytics p75 for the past 7 days
- [ ] Skimlinks does not appear in the critical-path waterfall
- [ ] First two product images show `rel="preload"` in page `<head>`
