# Sentry Setup Guide — GiftHint

Complete instructions for configuring the four custom alerts and performance
dashboard after the SDK is wired up.

---

## 1 · Initial project setup

```
npx @sentry/wizard@latest -i nextjs
```

The wizard will:
- Create `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`
  (these already exist in the repo — skip overwriting them when prompted)
- Add `SENTRY_AUTH_TOKEN` to `.env.local` (or Vercel env vars)
- Verify the source-map upload pipeline

After the wizard finishes, add the remaining env vars to Vercel:

| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | Project Settings → Client Keys → DSN |
| `SENTRY_DSN` | Same DSN value |
| `SENTRY_ORG` | Your org slug in the Sentry URL |
| `SENTRY_PROJECT` | Your project slug |
| `SENTRY_AUTH_TOKEN` | Settings → Developer Settings → Internal Integration |

---

## 2 · Custom alert rules

Navigate to **Alerts → Create Alert → Issues** (or Metric Alerts) in your Sentry project.

### Alert 1 — Payment critical path exceptions

**Type:** Issue Alert  
**Name:** `[CRITICAL] Group-gift payment error`

| Setting | Value |
|---|---|
| Environment | `production` |
| Conditions | `An issue is first seen` AND `The issue's URL path contains /api/group-gift/` |
| Filter | `The issue has not been resolved` |
| Action | Send email to team + Slack `#gifthint-critical` |
| Threshold | Trigger on **every occurrence** (not a count threshold) |

**Why:** Any unhandled exception in `/api/group-gift/*` is on the payment critical
path (contribution intake, Stripe webhook, pool management). Zero tolerance.

---

### Alert 2 — Claim endpoint error rate spike

**Type:** Metric Alert → Error Rate  
**Name:** `[HIGH] /api/claim error rate > 5%`

| Setting | Value |
|---|---|
| Environment | `production` |
| Metric | `Number of Errors / Total Events` |
| Filter | `transaction:/api/claim` |
| Threshold | `> 5%` |
| Time window | `5 minutes` (rolling) |
| Resolve threshold | `< 1%` |
| Action | Email team + PagerDuty if on-call is configured |

**Why:** `/api/claim` is a concurrent, race-condition-sensitive route. A >5%
error rate in 5 minutes usually indicates a DB constraint failure or a broken
update query — not normal user behaviour.

**Sentry UI path:**  
Alerts → Create Alert → **Metric Alert** → choose `error_rate` metric →
filter `transaction:/api/claim`.

---

### Alert 3 — Price-check cron consecutive failures

**Type:** Issue Alert with occurrence threshold  
**Name:** `[HIGH] Price-check cron failing`

| Setting | Value |
|---|---|
| Environment | `production` |
| Conditions | `An issue is seen more than 3 times` in `1 hour` |
| Filter | `The event's transaction is /api/cron/check-prices` |
| Action | Email team |

**Alternative (more precise) setup using Cron Monitors:**  
Sentry → Crons → Create Monitor:

```
Name:         GiftHint price-check cron
Schedule:     0 */6 * * *   (every 6 hours — match vercel.json)
Check-in URL: (copy from Sentry UI)
Failure threshold: 3 missed check-ins
```

Add the check-in call to `app/api/cron/check-prices/route.ts`:

```typescript
import * as Sentry from '@sentry/nextjs'

// At the start of the handler:
const checkInId = Sentry.captureCheckIn(
  { monitorSlug: 'gifthint-price-check', status: 'in_progress' },
)

// On success, before returning:
Sentry.captureCheckIn({
  checkInId,
  monitorSlug: 'gifthint-price-check',
  status: 'ok',
})

// In any catch block:
Sentry.captureCheckIn({
  checkInId,
  monitorSlug: 'gifthint-price-check',
  status: 'error',
})
```

The Cron Monitor approach is more reliable than counting exceptions because it
fires even if the cron itself never starts (Vercel scheduler outage, cold-start
timeout, etc.).

---

### Alert 4 — Stripe webhook non-200 status

**Type:** Issue Alert  
**Name:** `[CRITICAL] Stripe webhook non-200`

| Setting | Value |
|---|---|
| Environment | `production` |
| Conditions | `An issue is first seen` |
| Filter | `The event's transaction contains /api/group-gift/webhook` AND `The event level is error or fatal` |
| Action | Email team + Slack `#gifthint-critical` immediately |

**Add explicit Sentry capture to the webhook route** so non-200 responses
(which Next.js would swallow as normal HTTP errors) are surfaced:

```typescript
// In app/api/group-gift/webhook/route.ts, wrap the handler body:
import * as Sentry from '@sentry/nextjs'

// When returning a non-200 response due to an error:
Sentry.captureException(new Error(`Stripe webhook error: ${errorMessage}`), {
  tags: { route: 'stripe-webhook' },
  extra: { stripeEventType, paymentIntentId },
})
return NextResponse.json({ error: errorMessage }, { status: 400 })
```

