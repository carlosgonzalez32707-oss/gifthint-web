# GiftHint — Post-Submission Monitoring Checklist

Run through this checklist daily during the first two weeks after Chrome Web Store submission,
then weekly once growth stabilises.

---

## Day 0 — Submission Day

- [ ] Confirm submission receipt email from Chrome Web Store (subject: "Extension submitted for review")
- [ ] Note the review status URL: https://chrome.google.com/webstore/developer/dashboard
- [ ] Verify the production gifter page URL is live: https://gifthint.com/list/[your-username]
- [ ] Confirm Vercel deployment status is green: https://vercel.com/dashboard
- [ ] Run `npm test` locally — all 63 tests still passing
- [ ] Set up UptimeRobot free monitor on https://gifthint.com (5-minute check interval)
  - Alert email: your address
  - Alert on: down > 1 minute

---

## Daily Checks (first 2 weeks)

### Chrome Web Store Review Status
- [ ] Check review status at: https://chrome.google.com/webstore/developer/dashboard
  - Status: Under review → Approved → Published (typically 1–7 business days)
  - If "Rejected": open `docs/rejection-responses.md` for pre-written appeal responses

### Supabase — New Sign-ups
- [ ] Open Supabase → Table Editor → `users`
  - Sort by `created_at DESC`
  - Note any new rows since yesterday
- [ ] Run the daily stats view for a quick summary:
  ```sql
  SELECT * FROM daily_stats LIMIT 7;
  ```

### Supabase — First Buy Clicks
- [ ] Open Supabase → Table Editor → `click_events`
  - Sort by `clicked_at DESC`
  - Check `affiliate_network` column (amazon_associates vs skimlinks vs unknown)
- [ ] Quick breakdown query:
  ```sql
  SELECT affiliate_network, count(*) as clicks
  FROM click_events
  WHERE clicked_at > now() - interval '24 hours'
  GROUP BY affiliate_network;
  ```

### Supabase — CTA Bar Interactions
- [ ] Open Supabase → Table Editor → `cta_events` (if table exists)
  - Check rows since last check
  - High CTA clicks + low sign-ups → landing page conversion issue

### Supabase — Error Logs
- [ ] Open Supabase → Logs → API logs
  - Filter for status ≥ 400
  - Any repeated 500 errors → investigate immediately
- [ ] Check Vercel → Deployments → [latest] → Functions → Runtime Logs
  - Look for `[claim]`, `[track-click]`, `[GiftHint]` prefixed errors

---

## Weekly Checks

### Amazon Associates
- [ ] Log in to https://affiliate-program.amazon.com
- [ ] Check Earnings Report → last 7 days
  - Clicks visible within 24 hours; commissions confirmed after 30–90 days
- [ ] Verify your Associates tag (`gifthint-20`) appears in click reports

### Skimlinks
- [ ] Log in to https://publishers.skimlinks.com
- [ ] Check Reporting → last 7 days
  - Clicks, impressions, estimated earnings
  - Zero clicks = Skimlinks not loading → check `NEXT_PUBLIC_SKIMLINKS_PUBLISHER_ID` in Vercel

### UptimeRobot
- [ ] Log in to https://uptimerobot.com
- [ ] Check uptime % and any downtime incidents this week
  - Target: 99.9% uptime

### Extension Reviews
- [ ] Check Chrome Web Store developer dashboard for new user reviews
  - Respond to any 1–2 star reviews within 48 hours
  - Note common complaints → add to bug backlog

---

## First Sign-up Alert

When you run `docs/supabase-alerts.sql`, the pg_net webhook fires on every new user.
Make sure your webhook endpoint is set up:
1. Create a free Make.com (formerly Integromat) scenario or a Slack incoming webhook
2. Replace `YOUR_WEBHOOK_URL_HERE` in `docs/supabase-alerts.sql` with your real URL
3. Re-run the SQL in Supabase → SQL Editor

---

## Escalation Contacts

| Issue | Action |
|-------|--------|
| Vercel build failure | Check build logs → push fix → redeploy |
| Supabase down | Check https://status.supabase.com |
| Amazon Associates suspended | Email amazon-associates-support@amazon.com |
| Skimlinks issue | Email publishers@skimlinks.com |
| Chrome Web Store rejection | Use `docs/rejection-responses.md` templates |
| Gifter page 404 | Check Vercel → check Supabase RLS policies |
