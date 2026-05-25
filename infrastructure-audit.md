# GiftHint — Pre-10k Infrastructure Audit

> **Purpose**: Confirm every infrastructure layer can sustain 10,000 MAU before
> you hit that scale, not after. Work through this checklist top-to-bottom.
> Each item has a pass/fail criterion and an action if it fails.
>
> **Last audited**: —  
> **Auditor**: —  
> **Next review**: when MAU crosses 5,000

---

## How to use this checklist

Each item has three columns you fill in:

| Column | Meaning |
|--------|---------|
| **Status** | ✅ Pass · ⚠️ Needs action · ❌ Fail · — Not checked |
| **Evidence** | Screenshot URL, plan name, metric value |
| **Action** | What to do if the item fails |

---

## 1 · Database — Supabase

### 1.1 Plan supports 10k MAU + connection pooling

**Why it matters**: Supabase Free plan caps at 500 MB storage and 2 GB egress/month.
The Pro plan ($25/month) includes 8 GB storage, 250 GB egress, and — critically —
PgBouncer connection pooling. Without pooling, Vercel serverless functions exhaust
Postgres connections within minutes of a traffic spike.

| Check | Pass criterion | Status | Evidence |
|-------|---------------|--------|----------|
| Supabase plan | Pro or higher | — | — |
| PgBouncer enabled | Database → Settings → Connection pooling → Mode = Transaction | — | — |
| Pool size | ≥ 15 connections | — | — |
| Direct connection string NOT used | lib/supabase-server.ts uses pooler URL (port 6543) | — | — |
| Max connections headroom | `SHOW max_connections` returns ≥ 100 | — | — |

**Action if failing**: Upgrade to Supabase Pro. Enable connection pooling in
`Database → Settings → Connection Pooling`. Update `DATABASE_URL` in Vercel to
use the pooler URL (`postgresql://postgres:[password]@db.[ref].supabase.co:6543/postgres?pgbouncer=true`).

---

### 1.2 All performance indices applied

All indices from `supabase/migrations/20260518_db_optimisation.sql` must be present.

Run in the Supabase SQL editor to verify:

```sql
SELECT indexname, tablename, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_wishlist_items_wishlist_id',
    'idx_wishlist_items_user_id',
    'idx_wishlists_slug',
    'idx_wishlists_user_id',
    'idx_users_username',
    'idx_click_events_wisher',
    'idx_click_events_item_id',
    'idx_page_views_wishlist_date',
    'idx_digest_sends_user_week',
    'price_history_item_checked_idx',
    'idx_users_referral_code'
  )
ORDER BY tablename, indexname;
```

Expected: 11 rows returned.

| Check | Pass criterion | Status | Evidence |
|-------|---------------|--------|----------|
| All 11 indices present | Query returns 11 rows | — | — |
| No sequential scans on hot tables | `pg_stat_user_tables.seq_scan` < 100/min on wishlist_items | — | — |
| `get_items_with_click_counts` function exists | `\df get_items_with_click_counts` in psql returns 1 row | — | — |

**Identify slow queries** (run weekly after going live):

```sql
-- Requires pg_stat_statements (enabled by default on Supabase)
SELECT
  query,
  calls,
  round(total_exec_time::numeric, 2)         AS total_ms,
  round(mean_exec_time::numeric, 2)          AS avg_ms,
  round((stddev_exec_time)::numeric, 2)      AS stddev_ms,
  rows
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_stat%'
ORDER BY mean_exec_time DESC
LIMIT 20;
```

Any query with `avg_ms > 100` on a hot path (wishlist items, click events) needs an index or query rewrite.

---

### 1.3 Row counts and storage within plan limits

| Table | Expected rows at 10k MAU | Storage estimate |
|-------|--------------------------|-----------------|
| `users` | 10,000 | ~3 MB |
| `wishlists` | ~25,000 (2.5 avg/user) | ~8 MB |
| `wishlist_items` | ~250,000 (25 items avg) | ~120 MB |
| `click_events` | ~3M/month (rolling 12m) | ~1.5 GB |
| `page_views` | ~2.4M/month (rolling 12m) | ~800 MB |
| `price_history` | ~600k/month | ~200 MB |

**Total estimated storage at 10k MAU: ~3 GB** — within the Pro plan's 8 GB.
Archive `click_events` and `page_views` older than 12 months per `database-maintenance.md`.

| Check | Pass criterion | Status | Evidence |
|-------|---------------|--------|----------|
| click_events archive cron scheduled | `cron.job` for `archive_click_events` visible | — | — |
| pg_cron extension enabled | `SELECT * FROM pg_extension WHERE extname='pg_cron'` | — | — |
| Total DB size | `SELECT pg_size_pretty(pg_database_size('postgres'))` < 7 GB | — | — |

---

## 2 · Hosting — Vercel

### 2.1 Plan and function limits