---

## 3 · Performance monitoring dashboard

Navigate to **Dashboards → Create Dashboard** → name it `GiftHint SLO Tracker`.

### Widget 1 — Gifter page P75 load time

| Setting | Value |
|---|---|
| Widget type | Line chart |
| Dataset | Transactions |
| Y-axis | `p75(measurements.lcp)` |
| Filter | `transaction:/list/:username/:slug` |
| Group by | (none — single line) |
| Interval | 1 hour |
| Title | `Gifter page LCP — P75` |

**Target SLO: P75 LCP < 2.5 s**  
Add a reference line at 2500ms in the widget settings.

---

### Widget 2 — API P95 response times (by route)

| Setting | Value |
|---|---|
| Widget type | Table |
| Dataset | Transactions |
| Columns | `transaction`, `p95(transaction.duration)`, `count()`, `failure_rate()` |
| Filter | `transaction:/api/*` |
| Sort | `p95(transaction.duration) DESC` |
| Row limit | 20 |
| Title | `API P95 latency by route` |

**Target SLO: P95 < 500 ms for all API routes**

---

### Widget 3 — Error rate by route

| Setting | Value |
|---|---|
| Widget type | Bar chart |
| Dataset | Transactions |
| Y-axis | `failure_rate()` |
| Filter | `transaction:/api/*` |
| Group by | `transaction` |
| Interval | 1 hour |
| Title | `Error rate by API route` |

**Target SLO: < 0.5% error rate across all routes**

Add a threshold line at 0.005 (0.5%).

---

### Widget 4 — Extension error trend

| Setting | Value |
|---|---|
| Widget type | Line chart |
| Dataset | Issues (Errors) |
| Y-axis | `count()` |
| Filter | `tags[source]:extension` |
| Group by | `tags[extensionVersion]` |
| Interval | 1 day |
| Title | `Extension errors by version` |

This surfaces regressions in new extension releases (v1.1.0 vs v1.2.0).

---

### Widget 5 — Apdex score

| Setting | Value |
|---|---|
| Widget type | Big Number |
| Dataset | Transactions |
| Y-axis | `apdex(300)` |
| Filter | `transaction:/list/:username/:slug` |
| Title | `Gifter page Apdex (300ms threshold)` |

Target: **> 0.9** (satisfactory).

---

## 4 · SLO summary

| SLO | Metric | Target | Alert threshold |
|---|---|---|---|
| API response time | P95 `transaction.duration` | < 500 ms | > 750 ms |
| Gifter page LCP | P75 `measurements.lcp` | < 2.5 s | > 3 s |
| Overall error rate | `failure_rate()` | < 0.5% | > 1% |
| Payment critical path | Any error on `/api/group-gift/*` | 0 errors | 1st occurrence |
| Price-check cron | 3 consecutive failures | 0 consecutive | 3 in 1 hour |

---

## 5 · Verifying the setup locally

```bash
# 1. Check that errors appear in Sentry
#    Trigger a test error in any Server Component:
throw new Error('Sentry test — delete me')

# 2. Verify source maps uploaded
#    After deploying, click any stack frame in Sentry and confirm
#    it shows readable TypeScript source, not minified JS.

# 3. Verify Session Replay fires on error
#    Use the browser console to throw:
#    throw new Error('replay test')
#    Check Sentry → Replays for the recording.

# 4. Verify extension errors appear
#    In the extension service worker console (chrome://extensions → service worker):
#    throw new Error('extension error test')
#    Check Sentry → Issues for tag source:extension.
```

---

## 6 · Sampling rate reference

| Config | Rate | Rationale |
|---|---|---|
| Client `tracesSampleRate` | **10%** | ~3k traces/day at 10k MAU. Enough for P95 bucketing. |
| Server `tracesSampleRate` | **10%** | Matches client so distributed traces stay coherent. |
| Edge `tracesSampleRate` | **5%** | Middleware runs on every request — lower rate prevents quota exhaustion. |
| Client `replaysSessionSampleRate` | **2%** | ~200 replays/day — within Sentry free plan (500/day). |
| Client `replaysOnErrorSampleRate` | **100%** | Every error session replayed — highest signal, no extra cost unless errors fire. |
| Client `profilesSampleRate` | **10%** | Matches traces — every trace includes a JS CPU flame graph. |
| Server `profilesSampleRate` | **10%** | Node.js CPU profiles for slow Supabase/Stripe calls. |

To increase sampling temporarily (e.g. debugging a slow route):  
Set `SENTRY_TRACES_SAMPLE_RATE=0.5` in Vercel env vars without redeploying — the
Sentry SDK reads this env var at runtime when you add the environment-variable
override in the config files.
