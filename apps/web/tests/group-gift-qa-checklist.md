# Group Gift QA Checklist

Manual test plan for the GiftHint group gifting and Stripe payment system.
Run against a local dev server with `STRIPE_SECRET_KEY=sk_test_...` in `.env.local`.

**Prerequisites**
- Stripe CLI installed (`brew install stripe/stripe-cli/stripe`)
- `stripe listen --forward-to localhost:3000/api/group-gift/webhook` running in a terminal
- `STRIPE_WEBHOOK_SECRET` in `.env.local` set to the CLI's signing secret (printed on startup)
- Signed in as a test wisher account
- Test item saved on the dashboard (e.g. "Cashmere Sweater — £50")

---

## 1. Enable group gifting on an item

- [ ] Open the dashboard and click **Edit** on a test item
- [ ] Scroll to the **Group gift** toggle — confirm it is off by default
- [ ] Toggle **Group gift** on — confirm the form expands with three fields:
  - Target amount (pre-filled with the item price)
  - Organiser name
  - Organiser email
- [ ] Set target to **£50**, fill in name and email, click **Create group gift pool**
- [ ] Confirm the form collapses and a green "Pool is open" banner appears
- [ ] Confirm the item on the public wishlist page now shows the **GroupGiftCard**
  with an empty progress bar at **0% of £50**

**Expected:** pool created, item card shows group gift UI, no errors in console.

---

## 2. Contribute £20 using test card 4242 4242 4242 4242

- [ ] Open the item's public wishlist page in an incognito window (as a gifter)
- [ ] Click **Chip in** on the group gift card
- [ ] Fill in:
  - Name: `Alice Test`
  - Email: `alice@example.com`
  - Amount: **£20**
- [ ] Select the **£20** preset or type it manually
- [ ] In the Stripe payment form, enter:
  ```
  Card number:  4242 4242 4242 4242
  Expiry:       12/29
  CVC:          424
  ZIP:          42424
  ```
- [ ] Click **Chip in — £20**
- [ ] Confirm the modal transitions to a **success state** (checkmark, "Thank you" message)
- [ ] Check the Stripe CLI terminal — confirm `payment_intent.succeeded` was received
- [ ] Check Stripe Dashboard → Payments — confirm a £20 test payment appears with status **Succeeded**

**Expected:** payment succeeds, webhook fires, contribution row created with `stripe_payment_status = 'succeeded'`.

---

## 3. Verify progress bar updates to 40% in real-time

- [ ] Without refreshing the page, observe the group gift progress bar
- [ ] Confirm it updates from 0% to **40%** (£20 of £50) within a few seconds of payment
- [ ] Confirm Alice's avatar/name appears in the contributor list (if not anonymous)
- [ ] Confirm the progress bar label shows **£20 raised · 40% of £50**

**Expected:** Supabase Realtime pushes the update; no page refresh needed.

---

## 4. Contribute another £30 — confirm pool transitions to 'funded'

- [ ] Open the chip-in flow again (different incognito window or same)
- [ ] Fill in name `Bob Test`, email `bob@example.com`, amount **£30**
- [ ] Use card `4242 4242 4242 4242` and complete payment
- [ ] Confirm success state in the modal
- [ ] Observe the progress bar — it should reach **100% (£50 of £50)**
- [ ] Confirm the card shows a **"Fully funded 🎉"** state — Chip In button hidden
- [ ] Check the Stripe CLI — confirm the second `payment_intent.succeeded` arrived
- [ ] In Supabase → Table Editor → `gift_pools`, confirm `status = 'funded'`
  and `funded_at` has a timestamp

**Expected:** DB trigger fires on the second contribution, pool flips to `funded`.

---

## 5. Verify organiser receives "pool fully funded" email

- [ ] Check the organiser email inbox (or Resend dashboard if using live Resend)
- [ ] Confirm an email arrives with subject: `🎉 "[Item title]" is fully funded — time to buy!`
- [ ] Confirm the email shows:
  - Total collected: **£50**
  - Target: **£50**
  - Contributor table listing Alice (£25) and Bob (£30)
    *(or actual amounts — may differ if you used different test amounts)*
  - A **"Buy the gift →"** button linking to the item's source URL
  - Next steps list (purchase, keep receipt, reply with questions)

**Expected:** `sendPoolFundedEmail` called by webhook handler; email renders correctly.

---

## 6. Verify "Mark as purchased" button appears in the dashboard

- [ ] Sign in as the wisher and open `/dashboard/group-gifts`
- [ ] Confirm the pool card for the test item shows:
  - Status badge: **Funded** (green)
  - Progress bar at 100%
  - Both contributor names with amounts
  - A **"Mark purchased →"** button
- [ ] Confirm the button is NOT visible for pools in **Open** status
- [ ] Confirm the button is NOT visible for pools in **Purchased** status

**Expected:** Only funded pools show the mark-purchased CTA.

---

## 7. Click "Mark as purchased" — verify contributors receive thank-you emails

- [ ] Click **Mark purchased →** on the funded pool card
- [ ] Confirm the confirmation modal appears, showing contributor count
- [ ] Optionally paste a receipt URL: `https://example.com/receipt-12345`
- [ ] Click **Confirm purchase**
- [ ] Confirm the modal closes and the pool card's status badge updates to **Purchased**
- [ ] Check Alice's inbox (`alice@example.com`) — confirm thank-you email:
  - Subject: `🎁 The gift has arrived — thanks for chipping in!`
  - Shows item title and thumbnail
  - Shows "Your contribution: £20"
  - Shows the receipt URL block (if you added one)
  - Includes a "Create your GiftHint list →" viral CTA
