# Claim System & Email Reminder — Manual QA Checklist

> **When to run:** Before every production deploy that touches the claim routes,
> coordination panel, Realtime hook, or email reminder system.
>
> **Environment:** Use a staging Supabase project with test data — never run
> destructive steps against the production database.
>
> **Setup:** Open the gifter page at `http://localhost:3000/list/<username>` (or
> your staging URL). Have Supabase Table Editor open in a separate tab so you
> can verify DB state without writing SQL.

---

## 1 — Simultaneous claim race condition

**Goal:** Confirm Postgres guarantees exactly one winner when two gifters click
"I'll buy this" at the same moment.

- [ ] Open the gifter page in **two separate browser windows** (not tabs — windows
      allow truly parallel JS execution).
- [ ] Find an item that is not yet claimed. Note its item ID from the Supabase
      `wishlist_items` table.
- [ ] In each window, click **"I'll buy this 🎁"** on that item to open the
      inline claim form. Fill in a different name in each window
      (e.g. "Alice" in Window A, "Bob" in Window B).
- [ ] Click **"I'll buy this 🎁"** submit in both windows **as simultaneously as
      possible** (get a friend to click in one while you click in the other).
- [ ] **Expected — Window A (winner):** the item immediately shows as claimed
      (greyed-out overlay, green "✓ Taken" badge).
- [ ] **Expected — Window B (loser):** the claim form shows an error or the item
      is already visually marked as claimed before the submit completes.
      The `POST /api/claim` response must be `409 { error: "already_claimed" }`.
- [ ] Verify in Supabase: the `wishlist_items` row shows exactly **one** of the
      two names in `claimed_by` — never both, never null.

---

## 2 — Real-time update without page refresh

**Goal:** Confirm the Realtime hook propagates a claim to all connected gifter
pages within ~2 seconds.

- [ ] Open the gifter page in **two browser tabs** (Tab 1 = observer, Tab 2 = actor).
- [ ] In **Tab 2**, claim any unclaimed item by name.
- [ ] Switch to **Tab 1** without refreshing — within 2 seconds the item should
      visually update to the claimed state (greyed-out image, green badge).
      No manual refresh should be required.
- [ ] Confirm the flash notification pill ("Just claimed by someone 🎉") appears
      briefly over the item thumbnail in Tab 1.
- [ ] Check the browser DevTools → Network tab in Tab 1 to confirm a WebSocket
      frame was received from Supabase Realtime (channel name contains
      `gifthint:claims:<user_id>`).

---

## 3 — Anonymous claim → "Someone" in coordination panel

**Goal:** Confirm anonymous flag suppresses the gifter's name everywhere.

- [ ] In a fresh incognito window, open the gifter page and click "I'll buy this 🎁"
      on an unclaimed item.
- [ ] **Check "Stay anonymous"** in the claim form and submit (leave the name
      field blank or filled — it should be ignored).
- [ ] Verify in Supabase: `claimed_anonymous = true`, `claimed_by = null`.
- [ ] Open (or expand) the **"See what's been claimed"** coordination panel.
- [ ] **Expected:** the item row shows **"Claimed anonymously"** (not a name).
- [ ] Hit `GET /api/claims/<username>` directly in the browser or Postman.
      **Expected:** `claimedBy` field is `"Someone"` — never the actual name.

---

## 4 — Named unclaim (gifter removes their own claim)

**Goal:** Confirm a gifter can unclaim an item by re-entering the same name.

- [ ] Claim an item with the name **"Carlos"** (not anonymously).
- [ ] Verify `is_claimed = true`, `claimed_by = 'Carlos'` in Supabase.
- [ ] On the same gifter page, click "I'll buy this 🎁" to reopen the form.
      Type **"Carlos"** in the name field (must match exactly, case-insensitive).
- [ ] **Expected:** the form reveals a secondary button — "↩ Unclaim this item".
- [ ] Click "↩ Unclaim this item".
- [ ] **Expected:** item card returns to the unclaimed state (coloured image, purple
      "I'll buy this 🎁" CTA restored).
- [ ] Verify in Supabase: `is_claimed = false`, `claimed_by = null`,
      `claimed_at = null`.

---

## 5 — Wrong name blocked from unclaiming

**Goal:** Confirm the name-based auth guard rejects incorrect names.

- [ ] Claim an item with the name **"Alice"**.
- [ ] In the same claim form, type **"Bob"** and attempt to unclaim.
- [ ] **Expected:** error message appears — "Name doesn't match — only the person
      who claimed this can unclaim it."
- [ ] Verify in Supabase: `is_claimed` is still `true`, name is still `'Alice'`.

---

