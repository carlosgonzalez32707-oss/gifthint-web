# GiftHint — Phase 3 Metrics Review & 10k Milestone Audit

**Review date:** Week 24 (fill in)
**Reviewer:** (fill in)
**Supabase project:** `pxegvviakrjhldtwtobi`
**Stripe dashboard:** https://dashboard.stripe.com/test

---

## SECTION 1 — METRICS CAPTURE TEMPLATE

*Fill in every cell after Week 24 closes. Sources listed inline. Run SQL queries from Section 2 for DB metrics; pull email/Stripe figures from their dashboards.*

---

### 1.1 Core Growth

| Metric | Target | Actual | Source |
|--------|--------|--------|--------|
| Total registered users | 10,000 | [X] | `SELECT COUNT(*) FROM users` |
| Weekly active wishers (W24) | 2,000 | [X] | `growth_kpis` view — `weekly_active_wishers` |
| D30 retention | ≥ 25% | [X]% | `growth_kpis` view — `d30_retention_pct` |
| Viral coefficient K | ≥ 0.4 | [X] | `growth_kpis` view — `viral_k` |
| Referral signups (% of total) | ≥ 30% | [X]% | Section 2, Query 1 |

### 1.2 Product Engagement

| Metric | Target | Actual | Source |
|--------|--------|--------|--------|
| Total items saved (all time) | 50,000 | [X] | `SELECT COUNT(*) FROM wishlist_items` |
| Total wishlists created | 15,000 | [X] | `SELECT COUNT(*) FROM wishlists` |
| Avg items per active wisher | 8 | [X] | items / weekly_active_wishers |
| Group gifts funded | 500 | [X] | `SELECT COUNT(*) FROM group_gift_pools WHERE status IN ('funded','purchased')` |
| Price alerts sent (all time) | 5,000 | [X] | Resend dashboard / `SELECT COUNT(*) FROM price_drop_alerts` |
| Price alert email open rate | ≥ 45% | [X]% | Resend dashboard → Broadcasts |
| Premium themes applied (non-default) | 20% of wishlists | [X]% | Section 2, Query 6 |

### 1.3 Revenue

| Metric | Target | Actual | Source |
|--------|--------|--------|--------|
| Total buy clicks (all time) | 27,000 | [X] | `SELECT COUNT(*) FROM click_events` |
| Estimated affiliate revenue | $3,500 | $[X] | `SELECT SUM(estimated_commission_pence)/100 FROM click_events` |
| Revenue per user (lifetime) | $0.35 | $[X] | `growth_kpis` view — `revenue_per_user_pence / 100` |
| Pro subscribers | 100 | [X] | `SELECT COUNT(*) FROM users WHERE subscription_status = 'pro'` |
| Pro MRR | $499 | $[X] | subscribers × $4.99 |
| Cancelled-but-in-period | — | [X] | `SELECT COUNT(*) FROM users WHERE subscription_status = 'cancelled' AND subscription_period_end > now()` |
| Referral milestone unlocks (themes) | — | [X] | `SELECT COUNT(*) FROM users WHERE premium_themes_enabled = true AND subscription_status = 'free'` |

### 1.4 Acquisition Channels

| Channel | Signups | % of Total | Source |
|---------|---------|-----------|--------|
| Organic (direct / type-in) | [X] | [X]% | Query 1 |
| Referral (user → user) | [X] | [X]% | Query 1 |
| Partner (blog / influencer) | [X] | [X]% | Query 1 |
| ProductHunt | [X] | [X]% | PH dashboard |
| Community seeding (Reddit/HN/Twitter) | [X] | [X]% | Estimate from UTM — Query 3 |

### 1.5 ProductHunt Launch

| Metric | Target | Actual | Source |
|--------|--------|--------|--------|
| ProductHunt upvotes | 300 | [X] | PH dashboard |
| PH rank on launch day | Top 5 | [X] | PH dashboard |
| Signups attributed to PH (24 h) | 500 | [X] | Query 3 — `utm_source = 'producthunt'` |
| Signups attributed to PH (7 d) | 800 | [X] | Query 3 |

