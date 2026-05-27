# Referral, Rewards & Social Sharing — Manual QA Checklist

Use this checklist after each deploy to staging or production to verify the
end-to-end referral funnel, premium reward unlocks, and social sharing features
work correctly. Tick every item before marking the release as shippable.

---

## 1. Referral Link Generation

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 1.1 | Log in, open `/dashboard` | "🔗 Referrals" link is visible in the nav header | ☐ |
| 1.2 | Open `/dashboard/referrals` | Page loads without error; your referral link is displayed in a monospace box | ☐ |
| 1.3 | Inspect the link format | URL is `https://gifthint.io/r/<code>` where `<code>` is 8 alphanumeric chars | ☐ |
| 1.4 | Click **Copy link** | Link is copied to clipboard; toast confirmation appears | ☐ |
| 1.5 | Open the copied link in a new tab | Redirected to `https://gifthint.io/?ref=<code>` | ☐ |

---

## 2. Cookie Planting via Referral Link

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 2.1 | Clear all cookies, open the referral link in an Incognito window | Browser DevTools → Application → Cookies shows `gifthint_ref=<code>` | ☐ |
| 2.2 | Verify cookie attributes in DevTools | `HttpOnly: true`, `Secure: true` (on HTTPS), `SameSite: Lax`, `Max-Age ≈ 2592000` (30 days) | ☐ |
| 2.3 | Visit the referral link twice in the same Incognito session | Cookie value and attributes do not change (idempotent) | ☐ |
| 2.4 | Use an invalid referral code (e.g. `/r/badinput`) | Redirected to `/`; **no** `gifthint_ref` cookie is set | ☐ |
| 2.5 | Use an empty code (`/r/`) | 404 or redirect to `/`; no cookie | ☐ |

---

## 3. Referral Attribution on Signup

Prerequisites: cookie `gifthint_ref=<valid_code>` is present.

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 3.1 | Complete signup while holding the referral cookie | Signup succeeds; you land on the dashboard | ☐ |
| 3.2 | Check `users` table for the new account | `referred_by = <referrer_user_id>` | ☐ |
| 3.3 | Check `users` table for the referrer | `referral_count` incremented by 1 | ☐ |
| 3.4 | Check `referral_events` table | Row inserted: `referrer_id`, `referee_id`, `event_type = 'signup'`, `created_at` within last minute | ☐ |
| 3.5 | Sign up a second time with the same referral code (different email) | Another `referral_events` row; referrer's `referral_count` incremented again | ☐ |
| 3.6 | Sign up using your **own** referral code | `referred_by` is **not** set on the new row; `referral_count` unchanged (self-referral prevention) | ☐ |
| 3.7 | Complete signup **without** a referral cookie | `referred_by` is NULL; `referral_events` has no new row | ☐ |
| 3.8 | After attribution, verify the cookie is cleared | `gifthint_ref` cookie is absent from the browser | ☐ |

---

## 4. Referral Click Tracking

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 4.1 | Open a referral link | `referral_events` row inserted with `event_type = 'click'` | ☐ |
| 4.2 | Verify click event fields | `referrer_id`, `event_type = 'click'`, `created_at` present; `referee_id` is NULL | ☐ |
| 4.3 | Check redirect is not delayed | Redirect to `/?ref=<code>` happens in < 200 ms (click insert is fire-and-forget) | ☐ |

---

## 5. Reward Unlocks

> Reset a test user's `referral_count` to 0 between sub-sections.

### 5.1 — First referral (count = 1 → "plus" tier)

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 5.1.1 | Trigger signup via referral code so referrer reaches count = 1 | `premium_tier = 'plus'`, `custom_username_enabled = true` | ☐ |
| 5.1.2 | Log in as the referrer, open `/dashboard/referrals` | Tier badge shows "Plus"; **Custom username** row shows as unlocked | ☐ |

