# GiftHint Cross-Browser QA Checklist

Manual test matrix for the GiftHint bookmarklet, iOS Share Sheet, and browser
extension across all supported platforms.

Run this checklist before every store submission and after any change to:
- `extension/` source files
- `app/save/page.tsx` or `app/save/SaveUI.tsx`
- `lib/scrape-og.ts`
- `lib/bookmarklet-minifier.ts`

---

## Legend

| Symbol | Meaning               |
|--------|-----------------------|
| □      | Not yet tested        |
| ✓      | Passed                |
| ✗      | Failed (file a bug)   |
| N/A    | Not applicable        |

Fill in **Tester**, **Date**, and **Build** at the top of each run.

```
Tester: _______________   Date: _______________   Build: v___________
```

---

## 1. Bookmarklet — Chrome Desktop

**Setup:** Install the bookmarklet from gifthint.io/bookmarklet. Sign in to GiftHint.
Show bookmarks bar (⌘ Shift B). Drag the button.

| # | Test case | Expected result | Result | Notes |
|---|-----------|----------------|--------|-------|
| 1.1 | Click bookmarklet on an **Amazon product page** (e.g. Sony headphones) | 400×560 popup opens; title, price, and image are pre-filled | □ | |
| 1.2 | Click bookmarklet on an **Etsy listing** | Popup opens with handmade product title + image | □ | |
| 1.3 | Click bookmarklet on an **ASOS product** | Popup opens; currency is GBP or appropriate locale | □ | |
| 1.4 | Click bookmarklet on a **product page with no OG tags** (e.g. a small retailer) | Popup opens; title falls back to `<title>` tag; price field empty but not broken | □ | |
| 1.5 | Click bookmarklet **while not signed in** | Sign-in screen shown in popup; Google sign-in works after click | □ | |
| 1.6 | After sign-in, **select a different wishlist** and save | Item appears in the correct list on the dashboard | □ | |
| 1.7 | Save an item with a **product title containing `&`, `"`, `#`, `%`** special characters | Title displays correctly (not HTML-entity-encoded) in the saved item | □ | |
| 1.8 | After saving, click **"Copy share link"** | Link copied to clipboard; paste gives correct `gifthint.io/list/…` URL | □ | |
| 1.9 | After saving, click **"Open my list"** | Correct gifter page loads in a new tab | □ | |
| 1.10 | Click bookmarklet **from gifthint.io itself** | Alert fires: "You are already on GiftHint…" — no popup opened | □ | |
| 1.11 | Block popups in Chrome, then click bookmarklet | Falls back to full-tab redirect to `/save?url=…` | □ | |

---

## 2. Bookmarklet — Firefox Desktop

**Setup:** Install bookmarklet from gifthint.io/bookmarklet. Drag to bookmarks toolbar.

| # | Test case | Expected result | Result | Notes |
|---|-----------|----------------|--------|-------|
| 2.1 | Click bookmarklet on an **Amazon product page** | Popup opens (or full-tab fallback); product data pre-filled | □ | |
| 2.2 | Click bookmarklet on an **Etsy listing** | Popup opens with correct data | □ | |
| 2.3 | Click bookmarklet while **not signed in** | Sign-in screen shown; Google OAuth completes within popup | □ | |
| 2.4 | Save an item and verify it appears **in the correct wishlist** | Item visible on gifthint.io/dashboard | □ | |
| 2.5 | Special characters in title (`&`, `"`) | Title renders correctly in the saved item | □ | |

---

## 3. Bookmarklet — Safari (macOS)

**Setup:** Install bookmarklet from gifthint.io/bookmarklet. Show Favorites Bar (⌘ Shift B).

| # | Test case | Expected result | Result | Notes |
|---|-----------|----------------|--------|-------|
| 3.1 | Click bookmarklet on a **Target product page** | Popup opens; title and image populated | □ | |
| 3.2 | Click bookmarklet on an **Apple Store product** | Popup opens with Apple product data | □ | |
| 3.3 | Click bookmarklet while **not signed in** | Sign-in screen shown; Google OAuth completes | □ | |
| 3.4 | Save an item | Item appears in dashboard; share link works | □ | |