---

## SECTION 2 — GROWTH CHANNEL ATTRIBUTION SQL

*Run all queries against Supabase → SQL Editor. Each query is documented with what it answers and what action to take based on the result.*

---

### Query 1 — Signups by acquisition channel

**Answers:** What drove user growth? How much is viral vs. paid vs. organic?

```sql
-- Channel breakdown: organic / referral (peer) / partner (blog/influencer)
-- Uses the partners table to distinguish partner-driven referrals from peer referrals.
SELECT
  CASE
    WHEN u.referred_by IS NULL                                          THEN 'organic'
    WHEN u.referred_by IN (SELECT user_id FROM partners WHERE active = true)
                                                                        THEN 'partner'
    ELSE                                                                     'referral'
  END                                         AS channel,
  COUNT(*)                                    AS signups,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS pct
FROM users u
GROUP BY 1
ORDER BY signups DESC;
```

**What to do with this:**
- If `referral` > 30% → viral flywheel is working; double down on referral incentive UX
- If `partner` > 15% → partner programme is outperforming; recruit more partners
- If `organic` > 70% → SEO/brand is carrying growth but K < 0.3 is fragile; invest in referral activation

---

### Query 2 — Top 10 gifter pages by viral CTA clicks

**Answers:** Which wisher pages are the best acquisition surfaces? Who are the power users driving new signups?

```sql
-- Gifter pages sorted by unique CTA click events (ViralCTABar interactions)
SELECT
  ce.gifter_page_username                           AS wisher,
  COUNT(*)                                          AS cta_clicks,
  COUNT(*) FILTER (WHERE ce.event_type = 'signup_cta_click')
                                                    AS signup_intent_clicks,
  u.display_name                                    AS wisher_display_name,
  u.referral_count                                  AS referrals_earned,
  u.subscription_status
FROM cta_events ce
LEFT JOIN users u ON u.public_username = ce.gifter_page_username
GROUP BY ce.gifter_page_username, u.display_name, u.referral_count, u.subscription_status
ORDER BY cta_clicks DESC
LIMIT 10;
```

**What to do with this:**
- High CTA clicks + low referral_count → gifters are clicking but not converting; fix the /r/ landing page or sign-up flow
- Top wishers with high referral_count → these are power users; consider a personal outreach, Pro upgrade discount, or ambassador programme

---

### Query 3 — Referral_events funnel: click → signup → first_save

**Answers:** Where in the referral funnel are we losing people?

```sql
-- Funnel conversion at each referral event stage
SELECT
  event_type,
  COUNT(*)                                          AS events,
  COUNT(DISTINCT referrer_id)                       AS unique_referrers,
  COUNT(DISTINCT referee_id)                        AS unique_referees,
  -- Conversion from the previous stage (click→signup, signup→first_save)
  ROUND(
    100.0 * COUNT(DISTINCT referee_id)
    / NULLIF(LAG(COUNT(DISTINCT referee_id)) OVER (ORDER BY
        CASE event_type
          WHEN 'click'      THEN 1
          WHEN 'signup'     THEN 2
          WHEN 'first_save' THEN 3
        END
      ), 0
    ),
  1)                                                AS conversion_from_prev_pct
FROM referral_events
GROUP BY event_type
ORDER BY
  CASE event_type
    WHEN 'click'      THEN 1
    WHEN 'signup'     THEN 2
    WHEN 'first_save' THEN 3
  END;
```

**What to do with this:**
- click→signup < 20% → the /r/[code] landing page needs work (copy, social proof, friction)
- signup→first_save < 60% → onboarding activation is failing; add guided "add your first item" prompt
- click→signup > 35% → strong landing page; focus optimisation effort on first_save instead

---

