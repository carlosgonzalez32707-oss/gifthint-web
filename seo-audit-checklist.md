# GiftHint SEO Audit Checklist

Run this checklist before each major release and at the 2-week and 6-week marks
after publishing new occasion pages or blog posts. Check off each item as you
verify it. Add the date and your initials when a section is signed off.

---

## 1. Structured Data — Occasion Landing Pages

**Tool:** https://search.google.com/test/rich-results

Run each of the 7 `/gifts/[occasion]` URLs through the Rich Results Test.

| URL | FAQPage validates? | No errors? | Date checked |
|-----|--------------------|------------|--------------|
| `/gifts/birthday`     | ☐ | ☐ | |
| `/gifts/christmas`    | ☐ | ☐ | |
| `/gifts/wedding`      | ☐ | ☐ | |
| `/gifts/baby-shower`  | ☐ | ☐ | |
| `/gifts/graduation`   | ☐ | ☐ | |
| `/gifts/housewarming` | ☐ | ☐ | |
| `/gifts/anniversary`  | ☐ | ☐ | |

**What to check:**
- All 7 pages show a green "FAQPage" result in the Rich Results Test
- No red errors (yellow warnings for optional fields are acceptable)
- The FAQ questions and answers match the content visible on the page

---

## 2. Structured Data — Gifter Pages (ItemList + BreadcrumbList)

**Tool:** https://search.google.com/test/rich-results

Pick one live public gifter page with at least 3 unclaimed items.

```
https://gifthint.io/list/<username>/<slug>
```

☐ Rich Results Test detects an **ItemList** schema  
☐ ItemList contains at least 1 `ListItem` with `name`, `url`, and `offers.price`  
☐ Rich Results Test detects a **BreadcrumbList** schema  
☐ Breadcrumb shows 3 levels: Home → Gift Lists → [Name]'s [Occasion] List  
☐ No red validation errors on either schema  
☐ Canonical URL in the page `<head>` matches the gifter page URL (no trailing slash mismatch)

**Note:** If the page has no items, the ItemList will have `numberOfItems: 0` — test with a populated list.

---

## 3. Structured Data — Organization Schema (Homepage)

☐ Run `https://gifthint.io` through the Rich Results Test  
☐ **Organization** schema is detected  
☐ `name` is "GiftHint", `url` is `https://gifthint.io`  
☐ `logo` URL resolves (returns a 200, not 404)  
☐ `sameAs` URLs are reachable (Twitter/Instagram profiles exist)

---

## 4. Google Search Console — Indexing (check at 2 weeks + 6 weeks)

> Wait at least 2 weeks after deploying before checking. GSC data lags by
> 2–5 days; impression data takes longer to appear.

**2-week check (date: ___________)**

☐ All 7 `/gifts/[occasion]` URLs appear in Coverage → Valid  
☐ `/blog` index page is indexed  
☐ At least 1 blog post appears in Coverage → Valid  
☐ Homepage is indexed with no canonical mismatch  
☐ No pages in **Excluded → Duplicate without user-selected canonical**

**6-week check (date: ___________)**

☐ `/gifts/birthday` has impressions in Performance  
☐ Click-through rate visible for at least 3 occasion pages  
☐ No URLs in Coverage → Crawled but not indexed (re-inspect if present)  
☐ Sitemap submitted and shows 0 errors in Sitemaps tab

---

## 5. Title Tags and Meta Descriptions — Uniqueness

Run the following check against the live site or the build output.

☐ Each of the 7 occasion pages has a **unique** `<title>` tag  
☐ Each of the 7 occasion pages has a **unique** `<meta name="description">` tag  
☐ No two titles are identical (use `curl` + `grep` or a browser SEO extension)  
☐ All titles are ≤ 65 characters (Google truncates longer ones)  
☐ All descriptions are ≤ 160 characters  
☐ The homepage `<title>` is distinct from all occasion page titles  
☐ Each blog post has a unique `<title>` derived from its MDX frontmatter `title` field

**Quick terminal check:**
```bash
# Fetch all occasion page titles in one pass
for slug in birthday christmas wedding baby-shower graduation housewarming anniversary; do
  echo -n "$slug: "
  curl -s "https://gifthint.io/gifts/$slug" | grep -o '<title>[^<]*</title>'
done
```

---

## 6. Internal Linking — GifterFooter → Occasion Pages

Every gifter page footer must link to the correct occasion landing page.
This passes PageRank from gifter pages to the SEO landing pages.

☐ Open a `/list/<username>/<slug>` page for a **birthday** list  
  → Footer CTA reads "Create your own birthday list" and href is `/gifts/birthday`  