---

## 4. Chrome Extension

**Setup:** Load `dist/gifthint-chrome-x.x.x.zip` in Chrome via `chrome://extensions` →
Developer Mode → Load Unpacked (or install from Chrome Web Store).

| # | Test case | Expected result | Result | Notes |
|---|-----------|----------------|--------|-------|
| 4.1 | Visit an Amazon product page — **floating button appears** | Purple 🎁 button in bottom-right within ~1 s of page load | □ | |
| 4.2 | Click floating button while **not signed in** | Sign-in tooltip/popup appears | □ | |
| 4.3 | Sign in via Google | Auth token cached; button changes to "Save" state | □ | |
| 4.4 | Click floating button on **Amazon** — save to default list | ✓ toast shown; item in dashboard | □ | |
| 4.5 | Click floating button on **Etsy** | Product title + image extracted; save succeeds | □ | |
| 4.6 | Click floating button — **select a different list** from picker | Item saved to selected list | □ | |
| 4.7 | Click floating button on **gifthint.io** itself | Button does not appear (excluded in manifest) | □ | |
| 4.8 | Click extension **popup icon** | Popup renders with user's lists and last-used list highlighted | □ | |
| 4.9 | Popup: click **"View analytics"** | Opens gifthint.io/dashboard/analytics in new tab | □ | |
| 4.10 | Popup: click **"Share [list]"** | Share URL copied to clipboard | □ | |
| 4.11 | Popup: **sign out** | Signed-out state renders; re-sign-in works | □ | |

---

## 5. Firefox Extension (MV2 build)

**Setup:** Load `dist/gifthint-firefox-x.x.x.zip` in Firefox via `about:debugging` →
This Firefox → Load Temporary Add-on.

| # | Test case | Expected result | Result | Notes |
|---|-----------|----------------|--------|-------|
| 5.1 | Visit an Amazon product page — **floating button appears** | Purple 🎁 button renders (bundled MV2 content script) | □ | |
| 5.2 | Click floating button while **not signed in** | Sign-in tooltip appears | □ | |
| 5.3 | **OAuth sign-in via launchWebAuthFlow** | Firefox popup opens Google sign-in; returns to extension on success | □ | |
| 5.4 | Confirm token exchange calls **/api/auth/exchange** | Check Network tab: POST to gifthint.io/api/auth/exchange returns `{access_token}` | □ | |
| 5.5 | Save an **Amazon product** | Item appears in dashboard | □ | |
| 5.6 | Save a **Walmart product** | Item appears in dashboard | □ | |
| 5.7 | Extension **popup** renders correctly | Lists, occasion badge, quick-actions all visible | □ | |
| 5.8 | Sign out and sign back in | Auth flow repeats cleanly; no stale token errors | □ | |
| 5.9 | Reload the page — **floating button persists** | Button re-injects after navigation (SPA and full reload) | □ | |

---

## 6. Edge Extension (MV3 build)

**Setup:** Load `dist/gifthint-edge-x.x.x.zip` via `edge://extensions` →
Developer Mode → Load Unpacked.

| # | Test case | Expected result | Result | Notes |
|---|-----------|----------------|--------|-------|
| 6.1 | Visit a **Walmart product page** — floating button appears | Button renders within ~1 s | □ | |
| 6.2 | Click floating button — **sign in** | Google OAuth via Edge's identity API; token cached | □ | |
| 6.3 | Save a **Walmart product** | Item visible in dashboard | □ | |
| 6.4 | Save an **Amazon product** | Affiliate tag applied at gifter page render time (check gifter page URL) | □ | |
| 6.5 | Extension **popup** opens correctly | Same UI as Chrome extension | □ | |
| 6.6 | Verify Edge update_url in manifest | `edge://extensions` shows "From Microsoft Edge Add-ons" badge after store install | □ | N/A for dev load |

---

## 7. iOS Safari — Bookmarklet (manual install)