### Query 4 — Blog and UTM source attribution

**Answers:** Which content pieces (blog posts, tweets, Reddit threads) drove signups?

```sql
-- UTM source breakdown from referral_events metadata JSONB
-- Referral events store UTM params captured at the /r/[code] click in metadata.
SELECT
  metadata->>'utm_source'                           AS utm_source,
  metadata->>'utm_medium'                           AS utm_medium,
  metadata->>'utm_campaign'                         AS utm_campaign,
  COUNT(*)                                          AS clicks,
  COUNT(*) FILTER (WHERE event_type = 'signup')     AS signups,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE event_type = 'signup')
    / NULLIF(COUNT(*) FILTER (WHERE event_type = 'click'), 0),
  1)                                                AS click_to_signup_pct
FROM referral_events
WHERE metadata->>'utm_source' IS NOT NULL
GROUP BY 1, 2, 3
ORDER BY signups DESC
LIMIT 20;
```

**What to do with this:**
- `producthunt` source with high click volume → confirm PH launch day attribution
- `reddit` or `twitter` → identify which post/thread drove the spike; replicate content format
- Low click_to_signup_pct for a source → the referral link landing experience broke for that audience (check device/browser for anomalies)

---

### Query 5 — Cohort retention (W1 / W4 / W8)

**Answers:** Are users coming back? Are we improving activation week-over-week?

```sql
-- Pull directly from the materialised view created in 20260518_growth_metrics_view.sql
SELECT
  week,
  cohort_size,
  w1   AS "W1 retention %",
  w2   AS "W2 retention %",
  w4   AS "W4 retention %",
  w8   AS "W8 retention %"
FROM cohort_retention
ORDER BY week_iso DESC
LIMIT 12;
```

**Benchmarks:**
- W1 ≥ 40% → healthy activation (industry: 25–35% for consumer tools)
- W4 ≥ 20% → sticky habit forming around occasions
- W8 ≥ 15% → users are returning for repeat events (second birthday, Christmas after summer signup)

**What to do with this:**
- W1 dropping over time → a recent change hurt activation; correlate with deploy log
- W4 > W1 → users are returning for occasions after initial inactivity; this is expected for GiftHint and OK, but signals that occasion-date reminders are the key retention lever, not daily habits

---

### Query 6 — Revenue attribution: buy clicks by retailer and affiliate network

**Answers:** Which retailers drive the most revenue? Is Amazon still dominant or have non-Amazon clicks grown?

```sql
-- Revenue breakdown by retailer and affiliate network
SELECT
  retailer,
  affiliate_network,
  COUNT(*)                                                          AS click_count,
  ROUND(SUM(estimated_commission_pence) / 100.0, 2)                AS estimated_revenue_usd,
  ROUND(AVG(estimated_commission_pence) / 100.0, 4)                AS avg_commission_per_click,
  ROUND(
    100.0 * COUNT(*) / SUM(COUNT(*)) OVER (),
  1)                                                                AS pct_of_clicks
FROM click_events
GROUP BY retailer, affiliate_network
ORDER BY estimated_revenue_usd DESC
LIMIT 15;
```

**What to do with this:**
- If Amazon > 50% of clicks → Skimlinks non-Amazon strategy is under-indexed; check if alternative gift panel is surfacing non-Amazon options
- Identify top 3 non-Amazon retailers → these are the first direct partnership targets (use retailer-partnership-package.md outreach templates)
- Low avg_commission_per_click on a high-volume retailer → commission rate is too low; prioritise that retailer for direct negotiation

---

### Query 7 — Premium theme adoption

**Answers:** Are paid users actually using themes? Which theme is most popular?

```sql
-- Theme distribution across all wishlists
SELECT
  theme,
  COUNT(*)                                                 AS wishlists,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1)      AS pct_of_all_wishlists,
  COUNT(DISTINCT user_id)                                  AS unique_wishers
FROM wishlists
WHERE is_public = true
GROUP BY theme
ORDER BY wishlists DESC;
```

