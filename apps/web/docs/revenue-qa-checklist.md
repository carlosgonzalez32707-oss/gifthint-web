# GiftHint Revenue Attribution — Manual QA Checklist

**Purpose:** Confirm that affiliate clicks are tracked end-to-end, from gifter click → partner dashboard → internal Supabase records → admin revenue display.

**Before you start:** Ensure you have a test user account with at least one item from each of these retailer types saved:

| Item type          | Example retailer | Expected programme       |
|--------------------|------------------|--------------------------|
| Amazon product     | amazon.com       | Amazon Associates        |
| Skimlinks-eligible | walmart.com      | Skimlinks (auto)         |
| Ineligible (rare)  | anthropologie.com | Skimlinks fallback redirect |

---

## 1. Amazon Associates click-through

**Goal:** Confirm Amazon click is logged in the Associates dashboard and in `click_events`.

- [ ] Open the gifter page for a test user who has an Amazon item saved.
- [ ] Right-click the **Buy** button → Copy Link Address.
  - The URL should start with `https://www.amazon.com/...` and contain `tag=gifthint-20` (or your Associates tag).
  - It must **not** contain `go.skimresources.com` anywhere.
- [ ] Click **Buy** and complete the navigation to the Amazon product page.
- [ ] Open Supabase → Table Editor → `click_events`.
  - Find the row for the click you just made.
  - Confirm `affiliate_network = 'amazon_associates'` and `retailer = 'amazon'`.
  - Confirm `clicked_at` timestamp matches (within a few seconds of now).
- [ ] *(Allow 24 hours)* Open [Amazon Associates Central](https://affiliate-program.amazon.com) → **Reports** → **Summary**.
  - Confirm 1 click appeared for today's date.
  - Note: clicks appear with a 24 h delay; earnings appear after the order ships.

---

## 2. Skimlinks click-through (Walmart example)

**Goal:** Confirm a Skimlinks-eligible retailer click is tracked by the Skimlinks script and logged internally.

- [ ] Open the gifter page for a test user who has a Walmart item saved.
- [ ] Right-click the **Buy** button → Copy Link Address.
  - The URL should be a direct `walmart.com` URL (Skimlinks' browser-side JS will handle the redirect).
  - It must **not** contain `go.skimresources.com` — the JS script wraps it automatically; no server-side redirect is needed.
- [ ] Click **Buy** and verify you land on the correct Walmart product page.
- [ ] Open Supabase → `click_events`.
  - Confirm `affiliate_network = 'skimlinks'` (or `null`/blank if Skimlinks tracking fires asynchronously — check the Skimlinks dashboard in step below).
  - Confirm `retailer = 'walmart'` and `clicked_at` is correct.
- [ ] *(Allow up to 48 hours)* Open [Skimlinks Publisher Hub](https://app.skimlinks.com) → **Reports** → **Clicks**.
  - Confirm 1 click for the Walmart domain appears.
  - Status will show as **Pending** initially; moves to **Confirmed** when the retailer validates it (see §6 below).

---

## 3. Ineligible-retailer fallback redirect

**Goal:** Confirm that retailers not on the Skimlinks eligible list use the manual `go.skimresources.com` fallback.

- [ ] Save an item from a retailer **not** in `lib/skimlinks-eligible-retailers.ts` (e.g. anthropologie.com).
- [ ] Open the gifter page and right-click the **Buy** button → Copy Link Address.
  - The URL **should** start with `https://go.skimresources.com?id=...&url=...`.
  - The `url=` parameter should be URL-encoded pointing to the correct product page.
- [ ] Click **Buy** and verify you are redirected to the correct product page.
- [ ] Check `click_events` for this click (affiliate_network may be `skimlinks_fallback`).

---

## 4. Double-tracking audit (Amazon must never hit Skimlinks)

**Goal:** Confirm Amazon links are excluded from Skimlinks tracking.

- [ ] View the HTML source of the gifter page (`⌘U` in Chrome).
  - Search for `data-skimlinks-disabled` or `data-skimlinks-exclude`.
  - All `<a>` tags whose href contains `amazon.com` should carry the Skimlinks exclusion attribute set in `GiftCard.tsx` (`data-skimlinks-disabled="true"` or equivalent).
- [ ] Alternatively, open DevTools → Network tab → filter by `skimresources.com`.
  - Click an Amazon **Buy** button.
  - Confirm that **no** network request to `go.skimresources.com` fires for the Amazon click.
- [ ] Click a Walmart **Buy** button and confirm a Skimlinks network request **does** fire.

---

## 5. Internal click_events table verification

**Goal:** Cross-reference internal data against what the external dashboards show.

- [ ] Run this query in the Supabase SQL editor:

```sql
SELECT
  date(clicked_at AT TIME ZONE 'UTC') AS click_date,
  affiliate_network,
  COUNT(*)                             AS clicks
FROM click_events
WHERE clicked_at >= now() - interval '7 days'
GROUP BY 1, 2
ORDER BY 1 DESC, 2;
```

- [ ] Compare the output to Amazon Associates Reports → Summary (last 7 days).
  - Associates row count ≥ internal `amazon_associates` count. (Associates may be higher because it includes direct traffic; internal only logs gifter-page clicks.)
- [ ] Compare Skimlinks row count to Skimlinks Reports → Clicks (last 7 days).
  - Skimlinks count may be higher if the publisher script captured additional page clicks; internal count should be ≤ Skimlinks count.
- [ ] Note any large discrepancies and cross-check with your deployment date — you may have clicks from before the tracking code shipped.

---

## 6. Admin dashboard verification

**Goal:** Confirm the `/admin` dashboard numbers match `click_events`.

- [ ] Visit `/admin` (you'll need the `gh_admin` cookie; see first-time setup in `app/admin/page.tsx`).
- [ ] Note the **Total Buy Clicks** KPI card value.
- [ ] Run in Supabase SQL editor:

```sql
SELECT COUNT(*) FROM click_events;
```

- [ ] The dashboard value should equal the SQL result (both reflect all-time totals).
- [ ] Check the **Affiliate Clicks — Last 30 Days** chart:
  - Run the spot-check query from `docs/supabase-admin-views.sql` (§ "Last 7 days of click traffic by network") and confirm the chart shape matches.
- [ ] Check the **Estimated Revenue** KPI card.
  - Run:

```sql
SELECT ROUND(SUM(estimated_commission)::numeric, 2) FROM wishlist_items
WHERE estimated_commission IS NOT NULL;
```

  - The admin card should match this value.

---

## 7. Estimated commission spot-check

**Goal:** Verify per-category commission calculation on a real item.

- [ ] Pick an Amazon Electronics item you have saved (e.g. a smart speaker, tablet, or cable).
- [ ] In Supabase → `wishlist_items`, find the row.
  - Confirm `amazon_category = 'Electronics'`.
  - Confirm `estimated_commission ≈ price × 0.01` (1% rate).
  - Example: price = $89.99 → estimated_commission should be $0.8999.
- [ ] Pick an Amazon Luxury Beauty item.
  - Confirm `amazon_category = 'Luxury Beauty'` and `estimated_commission ≈ price × 0.10`.
- [ ] Pick an Amazon Gift Card.
  - Confirm `amazon_category = 'Gift Cards'` and `estimated_commission = 0.00`.

---

## Sign-off

| Check | Passed | Notes |
|-------|--------|-------|
| Amazon click → Associates dashboard | | |
| Walmart click → Skimlinks dashboard | | |
| Amazon links excluded from Skimlinks | | |
| click_events data correct per click | | |
| Admin dashboard matches Supabase | | |
| Estimated commission calculations correct | | |
