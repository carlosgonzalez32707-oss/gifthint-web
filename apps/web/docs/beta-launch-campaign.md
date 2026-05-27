# GiftHint — Beta Launch Campaign
# Target: 100 active users by end of Week 12

> **Active user definition:** signed in + saved at least 1 item to a wishlist.
> **Campaign window:** Weeks 1–12 from first public post.
> **Primary metric:** weekly active signups trending toward 100 cumulative.

---

## WEEK-BY-WEEK SCHEDULE

| Week | Focus | Channel | Target signups |
|------|-------|---------|----------------|
| 1 | Seed personal network | Email + iMessage | 10 |
| 2 | Reddit soft launch | r/SideProject, r/GiftIdeas | 20 |
| 3 | ProductHunt launch | PH front page | 35 |
| 4 | Twitter thread + replies | X / Twitter | 50 |
| 5–8 | Community nurture + SEO drip | Reddit comments, Discord gift communities | 70 |
| 9–12 | Referral loop + repeat posts | Existing users sharing, Reddit re-posts in new subs | 100 |

---

## SECTION 1 — TARGET CHANNELS + COPY

---

### 1A. REDDIT POSTS

---

#### POST 1 — r/SideProject
**Title:** I built a browser extension so my friends stop buying me duplicate birthday gifts — here's how it works

---

Every year around my birthday the same thing happens. My mum asks what I want. I spend 15 minutes scraping together a list of screenshots, Amazon links, and vague hints. She sends them to my sister. My sister buys two of the same thing my aunt already bought. Someone ends up with a return to deal with.

I spent about four months building something to fix this properly and wanted to share it here because this community has helped me more times than I can count.

**What I built: GiftHint**

It's a Chrome extension with a floating heart button that appears on any product page — Amazon, ASOS, Etsy, Apple, John Lewis, wherever. You click the heart, it reads the product name, price, and image automatically, and saves it to your personal wishlist at gifthint.io/list/[yourname]. No copy-pasting, no screenshots.

You then share one link. Gifters see your full list, no account required. When someone decides to buy something, they claim it — it gets marked as taken so no one else buys the same thing.

**The bit I'm most happy with:** the DNA tags. When you save something you can add a note — "size M, blue colourway, the one with the leather strap not the nylon one" — so the person buying it gets exactly the right variant without having to ask. Eliminates the last remaining reason for a confused phone call.

**The bit I spent the longest on:** the gifter page. I wanted it to look like something you'd actually want to share, not a spreadsheet. Took three design iterations to get the card layout feeling right on mobile.

**Stack:** Next.js 15 (App Router), Supabase (auth + database), Skimlinks + Amazon Associates for affiliate monetisation, Chrome MV3 extension with identity + storage.

**Where it is now:** In beta. Working end-to-end. Affiliate links are live. I've had a handful of friends and family test it and the feedback has mostly been "oh this is actually useful."

**You can see my actual wishlist here (no account needed):** https://gifthint.io/list/carlos/birthday-2026

Specific things I'd love feedback on if you have five minutes:
- Does the heart button show up on product pages you visit?
- Does the gifter page feel intuitive if you've never seen it before?
- Any retailer where the product data came through wrong or missing?
- Would you use this? And if not — what would have to be different?

Happy to answer questions about any part of the build. It's been a genuinely fun project and I've learned a lot about what it actually takes to make a Chrome extension feel polished.

---

#### POST 2 — r/GiftIdeas
**Title:** Made something to fix the "what do you want for your birthday?" problem

---

Not sure if this is the right place but I think the people here will get why this exists.

The problem: someone asks what you want for your birthday. You either say "oh nothing, don't worry" (and then feel vaguely disappointed when they buy something generic) or you spend 20 minutes sending links that get ignored, duplicated, or bought in the wrong size.

I built a Chrome extension called GiftHint that turns this into a two-minute job.