```sql
-- Cross-tab: theme usage by subscription tier
SELECT
  w.theme,
  COUNT(*) FILTER (WHERE u.subscription_status = 'pro')           AS pro_wishlists,
  COUNT(*) FILTER (WHERE u.subscription_status = 'free'
                   AND u.premium_themes_enabled = true)            AS referral_unlock_wishlists,
  COUNT(*) FILTER (WHERE u.subscription_status = 'free'
                   AND u.premium_themes_enabled = false)           AS free_wishlists
FROM wishlists w
JOIN users u ON u.id = w.user_id
WHERE w.theme <> 'default'
GROUP BY w.theme
ORDER BY pro_wishlists DESC;
```

**What to do with this:**
- High theme adoption among Pro users → themes are a real retention driver for paid tier; add more themes in Phase 4
- Theme adoption near 0 even for Pro → UX discovery problem; the ThemeSelector may not be prominent enough in list settings
- One theme dominant → lean into it for marketing ("GiftHint Midnight — used by 40% of Pro wishlists")

---

### Query 8 — Group gift funnel health

**Answers:** Do group gifts complete, or do they stall open?

```sql
-- Group gift pool status distribution + average completion time
SELECT
  status,
  COUNT(*)                                                 AS pools,
  ROUND(AVG(collected_amount::numeric), 0)                 AS avg_collected_pence,
  ROUND(AVG(target_amount::numeric), 0)                    AS avg_target_pence,
  ROUND(
    AVG(
      CASE WHEN funded_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (funded_at - created_at)) / 3600.0
      END
    ),
  1)                                                       AS avg_hours_to_funded
FROM group_gift_pools
GROUP BY status
ORDER BY pools DESC;
```

**What to do with this:**
- `open` count >> `funded` count → gifters are starting pools but not completing; send organiser a "3 contributors joined, 2 more needed!" nudge email
- `cancelled` > 20% of total → pools are being abandoned; add a "can't reach target? Lower it" CTA at the 7-day mark
- avg_hours_to_funded < 48h → pools complete quickly; tighten the organiser notification copy around "share now while people are engaged"

---

### Query 9 — Pro subscriber churn and conversion funnel

**Answers:** Are Pro subscribers staying? How long does it take from signup to subscribe?

```sql
-- Subscription status distribution with time-to-subscribe
SELECT
  u.subscription_status,
  COUNT(*)                                                 AS users,
  ROUND(
    AVG(
      EXTRACT(EPOCH FROM (
        -- When did they first subscribe? Approximate via stripe_customer_id creation.
        -- For accurate time-to-subscribe, join on a subscriptions_log table if available.
        CASE WHEN u.stripe_customer_id IS NOT NULL
        THEN u.created_at  -- placeholder; replace with actual checkout timestamp if logged
        END
        - u.created_at
      )) / 86400.0
    ),
  1)                                                       AS avg_days_to_subscribe
FROM users u
GROUP BY u.subscription_status
ORDER BY users DESC;

-- Cancelled subscriptions: are they in grace period or fully lapsed?
SELECT
  CASE
    WHEN subscription_period_end > now() THEN 'grace_period_active'
    ELSE                                      'fully_lapsed'
  END                                                      AS cancel_state,
  COUNT(*)                                                 AS users,
  ROUND(AVG(
    EXTRACT(EPOCH FROM (now() - subscription_period_end)) / 86400.0
  ), 0)                                                    AS avg_days_since_lapse
FROM users
WHERE subscription_status = 'cancelled'
GROUP BY 1;
```

**What to do with this:**
- High grace_period_active → recently cancelled users are still in period; this is the win-back window; send a "we're sorry to see you go" email with a retention offer
- Churn > 15%/month → pricing resistance; A/B test annual plan promotion more aggressively
- avg_days_to_subscribe < 7 → users know they want Pro fast; put upgrade CTA on first session (after first item saved)

