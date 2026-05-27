# GiftHint Affiliate Compliance QA Checklist

Use this checklist before every production deploy that touches affiliate, tracking,
or FTC disclosure logic. Check off each item manually in a staging environment.

---

## 1 — Amazon Associates Compliance

| # | Check | Pass |
|---|-------|------|
| 1.1 | Visit `/list/[any-username]` with an Amazon item. Click "Buy on Amazon". Confirm the URL that opens in the new tab contains `tag=gifthint-20` (or your Associates tag). | ☐ |
| 1.2 | In Supabase, insert an item whose `source_url` already contains `tag=someone-else-21`. Reload the gifter page and click the Buy button. Confirm the landing URL contains **only** `tag=gifthint-20`, not the original tag. (No double-tag.) | ☐ |
| 1.3 | Confirm the Amazon URL opens over **HTTPS** even if the `source_url` in DB was saved as `http://`. | ☐ |
| 1.4 | In DevTools → Network, confirm the `/list/[username]` page's HTML source already contains the affiliate URL (i.e. server-side rewritten, not injected by JS). | ☐ |
| 1.5 | Confirm `lib/affiliate.ts` has no `import` in any file with `'use client'` at the top. (Check with `grep -r "affiliate" app/ components/ --include="*.tsx" --include="*.ts"` — should only appear in `app/list/[username]/page.tsx`.) | ☐ |

---

## 2 — Skimlinks Integration

| # | Check | Pass |
|---|-------|------|
| 2.1 | On the gifter page, open DevTools → Sources. Confirm the Skimlinks bundle (`skimlinks.js`) is loaded **only** on `/list/*` routes, **not** on the landing page or any other route. | ☐ |
| 2.2 | Inspect any Amazon `<a>` tag in the DOM. Confirm it has the attribute `data-skimlinks-excluded="true"`. | ☐ |
| 2.3 | Inspect a non-Amazon `<a>` tag (e.g. Etsy). Confirm it does **not** have `data-skimlinks-excluded`. | ☐ |
| 2.4 | In DevTools → Console, type `window.skimlinks_pub_id`. Confirm it returns your publisher ID, not `undefined`. | ☐ |
| 2.5 | Click an Etsy/Walmart/Target Buy button. In Network tab, verify the request passes through `go.skimresources.com` (Skimlinks redirect). | ☐ |
| 2.6 | Confirm `NEXT_PUBLIC_SKIMLINKS_PUBLISHER_ID` is set in Vercel → Settings → Environment Variables → Production. | ☐ |

---

## 3 — Click Tracking

| # | Check | Pass |
|---|-------|------|
| 3.1 | Click any Buy button on the gifter page. In Supabase → Table Editor → `click_events`, confirm a new row appears with the correct `item_id` and `gifter_page_username`. | ☐ |
| 3.2 | Confirm the new `click_events` row has **no** email, IP address, or name stored (only UUIDs + retailer text). | ☐ |
| 3.3 | In DevTools → Network, confirm the `POST /api/track-click` request uses `keepalive: true` (visible in request details). | ☐ |
| 3.4 | Confirm `POST /api/track-click` responds with `{"ok":true}` and HTTP 200, independent of DB insert latency. (Check with DevTools → Network → Response.) | ☐ |
| 3.5 | Test with an Amazon URL: confirm `affiliate_network` in the DB row is `amazon_associates`. | ☐ |
| 3.6 | Test with a non-Amazon URL: confirm `affiliate_network` is `skimlinks` or `unknown`. | ☐ |

---

## 4 — FTC Disclosure

| # | Check | Pass |
|---|-------|------|
| 4.1 | On any `/list/[username]` page, scroll to the bottom. Confirm the GifterFooter affiliate disclosure is **visible without scrolling past it** (i.e. not hidden). | ☐ |
| 4.2 | Confirm the disclosure text explicitly states that GiftHint earns commissions when you buy through links on the page. (FTC requirement: clear and conspicuous.) | ☐ |
| 4.3 | Confirm the GifterFooter is **not dismissible** (no X button, no localStorage hide). | ☐ |
| 4.4 | On mobile (375 px viewport), confirm the footer is still visible and the disclosure text is readable (not truncated or hidden by overflow). | ☐ |
| 4.5 | Visit `/privacy` and `/terms`. Confirm both pages load without 404. Confirm Section 3 of Privacy Policy mentions Skimlinks and Amazon Associates by name. | ☐ |

---

## 5 — Chrome Extension Policy Compliance

| # | Check | Pass |
|---|-------|------|
| 5.1 | In the Chrome extension source code, confirm `lib/affiliate.ts` is **not imported** anywhere. | ☐ |
| 5.2 | Confirm the extension's background script and content scripts do **not** modify the `href` of any link on third-party retailer pages. | ☐ |
| 5.3 | Using the extension on Amazon, add a product to the GiftHint list. Confirm the URL saved to Supabase (`source_url`) is the **clean original** Amazon URL with no affiliate tag added by the extension. | ☐ |
| 5.4 | Confirm the `AMAZON_ASSOCIATES_TAG` env var exists only in `.env.local` and Vercel — it is **never** bundled into the Chrome extension. (Run `grep -r "AMAZON_ASSOCIATES_TAG" extension/` — should return nothing.) | ☐ |

---

## 6 — Environment Variables

| # | Check | Pass |
|---|-------|------|
| 6.1 | Verify `AMAZON_ASSOCIATES_TAG` is set in Vercel → Production environment (not empty). | ☐ |
| 6.2 | Verify `NEXT_PUBLIC_SKIMLINKS_PUBLISHER_ID` is set in Vercel → Production environment. | ☐ |
| 6.3 | Verify `SUPABASE_SERVICE_ROLE_KEY` is set in Vercel → Production (required for track-click route). | ☐ |
| 6.4 | Confirm `SUPABASE_SERVICE_ROLE_KEY` is **not** prefixed with `NEXT_PUBLIC_` (it must never be exposed to the browser). | ☐ |

---

## 7 — Regression: Claim Flow

| # | Check | Pass |
|---|-------|------|
| 7.1 | Click "I'll buy this 🎁" on an unclaimed item. Complete the claim modal. Confirm the card flips to the "✓ Already claimed" state. | ☐ |
| 7.2 | In a second browser tab, reload the gifter page. Confirm the item still shows "✓ Already claimed" (persisted to DB). | ☐ |
| 7.3 | Attempt to claim an already-claimed item via two simultaneous requests (e.g. open the same page in two tabs and click simultaneously). Confirm only one claim succeeds and the second receives a 409. | ☐ |

---

## 8 — Smoke Test: End-to-End Flow

| # | Check | Pass |
|---|-------|------|
| 8.1 | Fresh incognito window → navigate to `gifthint.com/list/[username]`. Page loads without JS errors in Console. | ☐ |
| 8.2 | All gift cards are visible. Filter bar works (Still needed / Under $50 / Group gifts). | ☐ |
| 8.3 | Click a Buy button on an Amazon item → new tab opens at `amazon.com/…?tag=gifthint-20`. | ☐ |
| 8.4 | Click a Buy button on a non-Amazon item → tab opens at the retailer URL (Skimlinks may briefly redirect). | ☐ |
| 8.5 | ViralCTABar is visible at the top of the page and links to the extension or landing page. | ☐ |
| 8.6 | GifterFooter is visible at the bottom with the FTC disclosure. | ☐ |

---

*Last updated: 2026-05-12 | Reviewer: _________________ | Deploy: _________________*
