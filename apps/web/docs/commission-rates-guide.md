# Amazon Associates Commission Rates — GiftHint Reference

**Last verified:** May 2026  
**Source:** [Amazon Associates Fee Schedule](https://affiliate-program.amazon.com/help/node/topic/GRXPHT8U84RAYDXZ)  
**Code location:** `lib/amazon-categories.ts` → `AMAZON_COMMISSION_RATES`

---

## Current Fee Schedule

| Category | Rate | GiftHint priority | Notes |
|---|---|---|---|
| Luxury Beauty | **10%** | 🟢 HIGH | Best earner. Push Tatcha, La Mer, SK-II, Charlotte Tilbury |
| Amazon Explore | **10%** | 🟢 HIGH | Experiences — rarely on wishlists |
| Headphones | **6%** | 🟢 HIGH | AirPods, Sony WH/WF, Bose QC — common gift |
| Musical Instruments | **6%** | 🟢 HIGH | Guitars, keyboards, microphones |
| Business & Industrial | **6%** | 🟡 MED | Niche; lower wishlist volume |
| Books | **4.5%** | 🟢 HIGH | High volume + decent rate. Cookbooks especially |
| Kitchen | **4.5%** | 🟢 HIGH | Stand mixers, air fryers, espresso machines — popular gifts |
| Automotive | **4.5%** | 🟡 MED | Lower wishlist relevance |
| Amazon Fashion | **4%** | 🟢 HIGH | High volume; every list has clothing |
| Jewelry | **4%** | 🟢 HIGH | High AOV ($80–$400) × 4% = meaningful commission |
| All Other Categories | **4%** | 🟡 MED | Safe fallback rate |
| Furniture | **3%** | 🟡 MED | Large AOV compensates for lower rate |
| Home | **3%** | 🟢 HIGH | Bedding, rugs, décor — extremely common on wishlists |
| Home Improvement | **3%** | 🟡 MED | Lower wishlist relevance |
| Lawn & Garden | **3%** | 🟡 MED | Seasonal |
| Pet Products | **3%** | 🟢 HIGH | Pet owners are dedicated gifters and receivers |
| Toys & Games | **3%** | 🟢 HIGH | Birthday/holiday peak; high conversion |
| Sports & Outdoors | **3%** | 🟡 MED | Camping, yoga, cycling — decent volume |
| Baby Products | **3%** | 🟢 HIGH | Baby showers drive high-intent gifting |
| Camera & Photo | **3%** | 🟡 MED | High AOV but niche audience |
| Handmade | **3%** | 🟡 MED | Etsy alternative on Amazon |
| Music (CDs/Vinyl) | **2.5%** | 🔴 LOW | Declining category |
| DVD & Blu-Ray | **2.5%** | 🔴 LOW | Declining category |
| Software | **2.5%** | 🔴 LOW | Usually purchased direct |
| PC | **2.5%** | 🟡 MED | High AOV; monitors and peripherals are gifted |
| Electronics | **1%** | 🔴 LOW | Cut from 2.5% → 1% in April 2020. Large AOV only saves it |
| Health & Personal Care | **1%** | 🔴 LOW | Cut from 4.5% → 1% in April 2020 |
| Grocery | **1%** | 🔴 LOW | Rarely on wishlists; very low rate |
| Cell Phones & Accessories | **1%** | 🔴 LOW | Phone accessories ok; handsets themselves are borderline |
| Video Games | **0%** | ❌ ZERO | No commission. Do not market as Amazon revenue |
| Gift Cards | **0%** | ❌ ZERO | Always zero. Block from affiliate attribution |

---

## Marketing Priority: Which Categories to Focus On

### Tier 1 — Lead with these in user acquisition messaging

1. **Luxury Beauty** (10%) — Target beauty enthusiasts. Promote: "Save your La Mer / Charlotte Tilbury wishlist"
2. **Headphones** (6%) — Tech gifters, AirPods season (holidays/birthdays)
3. **Musical Instruments** (6%) — Musicians as a niche are underserved by wishlist apps
4. **Books** (4.5%) + **Kitchen** (4.5%) — Highest volume at solid rates. Almost every wishlist has both.
5. **Amazon Fashion** (4%) + **Jewelry** (4%) — Birthdays, anniversaries; broad appeal

### Tier 2 — Build volume here; revenue follows

- **Home** (3%), **Baby Products** (3%), **Pet Products** (3%), **Toys & Games** (3%)
- These dominate wishlist volume. 3% on a $150 Roomba is $4.50. Volume wins.

### Tier 3 — Worth capturing, don't actively promote

- **Electronics** (1%), **Health & Personal Care** (1%)
- High AOV (a $1,200 MacBook generates $12) but structurally unfavorable.
- Do not de-prioritise in product — just don't feature in acquisition copy.

### Avoid in marketing

- **Video Games** (0%) — Frame as "gifter finds and buys separately"
- **Gift Cards** (0%) — Exclude from affiliate tracking entirely

---

## Revenue Estimation Formula

```
estimated_commission = price × getCommissionRate(amazon_category)
```

**Example calculations:**

| Item | Price | Category | Rate | Commission |
|------|-------|----------|------|------------|
| La Mer Moisturizer | $350 | Luxury Beauty | 10% | **$35.00** |
| Sony WH-1000XM5 | $280 | Headphones | 6% | **$16.80** |
| KitchenAid Stand Mixer | $380 | Kitchen | 4.5% | **$17.10** |
| Winter Coat | $120 | Amazon Fashion | 4% | **$4.80** |
| Sectional Sofa | $800 | Furniture | 3% | **$24.00** |
| iPhone Case | $25 | Cell Phones | 1% | **$0.25** |
| PS5 Game | $70 | Video Games | 0% | **$0.00** |

The `estimated_commission` column in `wishlist_items` stores this value at save time.
The `category_revenue` view aggregates it for dashboard reporting.

---

## How to Update Rates When Amazon Changes Them

Amazon typically updates the fee schedule **1–2× per year**, usually in:
- **April** (post-Q1 earnings, often a cut)
- **October/November** (pre-holiday, sometimes a boost for seasonal categories)

### Step-by-step update process

1. **Monitor the official source**
   - Bookmark: https://affiliate-program.amazon.com/help/node/topic/GRXPHT8U84RAYDXZ
   - Subscribe to the Amazon Associates newsletter (Settings → Communication in Associates Central)

2. **When a rate change is announced**, update `lib/amazon-categories.ts`:
   ```typescript
   // Find AMAZON_COMMISSION_RATES and update the decimal
   'Electronics': 0.01,   // was 0.025 before Apr 2020 — update comment to reflect history
   ```
   Update the `// Last verified:` comment at the top of the file.

3. **Update this guide** — revise the fee schedule table above and the "Last verified" date.

4. **Recalculate stored commissions** — existing rows in `wishlist_items` hold the rate at time of save. Run this SQL after a rate change to backfill:
   ```sql
   -- Example: recalculate Electronics after a rate change
   UPDATE wishlist_items
   SET estimated_commission = price * 0.01   -- new rate
   WHERE amazon_category = 'Electronics'
     AND price IS NOT NULL;
   ```
   Or recalculate all Amazon items by calling `rewriteAmazonUrls` from a migration script.

5. **Update `docs/commission-rates-guide.md`** (this file) — timestamp the change.

6. **Check the `category_revenue` view** — no schema change needed; it reads `estimated_commission` which you just backfilled.

---

## Frequently Asked Questions

**Q: What if an item is mis-categorised?**  
A: `detectAmazonCategory` runs at save time and uses heuristics (URL path + title keywords). Miscategorisations skew `estimated_commission` but don't affect actual payout — Amazon pays based on the category at the time of purchase, not what we predicted. The estimate is for internal reporting only.

**Q: Why do the rates for Electronics and Health & Personal Care seem low?**  
A: Amazon cut both categories from ~4.5% to 1% in April 2020. It was the largest single change in Associates history and caught most publishers off guard. These categories now generate meaningful revenue only at high AOV (e.g., a $1,500 laptop still earns $15).

**Q: Do international Amazon storefronts (amazon.co.uk, amazon.de, etc.) use the same rates?**  
A: No. Each storefront has its own fee schedule, denominated in local currency. `lib/amazon-categories.ts` models the `.com` (US) schedule. If you expand internationally, add per-locale rate tables keyed by the `currency` field on each item.

**Q: Is `estimated_commission` the amount we actually get paid?**  
A: It's an *estimate*. Associates pays on completed, shipped, non-returned purchases — not clicks. The actual payout is `clicks × conversion_rate × estimated_commission_per_item`. Use `estimated_commission` as a directional signal, not a financial forecast.
