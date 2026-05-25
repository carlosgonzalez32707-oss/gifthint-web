# Price Alert QA Checklist

Manual verification steps for the GiftHint price tracking and alert system.  
Run against a staging or local environment with real Supabase and Resend test-mode credentials.

---

## Prerequisites

| Requirement | How to satisfy |
|-------------|----------------|
| `CRON_SECRET` env var set | Check `.env.local` |
| `RESEND_TEST_MODE=true` | Set in `.env.local` to avoid real email sends |
| At least one test user account | Sign up at `/` |
| At least one wishlist with an item | Add via extension or direct DB insert |

---

## Checklist

### 1 · Add an Amazon item to a wishlist

- [ ] Open the browser extension on any Amazon product page
- [ ] Verify the product title, price, and image are detected correctly
- [ ] Save the item to a wishlist
- [ ] Confirm the item appears in the dashboard at `/dashboard`
- [ ] Confirm `price`, `source_url`, and `image_url` are populated in the `wishlist_items` table

---

### 2 · Manually insert a price_history record with a lower price

Using the Supabase table editor or `psql`, insert a row simulating a yesterday price higher than the current price:

```sql
INSERT INTO price_history (item_id, price, checked_at, source)
VALUES (
  '<your-item-uuid>',
  <current_price * 1.12>,   -- 12% higher than today → simulates a 12% drop
  NOW() - INTERVAL '1 day',
  'manual_qa'
);
```

- [ ] Row appears in `price_history` for the correct `item_id`
- [ ] `checked_at` is approximately 24 hours ago

---

### 3 · Run check-prices cron manually — verify last_checked_at updated

```bash
curl -X GET http://localhost:3000/api/cron/check-prices \
  -H "Authorization: Bearer $CRON_SECRET"
```

- [ ] Response is `200 OK` with a JSON summary (e.g. `{ checked: N, updated: M }`)
- [ ] `wishlist_items.last_checked_at` is updated for the item(s) checked
- [ ] `wishlist_items.lowest_price` is updated if the newly scraped price is the all-time low
- [ ] `price_history` contains a new row with `source: 'scraper'` and today's price

---

### 4 · Run send-price-alerts cron manually — verify email received

```bash
curl -X GET http://localhost:3000/api/cron/send-price-alerts \
  -H "Authorization: Bearer $CRON_SECRET"
```

- [ ] Response is `200 OK` with a summary (e.g. `{ sent: 1, skipped: 0 }`)
- [ ] Email is delivered to the wisher's address (check Resend dashboard or local mail trap)
- [ ] Email subject includes the item title
- [ ] Email body shows the old price, new price, and savings amount
- [ ] "Buy now" button links to the correct `affiliate_url` (or `source_url` if no affiliate link)
- [ ] Unsubscribe link in the footer contains `?type=price_alerts`

---

### 5 · Check price_drop_alerts table — confirm record inserted

```sql
SELECT * FROM price_drop_alerts
WHERE item_id = '<your-item-uuid>'
ORDER BY alert_sent_at DESC
LIMIT 5;
```

- [ ] A row exists with the correct `item_id` and `user_id`
- [ ] `alert_sent_at` is within the last few minutes
- [ ] `old_price` and `new_price` match what appeared in the email
- [ ] `drop_pct` is a positive number (e.g. ~12 for a 12% drop)

---

### 6 · Run cron again — verify no duplicate alert within 7 days

Immediately re-run the send-price-alerts cron:

```bash
curl -X GET http://localhost:3000/api/cron/send-price-alerts \
  -H "Authorization: Bearer $CRON_SECRET"
```

- [ ] Response summary shows `{ sent: 0, skipped: N }` (no new emails sent)
- [ ] No new row inserted in `price_drop_alerts` for the same item
- [ ] No second email received

---

### 7 · Set threshold to 20%, trigger 10% drop, verify NO alert

Update the item's `price_alert_threshold` to 80 (meaning: alert only when price ≤ 80% of previous, i.e. ≥ 20% drop):

```sql
UPDATE wishlist_items
SET price_alert_threshold = 80
WHERE id = '<your-item-uuid>';

-- Also clear any existing alert record so dedup doesn't interfere
DELETE FROM price_drop_alerts WHERE item_id = '<your-item-uuid>';
```

Then insert a history row showing only a 10% drop (insufficient for this threshold):

```sql
INSERT INTO price_history (item_id, price, checked_at, source)
VALUES ('<your-item-uuid>', <current_price * 1.10>, NOW() - INTERVAL '1 day', 'manual_qa');
```

Re-run the cron:

```bash
curl -X GET http://localhost:3000/api/cron/send-price-alerts \
  -H "Authorization: Bearer $CRON_SECRET"
```

- [ ] Response shows `{ sent: 0, skipped: N }` — item correctly skipped
- [ ] No email received
- [ ] No new row in `price_drop_alerts`

---

### 8 · Test unsubscribe link — verify only price alerts disabled

Find the unsubscribe URL from the email footer (contains `?type=price_alerts&token=<token>`).  
Open it in a browser or via curl:

```bash
curl -L "http://localhost:3000/unsubscribe?type=price_alerts&token=<token>"
```

- [ ] Response is `200 OK` HTML with copy specific to price alerts (not the weekly digest copy)
- [ ] `users.price_alerts_enabled` is now `false` for this user
- [ ] `users.unsubscribe_token` has been rotated (new UUID, different from the original)
- [ ] `users.email_digest_enabled` is **unchanged** (still `true`) — weekly digest must not be affected
- [ ] Re-running send-price-alerts cron after unsubscribe sends **no** email to this user

---

## Post-QA Cleanup

After completing all checks, restore the test account to a clean state:

```sql
-- Re-enable alerts and reset threshold
UPDATE wishlist_items
SET price_alert_threshold = 90
WHERE id = '<your-item-uuid>';

UPDATE users
SET price_alerts_enabled = true
WHERE id = '<your-user-uuid>';

-- Remove manual QA history rows
DELETE FROM price_history WHERE source = 'manual_qa';

-- Remove test alert records
DELETE FROM price_drop_alerts WHERE item_id = '<your-item-uuid>';
```