You install it, browse any online store, and click the heart button on anything you want. It saves the item — name, price, photo, link — to your list automatically. Then you send one link and that's it. Anyone can see your list without needing an account, and when they decide to buy something they mark it as claimed so no one else buys the same thing.

The thing I find most useful: you can add a note to each item. So instead of just linking to a jumper and hoping someone picks the right colour, I add "size M, the slate grey one, not the navy" and suddenly there's no ambiguity. My mum has told me three times this year it's the most useful thing I've ever made.

It also now does multiple wishlists — so I have a separate birthday list, a Christmas list, and a "things I'd buy myself eventually" list. Each one gets its own shareable link.

**My birthday list if you want to see what it looks like:** https://gifthint.io/list/carlos/birthday-2026

It's in beta and completely free to use. Would love to know if this is something you'd actually pass around in your family group chat.

---

#### POST 3 — r/ProductHunters
**Title:** Launching GiftHint tomorrow on ProductHunt — universal wishlist with a gift claiming system. Any feedback welcome before we go live?

---

Hey everyone — launching GiftHint on Product Hunt tomorrow morning and wanted to share here first for any last-minute feedback.

**What it is:** A Chrome extension + web app that lets you save gift ideas from any online store and share a wishlist that friends and family can browse and claim items from. The claim system is the key bit — when someone marks they're buying something, everyone else sees it as taken, so no duplicate presents.

**What's new in v1.1 (the version we're launching):**
- Multiple wishlists per user (birthday list, Christmas list, wedding registry — all separate links)
- Occasion tags with countdown badges (14 days until your birthday → amber badge, tomorrow → green)
- Share-link button in the popup (one tap to clipboard)
- Smart floating button on product pages: if you only have one list it saves directly; if you have multiple it shows a mini picker on-page so you don't have to open the popup

**The monetisation model:** We add affiliate links (Amazon Associates + Skimlinks) to items you save. When a gifter clicks through and buys, we earn a small commission. We disclose this. The extension and web app are free forever — the business model only works if the product is genuinely useful, which I think keeps incentives aligned.

**ProductHunt page goes live at midnight Pacific tonight.**

If you want a preview of what the gifter page looks like before tomorrow: https://gifthint.io/list/carlos/birthday-2026

Questions I'd specifically love answered:
- Does the product positioning make sense on first read?
- Is "universal wishlist with claiming" clear enough, or does it need a simpler frame?
- Anything about the v1.1 feature set that feels half-baked?

Happy to upvote anyone else launching this week if you drop your link below.

---

### 1B. PRODUCT HUNT LAUNCH COPY

---

#### TAGLINES (60 chars max — pick one)

**Option A (54 chars):** Save gifts from any store. Share. Let friends claim.
**Option B (58 chars):** The wishlist your gifters will actually use — no duplicates.
**Option C (52 chars):** One link. Any store. No more duplicate gifts.

---

#### DESCRIPTION (260 chars)

Save gifts from any online store with one click. Share a link — gifters browse your list, claim what they're buying, and nothing gets bought twice. Multiple lists, occasion countdowns, DNA tags for variants. Free, affiliate-powered.

*(232 chars)*

---

#### FIRST COMMENT — Founder Story

Hey Product Hunt 👋

I built GiftHint because I got three copies of the same book for my birthday in 2023.

Not a complaint — three people who love me tried to do something nice. But I'd sent the same Amazon screenshot link to my mum, my sister, and a friend in separate chats, and no one knew what the others had bought. Classic coordination problem.

The existing solutions didn't quite fit. Amazon wishlists only work well inside Amazon. Universal wishlist apps I tried were clunky, required gifters to sign up, and felt like they were designed by people who'd never actually tried to organise a birthday.

So I built one that works the way I wanted it to work:

**For the person making the list:**
— A floating heart button appears on any product page. Click it, item saved. That's the whole flow for the common case.
— If you have multiple lists (birthday, Christmas, wedding registry), a mini picker appears on-page to route it to the right one. No popup required.
— Each item can have a DNA tag: size M, blue colourway, the leather strap version — so there's no ambiguity for the buyer.

**For the gifter:**
— No account. No download. Just a link.
— They browse the list, click claim on what they're buying, and it's marked as taken for everyone else.
— Works fine on mobile.

**The money side (being upfront):**
GiftHint is free. We earn through affiliate links — when a gifter clicks through to buy something, we may earn a small commission at no cost to them. We disclose this on the gifter page. The business only works if the product is genuinely useful to both sides, which I think keeps the incentives pointed in the right direction.

**What's next:**
— iOS / Android share sheet so you can save from any browser on mobile
— Gifter reminders ("Emma's birthday is in 14 days — you claimed the cashmere socks")
— Group coordination (see who else has claimed things without revealing what)

If you try it and find a retailer where the heart button doesn't appear or the product data comes through wrong, I genuinely want to know. Drop a comment or email me at carlos@gifthint.io.

Thanks for the upvotes — means a lot for an indie project. 🎁

---

### 1C. TWITTER / X THREAD

---

**Tweet 1 — Hook**

I got three copies of the same book for my birthday.

Three people who love me, zero coordination, one embarrassing pile of returns.

So I built something to fix it.

🧵

---

**Tweet 2 — The Solution**

It's called GiftHint.

A Chrome extension + web app where you save gifts from any online store and share one link.

Gifters browse your list, click "claim" on what they're buying, and everyone else sees it as taken.

No more duplicate presents. No awkward "oh... I love it" face.

---

**Tweet 3 — How It Works**

How it works in 3 steps:

1️⃣ Browse any store. A floating ♥ button appears on product pages. Click it — name, price, image saved automatically.

2️⃣ Your list lives at gifthint.io/list/yourname. Share the link wherever.

3️⃣ Friends and family browse it, claim what they're buying. Done.

No account required to view or claim. Works on Amazon, ASOS, Etsy, Apple — basically anywhere.

---

**Tweet 4 — The Clever Bit**

The two features I'm proudest of:

**DNA tags** — add a note to each item: "size M, slate grey, the one with the leather strap." The buyer gets exactly the right variant with zero follow-up texts.

**Claiming** — when someone marks they're buying something, it shows as taken for everyone else. Coordination without anyone having to coordinate.

Also just shipped: multiple lists (birthday, Christmas, wedding) with occasion countdowns. 🎂 14 days → amber. 🎁 Tomorrow → green.

---

**Tweet 5 — CTA**

GiftHint is live and free to use.

If you've ever had to say "oh don't worry, I don't need anything" just to avoid the coordination chaos — this is for you.

My birthday list (no account needed): https://gifthint.io/list/carlos/birthday-2026

The Chrome extension: https://gifthint.io

Feedback very welcome. What would make you actually send this to your family? 👇

---

## SECTION 2 — PERSONAL NETWORK OUTREACH

---

### 2A. EMAIL — 20 Personal Contacts

**Subject:** I made something I think you'll actually use (+ I need your honest take)

---

Hi [NAME],

I've been heads-down on a side project for the past few months and I'm finally at the point where I want real people to try it before it goes fully public. You're one of 20 people I'm sending this to — people whose opinions I trust and who I think will give me an honest answer rather than a polite one.

**The problem it solves:**

You know that moment when someone asks what you want for your birthday and you scramble to send them a mess of screenshots and half-remembered links? Or you buy someone a gift only to find out your sibling bought the same thing?

GiftHint fixes both sides of that.

**What it is:**

A Chrome extension with a floating heart button that appears on any product page. You click it, it saves the item (name, price, photo, link) to your personal wishlist. You share one link. Anyone who opens it can see your full list without creating an account, and they can "claim" items they're buying so nothing gets duplicated.

