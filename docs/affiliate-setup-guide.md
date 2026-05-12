# GiftHint Affiliate Setup Guide

This guide walks you through registering for Amazon Associates and Skimlinks,
then wiring your publisher IDs into the GiftHint codebase and Vercel.

Estimated time: 30–60 minutes (most of that is waiting for Amazon approval).

---

## Part 1 — Amazon Associates

### 1.1 Create your Associates account

1. Go to **https://affiliate-program.amazon.com** and sign in with your Amazon account (or create one).
2. Click **"Sign up"** to start the application.
3. Fill in:
   - **Website / Mobile App URLs** → enter `https://gifthint.com`
   - **What your site does** → "Gift wishlist platform — users share a list of products with friends who can browse and buy gifts on their behalf."
   - **How do you drive traffic** → "SEO, social sharing, word of mouth."
4. Choose a **Tracking ID** (Associates tag). We use `gifthint-20`. You can use any string; it will look like `yourname-20`.
5. Complete the tax interview (W-9 or W-8BEN depending on your country).
6. **Submit**. You can start using your tag immediately — Amazon grants provisional access for 180 days. You need at least 3 qualifying sales to get permanent approval.

### 1.2 Find your Associates tag

Your tag is visible in the Associates Central dashboard, top-right corner. It looks like:

```
gifthint-20
```

### 1.3 Add to Vercel environment variables

1. Go to **https://vercel.com** → your `gifthint-web` project → **Settings → Environment Variables**.
2. Add:

   | Name | Value | Environment |
   |------|-------|-------------|
   | `AMAZON_ASSOCIATES_TAG` | `gifthint-20` | Production, Preview, Development |

3. Click **Save**, then **Redeploy** your latest deployment for the change to take effect.

### 1.4 Add to local .env.local

Open `/Users/carlos/Downloads/gifthint-web/.env.local` and confirm this line:

```
AMAZON_ASSOCIATES_TAG=gifthint-20
```

Replace `gifthint-20` with your actual tag if different.

### 1.5 Verify it works

1. Visit `https://gifthint.com/list/[any-username]` with an Amazon item in the list.
2. Click "Buy on Amazon".
3. In the URL of the Amazon page that opens, confirm `tag=gifthint-20` is present.

---

## Part 2 — Skimlinks

Skimlinks handles all non-Amazon retailers automatically. You give it your publisher ID
and it rewrites non-Amazon links when gifters click them — no manual affiliate signup
needed for each retailer.

### 2.1 Create your Skimlinks account

1. Go to **https://skimlinks.com** and click **"Sign up as a Publisher"**.
2. Fill in:
   - **Website URL** → `https://gifthint.com`
   - **Website category** → "Shopping / Gift lists"
   - **Monthly traffic** → select the range that applies. If you're starting out, select the lowest bracket.
3. Submit your application. Approval typically takes 1–3 business days.

### 2.2 Get your Publisher ID

Once approved, log into the Skimlinks dashboard:

1. Go to **Account → Publisher Info** (or **Tools → Skimlinks JavaScript**).
2. Copy your **Publisher ID** — a numeric string like `123456`.

The JavaScript snippet they show you will look like:

```html
<script src="https://s.skimresources.com/js/123456X.skimlinks.js"></script>
```

Your publisher ID is the number before `X` — in this example, `123456`.

### 2.3 Add to Vercel environment variables

1. Go to Vercel → your project → **Settings → Environment Variables**.
2. Add:

   | Name | Value | Environment |
   |------|-------|-------------|
   | `NEXT_PUBLIC_SKIMLINKS_PUBLISHER_ID` | `123456` | Production, Preview, Development |

   > ⚠️ This variable is intentionally `NEXT_PUBLIC_` because it is loaded in the browser.
   > It is safe to expose — it identifies your publisher account, not a secret.

3. Click **Save**, then **Redeploy**.

### 2.4 Add to local .env.local

```
NEXT_PUBLIC_SKIMLINKS_PUBLISHER_ID=123456
```

Replace `123456` with your actual publisher ID.

### 2.5 Verify it works

1. Visit `https://gifthint.com/list/[username]` with a non-Amazon item (e.g. Etsy or Walmart).
2. Open DevTools → Console and type `window.skimlinks_pub_id`. Confirm it returns your publisher ID.
3. Click a non-Amazon Buy button. In DevTools → Network, look for a request to `go.skimresources.com` — that confirms Skimlinks is intercepting the click.

---

## Part 3 — Verify Both Are Wired Up Correctly

Run the full compliance checklist:

```
tests/compliance-checklist.md
```

Pay special attention to:

- **Section 1** — Amazon tag appears in URLs, only once, server-side.
- **Section 2** — Skimlinks loads on gifter pages only; Amazon links are excluded.
- **Section 4** — FTC disclosure visible on every gifter page.

---

## Part 4 — Monitoring Revenue

### Amazon Associates

Revenue appears in **Associates Central → Reports → Earnings Report**.
Lag time: clicks appear within 24 hours; commissions are confirmed after the return
window closes (usually 30–90 days depending on the product category).

### Skimlinks

Revenue appears in the **Skimlinks Publisher Hub → Reporting**.
Lag time: clicks are near-real-time; earnings are estimated until merchants confirm.

### GiftHint Internal

Click events are stored in the Supabase `click_events` table. You can query by:

```sql
-- Clicks per item, last 30 days
SELECT item_id, COUNT(*) AS clicks
FROM click_events
WHERE clicked_at > now() - interval '30 days'
GROUP BY item_id
ORDER BY clicks DESC;

-- Clicks by affiliate network
SELECT affiliate_network, COUNT(*) AS clicks
FROM click_events
GROUP BY affiliate_network;
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Buy button opens Amazon without `tag=` param | `AMAZON_ASSOCIATES_TAG` env var not set in Vercel | Add the var and redeploy |
| Skimlinks console error on gifter page | Publisher ID empty or wrong | Check `NEXT_PUBLIC_SKIMLINKS_PUBLISHER_ID` in Vercel |
| Amazon links show `data-skimlinks-excluded` missing | `shouldSkipSkimlinks` not called on that item | Check `lib/affiliate.ts` import in `GiftCard.tsx` |
| `click_events` table empty after clicking | Supabase service role key missing | Check `SUPABASE_SERVICE_ROLE_KEY` in Vercel |
| Amazon Associates application denied | No qualifying sales in 180 days | Drive 3 purchases through the tag within the window |

---

*Questions? Check `tests/compliance-checklist.md` for the full manual QA flow.*