## 6 — Anonymous claim cannot be unclaimed via name

**Goal:** Confirm anonymous claims are permanently protected.

- [ ] Claim an item anonymously ("Stay anonymous" checked).
- [ ] Reopen the claim form on the same item. Enter any name in the name field.
- [ ] **Expected:** the "↩ Unclaim this item" button does **not** appear
      (because `nameMatchesClaim` requires a stored `claimed_by`).
- [ ] Manually call `DELETE /api/claim/<itemId>` with any `claimedBy` value.
      **Expected:** `403 { error: "name_mismatch" }`.

---

## 7 — Reminder signup → DB row created

**Goal:** Confirm the reminder signup flow persists to Supabase.

- [ ] On the gifter page, scroll to the **"Want to know when … adds more gifts?"**
      widget.
- [ ] Enter a real email address and optionally a future date. Click **"Remind me 🔔"**.
- [ ] **Expected UI:** the widget replaces with a green pill —
      "✓ We'll remind you 7 days before!".
- [ ] Check Supabase → `gifter_reminders` table. Confirm a new row exists with:
  - `gifter_email` = the address you entered
  - `wisher_user_id` = the list owner's UUID
  - `occasion_date` = the date you entered (or `null` if omitted)
  - `reminder_sent_at` = `null`
- [ ] **Duplicate prevention:** reload the page (the widget stays hidden — localStorage),
      open a fresh incognito window and submit the same email again.
      **Expected:** Supabase still has exactly **one** row for that email + wisher combo
      (the upsert merged it). The `occasion_date` may have updated.

---

## 8 — Manually trigger the cron endpoint and verify email delivery

**Goal:** Confirm the full email pipeline works end-to-end before waiting 24 hours.

### 8a — Seed a due reminder

Run in Supabase SQL Editor (replace placeholders):

```sql
INSERT INTO gifter_reminders (wisher_user_id, gifter_email, occasion_date)
VALUES (
  '<your-wisher-user-id>',
  '<your-real-email@example.com>',
  (CURRENT_DATE + INTERVAL '7 days')::date
)
ON CONFLICT (wisher_user_id, gifter_email)
DO UPDATE SET
  occasion_date    = EXCLUDED.occasion_date,
  reminder_sent_at = NULL;
```

### 8b — Trigger the cron endpoint

```bash
curl -X GET https://<your-domain>/api/cron/send-reminders \
  -H "Authorization: Bearer $CRON_SECRET"
```

Or in development (replace `$CRON_SECRET` with your local value from `.env.local`):

```bash
curl -X GET http://localhost:3000/api/cron/send-reminders \
  -H "Authorization: Bearer $(grep CRON_SECRET .env.local | cut -d= -f2)"
```

### 8c — Verify

- [ ] The curl response should be `{"sent":1,"skipped":0,"errors":0}`.
- [ ] Check Supabase: `reminder_sent_at` on the seeded row is now a timestamp.
- [ ] **Check your inbox** — the reminder email should arrive within 1–2 minutes.
      Verify:
  - Subject contains the wisher's name and/or "7 days"
  - Dark-themed HTML renders correctly in your email client
  - The "View … wishlist →" CTA button links to the correct list URL
  - Top unclaimed items are displayed (up to 3), with prices and "Buy →" links
  - No broken images (images use direct CDN URLs; some email clients block them)

### 8d — Idempotency check

Re-run the same curl command a second time.

- [ ] **Expected:** `{"sent":0,"skipped":0,"errors":0}` — the row already has
      `reminder_sent_at` set, so it's excluded from the query.
- [ ] You do **not** receive a duplicate email.

---

## 9 — Cron auth guard

**Goal:** Confirm the endpoint rejects unauthenticated callers.

```bash
# No auth header → 401
curl -X GET http://localhost:3000/api/cron/send-reminders
# Expected: {"error":"unauthorized"}

# Wrong secret → 401
curl -X GET http://localhost:3000/api/cron/send-reminders \
  -H "Authorization: Bearer wrong-secret"
# Expected: {"error":"unauthorized"}
```

- [ ] Both commands return HTTP 401.
- [ ] No emails are sent and no DB rows are modified.

---

## Sign-off

| Check | Tester | Date | Notes |
|---|---|---|---|
| Race condition (§1) | | | |
| Realtime propagation (§2) | | | |
| Anonymous masking (§3) | | | |
| Named unclaim (§4) | | | |
| Wrong-name guard (§5) | | | |
| Anonymous unclaim guard (§6) | | | |
| Reminder signup + DB (§7) | | | |
| End-to-end email delivery (§8) | | | |
| Cron auth guard (§9) | | | |