- [ ] Check Bob's inbox — same email, showing "Your contribution: £30"
- [ ] In Supabase → `gift_pools`, confirm `status = 'purchased'`

**Expected:** `sendContributorThankYouEmail` called for each contributor, pool closed.

---

## 8. Test declined card — verify graceful error state

- [ ] Open the chip-in modal on a different item's group gift pool (reset to open)
- [ ] Enter amount **£10**, fill name and email
- [ ] Use Stripe test card for **generic decline**:
  ```
  Card number:  4000 0000 0000 0002
  Expiry:       12/29
  CVC:          424
  ```
- [ ] Click **Chip in**
- [ ] Confirm the modal displays an **error state**, NOT a success state
  - Expected error message from Stripe: "Your card has been declined."
- [ ] Confirm the modal shows a **retry option** (Try again / Go back)
- [ ] Confirm no contribution row appears in `gift_contributions` with `stripe_payment_status = 'succeeded'`
  *(a pending row may exist — that's acceptable and expected)*
- [ ] Confirm the progress bar has NOT moved

**Expected:** Stripe Elements surfaces the decline error; no pool credit issued.

**Additional decline cards to test:**

| Card number          | Decline reason                 |
|----------------------|-------------------------------|
| 4000 0000 0000 9995  | Insufficient funds            |
| 4000 0000 0000 0069  | Expired card                  |
| 4000 0000 0000 0127  | Incorrect CVC                 |
| 4000 0025 0000 3155  | 3D Secure authentication      |

For the 3D Secure card, a challenge modal should appear — clicking "Fail" declines, "Complete" succeeds.

---

## 9. Test overpayment prevention

- [ ] Set up a pool with £50 target; make one contribution of £40 (£10 remaining)
- [ ] In the chip-in modal, manually type amount **£15** (exceeds £10 remaining)
- [ ] Click **Chip in**
- [ ] Confirm the server returns an error:
  - HTTP 422 `amount_exceeds_remaining`
  - Error message should mention the remaining balance: `£10.00`
- [ ] Confirm **no Stripe PaymentIntent was created** (check Stripe Dashboard — no new payment in the last 5 min)
- [ ] Try again with **£10** exactly — confirm it succeeds and pool becomes funded

**Expected:** Contribute endpoint validates server-side before calling Stripe.

---

## 10. Test anonymous contribution

- [ ] Open the chip-in modal for an open group gift pool
- [ ] Fill in name `Carol Test`, email `carol@example.com`, amount **£10**
- [ ] Check the **"Contribute anonymously"** checkbox (if visible) — or leave name blank
  *(The anonymous flag is sent as `anonymous: true` in the payload)*
- [ ] Complete payment with `4242 4242 4242 4242`
- [ ] On the gifter public page, confirm the contributor list shows **"Anonymous"** instead of Carol
- [ ] In the organiser's funded email, confirm the contributor table shows **"Anonymous"** for that row
- [ ] In Supabase → `gift_contributions`, confirm:
  - `contributor_name = null`
  - `anonymous = true`
  - `contributor_email = 'carol@example.com'` *(email is retained for receipts)*

**Expected:** Anonymous contributors hidden from all public displays; email retained server-side only.

---

## 11. Cancel pool with active contributions

- [ ] Ensure a pool has at least one succeeded contribution
- [ ] In the item editor, toggle **Group gift** off
- [ ] Confirm the **cancel warning modal** appears with contributor count
- [ ] Confirm the warning copy mentions refunds ("will be refunded automatically via Stripe")
- [ ] Click **Confirm cancel**
- [ ] Confirm:
  - Pool card disappears from `/dashboard/group-gifts`
  - Item on the public page no longer shows the GroupGiftCard
  - In Stripe Dashboard, the original payment now shows a **Refund** against it
  - In Supabase → `gift_pools`, `status = 'cancelled'`
  - In Supabase → `wishlist_items`, `is_group_gift = false`

**Expected:** `POST /api/group-gift/refund` issues Stripe refunds and cleans up DB state.

---

## 12. Regression — non-group-gift items unaffected

- [ ] Open an item that has never had `is_group_gift = true`
- [ ] Confirm the gifter page shows the standard **"Buy"** button — no group gift UI
- [ ] Confirm the item editor shows the Group Gift toggle in the **off** state
- [ ] Confirm toggling it on and immediately off (before saving) leaves the item unchanged

**Expected:** Feature is fully opt-in; no side effects on regular items.

---

## Sign-off

| Check | Result | Notes |
|-------|--------|-------|
| Stripe webhook delivery ≤ 3s latency | ☐ Pass / ☐ Fail | |
| Progress bar real-time update visible | ☐ Pass / ☐ Fail | |
| Funded email received < 30s after 2nd payment | ☐ Pass / ☐ Fail | |
| Thank-you emails received < 60s after mark-purchased | ☐ Pass / ☐ Fail | |
| Declined card — clean error, no money charged | ☐ Pass / ☐ Fail | |
| Overpayment blocked server-side | ☐ Pass / ☐ Fail | |
| Refund issued in Stripe after pool cancel | ☐ Pass / ☐ Fail | |
| Anonymous name hidden from public UI | ☐ Pass / ☐ Fail | |

**Tested by:** ____________________  **Date:** ____________  **Environment:** local / staging / prod