The new version also lets you keep separate lists — birthday, Christmas, wedding registry — each with their own link, and a countdown showing how many days until the occasion.

**My actual wishlist so you can see what it looks like:**
https://gifthint.io/list/carlos/birthday-2026

(Nothing embarrassing on there. Probably. Don't judge the cashmere socks.)

**The favour I'm asking:**

Install the extension (takes 30 seconds), save 2–3 items from any store you're already on, then reply to this email with one honest sentence: did it work, and would you actually use this?

If something was confusing or broken, that's the most useful thing you could tell me.

**Install link:** https://gifthint.io

That's it. No survey, no form, just a reply.

Thanks — genuinely.

[YOUR NAME]

P.S. If you think someone else you know would find this useful, forward it on. I'm not doing a big launch yet, so word of mouth from people I trust is everything right now.

---

### 2B. TEXT MESSAGE / iMESSAGE — Close Friends & Family

---

**Version A — for people who love gadgets/apps:**

Hey! I finally launched the thing I've been building 🎁 It's called GiftHint — basically a browser button that saves anything you want online to a wishlist, then one link for people to see it all and claim what they're buying. No more duplicate gifts.

Here's my birthday list so you can see what it looks like: https://gifthint.io/list/carlos/birthday-2026

Would you be up for trying it? Just install and save a couple of things from any site you visit. Takes 5 mins and your honest feedback is genuinely the most helpful thing right now.

---

**Version B — for people who aren't particularly techy:**

Hey! Quick favour — I've been working on something for the last few months and you're one of the first people I'm showing it to.

It's basically: you click a button on things you want online, they go on a list, you send people the link. Way easier than the screenshot chaos every birthday. 😅

My list: https://gifthint.io/list/carlos/birthday-2026

Did the link work okay for you? Would you use something like this? Honest answer appreciated ❤️

---

**Version C — for family members less comfortable with tech:**

Hi [NAME]! I built something that makes birthday and Christmas shopping easier — for both sides 😊

If you click this link you can see a sample wishlist — you can browse it, see prices, and if you want to buy something you can mark it so no one else buys the same thing: https://gifthint.io/list/carlos/birthday-2026

What do you think — is it clear how it works? Would you use a list like this? Even just "yes" or "I'm confused by X" is really helpful!

---

## SECTION 3 — BETA TRACKING DASHBOARD SETUP

---

### 3A. SQL — Beta Cohort View

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- beta_cohort: daily signup + activity roll-up for Week 1–12 tracking
-- Run in Supabase SQL editor or query via the REST API
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW beta_cohort AS
SELECT
  date(u.created_at)                                   AS signup_date,
  COUNT(DISTINCT u.id)                                 AS signups,
  COUNT(DISTINCT CASE WHEN wi.id IS NOT NULL
        THEN u.id END)                                 AS users_with_items,
  COUNT(wi.id)                                         AS total_items_saved,
  ROUND(COUNT(wi.id)::numeric /
        NULLIF(COUNT(DISTINCT u.id), 0), 1)            AS avg_items_per_user,
  SUM(CASE WHEN wi.created_at >= u.created_at
           AND wi.created_at < u.created_at + interval '7 days'
           THEN 1 ELSE 0 END)                          AS items_saved_first_7_days
FROM users u
LEFT JOIN wishlists w  ON w.user_id  = u.id
LEFT JOIN wishlist_items wi ON wi.wishlist_id = w.id
GROUP BY date(u.created_at)
ORDER BY signup_date DESC;


-- ─────────────────────────────────────────────────────────────────────────────
-- beta_funnel: cumulative funnel from signup → item saved → gifter click
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW beta_funnel AS
WITH base AS (
  SELECT
    u.id                                               AS user_id,
    u.created_at                                       AS signed_up_at,
    MIN(wi.created_at)                                 AS first_item_at,
    COUNT(DISTINCT wi.id)                              AS items_saved,
    COUNT(DISTINCT pv.id)                              AS gifter_page_views,
    COUNT(DISTINCT CASE WHEN pv.is_affiliate_click
          THEN pv.id END)                              AS affiliate_clicks
  FROM users u
  LEFT JOIN wishlists w         ON w.user_id      = u.id
  LEFT JOIN wishlist_items wi   ON wi.wishlist_id  = w.id
  LEFT JOIN page_views pv       ON pv.wishlist_id  = w.id
  GROUP BY u.id, u.created_at
)
SELECT
  COUNT(*)                                             AS total_signups,
  COUNT(CASE WHEN items_saved >= 1 THEN 1 END)        AS saved_at_least_1_item,
  COUNT(CASE WHEN items_saved >= 3 THEN 1 END)        AS saved_at_least_3_items,
  COUNT(CASE WHEN gifter_page_views >= 1 THEN 1 END)  AS list_shared_at_least_once,
  COUNT(CASE WHEN affiliate_clicks >= 1 THEN 1 END)   AS generated_affiliate_click,
  ROUND(
    COUNT(CASE WHEN items_saved >= 1 THEN 1 END)::numeric
    / NULLIF(COUNT(*), 0) * 100, 1
  )                                                    AS activation_rate_pct
FROM base;


-- ─────────────────────────────────────────────────────────────────────────────
-- beta_weekly: week-over-week signup and activity counts for the 12-week window
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW beta_weekly AS
SELECT
  date_trunc('week', u.created_at)::date               AS week_start,
  COUNT(DISTINCT u.id)                                  AS new_signups,
  SUM(COUNT(DISTINCT u.id)) OVER (
    ORDER BY date_trunc('week', u.created_at)
  )                                                     AS cumulative_signups,
  COUNT(DISTINCT wi.id)                                 AS items_saved,
  COUNT(DISTINCT CASE WHEN pv.is_affiliate_click
        THEN pv.id END)                                 AS affiliate_clicks
FROM users u
LEFT JOIN wishlists w       ON w.user_id     = u.id
LEFT JOIN wishlist_items wi ON wi.wishlist_id = w.id
LEFT JOIN page_views pv     ON pv.wishlist_id = w.id
GROUP BY date_trunc('week', u.created_at)
ORDER BY week_start;
```

---

### 3B. WEEK 12 TARGETS + MILESTONES

| Metric | Week 4 | Week 8 | Week 12 (final) |
|--------|--------|--------|-----------------|
| Cumulative signups | 35 | 70 | **100** |
| Active users (≥1 item saved) | 25 | 55 | **80** |
| Total items saved | 75 | 200 | **300** |
| Wishlists shared (gifter page view ≥1) | 15 | 40 | **60** |
| Affiliate buy clicks | 10 | 30 | **50** |
| Estimated affiliate revenue | $1.00 | $3.00 | **$5.00** |
| Feedback survey responses | 5 | 15 | **25** |

**Revenue assumption:** $0.10 average EPC (earnings per click) × 50 clicks = $5.00. Realistic for a cold-traffic mix of Amazon Associates (3–4% commission, low AOV) and Skimlinks (variable).

**Health flags — pause and diagnose if:**
- Activation rate (signups → ≥1 item saved) drops below 40%
- Avg items per user stays below 2.0 after Week 4 (suggests floating button UX friction)
- Zero affiliate clicks in a week where ≥5 gifter page views occurred (suggests claim-to-click funnel broken)

---

### 3C. DAILY MORNING CHECK RITUAL

**Total time: ~8 minutes. Run every weekday morning before opening anything else.**

---

**Step 1 — Supabase (3 min)**

Open: https://app.supabase.com → your project → SQL Editor

Run:
```sql
-- Yesterday's snapshot
SELECT
  (SELECT COUNT(*) FROM users
   WHERE created_at >= current_date - 1
   AND created_at < current_date)             AS signups_yesterday,

  (SELECT COUNT(*) FROM users
   WHERE created_at >= '2026-05-01')          AS total_signups_to_date,

  (SELECT COUNT(DISTINCT u.id)
   FROM users u
   JOIN wishlists w ON w.user_id = u.id
   JOIN wishlist_items wi ON wi.wishlist_id = w.id
   WHERE u.created_at >= '2026-05-01')        AS active_users_to_date,

  (SELECT COUNT(*) FROM wishlist_items
   WHERE created_at >= current_date - 1
   AND created_at < current_date)             AS items_saved_yesterday,

  (SELECT COUNT(*) FROM page_views
   WHERE created_at >= current_date - 1
   AND created_at < current_date
   AND is_affiliate_click = true)             AS affiliate_clicks_yesterday;
```

Note: any spike (good or bad) compared with the 7-day rolling average. A spike in signups with zero items saved = traffic without activation → check the onboarding flow and extension install rate.

---

**Step 2 — Amazon Associates dashboard (2 min)**

Open: https://affiliate-program.amazon.com → Reports → Summary

Check yesterday:
- Clicks
- Items shipped (lags 24–48h)
- Estimated earnings

Flag: if clicks > 0 but ordered items = 0, check whether the affiliate tag is correctly appended to Amazon URLs in `app/list/[username]/[slug]/page.tsx`.

---

**Step 3 — Skimlinks dashboard (2 min)**

Open: https://dashboard.skimlinks.com → Reports → Daily

Check:
- Merchant clicks
- Commissions earned
- Top merchants (confirms which retailers your users are saving from)

Flag: if a merchant suddenly disappears from the top list mid-week, check whether that retailer's product page structure changed and broke the floating button's OG/JSON-LD reader.

---

**Step 4 — Feedback inbox (1 min)**

Check email (carlos@gifthint.io) and the Typeform responses dashboard for any overnight feedback. Flag anything mentioning:
- Extension button not appearing (→ add to floating-button issue tracker)
- Wrong price / title captured (→ retailer-specific fix)
- Gifter claim flow confusion (→ UX copy review)

Log anything actionable in the bug tracker before closing.

---

## SECTION 4 — FEEDBACK COLLECTION

---

### 4A. FEEDBACK SURVEY — 5 Questions
**Platform:** Typeform or Google Forms. Title: "GiftHint Beta Feedback (takes 2 min)"

Share via: survey link in the Week 2 follow-up email, at the bottom of the gifter page, and in the ProductHunt first comment.

---

**Q1 — Overall impression**
*Type: Opinion Scale 1–10*

On a scale of 1–10, how useful did GiftHint feel for your actual gifting situation?

*(1 = not useful at all, 10 = exactly what I needed)*

---

**Q2 — The saving experience**
*Type: Multiple choice (pick one)*

When you used the floating heart button to save an item, how did it go?

- ✅ Worked perfectly — name, price, and image all came through correctly
- ⚠️ Mostly worked but something was wrong (price missing, image didn't load, etc.)
- ❌ The button didn't appear on the page I was browsing
- 🙅 I didn't manage to install the extension

*Follow-up (show if anything other than first option selected):*
Which site were you on, and what went wrong? *(Short text)*

---

**Q3 — The gifter experience**
*Type: Multiple choice (pick one)*

If you viewed someone else's GiftHint list as a potential gifter, how clear was the claiming process?

- Crystal clear — I knew exactly what to do
- Mostly clear — I figured it out but it took a moment
- Confusing — I wasn't sure what claiming meant or how it worked
- I didn't view a list as a gifter

*Follow-up (show if "Confusing"):*
What specifically wasn't clear? *(Short text)*

---

**Q4 — The most valuable thing**
*Type: Short text*

What's the one thing GiftHint does that you'd actually miss if it was gone?

*(No right answer — whatever comes to mind first)*

---

**Q5 — The biggest gap**
*Type: Short text*

What's the one thing GiftHint doesn't do that would make you recommend it to everyone you know?

*(Could be a feature, a platform, a use case — anything)*

---

**Thank you screen copy:**

Thanks so much — this genuinely shapes what we build next.

If you want to follow along:
🐦 Twitter/X: @gifthint
📧 Get update emails: https://gifthint.io/#notify

And if GiftHint saved you from a duplicate gift situation, we'd love a share: https://gifthint.io

---

### 4B. IN-APP FEEDBACK PROMPT

**Trigger:** Show after the user's 3rd item save (first two saves are the "aha" flow; third save signals genuine adoption intent).

**Placement:** Slide-up banner at the bottom of the gifter page or dashboard, dismissible, shown once per user.

---

**Prompt copy:**

```
┌──────────────────────────────────────────────────────────┐
│  How's GiftHint working for you?                         │
│                                                          │
│  [👍 Love it]   [👎 Needs work]   [💬 Tell us]          │
│                                          [Dismiss ×]     │
└──────────────────────────────────────────────────────────┘
```

**On 👍 (Love it):**
> "That's great to hear! If you know someone who'd find this useful, share your list link — word of mouth is how we grow. 🎁"
> *[Copy list link] [Dismiss]*

**On 👎 (Needs work):**
> "Thanks for being honest — that's how we get better. What's the biggest thing that's not working for you?"
> *[Short text input — 3 lines max] [Send] [Skip]*
> On send: "Got it. We'll look into this — thank you."

**On 💬 (Tell us):**
> Redirect to the 5-question Typeform survey (opens in new tab).
> Prompt disappears.

---

**Implementation note (popup.js / dashboard):**

```javascript
// Show after 3rd wishlist_items insert for this user session.
// Track in chrome.storage.local to avoid re-showing after dismiss.

const FEEDBACK_PROMPT_KEY = 'gh_feedback_prompt_shown'

async function maybeShowFeedbackPrompt(itemCount) {
  if (itemCount < 3) return

  const result = await chrome.storage.local.get(FEEDBACK_PROMPT_KEY)
  if (result[FEEDBACK_PROMPT_KEY]) return   // already shown or dismissed

  showFeedbackBanner()

  await chrome.storage.local.set({ [FEEDBACK_PROMPT_KEY]: true })
}
```

---

## APPENDIX — QUICK-REFERENCE LAUNCH CHECKLIST

```
Week 1
□ Send personal email to 20 contacts
□ Send iMessage/WhatsApp to 10 close friends/family
□ Set up beta_cohort, beta_funnel, beta_weekly SQL views in Supabase
□ Start daily morning check ritual

Week 2
□ Post to r/SideProject (Post 1 above)
□ Post to r/GiftIdeas (Post 2 above)
□ Send follow-up to anyone who replied to Week 1 emails but hadn't installed

Week 3
□ Launch on Product Hunt (midnight Pacific — schedule in PH dashboard)
□ Post the Twitter/X thread the morning of PH launch day
□ Reply to every PH comment within 2 hours
□ Post to r/ProductHunters (Post 3 above) 48h before PH launch

Week 4
□ Send survey link to all users who saved ≥ 3 items
□ Review activation rate — if below 40%, audit onboarding flow
□ Check Skimlinks top-merchant list for retailer coverage gaps

Weeks 5–8
□ Reply to relevant gift / wishlist threads in Reddit with genuine value (not spam)
□ Post in relevant Discord servers (r/weddingplanning Discord, gift exchange communities)
□ Weekly: review beta_weekly view, compare to milestone table

Weeks 9–12
□ Email users who saved ≥ 1 item but haven't shared their list — nudge to share
□ Re-post r/SideProject with a progress update ("Week 10: here's what I've learned")
□ Review survey responses — ship the top-requested fix before Week 12 ends
□ Final Week 12 snapshot: run beta_funnel view, write 1-paragraph retrospective
```
