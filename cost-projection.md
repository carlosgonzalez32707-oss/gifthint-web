# GiftHint — Infrastructure Cost & Revenue Projection at 10k MAU

> **Assumptions**: All figures are monthly unless stated otherwise.
> Exchange rate: £1 = $1.27 (May 2026).
> "MAU" = Monthly Active Users who have logged in and have ≥ 1 saved item.
>
> Sources: published pricing pages as of May 2026. Confirm current rates before
> budget sign-off — cloud pricing changes frequently.

---

## Traffic model at 10k MAU

These numbers feed every cost estimate below.

| Metric | Estimate | Basis |
|--------|----------|-------|
| Registered users | 14,000 | 10k MAU = ~70% of registrations |
| Monthly active users (MAU) | 10,000 | North Star metric |
| Wishlists total | 25,000 | 2.5 wishlists/user avg |
| Wishlist items total | 250,000 | 25 items/wisher avg |
| Gifter page visits/month | 30,000 | 3 gifter visits per wisher per month |
| Gifter page views (pageloads) | 90,000 | 3 pages/visit avg |
| Buy-button clicks/month | 27,000 | 30% CTR on gifter page items |
| Item saves via extension/month | 50,000 | 5 saves/active user/month |
| API requests/month (total) | ~2.1M | See breakdown below |
| DB rows written/month | ~400k | clicks + views + saves + price checks |
| Emails sent/month | ~47k | See Resend section |

### API request breakdown

| Endpoint | Requests/month |
|----------|---------------|
| `GET /list/:username/:slug` (ISR, mostly CDN) | 90,000 |
| `POST /api/track-view` | 90,000 |
| `POST /api/track-click` | 27,000 |
| `POST /api/claim` | 3,000 |
| `POST /api/reminder-signup` | 1,500 |
| `POST /api/extension-error` | 5,000 |
| Middleware (global, all routes) | ~1,800,000 |
| Cron jobs (5 jobs × 30 days) | 150 |
| Admin / dashboard API | 5,000 |
| Supabase direct (extension saves) | 100,000 |
| **Total** | **~2.12M** |

---

## 1 · Supabase

**Plan**: Pro — $25/month (includes 8 GB storage, 250 GB egress, 2 GB RAM compute)

### Data transfer (egress)

| Source | Monthly volume | Calc |
|--------|---------------|------|
| Gifter page: items + images metadata | 30k visits × ~15 KB JSON | ~450 MB |
| Dashboard: wishlist + analytics data | 10k active wishers × ~10 KB | ~100 MB |
| Click events (analytics reads) | Admin dashboard 30× daily × ~500 KB | ~15 MB |
| Extension: item list load | 50k saves × ~2 KB dup-check | ~100 MB |
| Cron jobs: price check reads | 250k items × daily × ~0.5 KB/batch | ~1.5 GB |
| Page views (write + occasional read) | ~90k rows written | ~30 MB |
| **Total egress estimate** | | **~2.2 GB/month** |

Pro plan includes 250 GB egress. **Well within limit.**  
Overage if exceeded: $0.09/GB.

### Storage

| Table | Rows | Size |
|-------|------|------|
| wishlist_items | 250,000 | ~130 MB |
| click_events (rolling 12m) | ~3.6M | ~1.8 GB |
| page_views (rolling 12m) | ~1.08M | ~500 MB |
| price_history (rolling 12m) | ~7.2M | ~2.3 GB |
| users + wishlists + misc | ~50k | ~30 MB |
| **Total** | | **~4.8 GB** |

Pro plan: 8 GB storage. **Healthy headroom; archive per database-maintenance.md.**  
Overage if exceeded: $0.125/GB/month.

### Compute (database CPU/RAM)

| Scenario | Compute hours |
|----------|--------------|
| Standard queries (index reads) | ~200h |
| Cron-driven price checks (batch writes) | ~50h |
| Analytics (aggregations) | ~20h |
| **Total** | **~270 compute hours/month** |