### 5.2 — Three referrals (count = 3 → premium themes)

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 5.2.1 | Reach `referral_count = 3` | `premium_themes_enabled = true` | ☐ |
| 5.2.2 | `/dashboard/referrals` | **Premium themes** row shows as unlocked | ☐ |

### 5.3 — Five referrals (count = 5 → priority support)

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 5.3.1 | Reach `referral_count = 5` | `priority_support_enabled = true` | ☐ |
| 5.3.2 | `/dashboard/referrals` | **Priority support** row shows as unlocked | ☐ |

### 5.4 — Ten referrals (count = 10 → "pro" tier)

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 5.4.1 | Reach `referral_count = 10` | `premium_tier = 'pro'` | ☐ |
| 5.4.2 | `/dashboard/referrals` | Tier badge changes to "Pro" (amber); all reward rows unlocked | ☐ |

### 5.5 — Reward idempotence

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 5.5.1 | Trigger a second signup via the same referral code (count already ≥ 1) | `checkAndApplyRewards` runs; no unnecessary DB UPDATE if nothing changed | ☐ |

---

## 6. Custom Username Editor

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 6.1 | Log in as a user with `custom_username_enabled = false`, open `/dashboard` | Custom username section shows a locked card / upgrade prompt | ☐ |
| 6.2 | Set `custom_username_enabled = true` in the DB, refresh | Username editor is visible and interactive | ☐ |
| 6.3 | Type a valid new username (3–24 chars, alphanumeric + hyphens) | Green "Available ✓" indicator appears after 300 ms debounce | ☐ |
| 6.4 | Type your own current username | "Available ✓" (own username is always available) | ☐ |
| 6.5 | Type a username already taken by another user | "Not available" indicator | ☐ |
| 6.6 | Type a reserved word (e.g. `admin`, `api`, `dashboard`) | "Not available" or format validation error | ☐ |
| 6.7 | Type fewer than 3 characters | Validation error before debounce fires | ☐ |
| 6.8 | Click **Save** with a valid, available username | Success toast; URL preview updates to `gifthint.io/list/<new_username>/…` | ☐ |
| 6.9 | Navigate to `/list/<new_username>/<slug>` | List page loads correctly under the new username | ☐ |
| 6.10 | Navigate to the **old** username URL | 404 (old slug no longer resolves) | ☐ |

---

## 7. OG Image Card

### 7.1 — Personalised card (username present)

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 7.1.1 | Share `/list/<username>/<slug>` in iMessage (iOS) | OG preview card shows: accent strip, occasion emoji, "[Name]'s [Occasion] List" headline, item count subline | ☐ |
| 7.1.2 | Share the same URL on Twitter/X | Large image card (1200×630) appears in the tweet compose preview | ☐ |
| 7.1.3 | Paste URL in Slack | Unfurl shows the personalised card; no broken image | ☐ |
| 7.1.4 | Open `/api/og?username=Test&occasion=birthday&itemCount=5&availableCount=3` directly | 200 PNG response; browser renders the birthday card | ☐ |
| 7.1.5 | Add `&img0=https://…` (a real product image URL) | Product image appears in the right column of the card | ☐ |
| 7.1.6 | Add `&occasionDate=<future-ISO>` | Date pill appears in the left column next to the occasion label | ☐ |

### 7.2 — Generic promo card (no username)

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 7.2.1 | Open `/api/og` with no params | Generic "Share your wish list" card is returned (200 PNG) | ☐ |
| 7.2.2 | Open `/api/og?occasion=birthday` (no username) | Generic card — personalised card must NOT appear | ☐ |

### 7.3 — SSRF / security

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 7.3.1 | Pass `&img0=http://insecure.example.com/img.jpg` | HTTP URL is stripped; emoji fallback box renders instead | ☐ |
| 7.3.2 | Pass `&img0=javascript:alert(1)` | Param is ignored; card renders without error | ☐ |
| 7.3.3 | Pass `&img0=data:image/png;base64,abc` | Param is ignored; card renders without error | ☐ |