---

## SECTION 3 — WHAT WORKED / WHAT DIDN'T

*Fill in after running all queries above and reviewing Vercel Analytics, Stripe dashboard, and Resend dashboard.*

---

### Top 3 growth drivers

1. **[Fill in]** — e.g. "Viral gifter page CTA drove 38% of signups; the 'Create your own list' bar converted at 4.2%"
2. **[Fill in]** — e.g. "ProductHunt launch delivered 620 signups in 48 hours, seeded initial referral network"
3. **[Fill in]** — e.g. "Blog post 'How to build a wedding gift registry without Amazon' ranked #3 for 'gift registry UK' and drove consistent 80 signups/week organically"

### Top 3 things that underperformed

1. **[Fill in]** — e.g. "Price drop alerts had 41% open rate (target 45%) — recipients opened but click-through to gifter page was only 12%, below the 20% target"
2. **[Fill in]** — e.g. "Partner programme signed 4 partners (target: 8); outreach to wedding blogs had a 12% response rate — lower than expected"
3. **[Fill in]** — e.g. "Group gift feature: 67% of pools stalled at < 50% funded; the 7-day nudge email was added too late in Phase 3"

### Biggest unexpected finding

**[Fill in]** — e.g. "D30 retention of 31% exceeded the 25% target, but the pattern was strongly bimodal: users who added ≥5 items in week 1 retained at 58%, while users who added ≤2 items retained at only 11%. The 5-item activation threshold should be the onboarding focus for Phase 4."

### Feature with highest engagement

**[Fill in]** — Measure by: weekly_active_wishers / total users (WAU/MAU ratio), items saved per session, buy clicks per gifter page visit.

*Candidate hypothesis to verify:*
```sql
-- Items saved by occasion type — which occasions drive the most engagement?
SELECT
  w.occasion,
  COUNT(wi.id)                              AS items_saved,
  COUNT(DISTINCT w.user_id)                 AS unique_wishers,
  ROUND(COUNT(wi.id)::numeric
    / NULLIF(COUNT(DISTINCT w.user_id), 0), 1)
                                            AS avg_items_per_wisher
FROM wishlists w
JOIN wishlist_items wi ON wi.wishlist_id = w.id
GROUP BY w.occasion
ORDER BY items_saved DESC;
```

### Feature with lowest adoption

**[Fill in]** — e.g. "DNA tags: only 14% of items had any tag applied despite the tag picker being prominent in ItemEditor. Suggests users don't understand the value — Phase 4 should either auto-tag or remove the explicit tagging step and infer from product title/URL."

*Verify:*
```sql
-- Items with no DNA tags at all
SELECT
  ROUND(100.0 *
    COUNT(*) FILTER (WHERE array_length(dna_tags, 1) IS NULL OR array_length(dna_tags, 1) = 0)
    / COUNT(*),
  1) AS pct_items_with_no_tags
FROM wishlist_items;
```

---

## SECTION 4 — PHASE 4 PRIORITY INPUTS

*Each candidate feature is ranked against three evidence signals: demand (data shows users want it), friction (current product has a gap), and revenue impact. Fill in [X] after running queries and reviewing analytics.*

---

### Signal 1 — Mobile app demand

**Check in Vercel Analytics** → Audience → Devices

```
Mobile traffic share of gifter page visits: [X]%
Mobile traffic share of dashboard visits:   [X]%
Mobile share of buy clicks:                 [X]%
```

**Decision rule:**
- Mobile gifter page > 60% → gifters are on mobile; a native app is less critical (gifter experience works fine in browser)
- Mobile dashboard > 40% → wishers are managing lists on mobile; a native app has a real job to do
- Mobile buy click rate lower than desktop (e.g. 18% vs 32% desktop) → mobile UX has friction on the gifter page; fix PWA first before native app

