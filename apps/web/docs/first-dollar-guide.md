# GiftHint — First Dollar Guide

How to get from "the code is live" to seeing real money in your affiliate accounts.

---

## Part 1: How long until you see the first data?

### Amazon Associates — click reporting delay

Amazon Associates reports clicks with approximately a **24-hour delay**. The flow is:

```
Gifter clicks Buy  →  Amazon records click  →  Shows in dashboard  →  Order ships  →  Commission confirmed
      (now)              (within minutes)       (up to 24h later)    (days/weeks)      (60 days later)
```

- **Click count**: visible in Associates Central → Reports → Summary within 24 hours.
- **Ordered items revenue**: appears after the customer's order ships, not when they order.
- **Commission confirmed**: typically 60 days after the shipping date (Amazon's return window). Until then it shows as **Pending**.

**What to check first:**
1. Associates Central → Reports → Summary → set date range to "yesterday".
2. Look for your affiliate tag (`gifthint-20`) in Reports → Summary → Tag Summary if you use multiple tags.

---

### Skimlinks — conversion reporting delay

Skimlinks' pipeline is slower because it depends on retailer reporting feeds:

```
Gifter clicks Buy  →  Skimlinks records click  →  Retailer sends conversion data  →  Commission confirmed
      (now)              (real-time in theory)      (24–48h for most retailers)       (30–90 day hold)
```

- **Click count**: visible in Skimlinks Publisher Hub → Reports → Clicks within a few hours, sometimes near-real-time.
- **Sale amount / commission**: visible after the retailer confirms the order — typically **24–48 hours** after the click. Some retailers batch-report weekly.
- **Commission confirmed**: 30–90 days depending on the retailer's return policy. Skimlinks rolls this up; you don't need to track it per-retailer.

**What to check first:**
1. Publisher Hub → Reports → Clicks → set date to today.
2. If you see clicks but no revenue: the sale data just hasn't come in yet — check back in 48 hours.

---

## Part 2: Pending vs Confirmed commissions

Both platforms use a hold period before paying out. Here's what the statuses mean:

### Amazon Associates

| Status | Meaning |
|--------|---------|
| **Pending** | Click recorded; order may have been placed but not yet shipped, or it shipped within the last 60 days. |
| **Shipped** | Item has shipped. Commission is now in the 60-day confirmation window. |
| **Confirmed** / **Earned** | 60 days have passed since shipment; customer didn't return it. This amount will be paid out. |
| **Returned** | Customer returned the item. Commission reversed to $0. |
| **Invalid** | Click was flagged (e.g. self-click, bot, or terms violation). No commission. |

**Key point:** Do not build cash-flow models off Pending revenue. Wait for Confirmed status.

### Skimlinks

| Status | Meaning |
|--------|---------|
| **Pending** | Click tracked; sale recorded but not yet validated by the retailer. |
| **Confirmed** | Retailer has validated the sale. Commission is locked in and will be paid on the next payment cycle. |
| **Declined** | Retailer declined the commission (return, coupon misuse, duplicate tracking, etc.). |
| **Deleted** | Click was removed (usually a bot or terms issue). |

**Key point:** Skimlinks pays out confirmed commissions on a **net-60 basis** (60 days after the calendar month the commission was confirmed). So a click in May → confirmed in May → paid in late July.

---

## Part 3: Minimum payout thresholds

You won't see money until you clear these minimums.

### Amazon Associates

| Payment method | Minimum threshold |
|----------------|-------------------|
| Amazon Gift Card | **$10** |
| Direct deposit (US bank) | **$100** |
| Check | $100 (plus $15 processing fee) |

- Payment cycle: monthly (commissions confirmed by the end of month X are paid ~60 days later, around the 28th of month X+2).
- Example: commissions confirmed in May → paid around July 28.
- **Recommendation:** Switch to Gift Card at $10 while testing; switch to direct deposit once you're consistently over $100/month.

### Skimlinks

| Payment method | Minimum threshold |
|----------------|-------------------|
| PayPal | **$10** |
| Bank transfer (BACS/ACH) | **$65** |

- Payment cycle: net-60 (confirmed in month X → paid at the end of month X+2).
- Skimlinks aggregates all retailer commissions into one monthly payout — you don't need separate accounts per retailer.
- **Recommendation:** Start with PayPal at $10. The $10 threshold is easy to clear even with modest early traffic.

---

## Part 4: Reconciling internal click_events with external dashboards

GiftHint logs every gifter Buy click internally in `click_events`. External dashboards will never match exactly — here's why, and what to do about it.

### Why the numbers differ

| Source | What it counts |
|--------|---------------|
| `click_events` (Supabase) | Every click on a GiftHint Buy button, regardless of outcome |
| Amazon Associates dashboard | Clicks that reached Amazon.com via your tracking tag AND were counted valid (bots filtered, etc.) |
| Skimlinks dashboard | Clicks that fired the Skimlinks JS or fallback redirect AND were recorded by the Skimlinks system |

**Expected discrepancy:** Internal clicks ≥ external clicks. You may log a click that the partner filters as a bot, or a click where the user had an ad blocker that blocked the tracking pixel.

### Reconciliation process

**Step 1 — Pull your internal totals for a date range:**

```sql
SELECT
  date(clicked_at AT TIME ZONE 'UTC') AS click_date,
  affiliate_network,
  COUNT(*)                             AS internal_clicks
FROM click_events
WHERE clicked_at >= '2025-06-01'
  AND clicked_at <  '2025-07-01'
GROUP BY 1, 2
ORDER BY 1, 2;
```

**Step 2 — Export external totals:**

- Amazon Associates → Reports → Summary → select the same date range → export CSV.
- Skimlinks Publisher Hub → Reports → Clicks → same date range → export CSV.

**Step 3 — Compare and flag outliers:**

Build a simple comparison table:

| Date | Internal Amazon | Associates | Diff | Internal Skimlinks | Skimlinks Hub | Diff |
|------|-----------------|------------|------|--------------------|---------------|------|
| June 1 | 45 | 42 | 3 | 18 | 15 | 3 |
| June 2 | 31 | 30 | 1 | 22 | 21 | 1 |

A consistent small gap (1–10%) is normal (ad blockers, bot filtering). Flag days where:
- Internal > External by more than **15%**: possible tracking tag error on some pages.
- Internal < External: should never happen — investigate immediately; it means external is counting traffic not from GiftHint.

**Step 4 — Common causes of large discrepancies:**

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Internal Amazon clicks >> Associates | Some items rewritten without tag; or user clicked then navigated away before Amazon recorded | Check `affiliate_url` values have your tag |
| Associates clicks >> internal | Direct Amazon traffic using your tag (e.g. someone shared the affiliate URL directly) | Not a problem; just extra revenue |
| Internal Skimlinks >> Skimlinks Hub | Ad blocker blocked Skimlinks JS; or fallback redirect was used but Skimlinks didn't fire | Expected; check % of fallback clicks vs. JS clicks |
| Large spike in internal with nothing external | Bot or load test hitting the gifter page | Check user-agent logs; add bot filtering to click_events write path |

### Using the admin dashboard as a quick sanity check

The `/admin` dashboard shows:
- **Total Buy Clicks** = all-time `COUNT(*) FROM click_events`
- **Last 30 Days chart** = daily Amazon + Skimlinks breakdown

If the chart shows activity but the external dashboards show nothing after 48 hours, check:
1. That `AMAZON_ASSOCIATES_TAG` env var is set and non-empty.
2. That `SKIMLINKS_PUBLISHER_ID` env var is set.
3. That your Associates and Skimlinks accounts are approved (not pending).
4. That you didn't click from the same browser session as the wishlister account (Associates bans self-clicks).

---

## Checklist: Your "first dollar" milestone

- [ ] At least one gifter has clicked Buy on an Amazon item
- [ ] You've confirmed the click in `click_events` with `affiliate_network = 'amazon_associates'`
- [ ] You've seen the click in Associates Reports (24h after click)
- [ ] A sale has shipped (check Shipped status in Associates → Earnings)
- [ ] Commission shows as Confirmed (60 days after ship date)
- [ ] Associates balance ≥ $10 (Gift Card) or $100 (direct deposit)
- [ ] Payment sent to your Gift Card / bank account

Once the first payout hits, you've validated the full funnel. From there, focus on:
1. Increasing items saved with high-commission Amazon categories (Luxury Beauty 10%, Headphones 6%, Kitchen 4.5%)
2. Growing Skimlinks coverage by adding more eligible retailers to `lib/skimlinks-eligible-retailers.ts`
3. Using `GET /api/affiliate-report` to find your most common ineligible-retailer domains and adding them to Skimlinks' approved list