☐ Open a page for a **wedding** list  
  → Footer CTA reads "Create your own wedding list" and href is `/gifts/wedding`  
☐ Open a page for a **baby shower** list  
  → href is `/gifts/baby-shower` (not `/gifts/baby_shower`)  
☐ "Powered by GiftHint" link is present and href is `/`  
☐ Both links are regular `<a>` tags — **not** `rel="nofollow"` (verify in DevTools → Elements)

---

## 7. Blog Posts — Link Health

☐ Open each blog post and click every internal link — confirm no 404s  
☐ `amazon-wish-list-problem` links to `/gifts` — returns 200  
☐ `birthday-wishlist-tips` links to `/gifts/birthday` — returns 200  
☐ `tennis-coach-gifts` links to `/gifts/birthday` — returns 200  
☐ No external links return 404 or redirect to unrelated pages  
☐ All `<InlineCTA />` links resolve to `/gifts` or a valid `/gifts/[occasion]` URL

**Affiliate disclosure check:**  
☐ `tennis-coach-gifts.mdx` has `hasAffiliateLinks: true` → amber disclosure banner visible at top of post  
☐ `birthday-wishlist-tips.mdx` has `hasAffiliateLinks: false` → NO disclosure banner rendered  
☐ `amazon-wish-list-problem.mdx` has `hasAffiliateLinks: false` → NO disclosure banner rendered

---

## 8. Core Web Vitals — Lighthouse

**Tool:** Chrome DevTools → Lighthouse, or https://pagespeed.web.dev

Run against `/gifts/birthday` (representative occasion page) and one blog post.

### `/gifts/birthday`

| Metric | Target | Result | Pass? |
|--------|--------|--------|-------|
| LCP    | < 2.5s | | ☐ |
| CLS    | < 0.1  | | ☐ |
| INP    | < 200ms| | ☐ |
| FCP    | < 1.5s | | ☐ |
| TBT    | < 200ms| | ☐ |

### Blog post (e.g. `/blog/tennis-coach-gifts`)

| Metric | Target | Result | Pass? |
|--------|--------|--------|-------|
| LCP    | < 2.5s | | ☐ |
| CLS    | < 0.1  | | ☐ |
| INP    | < 200ms| | ☐ |

**If LCP fails:** check whether hero images have `fetchpriority="high"` and are not lazy-loaded.  
**If CLS fails:** check for images without explicit `width`/`height`, and font swap shifts.

---

## 9. Sitemap Completeness

☐ Fetch `https://gifthint.io/sitemap.xml` — returns valid XML  
☐ `/` is present at priority 1.0  
☐ `/gifts` is present at priority 0.9  
☐ All 7 `/gifts/[occasion]` URLs are present at priority 0.9  
☐ At least one `/list/<username>/<slug>` gifter page is present  

> ⚠️  **Known gap:** The sitemap currently does **not** include blog post URLs
> (`/blog/*`). Add blog posts to `app/sitemap.ts` once there are ≥ 5 published
> posts. Until then, Google will discover them via internal links from the
> `/blog` index page.

```bash
# Quick check — count occasion URLs in sitemap
curl -s https://gifthint.io/sitemap.xml | grep -c '/gifts/'
# Expect: 8 (1 hub + 7 occasion pages)
```

---

## 10. Mobile Rendering — Blog Posts

Test at **375px width** (iPhone SE viewport) in Chrome DevTools Device Mode.

☐ Blog index (`/blog`) — cards stack to single column, no overflow  
☐ Blog post (`/blog/birthday-wishlist-tips`) — prose readable at 375px, no horizontal scroll  
☐ Code block in `amazon-wish-list-problem` — scrolls horizontally, does not overflow the viewport  
☐ `<InlineCTA />` component — stacks CTA text above button at narrow widths  
☐ Related posts sidebar stacks below the article (not beside it) at < 900px  
☐ Email capture form at the bottom of a post — input and button stack vertically at 375px

---

## Sign-off

| Section | Checked by | Date | Notes |
|---------|------------|------|-------|
| 1. Structured Data — Occasion pages | | | |
| 2. Structured Data — Gifter pages   | | | |
| 3. Structured Data — Organization   | | | |
| 4. GSC Indexing (2 weeks)           | | | |
| 4. GSC Indexing (6 weeks)           | | | |
| 5. Title / description uniqueness   | | | |
| 6. GifterFooter internal links      | | | |
| 7. Blog link health + disclosures   | | | |
| 8. Core Web Vitals                  | | | |
| 9. Sitemap completeness             | | | |
| 10. Mobile rendering                | | | |