**Recommended check:**
```sql
-- Do mobile users save fewer items per session? (proxy: items per user for phone-sized referrers)
-- This requires user_agent data from click_events if stored; check cta_events.user_agent
SELECT
  CASE
    WHEN user_agent ILIKE '%Mobile%' OR user_agent ILIKE '%Android%' THEN 'mobile'
    ELSE 'desktop'
  END                    AS device,
  COUNT(*)               AS cta_events,
  COUNT(DISTINCT gifter_page_username) AS pages_with_clicks
FROM cta_events
WHERE user_agent IS NOT NULL
GROUP BY 1;
```

**Phase 4 priority: [HIGH / MEDIUM / LOW]** — based on data above.

---

### Signal 2 — AI gift suggestions (DNA tag click-through)

**Answers:** Did the alternative gift recommendation panel drive buy clicks beyond the wisher's original items?

```sql
-- Buy clicks where the retailer is NOT the same as the item's source_url domain
-- This is a proxy for "gifter bought something the wisher didn't explicitly link"
-- which signals demand for AI-assisted suggestions
SELECT
  affiliate_network,
  COUNT(*)                                  AS total_clicks,
  -- Alternative gift clicks = clicks on items that differ from source_url retailer
  -- Requires joining click_events → wishlist_items → comparing retailer fields
  COUNT(*) FILTER (
    WHERE ce.retailer <> COALESCE(
      regexp_replace(wi.source_url, '^https?://(?:www\.)?([^/]+).*$', '\1'),
      ce.retailer
    )
  )                                         AS possible_alternative_clicks
FROM click_events ce
JOIN wishlist_items wi ON wi.id = ce.item_id
GROUP BY affiliate_network;
```

```sql
-- DNA tag diversity: are items getting tagged across many categories?
SELECT
  unnest(dna_tags)      AS tag,
  COUNT(*)              AS items_tagged
FROM wishlist_items
WHERE array_length(dna_tags, 1) > 0
GROUP BY tag
ORDER BY items_tagged DESC
LIMIT 20;
```

**Phase 4 priority: [HIGH / MEDIUM / LOW]** — if DNA tag adoption < 15% of items, AI auto-tagging is more valuable than a manual tag picker. If buy clicks on non-primary items are > 10% of total, alternative suggestions are working and worth expanding.

---

### Signal 3 — Direct retailer deals (partnership pipeline)

**Track separately in a CRM or simple spreadsheet (not in Supabase):**

```
Target outreach emails sent:    [X]
Target responses received:      [X] ([X]% response rate)
Etsy outreach emails sent:      [X]
Etsy responses received:        [X] ([X]% response rate)
Sephora outreach emails sent:   [X]
Sephora responses received:     [X] ([X]% response rate)
Best Buy outreach emails sent:  [X]
Best Buy responses received:    [X] ([X]% response rate)
Deals in negotiation:           [X]
Deals closed:                   [X]
Enhanced commission rate secured: [X]% (vs [X]% standard)
```

```sql
-- Current non-Amazon revenue to benchmark against direct deal potential
SELECT
  retailer,
  COUNT(*)                                  AS clicks,
  SUM(estimated_commission_pence) / 100.0   AS current_est_revenue_usd,
  -- If we secured 3% instead of 1% on Target, what would that be worth?
  SUM(estimated_commission_pence) / 100.0 * 3  AS revenue_at_3pct_commission
FROM click_events
WHERE affiliate_network = 'skimlinks'
GROUP BY retailer
ORDER BY clicks DESC
LIMIT 10;
```

**Phase 4 priority: [HIGH / MEDIUM / LOW]** — if no retailer responded to outreach, de-prioritise direct deals and focus on Skimlinks rate optimisation instead. If 2+ retailers are in negotiation, dedicate Phase 4 week 2 to closing them.

---

### Signal 4 — International expansion

**Answers:** Where are users already coming from? Is there an organic international beachhead?