**Setup:** On iPhone/iPad, follow the 4-step manual install from gifthint.io/bookmarklet.

| # | Test case | Expected result | Result | Notes |
|---|-----------|----------------|--------|-------|
| 7.1 | Tap bookmarklet on an Amazon product page | `/save` page loads in the same tab with product data in the URL | □ | |
| 7.2 | `/save` page receives `?url=…&title=…&price=…` params correctly | Product preview shows correct title and image | □ | |
| 7.3 | Sign in on iOS via Google | OAuth popup opens; redirects back to `/save` with session restored | □ | |
| 7.4 | Save the item | Saved successfully; success screen shown with share link | □ | |
| 7.5 | Tap bookmarklet on a page **with no OG tags** | `/save` page opens; form visible but fields empty — no crash | □ | |

---

## 8. iOS Safari — Share Sheet (iOS Shortcuts)

**Setup:** Install the GiftHint Shortcut using `public/gifthint-share.js`. Enable in Share Sheet.

| # | Test case | Expected result | Result | Notes |
|---|-----------|----------------|--------|-------|
| 8.1 | Browse an Amazon product in Safari; tap Share → **"Save to GiftHint"** | `/save?source=ios_share&url=…&title=…` loads with product data | □ | |
| 8.2 | `/save` page receives data correctly from Shortcut | Product preview card shows title, price, image | □ | |
| 8.3 | Server-side OG scraping supplements client data | If the Shortcuts script missed a field (e.g. price), server fills it in | □ | |
| 8.4 | Save on a page where **both Shortcut and server scrape fail** | Manual entry form is shown (`scrapeFailed=true`); user can type title | □ | |
| 8.5 | Complete manual entry and save | Item saved correctly with user-entered title | □ | |
| 8.6 | Test on a **Target product page** | Correct product data appears | □ | |
| 8.7 | Sign-in flow on iOS (via Supabase Google OAuth) | Redirects back to `/save` with auth session after Google sign-in | □ | |

---

## 9. /save page — All browsers

These tests apply to any browser opening the `/save` route (bookmarklet popup,
bookmarklet full-tab, or iOS Share Sheet).

| # | Test case | Expected result | Result | Notes |
|---|-----------|----------------|--------|-------|
| 9.1 | `/save?url=…&title=…&price=…&image=…` loads with product preview card | Card shows image thumbnail, title, price | □ | |
| 9.2 | `/save` with **no params** (bare URL) | Form loads in empty state; no crash | □ | |
| 9.3 | `/save` with a **very long title** (>300 chars in URL) | Title truncated to 300 chars; no layout overflow | □ | |
| 9.4 | `/save` — **select a different wishlist** | Dropdown shows all public wishlists; selection persists on save | □ | |
| 9.5 | `/save` — **add a hint** before saving | Hint saved with item; visible on dashboard | □ | |
| 9.6 | `/save` — **add DNA tags** via autocomplete | Tags appear as chips; saved with item | □ | |
| 9.7 | After save, **"View your list"** link | Opens correct `gifthint.io/list/{username}/{slug}` gifter page | □ | |
| 9.8 | After save, **"Copy share link"** | Clipboard contains the correct gifter page URL | □ | |
| 9.9 | Sign out mid-session, return to `/save` | Sign-in screen shown; on sign-in, form state is preserved via OAuth redirect | □ | |

---

## 10. Regression — affiliate URL not stored at save time

| # | Test case | Expected result | Result | Notes |
|---|-----------|----------------|--------|-------|
| 10.1 | Save an Amazon item via any flow | `wishlist_items.affiliate_url` is NULL in the DB (set at render time only) | □ | |
| 10.2 | Visit the gifter page for the saved item | Amazon Associates tag is present in the product link | □ | |
| 10.3 | Visit the gifter page for a non-Amazon item | Skimlinks rewrite applies in the browser | □ | |

---

## Sign-off

```
All critical tests passed:  yes / no
Blocker bugs filed:         _________________ (issue numbers)
Tester sign-off:            _________________
Date:                       _________________
Build approved for release: yes / no
```
