# Occasion Tagging — Manual QA Checklist

Run through every item in this checklist after deploying Phase 2 to staging. All checks must pass before promoting to production.

Mark each item ✅ (pass) or ❌ (fail). Record any failures in the Notes column and open a bug before promoting.

---

## Environment Setup

- Staging URL: `https://[staging-domain]`
- Test account: a freshly created account **with no prior wishlists** (ensures clean Phase 2 state)
- Test account 2: an existing pre-Phase-2 account that already has wishlist items (tests migration path)

---

## 1 — Birthday List with 10-Day Countdown (Amber)

**Scenario:** Create a birthday list dated 10 days from today and verify the countdown badge is shown in amber.

| # | Step | Expected | ✅/❌ | Notes |
|---|------|----------|-------|-------|
| 1.1 | Sign in and open the dashboard | Dashboard loads with "Your lists" heading | | |
| 1.2 | Click "✨ New list" | CreateListModal opens with 8 occasion tiles | | |
| 1.3 | Click the 🎂 Birthday tile | Title pre-fills with "Birthday Wishlist" | | |
| 1.4 | Set the date field to today + 10 days | Date picker accepts the value | | |
| 1.5 | Click "Create list" | Modal closes; new ListCard appears at top of grid | | |
| 1.6 | Inspect the CountdownBadge on the ListCard | Shows "10 days until the birthday" | | |
| 1.7 | Verify badge colour | Text and border are **amber (#F5A94E)**, not red or green | | |
| 1.8 | Open the gifter URL (`/list/[username]/[slug]`) | Page loads with pink (#E872A0) accent; 🎂 emoji in hero | | |
| 1.9 | Verify CountdownBadge on gifter page | Same amber colour and "10 days" copy | | |

---

## 2 — Christmas List (Green Accent + 🎄 Hero)

**Scenario:** Create a Christmas list dated more than 14 days away and verify green countdown and Christmas-themed hero.

| # | Step | Expected | ✅/❌ | Notes |
|---|------|----------|-------|-------|
| 2.1 | Click "✨ New list" | CreateListModal opens | | |
| 2.2 | Click the 🎄 Christmas tile | Title pre-fills with "Christmas Wishlist" | | |
| 2.3 | Set the date to Dec 25 of the current or next year (must be > 14 days away) | Date picker accepts the value | | |
| 2.4 | Click "Create list" | Modal closes; ListCard appears | | |
| 2.5 | Inspect the CountdownBadge on the ListCard | Shows "[N] days until Christmas" | | |
| 2.6 | Verify badge colour | Text and border are **green (#4EC99A)** | | |
| 2.7 | Confirm `gh-pulse` animation class is absent | Badge should not pulse when > 7 days remain | | |
| 2.8 | Open the gifter URL | Page loads with **green (#4EC99A)** accent throughout | | |
| 2.9 | Verify hero section | 🎄 emoji visible in hero; heroTagline references the recipient's name and "Christmas" | | |
| 2.10 | Verify page `<title>` or `<meta>` description | Contains "Christmas" | | |

---

## 3 — Wedding List — Gold Accent on Gifter Page

**Scenario:** Create a wedding list and verify the gifter page uses the gold accent colour.

| # | Step | Expected | ✅/❌ | Notes |
|---|------|----------|-------|-------|
| 3.1 | Click "✨ New list" | CreateListModal opens | | |
| 3.2 | Click the 💍 Wedding tile | Title pre-fills with "Wedding Wishlist" | | |
| 3.3 | Set a date at least 30 days in the future | Date picker accepts the value | | |
| 3.4 | Click "Create list" | ListCard appears with 💍 emoji | | |
| 3.5 | Click the "Share" button on the ListCard | Toast shows "✓ Copied!" for ~2 seconds; gifter URL is now in clipboard | | |
| 3.6 | Paste the clipboard URL into a new tab | Gifter page loads successfully | | |
| 3.7 | Verify page accent colour | Buttons, borders, and highlights use **gold (#E8A84A)** | | |
| 3.8 | Verify hero section | 💍 emoji visible; heroTagline contains the recipient's name and "married" | | |
| 3.9 | Verify countdown badge on gifter page | Green (#4EC99A) because > 14 days; no pulse animation | | |
| 3.10 | Open gifter page in an incognito / private window | Page loads without requiring sign-in (public list) | | |

---

## 4 — Backwards-Compatible Redirect from Legacy `/list/[username]` URL

**Scenario:** Old gifter links (no list slug) must continue to resolve after Phase 2.

| # | Step | Expected | ✅/❌ | Notes |
|---|------|----------|-------|-------|
| 4.1 | Sign in with test account 2 (pre-Phase-2 account with existing items) | Dashboard loads; existing items visible on default list | | |
| 4.2 | Note the public username shown in the top bar (e.g. "alice") | Username is present | | |
| 4.3 | Navigate to `/list/alice` (no slug) | Page loads without 404 or 500 | | |
| 4.4 | Verify page content | Same gift items visible as in the dashboard's default list | | |
| 4.5 | Verify accent colour | Uses the occasion colour of the default wishlist (or the default purple for "other") | | |
| 4.6 | Copy the URL shown in browser address bar | URL is either `/list/alice` (direct render) or `/list/alice/[default-slug]` (redirect) — both are valid | | |
| 4.7 | Navigate to `/list/alice/[default-slug]` directly | Same items visible as in 4.4 | | |
| 4.8 | Open `/list/alice` in an incognito window | Loads without authentication; no login prompt | | |
| 4.9 | Open a completely non-existent username: `/list/zzz-does-not-exist` | Returns 404 page, not a crash | | |
| 4.10 | Open an existing username but wrong slug: `/list/alice/wrong-slug` | Returns 404 page, not a crash | | |

---

## 5 — Urgency Colour Boundaries

**Scenario:** Verify the three colour thresholds (red/amber/green) are applied correctly at boundary values.

| # | Days Until Occasion | Expected Badge Colour | Pulse Animation | ✅/❌ | Notes |
|---|--------------------|-----------------------|-----------------|-------|-------|
| 5.1 | 1 day | Red (#E24B4A) | Yes (`gh-pulse`) | | |
| 5.2 | 6 days | Red (#E24B4A) | Yes | | |
| 5.3 | 7 days | Amber (#F5A94E) | No | | |
| 5.4 | 14 days | Amber (#F5A94E) | No | | |
| 5.5 | 15 days | Green (#4EC99A) | No | | |
| 5.6 | Today (0 days) | N/A — "Today is the day!" message | No | | |
| 5.7 | Yesterday (past) | N/A — "Hope they loved their gifts!" message | No | | |

To test these without waiting, use the Edit button on a ListCard to change the occasion date to the required day offset.

---

## 6 — Inline Edit on ListCard

**Scenario:** Edit a list's title and date directly from the dashboard card.

| # | Step | Expected | ✅/❌ | Notes |
|---|------|----------|-------|-------|
| 6.1 | Click the "Edit" button on a ListCard | Card flips to edit mode: title input + date input + Save / Cancel | | |
| 6.2 | Change the title to "My Updated List" | Input accepts the new value | | |
| 6.3 | Click "Save" | Edit mode closes; card shows "My Updated List" without page reload | | |
| 6.4 | Click "Edit" again, then "Cancel" | Card reverts to the original values | | |
| 6.5 | Clear the title field and click "Save" | Validation error shown; card does not save empty title | | |
| 6.6 | Edit on mobile viewport (375px wide) | Inputs are usable; buttons are accessible | | |

---

## 7 — Delete List

**Scenario:** Deleting a list removes it from the dashboard without a page reload.

| # | Step | Expected | ✅/❌ | Notes |
|---|------|----------|-------|-------|
| 7.1 | Click the "Delete" button on a ListCard that is **not** the default | Confirmation prompt or immediate deletion | | |
| 7.2 | Confirm deletion | Card is removed from the grid instantly (optimistic) | | |
| 7.3 | Reload the page | Deleted list is not present | | |
| 7.4 | Attempt to navigate to the deleted list's gifter URL | Returns 404 | | |

---

## 8 — Accessibility Spot-Check

| # | Check | Expected | ✅/❌ | Notes |
|---|-------|----------|-------|-------|
| 8.1 | Countdown badge when future date | `role="timer"` attribute present in HTML | | |
| 8.2 | Countdown badge when today | `role="status"` attribute present in HTML | | |
| 8.3 | Share button | Focusable via keyboard Tab; activatable with Enter/Space | | |
| 8.4 | Edit / Save / Cancel buttons | Focusable via keyboard Tab | | |
| 8.5 | Occasion tiles in CreateListModal | Selectable via keyboard; selected tile has visible focus ring | | |
| 8.6 | Run axe or browser accessibility audit on dashboard | Zero critical violations | | |

---

## Sign-Off

| Tester | Date | Environment | Overall Result |
|--------|------|-------------|----------------|
| | | Staging | |
| | | Production | |

All items must show ✅ before the Production sign-off cell is filled.