Pro plan: 500 compute hours/month included.  
Overage: $0.01/compute hour.

### Supabase cost summary

| Item | Cost |
|------|------|
| Pro plan (base) | $25.00 |
| Storage overage (est. 0 GB over 8 GB) | $0.00 |
| Egress overage (est. 0 GB over 250 GB) | $0.00 |
| Compute overage (est. 0h over 500h) | $0.00 |
| **Supabase total** | **$25.00/month** |

---

## 2 · Vercel

**Plan**: Pro — $20/month per seat (assume 2 seats = $40/month)

### Function invocations

| Source | Invocations/month |
|--------|------------------|
| Middleware (all /api/* + /admin/*) | ~2,120,000 |
| API routes (distinct serverless invocations) | ~225,000 |
| ISR revalidations (gifter pages, 60s TTL) | ~90,000 |
| **Total serverless invocations** | **~2.4M** |

Vercel Pro: 1M included, then $0.40 per additional 1M.  
Overage: 1.4M × $0.40 = **$0.56/month** — negligible.

### Bandwidth

| Source | Bandwidth |
|--------|----------|
| ISR-cached gifter pages (HTML, ~40 KB each) | 90k × 40 KB = ~3.6 GB |
| Static assets (JS, CSS — CDN) | ~2 GB |
| API responses (JSON, < 2 KB each) | 225k × 2 KB = ~450 MB |
| **Total** | **~6.1 GB** |

Vercel Pro: 1 TB included. **Well within limit.**  
Overage: $0.40/GB over limit.

### Vercel cost summary

| Item | Cost |
|------|------|
| Pro plan (2 seats) | $40.00 |
| Function invocation overage (~1.4M extra) | $0.56 |
| Bandwidth overage (none) | $0.00 |
| **Vercel total** | **~$40.56/month** |

---

## 3 · Upstash Redis

**Plan**: Pay-as-you-go (no monthly base fee — charged per command)

### Command volume

At 10k MAU with 14 requests/day per active user, origin traffic is
**140k requests/day** (static assets served from Vercel CDN edge do not reach
middleware or Redis).

| Use case | Daily commands | Monthly |
|----------|---------------|---------|
| Global middleware rate limit | 140k req/day × 2 cmds | ~8.4M |
| Track-click rate limit | 900 req/day × 2 cmds | ~54k |
| Track-view rate limit | 3k req/day × 2 cmds | ~180k |
| Claim rate limit | 100 req/day × 2 cmds | ~6k |
| Abuse detection counters | 5k events/day × 2 cmds | ~300k |
| IP blocklist SISMEMBER | 140k req/day × 1 cmd | ~4.2M |
| Ban/unban operations | ~10/day | ~300 |
| **Total** | | **~13.1M commands/month** |

> **Note on middleware volume**: Middleware is invoked only for requests that
> reach the Vercel origin — CDN-cached ISR pages, static JS/CSS bundles, and
> image-optimisation responses are served at the edge and bypass middleware
> entirely. 140k origin requests/day = 10k MAU × 14 origin req/day average.

Upstash pricing: $0.20 per 100k commands = $0.000002/command  
**13.1M × $0.000002 = ~$26/month**

However: the Upstash free tier (10k commands/day = 300k/month) is insufficient.
Pay-as-you-go has no monthly minimum — charges begin at the first request.

| Item | Cost |
|------|------|
| Pay-as-you-go (~13.1M commands) | ~$26 |
| **Upstash total** | **~$26/month** |

---

## 4 · Resend

**Plan**: Pro — $20/month (50k emails/month included)

### Email volume breakdown

| Email type | Frequency | Monthly volume |
|-----------|-----------|---------------|
| Weekly digest | Every Monday to all MAU | 10,000 × 4.3 weeks = **43,000** |
| Price-drop alerts | 2% of 250k items trigger once each/month | ~5,000 |
| Gift-pool funded | ~5 pools funded/day, 1 email each | ~150 |
| Reminder emails | 15% of MAU get a reminder/month | ~1,500 |
| **Total** | | **~49,650/month** |

Resend Pro: 50k emails/month. **Just within limit at 10k MAU.**  
Upgrade to Business ($90/month, 100k emails) when MAU approaches 12k.

Overage on Pro: $1.00 per 1k extra emails.

| Item | Cost |
|------|------|
| Pro plan (50k emails/month) | $20.00 |
| Overage (est. 0 emails over 50k) | $0.00 |
| **Resend total** | **$20.00/month** |

---

## 5 · Stripe

**Fees**: 1.5% + 20p per transaction (UK Stripe, domestic cards).
International cards: 2.5% + 20p.

### Group-gift transaction volume

At 10k MAU, assume a small fraction use group gifting:

| Metric | Estimate | Basis |
|--------|----------|-------|
| Active gift pools/month | 50 | 0.5% of MAU organise a pool |
| Average pool target | £60 | Typical shared gift value |
| Average contributors/pool | 5 | 5 friends contributing £12 each |
| Total transactions/month | 250 | 50 pools × 5 contributors |
| Average transaction value | £12 | |
| Total payment volume | £3,000 | |

### Stripe fees

| Fee type | Calculation | Monthly cost |
|----------|-------------|-------------|
| Processing fee (1.5%) | £3,000 × 1.5% | £45.00 |
| Per-transaction fee (20p) | 250 × £0.20 | £50.00 |
| **Total Stripe fees** | | **£95.00 (~$121/month)** |

Note: These fees are deducted from the payment volume. If GiftHint does not
take a platform cut from group gifts, the full £3,000 passes to the wisher
(minus Stripe's fee). GiftHint's current architecture does not charge a platform
fee on group gifts — Stripe fees are borne by the pool organiser.

If you add a platform fee (e.g. 2.5%):
- Platform revenue from group gifts: £3,000 × 2.5% = **£75/month** (~$95)
- This offsets Stripe fees almost exactly at this scale.

| Item | Cost |
|------|------|
| Stripe processing + per-transaction | ~£95.00 (~$121) |
| **Stripe total** | **~$121/month** |

---

## 6 · Sentry

**Plan**: Team — $26/month (100k errors/month, 1M performance units)

### Error + performance volume

| Source | Monthly events |
|--------|---------------|
| Errors (10% sample of 50k req/day = 5k traced) | ~2k errors/month (est. 4% error rate) |
| Performance transactions (10% sample) | ~630k transactions/month |
| Session Replays (2% of 90k gifter visits) | ~1,800 replays |

Sentry Team: 100k errors, 1M perf units. **Comfortably within limits.**

| Item | Cost |
|------|------|
| Team plan | $26.00 |
| **Sentry total** | **$26.00/month** |

---

## 7 · Total infrastructure cost

| Service | Monthly cost |
|---------|-------------|
| Supabase Pro | $25.00 |
| Vercel Pro (2 seats) | $40.56 |
| Upstash Redis (pay-as-you-go) | $26.00 |
| Resend Pro | $20.00 |
| Stripe (Gifter + pool fees) | $121.00 |
| Sentry Team | $26.00 |
| **Total** | **$258.56/month** |

**Infrastructure cost per MAU: $0.026/month (~2.6 cents per active user)**

This is extremely lean. The dominant cost is Stripe (>46%) which only applies to
group-gift transactions. The core product (wishlists + affiliate clicks) costs
~$138/month to run at 10k MAU.

---

## 8 · Revenue projection at 10k MAU

GiftHint earns through two channels: affiliate commissions on buy-clicks, and
(future) platform fees on group gifts.

### Channel 1 — Amazon Associates affiliate commissions

| Metric | Value | Source |
|--------|-------|--------|
| Gifter page visits/month | 30,000 | Traffic model above |
| Gifter pages viewed/visit | 3 | Avg items browsed |
| Buy-button click rate | 30% per visited page | Gifting intent is high |
| Total buy clicks/month | 27,000 | 30k × 3 × 30% |
| Amazon click share | 45% | Amazon is the dominant retailer |
| Amazon clicks/month | 12,150 | |
| Conversion rate (click → purchase) | 8% | Amazon Associates avg ~8-12% |
| Purchases attributed/month | 972 | |
| Avg order value | £35 | Typical gift spend in UK |
| Amazon commission rate (avg) | 4.5% | Mix of All Other (4%) + higher categories |
| **Amazon commission/month** | **972 × £35 × 4.5%** | **~£1,531** |

### Channel 2 — Skimlinks commissions (non-Amazon)

| Metric | Value |
|--------|-------|
| Non-Amazon clicks/month | 14,850 (55% of 27k clicks) |
| Skimlinks eligible share | 60% (not all non-Amazon retailers are eligible) |
| Eligible clicks/month | 8,910 |
| Conversion rate | 5% (lower than Amazon) |
| Avg order value | £45 (higher-end non-Amazon gifts: Etsy, NOTHS) |
| Skimlinks avg commission rate | 6% (Skimlinks typically 2-15%, avg ~6%) |
| **Skimlinks commission/month** | 8,910 × 5% × £45 × 6% = **~£1,205** |

### Total revenue projection

| Stream | Monthly (£) | Monthly ($) |
|--------|------------|------------|
| Amazon Associates | £1,531 | ~$1,944 |
| Skimlinks | £1,205 | ~$1,530 |
| Group-gift platform fee (2.5%, if implemented) | £75 | ~$95 |
| **Total revenue** | **£2,811** | **~$3,569** |

### Contribution margin

| Item | Monthly ($) |
|------|------------|
| Total revenue | $3,569 |
| Infrastructure cost | ($259) |
| **Gross contribution margin** | **$3,310 (93%)** |

**Unit economics**: $3,569 revenue / 10,000 MAU = **$0.36 revenue per MAU**.
Infrastructure cost per MAU: $0.026.
**Margin: 92.7%** — the business is highly capital-efficient at this scale.

---

## 9 · Cost scaling outlook

| MAU | Revenue (est.) | Infra cost | Margin |
|-----|---------------|-----------|--------|
| 1,000 | $357 | $160* | 55% |
| 5,000 | $1,785 | $215 | 88% |
| **10,000** | **$3,569** | **$259** | **93%** |
| 20,000 | $7,138 | $340† | 95% |
| 50,000 | $17,845 | $650† | 96% |

*At 1k MAU most services are on free or entry plans.  
†Upgrade Supabase to Business ($599/month at 50k MAU), Resend to Business.

### When to upgrade each service

| Trigger | Action |
|---------|--------|
| MAU > 5,000 | Upgrade Resend to Pro (if not already) |
| MAU > 12,000 | Upgrade Resend to Business ($90/month) |
| DB storage > 7 GB | Upgrade Supabase storage add-on (+$0.125/GB) |
| click_events > 10M rows | Enforce archival policy immediately |
| Upstash commands > 500M/month | Switch to Upstash Pro ($180/month, better latency) |
| Stripe volume > £100k/month | Negotiate custom Stripe rates (~1.0% + 15p) |

---

## 10 · Sensitivity analysis

The revenue model depends heavily on three conversion rates. Here's how revenue
changes if they differ from the base case:

| Scenario | Buy-click rate | Purchase conversion | Monthly revenue |
|----------|---------------|---------------------|----------------|
| Conservative | 15% | 5% | ~$890 |
| **Base case** | **30%** | **8%** | **$3,569** |
| Optimistic | 45% | 12% | ~$8,030 |

The largest revenue lever is **gifter page engagement** — more items viewed and
clicked per visit. Design optimisations here have a 3-5× higher impact on
revenue than optimising commission rates.