```sql
-- User distribution by country — requires IP geolocation data
-- If not stored in users table, check Vercel Analytics → Geography tab instead

-- Proxy: check currency distribution in wishlist_items
SELECT
  currency,
  COUNT(*)                                  AS items,
  COUNT(DISTINCT user_id)                   AS unique_users,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS pct
FROM wishlist_items
WHERE currency IS NOT NULL AND currency <> ''
GROUP BY currency
ORDER BY items DESC;
```

```sql
-- Source URL TLD distribution as a proxy for user geography
SELECT
  regexp_replace(source_url, '^https?://(?:www\.)?[^/]+(\.[a-z]{2,}).*$', '\1') AS tld,
  COUNT(*)                                  AS items_from_tld,
  COUNT(DISTINCT user_id)                   AS unique_users
FROM wishlist_items
WHERE source_url ~ '\.'
GROUP BY 1
ORDER BY items_from_tld DESC
LIMIT 15;
```

**Decision rule:**
- UK TLD (`.co.uk`, `amazon.co.uk`) > 15% of items → UK users are active without any explicit UK support; add UK affiliate programmes (AWIN, Skimlinks UK rates) in Phase 4
- Non-English TLDs (`.de`, `.fr`, `.es`) > 5% → international demand signal is real; plan localisation sprint for Phase 5

**Check also in Vercel Analytics → Geography → Top Countries**

**Phase 4 priority: [HIGH / MEDIUM / LOW]** — based on currency/TLD data above.

---

### Phase 4 Feature Priority Matrix

*Fill in after completing all four signal checks above.*

| Feature | Demand Signal | Friction Signal | Revenue Impact | Phase 4 Priority |
|---------|--------------|-----------------|----------------|-----------------|
| Mobile app (iOS) | [H/M/L] | [H/M/L] | [H/M/L] | **[1–5]** |
| AI gift suggestions | [H/M/L] | [H/M/L] | [H/M/L] | **[1–5]** |
| Direct retailer deals | [H/M/L] | [H/M/L] | [H/M/L] | **[1–5]** |
| International expansion | [H/M/L] | [H/M/L] | [H/M/L] | **[1–5]** |
| More premium themes | [H/M/L] | [H/M/L] | [H/M/L] | **[1–5]** |
| Team/family wishlists | [H/M/L] | [H/M/L] | [H/M/L] | **[1–5]** |

*Scoring: 1 = build first, 5 = defer. Highest demand + highest friction + highest revenue = 1.*

---

## SECTION 5 — INVESTOR-READY SUMMARY

*Clean one-page traction summary for angel investors and accelerator applications (YC, Entrepreneur First, Antler). Fill in [X] values before sharing.*

---

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   GIFTHINT  —  Wishlist infrastructure for the $475B gifting economy        │
│                                                                             │
│   "The gift registry for every occasion — not just weddings."               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### The Problem

Gift-giving is broken. Givers spend hours guessing, recipients get unwanted items, and retailers process $890B in annual returns. Existing wishlists (Amazon, wedding registries) are siloed, occasion-specific, and retailer-captured. Nobody owns the layer between "I want this" and "someone bought it for me."

### The Product

GiftHint is a universal wishlist platform that lets anyone save items from any retailer, share occasion-specific lists with gifters, and get bought exactly what they asked for.

**For wishers:**  Add items from any website via browser extension. Share a clean, public gifter page for any occasion (birthday, wedding, baby shower, Christmas).

**For gifters:**  See exactly what's wanted, in one place, with a single Buy button. Coordinate with others via group gifts. Never buy something already claimed.

**Flywheel:**  Every gifter page view is a potential new user. Viral CTA bar on public gifter pages drives [X]% of signups.

### Traction — [Month] [Year] · [X] weeks live

