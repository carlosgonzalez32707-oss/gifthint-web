# GiftHint — Post-Launch Monitoring Playbook

> Cover period: 14 days post-ProductHunt launch.
> This is a living doc — update the "what we saw" column each morning.

---

## 📅 Daily morning check (15 minutes, ~9 AM)

Run this in order, tab-by-tab. Should take under 15 minutes once you know the dashboards.

### 1. Supabase (2 min)

Open: `https://supabase.com/dashboard/project/[project-id]/editor`

```sql
-- Paste and run; review all five numbers at a glance
SELECT
  (SELECT COUNT(*) FROM users)                                         AS total_users,
  (SELECT COUNT(*) FROM users WHERE created_at > now() - interval '24h') AS new_users_24h,
  (SELECT COUNT(*) FROM users WHERE created_at > now() - interval '7d')  AS new_users_7d,
  (SELECT COUNT(DISTINCT user_id) FROM wishlist_items
   WHERE created_at > now() - interval '24h')                          AS active_wishers_24h,
  (SELECT COUNT(*) FROM referral_events
   WHERE event_type = 'signup' AND created_at > now() - interval '24h') AS referral_signups_24h;
```

**Log in the table at the bottom of this doc.**

---

### 2. ProductHunt dashboard (2 min)

URL: `https://www.producthunt.com/posts/gifthint` → Maker dashboard

| Metric | Check |
|--------|-------|
| Upvotes (24h delta) | Record in log |
| Comments | Read and reply to any unanswered |
| Rank (today vs yesterday) | Is it climbing or dropping? |
| Referral traffic in PH analytics | Note the top referring posts |

> Reply to every comment within 2 hours during the first 48 hours. Speed of maker response is a ranking signal on ProductHunt.

---

### 3. Vercel analytics (1 min)

URL: Vercel dashboard → Project → Analytics

Check:
- **Visits (24h)**: Is traffic sustained from PH?
- **Top pages**: `/gifts/[occasion]` should be in top 5
- **Error rate**: Should be < 0.5%. Any spike = investigate immediately
- **Edge Function invocations**: Abnormal spike = possible scraping/abuse

---

### 4. Resend email dashboard (1 min)

URL: `https://resend.com/emails`

- Delivery rate should be > 97%
- Any bounces on `referral` or `group-gift-funded` templates → investigate
- If > 3 hard bounces in a day: review the sending domain's SPF/DKIM records

---

### 5. Cron job health (1 min)

```bash
# Quick check — all should return {"ok": true} or similar
for cron in send-reminders sync-affiliate-data check-prices send-price-alerts; do
  echo -n "$cron: "
  curl -s -H "Authorization: Bearer $CRON_SECRET" \
    https://gifthint.io/api/cron/$cron | jq -r '.ok // .error // "unknown"'
done
```

If any returns an error: check Vercel function logs for that route.

---

### 6. Stripe (1 min, days 1–7 only)

URL: `https://dashboard.stripe.com/payments`

- Verify mode shows **Live** (not Test)
- Check for any failed payments or disputes
- Note group gifting revenue (should be > £0 if anyone contributes after launch)

---

### 7. Admin growth dashboard (2 min)

URL: `https://gifthint.io/admin/growth`

- Total users matches Supabase count
- Weekly Active Wishers is non-zero
- GrowthChart bars are growing (especially D+1 and D+2 post-launch)
- Check the "weeks to target" badge — is it trending down?

---

## 📊 Daily metrics log

Fill in each morning. Keep this for the 14-day sprint.

| Day | Date | Total users | +24h | WAW | Referral signups | PH upvotes | Notes |
|-----|------|-------------|------|-----|-----------------|------------|-------|
| D+1 | | | | | | | Launch day |
| D+2 | | | | | | | |
| D+3 | | | | | | | |
| D+4 | | | | | | | |
| D+5 | | | | | | | |
| D+6 | | | | | | | |
| D+7 | | | | | | | Week 1 review |
| D+8 | | | | | | | |
| D+9 | | | | | | | |
| D+10 | | | | | | | |
| D+11 | | | | | | | |
| D+12 | | | | | | | |
| D+13 | | | | | | | |
| D+14 | | | | | | | Week 2 review |

