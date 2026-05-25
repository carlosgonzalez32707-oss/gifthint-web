# GiftHint — Partnership Outreach Program

> **Purpose:** Structured program to acquire distribution partners in event-planning, gifting, and community contexts. Each partner gets a co-branded landing page, a referral code, and optional affiliate revenue sharing once they hit 10 active referred users.  
> **Owner:** Carlos  
> **Status:** Ready to execute

---

## 1. TARGET PARTNER CATEGORIES + RATIONALE

### Category A — Wedding Planners
**Why:** A wedding generates the highest-stakes gifting scenario a product like GiftHint can solve. The bride creates a wishlist; anywhere from 20 to 200 people need to coordinate purchases without doubling up. Planners are trusted by the couple *and* the family. One planner recommending GiftHint to 20 brides per year is 20 high-intent signups with large gifter cohorts behind each one.

**Key pitch angle:** GiftHint saves the planner the awkward conversation when Aunt Patricia buys the same Le Creuset as Uncle David. It's a professional recommendation, not a referral hustle. The planner looks competent; GiftHint gets the signup.

**Partnership value exchange:** Free co-branded landing page (`/partners/their-studio-name`), referral attribution credit, optional commission on affiliate clicks. No cost to the planner, no lock-in.

**Acquisition path:** Instagram DM to boutique wedding planners (5,000–50,000 followers), Facebook wedding planner groups, local wedding fairs, The Knot Vendor Network.

---

### Category B — Baby Shower Organisers
**Why:** Baby showers are increasingly cross-retailer (Mamas & Papas, Amazon, Mothercare, NEXT, Etsy), and traditional registries break if the organiser buys from a different store than the registry. GiftHint's universal-save model solves this perfectly. Baby shower organisers — often a best friend or sibling, not a professional — are highly social and will share organically if the tool works.

**Key pitch angle:** One link, any store, no duplicate muslins. Frame it as a baby shower planning tool, not a GiftHint product pitch.

**Partnership value exchange:** Dedicated landing page for parenting bloggers and NCT group admins. They recommend it as part of their "planning your baby shower" content.

**Acquisition path:** UK Mums Facebook groups (NCT groups are ideal — tight-knit, high trust), parenting bloggers with 5k–50k followers, Mumsnet community.

---

### Category C — Corporate Gifting Coordinators
**Why:** Office managers, PAs, and HR coordinators buy gifts multiple times per year — leaving parties, Secret Santa, work anniversaries, new-baby gifts. They currently rely on Amazon wishlists or email chains asking "what do you want?" GiftHint gives the recipient a multi-store wishlist; the coordinator shares it with the team.

**Key pitch angle:** Stops the coordinator from getting 4 people asking independently what Sarah wants for her leaving do. One link, everyone coordinates quietly.

**Partnership value exchange:** A dedicated `/partners/corporate-gifting` page framed for professional use. Potential for a "team coordinators" blog post featuring their testimonial.

**Acquisition path:** LinkedIn (search "office manager London", "executive assistant", "HR coordinator"), PA forums (The PA Hub, Executive PA Network), local business groups.

---

### Category D — LSAT / Pre-Law Tutoring Communities
**Why:** Personal network channel. Pre-law and LSAT students are highly educated gift-givers and gift-receivers — graduation season (May–June) is a concentrated gifting window. LSAT tutors have direct access to cohorts of 10–30 students at a time, and student communities share tools freely.

**Key pitch angle:** "Graduation wishlist that actually works — your family shops at M&S, your friends shop at Amazon, your wishlist works everywhere."

**Partnership value exchange:** Personal outreach (no cold pitch needed if you have existing relationships). Offer a referral link, explain the reward tiers (custom username at 1 referral, Pro badge at 10). Students share natively.

**Acquisition path:** Reddit r/LSAT, 7Sage community forums, Blueprint LSAT Discord, personal tutoring network. Direct message to LSAT tutors on Reddit who post regularly.

---

### Category E — Tennis Club Coordinators
**Why:** Junior tennis clubs and adult club committees run end-of-season coach gift collections every year. This is a classic coordination problem: 20 parents need to chip in for one coach gift, but some want to add a personal gift too. GiftHint's group gifting feature (pool contributions) is a direct fit. Club committee members are trusted, their recommendations carry weight, and clubs send newsletters that members actually read.

