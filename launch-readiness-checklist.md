# GiftHint — ProductHunt Launch Readiness Checklist

> Owner: run through this end-to-end the day before launch, then again the morning of launch.
> Any ❌ blocks the launch. Any ⚠️ should be resolved within 2 hours of launch.

---

## 🗂 Section 1 — Occasion pages (7 routes)

### □ 1.1 All 7 /gifts/[occasion] pages load correctly

Open each URL in an incognito window. Verify: no 404, no unhandled error overlay, hero image loads, gift cards render.

| Occasion | URL | Status |
|----------|-----|--------|
| Birthday | /gifts/birthday | ☐ |
| Wedding | /gifts/wedding | ☐ |
| Baby shower | /gifts/baby-shower | ☐ |
| Christmas | /gifts/christmas | ☐ |
| Graduation | /gifts/graduation | ☐ |
| Anniversary | /gifts/anniversary | ☐ |
| Housewarming | /gifts/housewarming | ☐ |

**Pass criteria:** All 7 load with HTTP 200 (or 304). Check with:
```bash
for slug in birthday wedding baby-shower christmas graduation anniversary housewarming; do
  code=$(curl -s -o /dev/null -w "%{http_code}" https://gifthint.io/gifts/$slug)
  echo "$slug → $code"
done
```

---

### □ 1.2 All 7 occasions have unique meta tags

Open DevTools → Elements for each page. Verify `<title>` and `<meta name="description">` are:
- Not identical across occasions
- Contain the occasion keyword
- Under 60 chars (title) / 155 chars (description)

Run the `seo.test.ts` suite to catch uniqueness regressions programmatically:
```bash
npx jest tests/seo.test.ts --no-coverage
```