| Metric | Value |
|--------|-------|
| Registered users | **[X]** (target was 10,000) |
| Weekly active wishers | **[X]** |
| Items saved | **[X]** |
| Buy clicks / month | **[X]** |
| D30 retention | **[X]%** |
| Viral coefficient K | **[X]** |
| Group gifts funded | **[X]** |
| MoM user growth (last 3 months) | **[X]%** · **[X]%** · **[X]%** |

### Monetisation

**Two revenue streams, both live:**

**1. Affiliate commissions** (zero marginal cost)
Every buy click generates affiliate revenue. Amazon Associates (up to 10%) + Skimlinks (1–8% across 48,500 retailers). Current: $[X]/month estimated. At 100k MAU with the same engagement profile: ~$35k/month.

**2. GiftHint Pro — $4.99/month** (launched [Month] [Year])
Premium features: 5 exclusive gifter page themes, unlimited wishlists, advanced analytics, priority support. Current: [X] paying subscribers = **$[X] MRR**. Conversion rate from free → Pro: [X]%. LTV at current churn: $[X].

**Unit economics (per user, lifetime):**
- Affiliate revenue per user: $[X]
- Pro subscription revenue per user (blended, including free tier): $[X]
- Total revenue per user: $[X]
- CAC (referral-driven): ~$0 for [X]% of users; ~$[X] blended including content/seeding

### Why now

1. **Affiliate rates are rising.** Amazon raised Associates rates in three categories in 2025; Skimlinks publisher revenue grew 22% YoY as brand budgets shifted from paid social to performance channels.
2. **Registry behaviour is normalising beyond weddings.** Gen Z and Millennials create wishlists for birthdays, housewarmings, and baby showers with the same expectation that registries meet. GiftHint is the only product built for this.
3. **Browser extensions are the new content discovery.** The GiftHint extension installs drive passive item-saving behaviour that feeds gifter page viral loops without requiring daily active engagement.

### Team

**[Founder name]** — [background]. Built GiftHint from 0 to [X] users in [X] weeks without paid acquisition.

*(Looking for:)* Co-founder with iOS/Android engineering background. Optionally: a growth/community hire for Phase 4 international expansion.

### The Ask

**Raising:** $[amount] angel round / pre-seed
**Use of funds:**
- 40% — iOS app development (Mobile traffic = [X]% of gifter page visits; native app removes key retention friction)
- 30% — Direct retailer partnerships (Target, Sephora, Etsy at 3–8% commission vs. current 1–2%)
- 20% — Growth / community (Reddit seeding, influencer gifting programme, UK launch)
- 10% — Infrastructure & compliance (GDPR localisation, Supabase compute upgrade for 100k MAU)

**Target milestones with this round:**
- 50,000 users in 6 months
- $15,000 MRR (affiliate + Pro combined)
- 1 direct retailer deal closed at ≥3% commission
- iOS app in App Store

**Contact:** [email] · [LinkedIn] · gifthint.io

---

*GiftHint is currently generating revenue. This summary is for informational purposes. Full cap table, financials, and technical due diligence available on request.*

---

## APPENDIX — HOW TO RUN THIS REVIEW

**Estimated time:** 2–3 hours

1. **Open Supabase SQL Editor** at `https://supabase.com/dashboard/project/pxegvviakrjhldtwtobi/sql`
2. Run Queries 1–9 in order. Paste results into the tables in Sections 1 and 3.
3. **Open Vercel Analytics** → check Geography, Devices, and Top Pages for mobile/international signals. Fill in Section 4.
4. **Open Resend dashboard** → Email → check price alert delivery rates and open rates. Fill into Section 1.2.
5. **Open Stripe dashboard** → check MRR, churn rate, and subscriber count. Fill into Section 1.3.
6. **Open ProductHunt project page** → record final upvote count and peak rank. Fill into Section 1.5.
7. Fill in Section 3 (What Worked) from the patterns you observed.
8. Score the Phase 4 matrix in Section 4 based on all signals.
9. Fill in all [X] values in Section 5 and share with investors.