| Check | Pass criterion | Status | Evidence |
|-------|---------------|--------|----------|
| Vercel plan | Pro ($20/month) or higher | — | — |
| Function execution timeout — API routes | 60 s (Pro) vs 10 s (Hobby) | — | — |
| Function execution timeout — Cron routes | 300 s (Pro) — price-check cron needs ~120 s | — | — |
| Bandwidth limit | Pro = 1 TB/month; 10k MAU ≈ 80 GB/month (well within) | — | — |
| Function invocations | Pro = unlimited; Hobby = 100k/month (exceeded at scale) | — | — |
| Edge Function regions | Enable ISR globally in Project Settings → Edge Config | — | — |

**Action if on Hobby plan**: Upgrade to Vercel Pro. The price-check cron
(`/api/cron/check-prices`) can run for > 10 s on large item sets — Hobby's
10 s limit will kill it silently.

### 2.2 Cron jobs configured correctly

Verify `vercel.json` crons match what's deployed:

```json
{
  "crons": [
    { "path": "/api/cron/send-reminders",    "schedule": "0 9 * * *"  },
    { "path": "/api/cron/weekly-digest",     "schedule": "0 9 * * 1"  },
    { "path": "/api/cron/check-prices",      "schedule": "0 6 * * *"  },
    { "path": "/api/cron/send-price-alerts", "schedule": "0 7 * * *"  },
    { "path": "/api/cron/sync-affiliate-data","schedule": "0 6 * * *"  }
  ]
}
```

| Check | Pass criterion | Status | Evidence |
|-------|---------------|--------|----------|
| All 5 crons listed in vercel.json | ✓ | — | — |
| CRON_SECRET set in Vercel env vars | Verified in Project → Settings → Environment Variables | — | — |
| Cron runs successfully in Vercel logs | No 5xx in last 7 runs | — | — |
| Sentry Cron Monitor wired up | `captureCheckIn()` calls present in check-prices route | — | — |

### 2.3 ISR and caching

| Check | Pass criterion | Status | Evidence |
|-------|---------------|--------|----------|
| Gifter page `revalidate = 60` | Confirmed in `app/list/[username]/[slug]/page.tsx` line 1 | ✅ | Already set |
| Vercel Analytics enabled | Project → Analytics → Enable | — | — |
| Core Web Vitals dashboard visible | Analytics → Web Vitals tab | — | — |

---

## 3 · Rate Limiting — Upstash Redis

### 3.1 Plan covers expected request volume

**Expected request volume at 10k MAU**:

| Source | Estimate | Redis commands |
|--------|----------|---------------|
| Global middleware rate limit | ~50k req/day × 2 cmds | ~100k/day |
| Track-click rate limit | ~30k clicks/day × 2 cmds | ~60k/day |
| Track-view rate limit | ~100k views/day × 2 cmds | ~200k/day |
| Claim rate limit | ~3k claims/day × 2 cmds | ~6k/day |
| Abuse detection checks | ~50k events/day × 2 cmds | ~100k/day |
| **Total** | | **~466k cmds/day = ~14M/month** |

Upstash free plan: 10k commands/day — **not sufficient at 10k MAU**.
Pay-as-you-go: $0.20 per 100k commands → **~$26–28/month** (see cost-projection.md §3).

| Check | Pass criterion | Status | Evidence |
|-------|---------------|--------|----------|
| Upstash plan | Pay-as-you-go or higher | — | — |
| UPSTASH_REDIS_REST_URL set | Vercel env var present | — | — |
| UPSTASH_REDIS_REST_TOKEN set | Vercel env var present | — | — |
| Daily command budget sufficient | Usage dashboard shows headroom | — | — |
| Fail-open confirmed | lib/rate-limit.ts logs warning if Redis unavailable | ✅ | Coded in |

### 3.2 Blocked IP list functional

| Check | Pass criterion | Status | Evidence |
|-------|---------------|--------|----------|
| `gifthint:blocked_ips` SET key exists | `redis-cli SMEMBERS gifthint:blocked_ips` | — | — |
| `/api/admin/ban-ip` returns 200 for valid IP | Manual test with curl | — | — |
| Blocked IP receives 403 from middleware | Manual test from blocked IP (use VPN) | — | — |

---

## 4 · Email — Resend

### 4.1 Plan covers weekly digest volume

**Expected email volume at 10k MAU**:

| Type | Frequency | Volume |
|------|-----------|--------|
| Weekly digest | Every Monday | 10k emails/week = 40k/month |
| Price-drop alerts | ~2% of items/week trigger | ~5k/month |
| Reminder emails | ~15% of users/month | ~1.5k/month |
| Gift-pool funded notifications | ~5 group gifts/day | ~150/month |
| **Total** | | **~47k emails/month** |

Resend free plan: 3k/month — not sufficient.
Resend Pro ($20/month): 50k emails/month — exactly sufficient at 10k users.
Resend Business ($90/month): 100k emails/month — needed at ~20k users.