Spot-check socials: paste 3 URLs into [metatags.io](https://metatags.io) and confirm the title + description differ.

---

### □ 1.3 OG images render correctly for all 7 occasions

Visit `https://www.opengraph.xyz/url/https://gifthint.io/gifts/[occasion]` for each of the 7 slugs.

Check:
- Image dimensions are 1200 × 630
- Occasion label (e.g. "Birthday gifts") is visible
- GiftHint branding is present
- No layout overflow / text cut-off

Also verify the raw endpoint directly:
```bash
curl -I "https://gifthint.io/api/og?occasion=birthday"
# Expect: content-type: image/png
```

For wishlist OG images, test with a real list:
```bash
curl -I "https://gifthint.io/api/og?username=testuser&slug=test-list&occasion=birthday"
```

---

## 🔗 Section 2 — Referral system

### □ 2.1 Referral link /r/[code] redirects and sets cookie correctly

```bash
# Expect: 307, location header to /?ref=, set-cookie with gifthint_ref
curl -s -I https://gifthint.io/r/[your-own-code]
```

Checklist:
- [ ] HTTP status is 3xx
- [ ] `location` header points to `https://gifthint.io/?ref=[code]`
- [ ] `set-cookie` contains `gifthint_ref=[code]`
- [ ] `set-cookie` contains `HttpOnly`
- [ ] `set-cookie` contains `Max-Age=2592000` (30 days)
- [ ] Invalid code `/r/invalid` redirects to `/` with no cookie

---

### □ 2.2 New user signup via referral correctly attributes to referrer

**Manual smoke test:**

1. Copy your referral link (e.g. `https://gifthint.io/r/abc12345`)
2. Open in incognito — confirm you land on `/?ref=abc12345`
3. Sign in with a test Google account
4. Check the Supabase `users` table: new user's `referred_by` = referrer's `id`
5. Check `referral_events`: one row with `event_type = 'signup'`
6. Check referrer's `referral_count` incremented by 1

```sql
-- Supabase SQL editor
SELECT id, referred_by, created_at FROM users ORDER BY created_at DESC LIMIT 5;
SELECT * FROM referral_events ORDER BY created_at DESC LIMIT 5;
```

---

### □ 2.3 Custom username unlocks after referral_count reaches 1

In the Supabase dashboard, set a test user's `referral_count` to 1 directly:
```sql
UPDATE users SET referral_count = 1 WHERE email = 'test@example.com';
```

Then verify:
- [ ] `custom_username_enabled` is `true` on that row (or triggers the reward)
- [ ] The user sees the custom username option in their dashboard settings
- [ ] The `/api/auth/signup` route calls `checkAndApplyRewards` — run rewards tests:
  ```bash
  npx jest tests/rewards.test.ts --no-coverage
  ```

---

## 🎁 Section 3 — Group gifting flow

### □ 3.1 Full group gifting flow: create → contribute → funded email → purchased

**Test with Stripe test mode** (`sk_test_` key):

1. Add an item to a test wishlist and enable group gifting
2. Contribute £10 from a test card (`4242 4242 4242 4242`, any future date, any CVC)
3. Verify `gift_contributions` table has a row with `status = 'succeeded'`
4. Bring the pool to 100% funded — verify `pool_status = 'funded'`
5. Check email inbox for the "pool funded" notification email
6. Mark as purchased — verify `pool_status = 'purchased'` and `is_group_gift = false`

```bash
npx jest tests/group-gifting.test.ts --no-coverage
# Expect: 707 passed
```

---

### □ 3.2 Stripe live mode enabled for production

**Critical:** Test keys (`sk_test_`) must be replaced with live keys (`sk_live_`) before launch.

- [ ] `STRIPE_SECRET_KEY` starts with `sk_live_` in Vercel Environment Variables (Production)
- [ ] `STRIPE_WEBHOOK_SECRET` is the live webhook secret from the Stripe dashboard
- [ ] Visit Stripe dashboard → Payments → verify mode toggle shows "Live"
- [ ] Do a £1.00 test contribution with a real card to confirm end-to-end

> ⚠️ **Never check live keys into source control.** Verify `.env.local` is in `.gitignore`.

---

## 🚨 Section 4 — Price alerts

### □ 4.1 At least 1 test price alert email sent successfully

1. Add an item with a price above the current market price
2. Trigger the price check cron manually:
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" https://gifthint.io/api/cron/check-prices
   curl -H "Authorization: Bearer $CRON_SECRET" https://gifthint.io/api/cron/send-price-alerts
   ```
3. Verify the email arrives in the test inbox
4. Check Resend dashboard for a successful delivery event

```bash
npx jest tests/price-tracking.test.ts --no-coverage
```

---

## 🧩 Section 5 — Browser extensions and bookmarklet

### □ 5.1 Firefox extension submitted to AMO

- [ ] Visit [addons.mozilla.org/developers](https://addons.mozilla.org/en-US/developers/) → Your Add-ons
- [ ] Extension shows status: **Approved** or **Awaiting Review** (not Draft)
- [ ] Version number matches `manifest.json` in the repo
- [ ] Listing URL is shareable (AMO public listing, not dev portal)

If still in review: note the submission date. AMO review typically takes 1–5 business days. If not yet submitted, submit immediately — do not block launch on this.

---

### □ 5.2 Edge extension submitted to Microsoft Edge Add-ons store

- [ ] Visit [partner.microsoft.com/en-us/dashboard/microsoftedge](https://partner.microsoft.com/en-us/dashboard/microsoftedge)
- [ ] Extension shows status: **In the Store** or **In Review**
- [ ] Version number matches manifest

---

### □ 5.3 Bookmarklet works on Safari (macOS) and iOS

**macOS Safari:**
1. Drag the bookmarklet from `gifthint.io` to the bookmarks bar
2. Navigate to a product page (e.g. Amazon, Etsy)
3. Click the bookmarklet — verify the save dialog appears
4. Save an item — verify it appears in the test wishlist

**iOS Safari:**
1. Add the bookmarklet manually via the share sheet → Add Bookmark
2. Navigate to a product URL
3. Open the bookmarklet from bookmarks — verify save UI appears

```bash
npx jest tests/bookmarklet.test.ts --no-coverage
```

---

## ✍️ Section 6 — Blog

### □ 6.1 Three posts published and indexed

- [ ] `/blog` page lists ≥ 3 posts with correct titles and dates
- [ ] Each post has a unique `<title>` and `<meta name="description">`
- [ ] Each post has correct `canonical` URL
- [ ] Google Search Console → URL Inspection → all 3 posts pass "URL is on Google" check (or submitted for indexing)
- [ ] `sitemap.xml` includes all blog post URLs

```bash
curl https://gifthint.io/sitemap.xml | grep blog
```

---

## 📊 Section 7 — Admin dashboard

### □ 7.1 Admin growth dashboard shows correct user counts

1. Visit `/admin/growth` (with the `gh_admin` cookie set)
2. Verify the **total users** figure matches:
   ```sql
   SELECT COUNT(*) FROM users;
   ```
3. Verify **Weekly Active Wishers** is a non-zero number (if users exist)
4. Verify the GrowthChart renders with data (not "No weekly signup data yet")
5. Verify the RetentionCohort table shows at least one cohort row

```bash
npx jest tests/growth.test.ts --no-coverage
# Expect: 45 passed
```

---

## ⚙️ Section 8 — Cron jobs

### □ 8.1 All 5 cron jobs active in Vercel

Crons defined in `vercel.json`:

| Cron | Schedule | Route |
|------|----------|-------|
| send-reminders | `0 9 * * *` | /api/cron/send-reminders |
| sync-affiliate-data | `0 6 * * *` | /api/cron/sync-affiliate-data |
| weekly-digest | `0 9 * * 1` | /api/cron/weekly-digest |
| check-prices | `0 6 * * *` | /api/cron/check-prices |
| send-price-alerts | `0 7 * * *` | /api/cron/send-price-alerts |

**Verify in Vercel:**
- [ ] Visit Vercel dashboard → Project → Settings → Cron Jobs
- [ ] All 5 routes are listed and show "Active"
- [ ] Last execution timestamp is recent (within the last 25 hours for daily jobs)
- [ ] No cron jobs show a failed status

Trigger each manually if needed:
```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://gifthint.io/api/cron/[name]
# Expect: {"ok": true} or similar
```

---

## 🚀 Section 9 — Performance

### □ 9.1 Lighthouse score > 90 on the gifter page

```bash
# Using lighthouse CLI
npx lighthouse https://gifthint.io/list/[test-username]/[test-slug] \
  --output=json --output-path=./lighthouse-report.json \
  --chrome-flags="--headless" \
  --preset=desktop

# Or use PageSpeed Insights:
# https://pagespeed.web.dev/report?url=https://gifthint.io/list/[slug]
```

Targets:

| Category | Target |
|----------|--------|
| Performance | > 90 |
| Accessibility | > 90 |
| Best Practices | > 90 |
| SEO | > 95 |

If Performance < 90:
- Check for unoptimised images (run `npx jest tests/og-image.test.ts`)
- Check for blocking resources in the waterfall
- Verify ISR is caching the gifter page (check `x-vercel-cache: HIT` header)

---

## ✅ Pre-launch sign-off

| Area | Owner | Status |
|------|-------|--------|
| All 7 occasion pages | Engineering | ☐ |
| OG images | Engineering | ☐ |
| Referral attribution | Engineering | ☐ |
| Group gifting E2E | Engineering | ☐ |
| Stripe live mode | Engineering | ☐ |
| Price alerts | Engineering | ☐ |
| Firefox extension | Product | ☐ |
| Edge extension | Product | ☐ |
| Bookmarklet (Safari) | Product | ☐ |
| Blog posts indexed | Marketing | ☐ |
| Admin dashboard | Engineering | ☐ |
| Cron jobs active | Engineering | ☐ |
| Lighthouse > 90 | Engineering | ☐ |

**Launch is blocked if any of the following are ❌:**
- Stripe is in test mode
- Referral attribution is broken
- Any /gifts/[occasion] page 404s
- Cron jobs are inactive
- Lighthouse Performance < 80

**Launch proceeds with a known issue if (log it in the post-launch log):**
- Firefox/Edge extension still in review
- Lighthouse 80–89 (investigate in week 1)
- Blog posts submitted but not yet indexed