---

## 🔥 Common post-launch issues and fixes

### Issue: Upvotes stalled after morning spike

**Symptom:** PH rank climbs in the first 2–4 hours, then plateaus or drops.

**Cause:** ProductHunt's algorithm favours spread-out, genuine upvotes over a morning burst.

**Fix:**
1. Post in communities that weren't seeded on launch day (Reddit r/Entrepreneur, Indie Hackers, Twitter threads)
2. DM your network asking them to comment, not just upvote — comments signal quality
3. Reply to every PH comment to push it back up the activity feed
4. Post your "maker story" thread on Twitter around midday for a second wave

---

### Issue: Supabase Edge Function timeouts

**Symptom:** Vercel function logs show `FUNCTION_INVOCATION_TIMEOUT`, 500 errors spike.

**Cause:** Traffic surge + slow DB queries (common on PH launch day).

**Fix — in order:**
1. Check Supabase dashboard → Database → Query Performance → find slow queries
2. Ensure indexes exist:
   ```sql
   -- Check that these are present
   SELECT indexname, tablename FROM pg_indexes
   WHERE tablename IN ('users', 'wishlist_items', 'click_events', 'referral_events');
   ```
3. If the gifter page is timing out: confirm ISR cache is serving it (`x-vercel-cache: HIT`)
4. If signup is timing out: check `auth.getUser()` latency in the Supabase auth logs
5. Last resort: increase `maxDuration` in the affected route's `export const config`

---

### Issue: Referral cookie not being set

**Symptom:** Users report they followed a referral link but the referrer got no credit.

**Diagnosis:**
```bash
curl -v https://gifthint.io/r/[code] 2>&1 | grep -E "set-cookie|location|HTTP"
```

**Common causes:**
- Deployment with a bug in `/app/r/[code]/route.ts` — roll back to the previous deployment in Vercel
- Safari ITP blocking third-party cookies — not applicable (we use first-party cookie)
- The referral code doesn't exist in `users.referral_code` — check DB:
  ```sql
  SELECT id, referral_code FROM users WHERE referral_code = '[code]';
  ```
- `NODE_ENV` not set correctly in production → `secure` flag mismatch (cookie set as non-secure but served over HTTPS)

---

### Issue: Group gifting Stripe webhook not firing

**Symptom:** Payment goes through in Stripe but `gift_contributions.status` stays `pending`.

**Diagnosis:**
1. Stripe dashboard → Developers → Webhooks → check for failed deliveries
2. Look at the webhook endpoint URL — confirm it points to the production domain, not `localhost`
3. Check the webhook signing secret is the **live** secret in Vercel env vars

**Fix:**
```bash
# Re-register the webhook endpoint if needed
stripe listen --forward-to https://gifthint.io/api/webhooks/stripe
# (This is for debugging only — the production webhook is registered in the Stripe dashboard)
```

---

### Issue: OG images not rendering on social shares

**Symptom:** Twitter/LinkedIn show a generic link preview instead of the GiftHint card.

**Diagnosis:**
1. Visit `https://cards-dev.twitter.com/validator` and paste a list URL
2. Visit `https://www.facebook.com/sharing/debugger/` and paste the URL

**Fixes:**
- If the OG image URL is broken: check `/api/og` is deployed and returning `image/png`
- If it's cached with old content: append `?v=2` to the og:image URL (temporary), then fix the Cache-Control headers
- Twitter caches OG data aggressively — use the Card Validator to force a re-scrape

---

### Issue: Price alert emails going to spam

**Symptom:** Users report not receiving alerts; Resend shows delivered but inbox shows spam.

