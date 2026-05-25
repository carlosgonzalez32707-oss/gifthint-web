# GiftHint Growth Targets — Phase 3

> Dashboard: `/admin/growth`
> SQL views: `supabase/migrations/20260518_growth_metrics_view.sql`
> Last updated: 2026-05-18

---

## North Star

| Metric | Value |
|--------|-------|
| **North Star** | Total registered users with ≥ 1 saved item |
| **Phase 3 target** | 10,000 activated users |
| **Target date** | Week 24 from Phase 3 launch |

---

## User milestones

| Week | Total users | Notes |
|------|-------------|-------|
| W0   | ~400        | Phase 3 baseline |
| W4   | 800         | ProductHunt launch echo |
| W8   | 1,800       | Partner pipeline active |
| W12  | 3,500       | Organic loop forming |
| W16  | 5,500       | Partner referrals compounding |
| W20  | 8,000       | Near-target acceleration |
| W24  | **10,000**  | North Star hit |

Growth rate implied: **~35% WoW** for the first 4 weeks post-PH launch, decaying to **~18% WoW** by W16 as the base grows.

---

## KPI definitions & targets

### 1. Viral K-factor

**Definition:**
```
K = new_referral_signups_last_30d / retained_users_who_could_refer
```

`retained_users_who_could_refer` = users who signed up > 30 days ago AND have saved ≥ 1 item (they've experienced the product and have a referral code to share).

| Level | K value | Interpretation |
|-------|---------|----------------|
| 🔴 Weak | K < 0.2 | Word-of-mouth not firing |
| 🟡 Building | 0.2 – 0.5 | Referral loop forming |
| 🟢 Strong | 0.5 – 1.0 | Viral contribution is real |
| 🚀 Viral | K > 1.0 | Exponential — each cohort grows |

**Phase 3 target:** K ≥ 0.5 by W12

**Levers:**
- Share-prompt after first item saved (currently post-save modal)
- Referral incentive: unlock DNA tags when ≥ 3 friends sign up via your link
- Partner program driving high-intent cohorts with stronger social context

---

### 2. Weekly Active Wishers (WAW)

**Definition:** Distinct users who created or updated at least one `wishlist_item` row in the last 7 calendar days.

This is the product's core engagement signal — saving a gift is the activation event and the retention event.

| Level | WAW | Interpretation |
|-------|-----|----------------|
| 🔴 Low | < 50 | Most users are dormant |
| 🟡 Growing | 50 – 200 | Reasonable for current total base |
| 🟢 Healthy | 200 – 500 | Strong weekly engagement density |
| 🚀 Scaling | > 500 | Audience flywheel working |

**Phase 3 target:** WAW ≥ 300 at 10,000 total users (3% WAU/MAU ratio is the floor; 5%+ is the goal)

**Levers:**
- Occasion reminder emails: "Your [Christmas / Birthday] is in 8 weeks — update your list"
- Gift-season calendar: push notifications or email campaigns timed to peak gifting dates
- List view improvements: make the dashboard compelling enough to return to

---

### 3. Revenue per User (RPU)

**Definition:**
```
RPU = SUM(click_events.estimated_commission_pence) / total_users
```

All values stored in **pence (integer)** to avoid floating-point issues. The dashboard displays as `£Xp` (pence).

`estimated_commission_pence` is back-filled from the Skimlinks Publisher API / Amazon PA API sync job. `NULL` is treated as 0 in aggregations.

| Level | RPU | Interpretation |
|-------|-----|----------------|
| 🔴 Early | < 5p | Most users haven't triggered buy-clicks yet |
| 🟡 Building | 5–20p | Buy-click funnel working at low volume |
| 🟢 Good | 20–50p | Meaningful affiliate contribution |
| 🚀 Strong | > 50p | Sustainable revenue per activated user |

**Phase 3 target:** RPU ≥ 15p at 10,000 users (implies ~£1,500 total affiliate revenue)

**Levers:**
- Retailer mix: Amazon and Etsy items have higher EPC than direct brands
- Guest buy-clicks: when a guest clicks "buy" on a claimed item, that's a trackable click
- Email nudges: "3 people are still looking at your [item] — remind them to buy?"

---

### 4. D30 Retention

**Definition:** Of users who (a) signed up ≥ 30 days ago AND (b) saved at least one item in their first 7 days (activated), what % have a wishlist_item activity in the 7-day window starting 30 days after their signup date?

```sql
-- Eligibility: signed up > 37 days ago (so W1 window + D30 window have both elapsed)
-- Numerator: activated AND active in [signup + 30d, signup + 37d]
-- Denominator: signed up > 30d ago (regardless of activation)
```

This is a strict retention definition — it only counts users who meaningfully engaged in W1. Unactivated users who churn immediately do not drag down the D30 number, but they do appear as zero in the cohort table.

| Level | D30 | Interpretation |
|-------|-----|----------------|
| 🔴 Poor | < 20% | Product-market fit risk |
| 🟡 Decent | 20–35% | Acceptable for early stage |
| 🟢 Strong | 35–50% | Real habit-forming signal |
| 🚀 Best-in-class | > 50% | Gift coordination is genuinely sticky |

**Phase 3 target:** D30 ≥ 35% by W16

**Levers:**
- Occasion date collection at signup (sets up a reason to return)
- Transactional emails when a guest claims or buys an item (brings wisher back)
- Smart notification: "Someone viewed your list!" (social proof of activity)

---

## Cohort retention targets (W1 / W2 / W4 / W8)

| Window | Target | Interpretation |
|--------|--------|----------------|
| W1 | ≥ 55% | Most activated users should return in week 1 |
| W2 | ≥ 40% | Natural drop-off; still strong if >40% |
| W4 | ≥ 30% | Monthly gifting cadence keeps returning users |
| W8 | ≥ 20% | Core retained audience — occasion cycle |

Colour coding in the dashboard:
- 🟢 Green: ≥ 40%
- 🟡 Amber: 20–39%
- 🔴 Red: < 20%
- — : window not yet elapsed

---

## Leading vs lagging indicators

| Indicator | Type | Cadence |
|-----------|------|---------|
| Weekly new signups (organic / referral / partner) | Leading | Weekly |
| Weekly Active Wishers | Leading | Weekly |
| Viral K-factor | Leading | Monthly |
| Partner onboarding pipeline | Leading | Weekly |
| D30 Retention | Lagging | Monthly |
| Revenue Per User | Lagging | Monthly |

Leading indicators should be reviewed every Monday. Lagging indicators are reviewed on the 1st of each month.

---

## Phase 3 milestone checklist

- [ ] **W4:** WAW ≥ 50, K ≥ 0.2 — ProductHunt + early community seeding working
- [ ] **W8:** WAW ≥ 120, K ≥ 0.3, ≥ 3 active partner pages live
- [ ] **W12:** 3,500 total users, D30 ≥ 25%, RPU ≥ 8p
- [ ] **W16:** 5,500 total users, D30 ≥ 35%, K ≥ 0.5, ≥ 8 active partners
- [ ] **W20:** 8,000 total users, WAW ≥ 250, RPU ≥ 12p
- [ ] **W24:** **10,000 users** 🎉, D30 ≥ 35%, WAW ≥ 300, RPU ≥ 15p

---

## Methodology notes

### K-factor simplification

The dashboard K is a *conversion K*, not a full *invite K* (which would require tracking how many referral links were shared, not just how many converted). Invite K = conversion K / invitation rate. We don't currently collect invitation-send data, so conversion K is used as a conservative proxy.

### RPU and commission lag

`estimated_commission_pence` is populated by a background sync job with a 48–72 hour lag from the Skimlinks / Amazon PA API. The RPU figure in the dashboard is always 2–3 days behind actual click activity. This is expected and documented.

### D30 window

D30 uses a 7-day activity window rather than a point-in-time check (was the user active on day 30 exactly?) because wishlist activity is occasion-driven, not daily. A 7-day window captures the natural "I'm planning a gift event" session cluster.
