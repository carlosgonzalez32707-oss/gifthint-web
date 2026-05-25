# GiftHint — Keyword Strategy

SEO and content strategy for the `/gifts/[occasion]` landing page cluster.
Last updated: May 2026.

---

## 1. Primary Keywords per Occasion

Volumes are estimated UK + US combined (Google Keyword Planner / Ahrefs ranges, rounded).
Difficulty scores are out of 100 (0 = no competition, 100 = impossible without DA 80+).

### Birthday
| Keyword | Est. Monthly Volume | Difficulty | Intent |
|---|---|---|---|
| birthday wish list | 27,000 | 42 | Transactional |
| birthday wishlist | 22,000 | 40 | Transactional |
| birthday gift list | 9,900 | 38 | Transactional |
| birthday registry | 6,600 | 35 | Transactional |
| what to put on a birthday list | 3,300 | 28 | Informational |
| birthday gift ideas for women | 49,000 | 61 | Informational |
| birthday gift ideas for men | 33,000 | 58 | Informational |
| **Target landing page** | `/gifts/birthday` | | |

### Christmas
| Keyword | Est. Monthly Volume | Difficulty | Intent |
|---|---|---|---|
| christmas wish list | 90,000 | 55 | Transactional |
| christmas wishlist | 74,000 | 52 | Transactional |
| christmas gift list | 18,000 | 46 | Transactional |
| secret santa wish list | 12,000 | 39 | Transactional |
| christmas gift ideas 2026 | 40,000 | 60 | Informational |
| xmas wishlist | 8,100 | 41 | Transactional |
| **Target landing page** | `/gifts/christmas` | | |

> **Note:** Christmas volume is extremely seasonal (Oct–Dec spike 10×). Publish by October 1 to capture early-season index time.

### Wedding
| Keyword | Est. Monthly Volume | Difficulty | Intent |
|---|---|---|---|
| wedding gift list | 33,000 | 58 | Transactional |
| wedding wishlist | 22,000 | 54 | Transactional |
| wedding registry | 110,000 | 71 | Transactional |
| alternative wedding registry | 5,400 | 39 | Transactional |
| universal wedding registry | 4,400 | 37 | Transactional |
| best wedding registry 2026 | 8,100 | 49 | Informational |
| **Target landing page** | `/gifts/wedding` | | |

> **Opportunity:** "Alternative wedding registry" has low difficulty and high commercial intent — couples frustrated with department store lock-in. Lead with this angle.

### Baby Shower
| Keyword | Est. Monthly Volume | Difficulty | Intent |
|---|---|---|---|
| baby shower wish list | 14,000 | 44 | Transactional |
| baby shower registry | 22,000 | 55 | Transactional |
| baby registry | 74,000 | 63 | Transactional |
| best baby registry | 9,900 | 47 | Informational |
| universal baby registry | 4,400 | 34 | Transactional |
| baby shower gift list | 6,600 | 41 | Transactional |
| **Target landing page** | `/gifts/baby-shower` | | |

### Graduation
| Keyword | Est. Monthly Volume | Difficulty | Intent |
|---|---|---|---|
| graduation gift list | 3,600 | 31 | Transactional |
| graduation wishlist | 2,400 | 29 | Transactional |
| graduation gift ideas | 33,000 | 52 | Informational |
| what to ask for as a graduation gift | 2,900 | 24 | Informational |
| college graduation gifts | 18,000 | 48 | Informational |
| **Target landing page** | `/gifts/graduation` | | |

### Housewarming
| Keyword | Est. Monthly Volume | Difficulty | Intent |
|---|---|---|---|
| housewarming gift list | 4,400 | 33 | Transactional |
| housewarming wishlist | 2,900 | 30 | Transactional |
| housewarming gift ideas | 27,000 | 49 | Informational |
| new home gift list | 3,600 | 32 | Transactional |
| housewarming registry | 2,400 | 28 | Transactional |
| moving in gift ideas | 8,100 | 41 | Informational |
| **Target landing page** | `/gifts/housewarming` | | |