### 7.4 — Error tolerance

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 7.4.1 | Pass `&occasionDate=not-a-date` | Date pill absent; card renders normally (no 500) | ☐ |
| 7.4.2 | Pass `&itemCount=xyz&availableCount=NaN` | Counts default to 0; card renders normally | ☐ |
| 7.4.3 | Pass `&occasion=made_up_occasion` | Falls back to "Wish List" / 🎁 meta; card renders normally | ☐ |

---

## 8. Social Sharing — ShareListButton

### 8.1 — Mobile (iOS/Android) native share sheet

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 8.1.1 | Open a gifter list page on a real iOS device | "🔗 Share list" button is visible in the hero | ☐ |
| 8.1.2 | Tap the button | Native iOS/Android share sheet opens | ☐ |
| 8.1.3 | Inspect the pre-filled share text | Format: `"I've added X things to my <occasion> wishlist — you can buy me exactly what I want! 🎁 <URL>"` | ☐ |
| 8.1.4 | Share via iMessage | Recipient sees the message with the gifter URL and OG preview card | ☐ |

### 8.2 — Desktop clipboard + popover

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 8.2.1 | Open a gifter list page on desktop (Chrome) | "🔗 Share list" button is visible | ☐ |
| 8.2.2 | Click the button | Popover appears below the button; clipboard is immediately loaded with the list URL | ☐ |
| 8.2.3 | Paste clipboard contents | The bare list URL (without share text) was copied | ☐ |
| 8.2.4 | Inspect the popover | Shows: URL row with "✓ Link copied!" state, WhatsApp link, Twitter/X link | ☐ |
| 8.2.5 | Click **WhatsApp** link | Opens `wa.me/?text=…` in a new tab with the full share text | ☐ |
| 8.2.6 | Click **Twitter/X** link | Opens `twitter.com/intent/tweet?text=…` in a new tab | ☐ |
| 8.2.7 | Click outside the popover | Popover closes | ☐ |

### 8.3 — Chrome extension share

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 8.3.1 | Open a gifter list page with the extension installed | Extension popup shows the list | ☐ |
| 8.3.2 | Click the share button in the popup | Toast shows "✓ Copied share message!" | ☐ |
| 8.3.3 | Paste clipboard | Full share text with occasion label and URL | ☐ |
| 8.3.4 | Test on a page with `occasion = 'christmas'` | Share text contains "christmas wishlist" (lowercased) | ☐ |

---

## 9. Referrals Dashboard — History Table

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 9.1 | Open `/dashboard/referrals` with at least one signup via your code | History table shows a row for the referee | ☐ |
| 9.2 | Check the referee row | Shows anonymised avatar initials, "Anonymous user #<last6 of ID>", time-ago label, item count, buy-click count | ☐ |
| 9.3 | Verify no PII is displayed | Full name, email, and user ID are NOT shown in the table | ☐ |
| 9.4 | Referral count badge in the header | Matches the `referral_count` value in the DB | ☐ |

---

## 10. Regression — Existing List Pages

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 10.1 | Open `/list/<username>/<slug>` | Page loads; OccasionHero renders; new ShareListButton replaces old copy-link button | ☐ |
| 10.2 | On desktop, click "🔗 Share list" | Popover with clipboard copy + WhatsApp + Twitter/X | ☐ |
| 10.3 | View page source or SEO meta tags | `og:image` URL points to `/api/og?...`; `twitter:card = summary_large_image` | ☐ |
| 10.4 | Check claim flow still works | Claiming a gift item still creates the claim record and updates the UI | ☐ |

---

## Sign-off

| Tester | Date | Environment | Verdict |
|--------|------|-------------|---------|
|        |      | staging     | ☐ Pass / ☐ Fail |
|        |      | production  | ☐ Pass / ☐ Fail |

> **All items must be ticked before marking the referral + OG + sharing milestone as shipped.**
> Failures should be filed as GitHub issues tagged `referral`, `og-image`, or `social-sharing` accordingly.