**Fix:**
1. Check SPF record: `dig TXT gifthint.io | grep spf`
2. Check DKIM: `dig TXT resend._domainkey.gifthint.io`
3. Check DMARC: `dig TXT _dmarc.gifthint.io`
4. If any of the above are missing: add them via your DNS provider (Resend's setup guide)
5. Review the email subject line — avoid spam trigger words ("free", "click here", "guaranteed")

---

### Issue: Extension not appearing in Firefox search results

**Symptom:** AMO listing isn't showing up when users search for "gifthint" on AMO.

**Cause:** New AMO listings take 24–48 hours to appear in search after approval.

**Fix:** Share the direct AMO listing URL instead of asking users to search. Include the link in all PH comments and launch posts.

---

### Issue: Cron job for price alerts runs but sends no emails

**Symptom:** `/api/cron/send-price-alerts` returns `{"ok": true}` but no emails sent.

**Diagnosis:**
```sql
-- Check if any price alerts are enabled and below their target
SELECT COUNT(*) FROM price_alerts
WHERE enabled = true AND current_price < target_price;
```

**Fix:** If 0 rows: no items have dropped below their alert threshold yet — this is expected behaviour, not a bug. If rows exist but emails aren't sent: check Resend logs for the `price-alert` template delivery status.

---

## 🏁 Declaring launch success vs pivot

### ✅ Launch is a success at Day 7 if:

| Metric | Target | Rationale |
|--------|--------|-----------|
| Total new users (7d) | ≥ 200 | Meaningful cohort for retention measurement |
| PH upvotes | ≥ 300 | Top 5 for the day = lasting SEO and community awareness |
| Referral signups | ≥ 30 (15%+ of total) | Viral loop is alive |
| D+3 WAW | ≥ 40 | Early retention signal; 20% of W1 signups |
| 0 critical bug reports | Any 500s on core flows | No broken signups, no broken saves |

If all 5 are met: declare success. Focus shifts to **retention** (reminder emails, occasion prompt, DNA tags promotion).

---

### ⚠️ Mixed result at Day 7 — partial pivot:

**Scenario: Traffic was high but signups were low (< 100 new users)**

Diagnosis: Landing page or value prop isn't converting.

Actions:
1. Check drop-off in `/` → `/api/auth/signup` funnel in Vercel Analytics
2. A/B test the hero headline (current vs "Save from Amazon, Etsy, John Lewis. Share one link.")
3. Add social proof to the homepage — embed real lists from beta users
4. Post a "what we learned from the launch" thread on Twitter/IH within 72 hours

---

**Scenario: Signups were OK (100–200) but WAW is < 25%**

Diagnosis: Users signed up but didn't activate (no item saved).

Actions:
1. Send a day-3 nudge email: "You haven't saved your first gift yet — here's how"
2. Add an onboarding prompt on the empty dashboard state
3. Check if the bookmarklet/extension install flow is too high-friction
4. Survey the Day 1 cohort (3 respondents is enough): "What stopped you from saving something?"

---

**Scenario: All metrics are weak (< 100 users, < 200 upvotes)**

This means the PH launch didn't reach the right audience, not that the product is broken.

Actions within 48 hours:
1. Post a Reddit thread in r/Frugal, r/OnlineShopping, r/WeddingPlanning
2. Reach out to 3 wedding/baby shower blogger partnerships (see `partnership-outreach.md`)
3. Submit to alternative discovery channels: Betalist, SaaSworthy, Indie Hackers "What I built"
4. Don't re-launch on PH until you have > 500 users (PH penalises repeat launches without growth)

---

### 🔴 Abandon ship criteria (not a launch failure — a learning):

Consider a strategic pause if by **Day 14**:
- Total user count is < 50 (product-market fit signal is absent)
- WAW is < 5% consistently (users sign up and immediately leave)
- Referral K < 0.05 (no word-of-mouth at all)

If this happens: the product works technically but the acquisition strategy needs rethinking before the next launch. Run 10 user interviews before the next distribution attempt.

---

## 📋 Week-1 and Week-2 review agenda

### End of Week 1 (Day 7) — 1 hour review

1. Fill in the metrics log through D+7
2. Answer: did we hit the Day 7 success criteria?
3. Calculate D7 retention: % of D+1 signups who are still WAW at D+7
4. Review all PH comments for product feedback themes
5. Decide: success path / mixed pivot / or pause

### End of Week 2 (Day 14) — 1 hour review

1. Fill in metrics log through D+14
2. Calculate D14 retention cohort (those from D+1)
3. Calculate Viral K for the 14-day window
4. Review referral-attributed vs organic user breakdown
5. Identify the top 3 friction points from user comments / support emails
6. Set W3–W8 targets based on actual D+7 and D+14 data (not the original Phase 3 plan)