**Key pitch angle:** End-of-season coach gift coordination — one link, parents claim items or chip into the group gift pool.

**Partnership value exchange:** Co-branded landing page `/partners/lawn-tennis-association` or per-club pages. Newsletter blurb template they can drop in directly.

**Acquisition path:** LTA (Lawn Tennis Association) club finder, local club newsletters, county junior tennis coordinator groups on Facebook, WhatsApp groups for club committees.

---

### Category F — Event Planning Facebook Groups
**Why:** Facebook groups for event planners have high volume (10k–100k members), low existing tool competition, and a culture of sharing useful resources. A single well-received post can drive 50–100 signups without any paid spend. The moderators are the gatekeepers — partner with them rather than posting into the group unsolicited.

**Key pitch angle:** Tool recommendation, not a product launch. "Here's what I'm recommending to clients for gift list coordination."

**Partnership value exchange:** Moderator gets a dedicated page and referral credit. Can be framed as a community-exclusive link.

**Acquisition path:** Search Facebook for "event planning UK", "wedding coordinator community", "party planning tips". Identify groups with 10k+ members and active moderators. DM the mod, not the group.

---

## 2. PARTNERSHIP PITCH — 3 VERSIONS

---

### Version A — Wedding Planner (Email, ~150 words)

**Subject:** A free tool your brides will actually thank you for

Hi [NAME],

I came across your work at [STUDIO NAME] — your [recent project / venue they post about] is beautiful.

I wanted to share something I think your couples would genuinely find useful. I built GiftHint — a free wishlist tool that works across every store, not just Amazon. Your couples share one link; guests claim items in real time. Nobody doubles up on the Le Creuset.

There's no login required for guests, no app to download, and it takes about 90 seconds to set up. It also handles multi-store wishlists — so if they want something from John Lewis, Etsy, and Selfridges, it's one link for all of it.

I'd love to offer you a co-branded page — gifthint.io/partners/[your-studio] — you can share with couples as part of your onboarding pack. Completely free, no strings.

Would you be open to a quick look?

Best,  
Carlos

---

### Version B — Community Admin (DM, ~80 words)

Hi [NAME],

I run GiftHint — a free wishlist tool for any store, with a real-time claim system so people don't double-buy.

I'd love to offer your community a dedicated page (gifthint.io/partners/[your-community]) with your branding and a direct link to sign up. When members sign up through it, you get referral credit — and once 10 members are active, we'll share a portion of affiliate revenue with you.

Happy to send more details. No commitment either way.

---

### Version C — Sports Club Newsletter (Email, ~100 words)

**Subject:** End-of-season coach gift — a simpler way to coordinate

Hi [NAME],

With [end of season / tournament month] coming up, I wanted to share a tool that makes coach gift coordination much easier.

GiftHint lets parents build a multi-item gift list — including a group gifting option where everyone chips in on one bigger present. Parents get one link, they claim what they're buying, nobody doubles up. It works across Amazon, John Lewis, Etsy, anywhere.

I've set up a club-specific page at gifthint.io/partners/[club-name] if you'd like to share it in the newsletter. Free for everyone to use.

Happy to chat if useful — thanks for all you do for the club.

Best,  
Carlos

---

## 3. PARTNER LANDING PAGE SYSTEM

### Route: `app/partners/[partnerSlug]/page.tsx`

**Overview:** A Server Component that fetches the partner record by slug, renders a co-branded landing page, and sets the `gifthint_ref` cookie to the partner's referral code before the user signs up. All downstream signups are attributed to the partner via the existing referral system.

---