### Anniversary
| Keyword | Est. Monthly Volume | Difficulty | Intent |
|---|---|---|---|
| anniversary gift list | 3,300 | 30 | Transactional |
| anniversary wishlist | 2,200 | 27 | Transactional |
| anniversary gifts for couples | 27,000 | 52 | Informational |
| what to ask for an anniversary gift | 1,900 | 22 | Informational |
| anniversary registry | 1,600 | 24 | Transactional |
| **Target landing page** | `/gifts/anniversary` | | |

---

## 2. Internal Linking Strategy

### Gifter page → occasion landing page

Every public gifter page at `/list/[username]/[slug]` should link back to the corresponding `/gifts/[occasion]` page. This passes authority from high-traffic gifter pages (which receive organic, social, and email traffic) back to the SEO cluster.

**Implementation (in `app/list/[username]/GifterPage.tsx`):**

```tsx
// Near the bottom of the gifter page, above the footer:
{wishlist.occasion && wishlist.occasion !== 'other' && (
  <a
    href={`/gifts/${occasionSlug}`}
    style={{ fontSize: 12, color: c.muted }}
  >
    Create your own {occasionLabel} list →
  </a>
)}
```

Map the DB key to the URL slug using `getOccasionSEOByDbKey()` from `lib/occasion-seo.ts`.

**Pages that should link to `/gifts`:**

| Source page | Link target | Anchor text |
|---|---|---|
| `/` (homepage) | `/gifts` | "Browse all occasions" |
| `/list/[username]/[slug]` | `/gifts/[occasion]` | "Create your own [occasion] list →" |
| Every `/gifts/[occasion]` | `/gifts` | "← All occasions" (already in Nav) |
| Footer (global) | `/gifts` | "Gift occasions" |

### Hub page → occasion pages

`/gifts` already links to all 7 `/gifts/[occasion]` pages via the occasion card grid. No additional work needed.

### Blog posts → landing pages (see §3)

Each content piece should include 2–3 contextual links to the relevant `/gifts/[occasion]` landing page using keyword-rich anchor text (e.g., "create a free graduation wish list").

---

## 3. Content Calendar — 2 Blog Posts per Month

Long-tail informational content that captures "research phase" queries and funnels to the transactional landing pages. All posts should be 1,200–1,800 words.

Each post should:
- Target a specific long-tail keyword with <30 difficulty
- Link to 1–2 relevant `/gifts/[occasion]` pages with CTA
- Be published under `/blog/[slug]` (to be built)
- Include a "Create your own [occasion] list" CTA block midway and at the end

### Month 1 (June 2026)

**Post 1:** "What to Get a Tennis Coach — 15 Gift Ideas They'll Actually Use"
- Target keyword: `what to get a tennis coach` (1,600/mo, difficulty 18)
- Angle: mix of practical coaching tools + luxury options
- Internal link: `/gifts/birthday`, `/gifts/graduation`
- CTA: "Build a wish list so your team can chip in on the perfect gift"

**Post 2:** "Graduation Gifts for Pre-Law Students — From Bar Prep to First Day Style"
- Target keyword: `graduation gifts for pre-law students` (880/mo, difficulty 14)
- Angle: items relevant to law school, LSATs, and professional first impressions
- Internal link: `/gifts/graduation`
- CTA: "Tell your family exactly what you want with a GiftHint graduation list"

### Month 2 (July 2026)

**Post 3:** "Housewarming Gifts for Small Apartments — 12 Space-Saving Ideas"
- Target keyword: `housewarming gifts for small apartments` (1,300/mo, difficulty 20)
- Angle: compact, multi-function items under $100
- Internal link: `/gifts/housewarming`
- CTA: "Create a housewarming list before your party so guests know exactly what fits"

**Post 4:** "The Best Baby Registry Checklist for First-Time Parents (2026)"
- Target keyword: `baby registry checklist first time parents` (4,400/mo, difficulty 26)
- Angle: complete by-room checklist, reassuring tone
- Internal link: `/gifts/baby-shower`
- CTA: "Add every item on this list in one click with GiftHint — any store, one list"

