# GiftHint Premium QA Checklist

Manual end-to-end verification for the Pro subscription, billing lifecycle,
premium themes, and referral-unlock paths.

Use the Stripe test card `4242 4242 4242 4242` (any future expiry, any CVC)
for all payment flows.  Run `stripe listen --forward-to localhost:3000/api/billing/webhook`
in a separate terminal so webhook events fire during local testing.

---

## 1. UPGRADE FLOW — Stripe Checkout

### 1a. Monthly plan

- [ ] Signed in as a **free** user — navigate to `/dashboard/upgrade`
- [ ] Page loads; billing toggle defaults to **Monthly**
- [ ] Monthly price is displayed correctly (matches `NEXT_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID`)
- [ ] Click **"Upgrade to Pro"**
- [ ] Stripe Checkout opens in the **same tab** with the correct product name ("GiftHint Pro")
      and the correct monthly price (e.g. $9.99/month)
- [ ] Complete checkout with test card `4242 4242 4242 4242`, expiry `12/26`, CVC `123`
- [ ] After payment: browser redirects to `/dashboard?upgraded=true`
- [ ] A success banner / confirmation message is visible on the dashboard
- [ ] In **Supabase** → Table Editor → `users`:
  - `subscription_status` = `'pro'`
  - `subscription_period_end` = ~30 days from now (ISO 8601 UTC)
  - `stripe_customer_id` is populated
- [ ] In **Stripe Dashboard** → Customers: a new customer row exists with the correct email

### 1b. Annual plan

- [ ] Navigate to `/dashboard/upgrade`
- [ ] Click the **Annual** toggle
- [ ] Annual price is displayed with the savings percentage (e.g. "Save 20%")
- [ ] Price shown matches `NEXT_PUBLIC_STRIPE_PRO_ANNUAL_PRICE_ID`
- [ ] Click **"Upgrade to Pro"** — Checkout opens with the **annual** price (not monthly)
- [ ] Complete checkout with the test card
- [ ] Verify `subscription_period_end` in Supabase is ~365 days from now

### 1c. Duplicate subscription guard

- [ ] While signed in as an **already-Pro** user, make a direct `POST` to
      `/api/billing/create-checkout` (e.g. via curl or Postman)
- [ ] Expect a **409 Conflict** response — the endpoint must not create a duplicate session

---

## 2. THEME SELECTOR — Pro user

- [ ] After completing checkout above, navigate to `/dashboard`
- [ ] Open **list settings** for any wishlist
- [ ] The **Theme** section shows 6 cards: Default, Midnight, Cloud, Forest, Rose, Slate
- [ ] **All 5 premium theme cards are now clickable** (no blur overlay, no lock icon)
- [ ] The "Upgrade →" CTA at the bottom of the Theme section is **not visible**

### 2a. Apply 'Midnight' theme

- [ ] Click the **Midnight** card
- [ ] The card border turns purple/gold and shows the ✓ tick
- [ ] Status line: "Saving theme…" appears briefly, then "Theme applied — visible to anyone viewing your list."
- [ ] Click **"Preview as gifter"** → new tab opens at `/list/[username]/[slug]`
- [ ] Gifter page background is near-black (`#0A0908`)
- [ ] Accent color is **gold** (`#C9A84C`) — visible on buy buttons, links, price text
- [ ] Typography uses a **serif** font (Georgia or equivalent)
- [ ] Open DevTools → inspect `<html>` or the ThemeProvider wrapper:
      `--theme-accent` = `#C9A84C`, `--theme-bg` = `#0A0908`

### 2b. Apply 'Cloud' theme

- [ ] Click the **Cloud** card
- [ ] Gifter page background is near-white (`#F7F7FC`)
- [ ] Accent color is **soft indigo** (`#7B6EE8`)
- [ ] Page is readable and text is dark (`#1A1830`)
- [ ] No dark-mode artifacts (borders, text, card surfaces all light)