| Check | Pass criterion | Status | Evidence |
|-------|---------------|--------|----------|
| Resend plan | Pro ($20/month) minimum | — | — |
| Sending domain verified | DNS records → Resend status "Verified" | — | — |
| DKIM configured | `dig TXT resend._domainkey.gifthint.io` returns a key | — | — |
| SPF record present | `dig TXT gifthint.io` includes `include:resend.com` | — | — |
| DMARC record present | `dig TXT _dmarc.gifthint.io` returns a policy | — | — |
| RESEND_TEST_MODE=false in production | Vercel production env var confirmed | — | — |
| Weekly digest cron sends < 50k/month | Digest log shows correct send count | — | — |

**Action if on free plan**: Upgrade to Resend Pro. The weekly digest alone
(10k emails every Monday) exceeds the free plan's 3k/month in a single send.

---

## 5 · Payments — Stripe

### 5.1 Live mode enabled and webhook wired

| Check | Pass criterion | Status | Evidence |
|-------|---------------|--------|----------|
| STRIPE_SECRET_KEY starts with `sk_live_` | Vercel production env var | — | — |
| NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY starts with `pk_live_` | Vercel production env var | — | — |
| STRIPE_WEBHOOK_SECRET set to production webhook | Vercel production env var | — | — |
| Webhook endpoint registered in Stripe dashboard | Dashboard → Developers → Webhooks | — | — |
| Webhook endpoint URL is production URL | `https://gifthint.io/api/group-gift/webhook` | — | — |
| `payment_intent.succeeded` event subscribed | Webhook events list in Stripe | — | — |
| Webhook delivery success rate > 99% | Stripe → Webhooks → Event deliveries | — | — |
| Stripe radar rules reviewed | No legitimate transactions blocked | — | — |
| Payouts enabled | Account → Payouts → Status = Active | — | — |

**Action if webhook shows failures**: Check Sentry for `[CRITICAL] Stripe webhook non-200`
alerts. Any webhook failure means a pool contribution may be stuck at 'pending'
permanently — requires manual intervention via the Stripe dashboard.

---

## 6 · Error Monitoring — Sentry

### 6.1 All four critical alerts configured

| Alert | Status | Sentry alert name |
|-------|--------|------------------|
| Any error in /api/group-gift/* | — | `[CRITICAL] Group-gift payment error` |
| Claim error rate > 5% in 5 min | — | `[HIGH] /api/claim error rate > 5%` |
| Price-check cron fails 3× in a row | — | `[HIGH] Price-check cron failing` |
| Stripe webhook non-200 | — | `[CRITICAL] Stripe webhook non-200` |

| Check | Pass criterion | Status | Evidence |
|-------|---------------|--------|----------|
| SENTRY_DSN set in production | Vercel env var present | — | — |
| NEXT_PUBLIC_SENTRY_DSN set | Vercel env var present | — | — |
| Source maps uploaded on last deploy | Sentry → Project → Source Maps → recent artifact | — | — |
| Session Replay triggering on errors | Sentry → Replays → filter by "has error" | — | — |
| All 4 alerts active | Sentry → Alerts → All Alerts → status = Active | — | — |
| Test error confirmed in Sentry | Deliberately throw error in staging → confirm in Sentry | — | — |

### 6.2 Performance dashboard functional

| Check | Pass criterion | Status | Evidence |
|-------|---------------|--------|----------|
| "GiftHint SLO Tracker" dashboard exists | Sentry → Dashboards | — | — |
| P75 LCP widget populated | Shows data from last 24h | — | — |
| P95 API latency table populated | Shows > 5 routes | — | — |
| Error rate widget populated | Shows < 0.5% baseline in staging | — | — |

---

## 7 · Analytics — Vercel

| Check | Pass criterion | Status | Evidence |
|-------|---------------|--------|----------|
| Vercel Analytics enabled | Project → Analytics → Enable | — | — |
| Core Web Vitals visible | Analytics → Web Vitals shows LCP, INP, CLS | — | — |
| Speed Insights enabled | Project → Speed Insights → Enable | — | — |
| Top pages visible | Analytics → Pages → at least 10 routes tracked | — | — |
| Audience tab shows traffic | Analytics → Audience | — | — |

---

## 8 · Load Testing Completed

| Test | Target | Status | Notes |
|------|--------|--------|-------|
| `gifter-page.js` against staging | P95 < 2s, error rate < 1% | — | — |
| `extension-save.js` against staging | P95 < 1s, 0 duplicate inserts | — | — |
| Peak load (200 VUs) smoke test | No 500 errors, DB connections healthy | — | — |

---

## 9 · Security Baseline

| Check | Pass criterion | Status | Evidence |
|-------|---------------|--------|----------|
| ADMIN_SECRET is a 64-char random hex string | `wc -c` on the value | — | — |
| CRON_SECRET is a 64-char random hex string | `wc -c` on the value | — | — |
| No secrets in git history | `git log --all -S "sk_live_"` returns 0 results | — | — |
| `.env.local` in `.gitignore` | Confirmed | — | — |
| Middleware blocks unknown Cron callers | Test with curl without Authorization header | — | — |
| Rate limits confirmed live in Upstash | Monitor shows hits on rate-limit keys | — | — |

---

## Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Engineering | — | — | — |
| Infrastructure | — | — | — |

**Ready for 10k MAU**: ☐ Yes · ☐ No — items outstanding: _______________