### Month 3 (August 2026)

**Post 5:** "What to Put on a Wish List for Your 30th Birthday"
- Target keyword: `what to put on a wish list for 30th birthday` (1,900/mo, difficulty 19)
- Angle: milestone birthday — mix of experiences, investments, luxury, and practical
- Internal link: `/gifts/birthday`
- CTA: "Save your 30th birthday list to GiftHint and share one link with everyone"

**Post 6:** "Wedding Registry Alternatives — 8 Better Options Than a Department Store"
- Target keyword: `wedding registry alternatives` (5,400/mo, difficulty 31)
- Angle: universal lists, experience registries, charity registries — pros/cons
- Internal link: `/gifts/wedding`
- CTA: "GiftHint lets you save from any store — no retailer lock-in"

### Month 4 (September 2026)

**Post 7:** "Christmas Wish List Ideas for Adults — 40 Things Worth Asking For"
- Target keyword: `christmas wish list ideas for adults` (8,100/mo, difficulty 34)
- Angle: curated by budget tier ($25, $50, $100, $200+) — shareable list
- Internal link: `/gifts/christmas`
- Publish date: September 15 for Christmas season indexing

**Post 8:** "Anniversary Gifts for Couples Who Have Everything"
- Target keyword: `anniversary gifts for couples who have everything` (3,600/mo, difficulty 27)
- Angle: experiences, subscriptions, luxury consumables, personalised items
- Internal link: `/gifts/anniversary`
- CTA: "Build an anniversary wish list together so family knows what to get you both"

### Month 5 (October 2026)

**Post 9:** "Gifts for a University Student Moving Into Halls"
- Target keyword: `gifts for university student moving into halls` (2,400/mo, difficulty 21)
- Internal link: `/gifts/housewarming`, `/gifts/graduation`

**Post 10:** "Secret Santa Ideas Under £25 — 20 Gifts That Feel Expensive"
- Target keyword: `secret santa ideas under £25` (12,000/mo, difficulty 29)
- Internal link: `/gifts/christmas`
- Publish date: October 1 — captures early Christmas research

### Month 6 (November 2026)

**Post 11:** "Baby Shower Gift Etiquette — What to Spend, When to Buy, and How to Coordinate"
- Target keyword: `baby shower gift etiquette` (4,400/mo, difficulty 24)
- Internal link: `/gifts/baby-shower`

**Post 12:** "The Perfect Housewarming Party Checklist (Host Edition)"
- Target keyword: `housewarming party checklist` (3,300/mo, difficulty 22)
- Internal link: `/gifts/housewarming`
- Angle: hosting tips + "send your wish list with invites" angle

---

## 4. Quick Wins — Existing Pages to Optimise

These pages already exist but are under-optimised for SEO.

| Page | Current title | Suggested update | Target keyword |
|---|---|---|---|
| `/` | "GiftHint — Your gift list, anywhere on the web" | Add "Wishlist from any store" to description | wishlist maker |
| `/list/[username]` | User's name only | Add structured data (Person + ItemList schema) | [name] wish list |
| `/bookmarklet` | Generic | "GiftHint Bookmarklet — Save from Any Browser" | gifthint without chrome |

---

## 5. Technical SEO Checklist

- [x] `generateStaticParams` on all occasion pages — fully pre-rendered at build
- [x] Unique `<title>` and `<meta description>` per page via `generateMetadata`
- [x] `FAQPage` JSON-LD schema on each `/gifts/[occasion]` page
- [x] Canonical URLs set via `alternates.canonical` in metadata
- [x] `/gifts` and `/gifts/[occasion]` in sitemap with priority 0.9
- [ ] `robots.ts` — confirm `/gifts/*` is not blocked (check `Disallow` rules)
- [ ] Add `og:image` per occasion (1200×630, branded with occasion emoji + tagline)
- [ ] Submit updated sitemap to Google Search Console after deploy
- [ ] Verify Core Web Vitals on `/gifts/[occasion]` — target LCP < 2.5s
- [ ] Add `ItemList` schema to the hub page listing all 7 occasions