### 2c. Apply 'Forest' theme

- [ ] Click the **Forest** card
- [ ] Gifter page background is deep green (`#1A2E1A`)
- [ ] Accent color is **copper** (`#B87333`)
- [ ] Text is cream-colored (`#F2EDD8`)

### 2d. Apply 'Rose' theme

- [ ] Click the **Rose** card
- [ ] Gifter page background is blush pink (`#FDF0F0`)
- [ ] Accent color is **deep rose** (`#C44569`)
- [ ] Typography uses a **serif** font
- [ ] Cards and buttons have visibly **rounder corners** than Default/Midnight

### 2e. Apply 'Slate' theme

- [ ] Click the **Slate** card
- [ ] Gifter page background is dark blue-grey (`#0D1117`)
- [ ] Accent color is **electric blue** (`#2F81F7`)
- [ ] Typography uses a **monospace** font
- [ ] Cards and buttons have **sharper corners** than Default

### 2f. Revert to Default

- [ ] Click the **Default** card
- [ ] Gifter page reverts to the standard dark GiftHint look (`#0C0C0E` bg, purple accent)
- [ ] Confirm in Supabase: `wishlists.theme` = `'default'`

---

## 3. CANCELLATION FLOW

- [ ] In Stripe Dashboard (test mode) → find the test customer → cancel their subscription
      **OR** use the Stripe CLI: `stripe subscriptions cancel <sub_id>`
- [ ] The `customer.subscription.deleted` webhook fires
- [ ] In Supabase `users`:
  - `subscription_status` = `'cancelled'`
  - `subscription_period_end` is still set (the original period end, NOT null)

### 3a. Grace period — Pro features still accessible

- [ ] Immediately after cancellation (period_end still in future), refresh `/dashboard`
- [ ] Theme selector is **still unlocked** (user has paid through period_end)
- [ ] Premium themes still apply to the gifter page

### 3b. Post-period — Pro features re-gated

Simulate an expired period_end by manually setting `subscription_period_end`
to a past timestamp in Supabase:

```sql
UPDATE users
SET subscription_period_end = now() - interval '1 hour'
WHERE email = 'your-test@email.com';
```

- [ ] Refresh `/dashboard`
- [ ] Theme selector shows all 5 premium cards **blurred with lock overlay**
- [ ] "Upgrade →" CTA reappears at the bottom of the Theme section
- [ ] If a premium theme was previously active, the gifter page should either:
      (a) still display the theme (the DB value is preserved, gating is dashboard-only), OR
      (b) fall back to default — confirm which behavior is intended and document it
- [ ] Navigate to `/dashboard/upgrade` — the page is accessible and functional

---

## 4. PAYMENT FAILED — Email notification

- [ ] Use the Stripe CLI to simulate a payment failure:
      `stripe trigger invoice.payment_failed`
- [ ] Check your test inbox (Resend dashboard / email preview): a payment-failed email
      arrives at the user's address
- [ ] Email contains:
  - Subject line mentioning the payment failure
  - The user's display name (if set)
  - A link to the billing portal (`/api/billing/portal` or `/dashboard/billing`)
  - Dark-themed HTML (consistent with GiftHint brand)
- [ ] `subscription_status` in Supabase is **NOT changed** — payment_failed is non-terminal
      (Stripe will retry; status only changes on `deleted` or `active`)

---

## 5. REFERRAL UNLOCK PATH — Themes without subscription

This tests the `premium_themes_enabled` column path (3 referrals → themes unlocked).

- [ ] Sign in as a **free user with no subscription**
- [ ] In Supabase, manually set `referral_count = 3` and `premium_themes_enabled = true`
      for this test user:
      ```sql
      UPDATE users
      SET referral_count = 3, premium_themes_enabled = true
      WHERE email = 'test-referral@example.com';
      ```