```tsx
/**
 * app/partners/[partnerSlug]/page.tsx — GiftHint
 *
 * Co-branded partner landing pages.
 *
 * Route: /partners/[partnerSlug]
 *   e.g. /partners/knighton-weddings
 *        /partners/lawn-tennis-association
 *        /partners/nct-chiswick
 *
 * Server Component — sets gifthint_ref cookie via Set-Cookie response header
 * so that when the visitor signs up (via Supabase OAuth), the existing
 * /api/auth/signup route attributes the new user to the partner's referral_code.
 *
 * Data flow:
 *   1. Request hits this page with [partnerSlug].
 *   2. Fetch partner row from `partners` table by slug.
 *   3. If not found → notFound() (404).
 *   4. Set Set-Cookie: gifthint_ref=<partner.referral_code>; Path=/; SameSite=Lax
 *      (30-day expiry — same as the user referral cookie).
 *   5. Render co-branded page: partner logo + GiftHint logo + occasion-specific copy.
 *   6. CTA links to /auth/signin — after OAuth, /api/auth/signup reads the cookie.
 *
 * Partner record shape (from `partners` table):
 *   { id, slug, name, logo_url, category, tagline, referral_code, accent_colour }
 *
 * Tracking:
 *   Every signup via this page increments partner.referral_count (via the
 *   existing increment_referral_count RPC) and logs a referral_event.
 *   Partner dashboard (future) queries referral_events WHERE referrer_id = partner.user_id.
 *
 * ISR: revalidate = 3600 (partner data changes rarely; no need for per-request fetch).
 */

import type { Metadata }  from 'next'
import { notFound }        from 'next/navigation'
import { cookies }         from 'next/headers'
import { createServerClient } from '@/lib/supabase-server'
import { tokens }          from '@/tokens'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PartnerRow {
  id:             string
  slug:           string
  name:           string
  logo_url:       string | null
  category:       'wedding' | 'baby_shower' | 'corporate' | 'sports_club' | 'education' | 'other'
  tagline:        string | null
  referral_code:  string
  accent_colour:  string | null   // hex, e.g. '#C084FC' — used for CTA button
}

// ── ISR ────────────────────────────────────────────────────────────────────────

export const revalidate = 3600

// ── Static params (optional — generate known slugs at build time) ──────────────

export async function generateStaticParams() {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('partners')
    .select('slug')
    .eq('active', true)
  return (data ?? []).map((p) => ({ partnerSlug: p.slug }))
}

// ── Metadata ───────────────────────────────────────────────────────────────────

export async function generateMetadata(
  { params }: { params: { partnerSlug: string } },
): Promise<Metadata> {
  const partner = await fetchPartner(params.partnerSlug)
  if (!partner) return {}

  const title = `GiftHint × ${partner.name}`
  const description = partner.tagline
    ?? `The free wishlist tool recommended by ${partner.name}. Save from any store. Share one link. No duplicates.`

  return {
    title,
    description,
    robots: { index: false },    // partner pages are not indexed — they're private landing pages
  }
}

// ── Data fetching ──────────────────────────────────────────────────────────────

async function fetchPartner(slug: string): Promise<PartnerRow | null> {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('partners')
    .select('id, slug, name, logo_url, category, tagline, referral_code, accent_colour')
    .eq('slug', slug)
    .eq('active', true)
    .maybeSingle()
  return data as PartnerRow | null
}

// ── Category copy map ──────────────────────────────────────────────────────────

const CATEGORY_COPY: Record<PartnerRow['category'], {
  headline: string
  subline:  string
  steps:    [string, string, string]
}> = {
  wedding: {
    headline: 'Your wedding wishlist, from every store.',
    subline:  'Save from John Lewis, Selfridges, Etsy, Amazon — one link for all of it. Guests claim in real time. Zero duplicates.',
    steps:    [
      'Save items from any store with one click',
      'Share gifthint.io/list/your-name with guests',
      'Guests buy and claim — nobody doubles up',
    ],
  },
  baby_shower: {
    headline: 'Everything your baby needs, from every store.',
    subline:  'Build your list from Mamas & Papas, NEXT, Amazon, Etsy — share one link. Friends claim what they\'re buying.',
    steps:    [
      'Save from Mamas & Papas, Amazon, Etsy — anywhere',
      'Share one link with everyone',
      'Items get claimed automatically — no duplicates',
    ],
  },
  corporate: {
    headline: 'Gift coordination without the email chain.',
    subline:  'Your colleague shares one link. The team claims items. No awkward duplicate presents at the leaving party.',
    steps:    [
      'Recipient saves what they actually want',
      'You share the link with the team',
      'Everyone claims quietly — coordinator stays sane',
    ],
  },
  sports_club: {
    headline: 'End-of-season coach gift, sorted.',
    subline:  'Parents chip into a group gift or claim individual items — one link, any store, fully coordinated.',
    steps:    [
      'Create a wishlist for the coach gift',
      'Share the link in the parent WhatsApp',
      'Parents contribute or claim — you\'re done',
    ],
  },
  education: {
    headline: 'Graduation wishlist that actually works.',
    subline:  'Your family shops at M&S. Your friends shop at ASOS. Your wishlist works everywhere.',
    steps:    [
      'Save from any store in seconds',
      'Share gifthint.io/list/your-name',
      'Gifts get claimed — no awkward duplicates',
    ],
  },
  other: {
    headline: 'Your gift list, from anywhere on the web.',
    subline:  'Save from any store. Share one link. No duplicates.',
    steps:    [
      'Save items from any store with one click',
      'Share your gifthint.io link',
      'Items get claimed — nobody doubles up',
    ],
  },
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function PartnerPage(
  { params }: { params: { partnerSlug: string } },
) {
  const partner = await fetchPartner(params.partnerSlug)
  if (!partner) notFound()

  // Set the referral cookie so sign-ups are attributed to this partner.
  // 30-day expiry matches the user referral cookie lifetime.
  const cookieStore = cookies()
  cookieStore.set('gifthint_ref', partner.referral_code, {
    path:     '/',
    sameSite: 'lax',
    maxAge:   60 * 60 * 24 * 30,   // 30 days
    secure:   process.env.NODE_ENV === 'production',
    httpOnly: false,                 // readable by JS for analytics
  })

  const copy   = CATEGORY_COPY[partner.category]
  const accent = partner.accent_colour ?? tokens.colors.purple
  const c      = tokens.colors

  return (
    <div style={{ minHeight: '100vh', background: c.bg, fontFamily: tokens.font.sans, color: c.text }}>

      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <nav style={{
        borderBottom: `1px solid ${c.border}`,
        padding: '0 24px',
        height: '56px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: c.bg,
      }}>
        {/* Co-brand lockup */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {partner.logo_url && (
            <>
              <img
                src={partner.logo_url}
                alt={partner.name}
                style={{ height: '28px', objectFit: 'contain' }}
              />
              <span style={{ color: c.border, fontSize: '20px' }}>×</span>
            </>
          )}
          <span style={{ fontSize: '16px', fontWeight: 800, letterSpacing: '-0.03em' }}>
            🎁 GiftHint
          </span>
        </div>

        <a
          href="/auth/signin"
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: accent,
            textDecoration: 'none',
          }}
        >
          Sign in →
        </a>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <main style={{ maxWidth: '680px', margin: '0 auto', padding: '64px 24px 48px' }}>

        {/* Partner attribution badge */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          background: `${accent}18`,
          border: `1px solid ${accent}30`,
          borderRadius: '100px',
          padding: '5px 14px',
          marginBottom: '28px',
          fontSize: '12px',
          fontWeight: 600,
          color: accent,
        }}>
          Recommended by {partner.name}
        </div>

        <h1 style={{
          fontSize: 'clamp(28px, 5vw, 44px)',
          fontWeight: 800,
          letterSpacing: '-0.04em',
          lineHeight: 1.1,
          marginBottom: '16px',
        }}>
          {copy.headline}
        </h1>

        <p style={{
          fontSize: '17px',
          color: c.muted,
          lineHeight: 1.6,
          marginBottom: '36px',
          maxWidth: '520px',
        }}>
          {copy.subline}
        </p>

        {/* CTA */}
        <a
          href="/auth/signin"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: accent,
            color: '#fff',
            fontWeight: 700,
            fontSize: '15px',
            padding: '14px 28px',
            borderRadius: '10px',
            textDecoration: 'none',
          }}
        >
          Create my free list →
        </a>

        <p style={{ fontSize: '12px', color: c.muted, marginTop: '10px' }}>
          Free forever · No login required for your guests
        </p>

        {/* ── How it works ──────────────────────────────────────────────────── */}
        <div style={{ marginTop: '56px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '20px', letterSpacing: '-0.02em' }}>
            How it works
          </h2>
          {copy.steps.map((step, i) => (
            <div key={i} style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '16px',
              marginBottom: '16px',
            }}>
              <div style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: `${accent}18`,
                border: `1px solid ${accent}30`,
                color: accent,
                fontSize: '13px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                {i + 1}
              </div>
              <p style={{ fontSize: '15px', color: c.text, lineHeight: 1.5, paddingTop: '4px' }}>
                {step}
              </p>
            </div>
          ))}
        </div>

        {/* ── Footer ────────────────────────────────────────────────────────── */}
        <div style={{
          marginTop: '56px',
          paddingTop: '24px',
          borderTop: `1px solid ${c.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px',
        }}>
          <span style={{ fontSize: '12px', color: c.muted }}>
            © {new Date().getFullYear()} GiftHint · Free forever
          </span>
          <div style={{ display: 'flex', gap: '16px' }}>
            <a href="/privacy" style={{ fontSize: '12px', color: c.muted, textDecoration: 'none' }}>Privacy</a>
            <a href="/terms"   style={{ fontSize: '12px', color: c.muted, textDecoration: 'none' }}>Terms</a>
          </div>
        </div>

      </main>
    </div>
  )
}
```

### Cookie Attribution Notes

- The `gifthint_ref` cookie is set to the **partner's referral code** (not a user referral code — same field, different owner type).
- Partners are stored as rows in the `partners` table, and they each have an associated `user_id` in the `users` table (a system account created at onboarding time). This lets the existing `increment_referral_count` RPC and `referral_events` pipeline work unchanged.
- No changes required to `/api/auth/signup` — it reads the cookie and attributes to whoever owns the referral_code, whether that's a human user or a partner system account.

---

## 4. AFFILIATE COMMISSION OFFER FOR PARTNERS

### Program Terms

| Threshold | Commission | Tracked via |
|-----------|-----------|-------------|
| 0–9 active referred users | No commission (referral credits only) | `referral_events` |
| 10+ active referred users | 20% of GiftHint affiliate revenue from their referrals' gifter pages | `click_events` + `partner_payouts` |

**"Active" definition:** A referred user is active if they have ≥1 item saved and their wishlist was accessed at least once in the past 90 days.

**Revenue attribution chain:**  
`partners.referral_code` → `users.referred_by` (set at signup) → `users.id` (wisher) → `click_events.wisher_user_id` → Skimlinks/Amazon revenue → 20% commission to partner.

**Payout cadence:** Monthly. Minimum payout threshold: £25. Paid via bank transfer or PayPal. Partner receives a monthly statement email with breakdown.

**Commission is on GiftHint's net affiliate revenue** from the referred user cohort — not gross GMV. Amazon Associates and Skimlinks rates vary (typically 1–8% of purchase price); GiftHint earns this and shares 20% with the partner.

---

### `partner_payouts` Table Schema

See SQL appendix (Section 6) for the full schema. Key columns:

| Column | Type | Notes |
|--------|------|-------|
| `partner_id` | uuid | FK → partners.id |
| `period_start` / `period_end` | timestamptz | Monthly billing period |
| `referred_active_users` | integer | Active users in cohort this period |
| `total_affiliate_clicks` | integer | Buy-button clicks from referral cohort |
| `gross_affiliate_revenue_pence` | integer | GiftHint's estimated revenue (pence) |
| `commission_pence` | integer | 20% of gross (pence) |
| `status` | text | `pending` → `approved` → `paid` |

---

## 5. OUTREACH TRACKER

| # | Name / Organisation | Category | Contact Method | Sent Date | Response | Status | Notes |
|---|---------------------|----------|----------------|-----------|----------|--------|-------|
| 1 | | Wedding planner | Instagram DM | | | 🔲 Not sent | |
| 2 | | Wedding planner | Email | | | 🔲 Not sent | |
| 3 | | Wedding planner | LinkedIn | | | 🔲 Not sent | |
| 4 | | Baby shower / NCT | Facebook group DM | | | 🔲 Not sent | |
| 5 | | Baby shower blogger | Email / DM | | | 🔲 Not sent | |
| 6 | | Corporate PA / office mgr | LinkedIn | | | 🔲 Not sent | |
| 7 | | Corporate PA / office mgr | LinkedIn | | | 🔲 Not sent | |
| 8 | | LSAT tutor (personal network) | Direct | | | 🔲 Not sent | |
| 9 | | LSAT tutor (personal network) | Reddit DM | | | 🔲 Not sent | |
| 10 | | 7Sage / Blueprint community admin | Forum DM | | | 🔲 Not sent | |
| 11 | | Tennis club coordinator | Email | | | 🔲 Not sent | |
| 12 | | Tennis club coordinator | Email | | | 🔲 Not sent | |
| 13 | | LTA junior programme contact | LinkedIn | | | 🔲 Not sent | |
| 14 | | Event planning FB group mod | Facebook DM | | | 🔲 Not sent | |
| 15 | | Event planning FB group mod | Facebook DM | | | 🔲 Not sent | |
| 16 | | Wedding planning FB group mod | Facebook DM | | | 🔲 Not sent | |
| 17 | | Parenting blogger | Email | | | 🔲 Not sent | |
| 18 | | Parenting blogger | Email | | | 🔲 Not sent | |
| 19 | | Hen party planner | Instagram DM | | | 🔲 Not sent | |
| 20 | | Graduation / university society | Email | | | 🔲 Not sent | |

**Status key:**  
🔲 Not sent · 📤 Sent · 👀 Opened · 💬 Replied · ✅ Partnered · ❌ Declined · 🔄 Follow-up pending

---

## 6. SQL SCHEMA APPENDIX

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- partners
--
-- Stores partner organisations that have co-branded landing pages and
-- referral attribution. Each partner row is associated with a system user
-- account (user_id) so the existing referral pipeline works unchanged.
--
-- Relationships:
--   partners.user_id → users.id     (the system user who "owns" the referral code)
--   partners.referral_code          (mirrors users.referral_code for the system user)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists partners (
  id              uuid        primary key default gen_random_uuid(),

  -- The system user account created for this partner.
  -- Signup attribution writes to users.referred_by = this user's id.
  user_id         uuid        not null references users(id) on delete restrict,

  -- URL-safe slug used in /partners/[slug]
  -- Must be unique, lowercase, hyphens only: 'knighton-weddings', 'nct-chiswick'
  slug            text        not null,

  -- Display name shown on the co-branded page
  name            text        not null,

  -- Partner category — drives copy selection in the landing page
  category        text        not null
                  check (category in (
                    'wedding', 'baby_shower', 'corporate',
                    'sports_club', 'education', 'other'
                  )),

  -- Mirrors users.referral_code for the partner's system user.
  -- Denormalised here for query convenience (avoids JOIN on every page load).
  referral_code   text        not null,

  -- Optional custom tagline for the hero section
  tagline         text,

  -- Optional logo URL (stored in Supabase Storage: partners/logos/<id>.png)
  logo_url        text,

  -- Accent colour for CTA button (hex, e.g. '#C084FC')
  -- Defaults to GiftHint purple in the component if null
  accent_colour   text,

  -- Contact details for the partner (used for payout communications)
  contact_email   text,
  contact_name    text,

  -- Whether this partner's page is live
  active          boolean     not null default true,

  -- Timestamps
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Unique constraints
create unique index if not exists partners_slug_idx          on partners (slug);
create unique index if not exists partners_user_id_idx       on partners (user_id);
create unique index if not exists partners_referral_code_idx on partners (referral_code);

-- Row-level security
alter table partners enable row level security;

-- Only service-role (admin) can read/write partner rows.
-- Partner pages are server-rendered with service-role key; no RLS bypass needed.
create policy "service role only" on partners
  using (auth.role() = 'service_role');


-- ─────────────────────────────────────────────────────────────────────────────
-- partner_payouts
--
-- Monthly commission statements for partners who have ≥10 active referred users.
--
-- Revenue attribution query (run monthly by cron or admin script):
--
--   SELECT
--     p.id                            AS partner_id,
--     count(DISTINCT u.id)            AS referred_active_users,
--     count(ce.id)                    AS total_affiliate_clicks,
--     -- Gross revenue estimated from click count × average order value × affiliate rate.
--     -- Replace with actual Skimlinks / Amazon earnings API data where available.
--     sum(ce.estimated_commission_pence)  AS gross_affiliate_revenue_pence,
--     round(sum(ce.estimated_commission_pence) * 0.20)  AS commission_pence
--   FROM partners p
--   JOIN users u         ON u.referred_by = p.user_id
--   JOIN click_events ce ON ce.wisher_user_id = u.id
--     AND ce.clicked_at BETWEEN :period_start AND :period_end
--   WHERE u.created_at <= :period_end          -- was signed up before period end
--     AND u.id IN (                            -- active = ≥1 item + viewed
--       SELECT DISTINCT user_id FROM wishlist_items
--     )
--   GROUP BY p.id
--   HAVING count(DISTINCT u.id) >= 10;         -- commission threshold
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists partner_payouts (
  id              uuid        primary key default gen_random_uuid(),

  -- The partner this payout belongs to
  partner_id      uuid        not null references partners(id) on delete cascade,

  -- Billing period (always 1st to last day of calendar month)
  period_start    timestamptz not null,
  period_end      timestamptz not null,

  -- Snapshot of the cohort stats at time of payout calculation
  referred_active_users           integer     not null default 0,
  total_affiliate_clicks          integer     not null default 0,

  -- Revenue figures stored in pence (integer arithmetic, no float rounding errors)
  -- gross_affiliate_revenue_pence: GiftHint's total affiliate earnings from cohort
  -- commission_pence:              20% of gross owed to the partner
  gross_affiliate_revenue_pence   integer     not null default 0,
  commission_pence                integer     not null default 0,

  -- Human-readable commission amount (derived, stored for emails and CSV export)
  commission_currency             text        not null default 'gbp',

  -- Lifecycle status
  -- pending  → calculated but not yet reviewed
  -- approved → reviewed and approved for payment
  -- paid     → payment sent (bank transfer or PayPal)
  -- void     → cancelled (e.g. partner was deactivated mid-period)
  status          text        not null default 'pending'
                  check (status in ('pending', 'approved', 'paid', 'void')),

  -- Payment confirmation details (populated when status = 'paid')
  paid_at         timestamptz,
  payment_ref     text,                -- bank transfer ref or PayPal transaction ID
  payment_notes   text,

  -- The admin email address that triggered the payout (audit trail)
  processed_by    text,

  -- Timestamps
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Prevent duplicate payouts for the same partner + period
create unique index if not exists partner_payouts_period_idx
  on partner_payouts (partner_id, period_start, period_end);

-- Fast lookup by partner
create index if not exists partner_payouts_partner_idx
  on partner_payouts (partner_id, period_start desc);

-- RLS: service role only (payouts are admin-managed)
alter table partner_payouts enable row level security;

create policy "service role only" on partner_payouts
  using (auth.role() = 'service_role');


-- ─────────────────────────────────────────────────────────────────────────────
-- click_events — extend with estimated_commission_pence
--
-- The existing click_events table tracks buy-button clicks. To support
-- partner commission calculations, add an estimated commission column.
-- This is populated async by a background job that reads Skimlinks /
-- Amazon PA API earnings data and back-fills per click.
--
-- If live earnings data is unavailable, the column defaults to null and
-- partner_payouts uses a blended average rate instead.
-- ─────────────────────────────────────────────────────────────────────────────

alter table click_events
  add column if not exists estimated_commission_pence integer;

comment on column click_events.estimated_commission_pence is
  'Estimated affiliate commission earned from this click, in pence. '
  'Populated by background sync with Skimlinks Publisher API / Amazon PA API. '
  'Null = not yet synced or no earnings data available for this click.';


-- ─────────────────────────────────────────────────────────────────────────────
-- Convenience view: partner_commission_summary
--
-- Aggregates the data needed for monthly payout calculation.
-- Run by the admin cron or manually to preview what's owed before approving.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view partner_commission_summary as
select
  p.id                                              as partner_id,
  p.name                                            as partner_name,
  p.slug                                            as partner_slug,
  p.contact_email,
  count(distinct u.id)                              as total_referred_users,
  count(distinct u.id) filter (
    where u.id in (select distinct user_id from wishlist_items)
  )                                                 as active_referred_users,
  count(ce.id)                                      as lifetime_affiliate_clicks,
  coalesce(sum(ce.estimated_commission_pence), 0)   as lifetime_gross_revenue_pence,
  coalesce(round(sum(ce.estimated_commission_pence) * 0.20), 0)
                                                    as lifetime_commission_pence
from partners p
left join users u         on u.referred_by = p.user_id
left join click_events ce on ce.wisher_user_id = u.id
group by p.id, p.name, p.slug, p.contact_email;
```

---

*Partnership program spec for gifthint.io · Referral infrastructure re-uses existing `referral_code`, `referral_events`, and `click_events` pipeline unchanged · SQL tested against Supabase Postgres 15*