- [ ] Refresh `/dashboard`
- [ ] Theme selector shows all 5 premium cards **unlocked** (no blur, no lock)
- [ ] The upgrade CTA at the bottom of the Theme section is **not visible**
- [ ] Apply any premium theme (e.g. Midnight) — confirm it saves and applies on gifter page
- [ ] Navigate to `/dashboard/upgrade`:
  - The referral-unlocked themes section shows "Premium themes ✓ Unlocked" status
  - Features that still require a paid subscription (unlimited lists, advanced analytics,
    pro badge) show as locked/unavailable

### 5a. Threshold boundary — 2 referrals (not enough)

- [ ] Set `referral_count = 2`, `premium_themes_enabled = false`
- [ ] Refresh `/dashboard`
- [ ] Theme selector shows all 5 premium cards **blurred** (lock overlay present)
- [ ] Upgrade page shows themes as "Locked — 1 more referral needed" (or equivalent)

---

## 6. WEBHOOK RELIABILITY

### 6a. Idempotency

- [ ] Using the Stripe CLI, replay the same `checkout.session.completed` event twice:
      `stripe events resend evt_xxx`
- [ ] Supabase `users.subscription_status` remains `'pro'` — no duplicate rows, no error

### 6b. Missing user (orphaned Stripe customer)

- [ ] Create a Stripe Customer manually in the dashboard (not via GiftHint checkout)
- [ ] Trigger a `customer.subscription.deleted` for that customer via Stripe CLI
- [ ] Webhook logs show the "user not found" warning but return 200 — Stripe does not retry
- [ ] No 500 error in Vercel function logs

### 6c. Wrong secret (misconfigured endpoint)

- [ ] Temporarily set `STRIPE_BILLING_WEBHOOK_SECRET` to an incorrect value in `.env.local`
- [ ] Trigger any billing event
- [ ] The route returns **400** with "Webhook signature invalid"
- [ ] No DB writes occurred
- [ ] Revert the secret

---

## 7. REGRESSION — Existing free user flows

These must be unaffected by the subscription system.

- [ ] New user sign-up → `subscription_status` = `'free'`, no Stripe data
- [ ] Free user can add items to wishlists (unlimited_lists is advisory; core adds work)
- [ ] Free user gifter page loads with the **default** theme (no crashes if `theme` column = `'default'`)
- [ ] Free user sharing a list via `/list/[username]/[slug]` — page renders without error
- [ ] ThemeSelector with `canUseThemes=false` shows upgrade CTA and blurred premium cards
- [ ] "Preview as gifter" link on the Theme section opens the correct URL in a new tab

---

## 8. CROSS-BROWSER VISUAL CHECK (premium themes)

Apply the **Midnight** theme, then verify the gifter page in:

- [ ] Chrome (latest) — gold accents, serif font, near-black bg
- [ ] Firefox (latest) — same visual output
- [ ] Safari (latest) — verify `backdrop-filter: blur` renders correctly on locked cards
      in the dashboard ThemeSelector (Safari has had intermittent backdrop-filter bugs)
- [ ] Mobile (375px viewport, iOS Safari or Chrome Android):
  - Theme grid in ThemeSelector wraps to single-column correctly
  - Gifter page readable; no horizontal overflow
  - Upgrade CTA section visible and tappable

---

## 9. SIGN-OFF

| Area | Tested by | Date | Pass / Fail |
|------|-----------|------|-------------|
| Monthly upgrade flow | | | |
| Annual upgrade flow | | | |
| Theme selector — Pro | | | |
| All 5 premium themes visual | | | |
| Cancellation + grace period | | | |
| Post-period re-gating | | | |
| Payment failed email | | | |
| Referral unlock (3 referrals) | | | |
| Referral boundary (2 referrals) | | | |
| Webhook idempotency | | | |
| Regression — free user flows | | | |
| Cross-browser (Chrome/FF/Safari) | | | |
| Mobile responsive | | | |

**Release approved by:** ________________  **Date:** ________________
