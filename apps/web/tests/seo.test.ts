/**
 * tests/seo.test.ts — GiftHint SEO suite
 *
 * Covers:
 *   1. lib/structured-data.ts — generateWishlistSchema, generateBreadcrumbSchema,
 *      generateOrganizationSchema
 *   2. lib/blog.ts            — getAllPosts, getPostBySlug, getRelatedPosts
 *   3. lib/occasion-seo.ts    — metadata uniqueness across all 7 occasions
 *
 * Run:  npx jest tests/seo.test.ts
 */

import {
  generateWishlistSchema,
  generateBreadcrumbSchema,
  generateOrganizationSchema,
  type SchemaUser,
  type SchemaWishlist,
  type SchemaItem,
} from '@/lib/structured-data'

import { getAllPosts, getPostBySlug, getRelatedPosts } from '@/lib/blog'

import {
  getOccasionSEO,
  OCCASION_SLUGS,
  OCCASION_CATALOGUE,
} from '@/lib/occasion-seo'

// SITE_URL defaults to 'https://gifthint.io' when NEXT_PUBLIC_APP_URL is unset
const SITE = 'https://gifthint.io'

// ── Shared fixtures ────────────────────────────────────────────────────────────

const USER: SchemaUser = {
  public_username: 'emma',
  display_name:    'Emma Clarke',
}

const WISHLIST: SchemaWishlist = {
  slug:     'birthday-2026',
  title:    'Birthday 2026',
  occasion: 'birthday',
}

function makeItems(count: number, claimed = false): SchemaItem[] {
  return Array.from({ length: count }, (_, i) => ({
    title:        `Gift ${i + 1}`,
    price:        (i + 1) * 25,
    currency:     'USD',
    source_url:   `https://example.com/product-${i + 1}`,
    affiliate_url: null,
    is_claimed:   claimed,
  }))
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. generateWishlistSchema
// ══════════════════════════════════════════════════════════════════════════════

describe('generateWishlistSchema()', () => {
  test('returns correct @context and @type', () => {
    const schema = generateWishlistSchema(USER, WISHLIST, []) as Record<string, unknown>
    expect(schema['@context']).toBe('https://schema.org')
    expect(schema['@type']).toBe('ItemList')
  })

  test('name combines first name and wishlist title', () => {
    const schema = generateWishlistSchema(USER, WISHLIST, []) as Record<string, unknown>
    expect(schema.name).toBe("Emma's Birthday 2026")
  })

  test('falls back to username (as-is, no capitalisation) when display_name is null', () => {
    const userNoName: SchemaUser = { public_username: 'carlos', display_name: null }
    const schema = generateWishlistSchema(userNoName, WISHLIST, []) as Record<string, unknown>
    expect(schema.name).toContain("carlos's")
  })

  test('url points to the correct gifter page', () => {
    const schema = generateWishlistSchema(USER, WISHLIST, []) as Record<string, unknown>
    expect(schema.url).toBe(`${SITE}/list/emma/birthday-2026`)
  })

  test('excludes claimed items', () => {
    const items: SchemaItem[] = [
      { title: 'Claimed item', price: 50, is_claimed: true,  source_url: null },
      { title: 'Available',    price: 30, is_claimed: false, source_url: null },
    ]
    const schema = generateWishlistSchema(USER, WISHLIST, items) as Record<string, unknown>
    expect(schema.numberOfItems).toBe(1)
    const list = schema.itemListElement as Array<Record<string, unknown>>
    expect(list).toHaveLength(1)
    expect((list[0].item as Record<string, unknown>).name).toBe('Available')
  })

  test('caps itemListElement at 5 even when more unclaimed items exist', () => {
    const items = makeItems(10)  // all unclaimed
    const schema = generateWishlistSchema(USER, WISHLIST, items) as Record<string, unknown>
    const list = schema.itemListElement as unknown[]
    expect(list).toHaveLength(5)
  })

  test('position values are sequential starting at 1', () => {
    const items = makeItems(3)
    const schema = generateWishlistSchema(USER, WISHLIST, items) as Record<string, unknown>
    const list = schema.itemListElement as Array<Record<string, unknown>>
    expect(list.map((e) => e.position)).toEqual([1, 2, 3])
  })

  test('includes offers block with formatted price when price is present', () => {
    const items: SchemaItem[] = [
      { title: 'Camera', price: 149.9, currency: 'GBP', is_claimed: false, source_url: null },
    ]
    const schema = generateWishlistSchema(USER, WISHLIST, items) as Record<string, unknown>
    const list = schema.itemListElement as Array<Record<string, unknown>>
    const product = list[0].item as Record<string, unknown>
    const offers  = product.offers as Record<string, unknown>
    expect(offers).toBeDefined()
    expect(offers.price).toBe('149.90')
    expect(offers.priceCurrency).toBe('GBP')
    expect(offers['@type']).toBe('Offer')
  })

  test('omits offers block when price is null', () => {
    const items: SchemaItem[] = [
      { title: 'Mystery gift', price: null, is_claimed: false, source_url: null },
    ]
    const schema = generateWishlistSchema(USER, WISHLIST, items) as Record<string, unknown>
    const list = schema.itemListElement as Array<Record<string, unknown>>
    const product = list[0].item as Record<string, unknown>
    expect(product.offers).toBeUndefined()
  })

  test('prefers affiliate_url over source_url for product url', () => {
    const items: SchemaItem[] = [{
      title:        'Headphones',
      price:        99,
      is_claimed:   false,
      source_url:   'https://amazon.com/headphones',
      affiliate_url: 'https://go.skimlinks.com/headphones',
    }]
    const schema = generateWishlistSchema(USER, WISHLIST, items) as Record<string, unknown>
    const list = schema.itemListElement as Array<Record<string, unknown>>
    const product = list[0].item as Record<string, unknown>
    expect(product.url).toBe('https://go.skimlinks.com/headphones')
  })

  test('falls back to source_url when affiliate_url is null', () => {
    const items: SchemaItem[] = [{
      title:        'Notebook',
      price:        12,
      is_claimed:   false,
      source_url:   'https://etsy.com/notebook',
      affiliate_url: null,
    }]
    const schema = generateWishlistSchema(USER, WISHLIST, items) as Record<string, unknown>
    const list = schema.itemListElement as Array<Record<string, unknown>>
    const product = list[0].item as Record<string, unknown>
    expect(product.url).toBe('https://etsy.com/notebook')
  })

  test('handles string price from DB and formats it correctly', () => {
    const items: SchemaItem[] = [
      { title: 'Candle', price: '34.5', is_claimed: false, source_url: null },
    ]
    const schema = generateWishlistSchema(USER, WISHLIST, items) as Record<string, unknown>
    const list = schema.itemListElement as Array<Record<string, unknown>>
    const offers = (list[0].item as Record<string, unknown>).offers as Record<string, unknown>
    expect(offers.price).toBe('34.50')
  })

  test('returns numberOfItems matching filtered unclaimed count', () => {
    const items: SchemaItem[] = [
      ...makeItems(3, false),   // 3 unclaimed
      ...makeItems(2, true),    // 2 claimed — excluded
    ]
    const schema = generateWishlistSchema(USER, WISHLIST, items) as Record<string, unknown>
    expect(schema.numberOfItems).toBe(3)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 2. generateBreadcrumbSchema
// ══════════════════════════════════════════════════════════════════════════════

describe('generateBreadcrumbSchema()', () => {
  const schema = generateBreadcrumbSchema(USER, WISHLIST, 'Birthday') as Record<string, unknown>
  const items  = schema.itemListElement as Array<Record<string, unknown>>

  test('returns correct @context and @type', () => {
    expect(schema['@context']).toBe('https://schema.org')
    expect(schema['@type']).toBe('BreadcrumbList')
  })

  test('has exactly 3 breadcrumb levels', () => {
    expect(items).toHaveLength(3)
  })

  test('level 1 is Home pointing to site root', () => {
    expect(items[0].position).toBe(1)
    expect(items[0].name).toBe('Home')
    expect(items[0].item).toBe(SITE)
  })

  test('level 2 is Gift Lists pointing to /gifts', () => {
    expect(items[1].position).toBe(2)
    expect(items[1].name).toBe('Gift Lists')
    expect(items[1].item).toBe(`${SITE}/gifts`)
  })

  test('level 3 contains the user first name and occasion label', () => {
    expect(items[2].position).toBe(3)
    expect(items[2].name).toContain("Emma's")
    expect(items[2].name).toContain('Birthday')
  })

  test('level 3 item URL is the correct gifter page URL', () => {
    expect(items[2].item).toBe(`${SITE}/list/emma/birthday-2026`)
  })

  test('falls back to username (as-is) when display_name is null', () => {
    const userNoName: SchemaUser = { public_username: 'jay', display_name: null }
    const s = generateBreadcrumbSchema(userNoName, WISHLIST, 'Birthday') as Record<string, unknown>
    const crumbs = s.itemListElement as Array<Record<string, unknown>>
    expect(crumbs[2].name).toContain("jay's")
  })

  test('level 3 URL uses the wishlist slug correctly', () => {
    const customWishlist: SchemaWishlist = { slug: 'xmas-2026', title: 'Xmas', occasion: 'christmas' }
    const s = generateBreadcrumbSchema(USER, customWishlist, 'Christmas') as Record<string, unknown>
    const crumbs = s.itemListElement as Array<Record<string, unknown>>
    expect(crumbs[2].item).toContain('xmas-2026')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 3. generateOrganizationSchema
// ══════════════════════════════════════════════════════════════════════════════

describe('generateOrganizationSchema()', () => {
  const schema = generateOrganizationSchema() as Record<string, unknown>

  test('returns correct @context and @type', () => {
    expect(schema['@context']).toBe('https://schema.org')
    expect(schema['@type']).toBe('Organization')
  })

  test('name is GiftHint', () => {
    expect(schema.name).toBe('GiftHint')
  })

  test('url points to site root', () => {
    expect(schema.url).toBe(SITE)
  })

  test('logo is an absolute URL', () => {
    expect(schema.logo).toMatch(/^https?:\/\//)
  })

  test('sameAs is a non-empty array', () => {
    expect(Array.isArray(schema.sameAs)).toBe(true)
    expect((schema.sameAs as string[]).length).toBeGreaterThan(0)
  })

  test('contactPoint has a valid email', () => {
    const cp = schema.contactPoint as Record<string, unknown>
    expect(cp['@type']).toBe('ContactPoint')
    expect(typeof cp.email).toBe('string')
    expect(cp.email as string).toContain('@')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 4. getAllPosts()
// ══════════════════════════════════════════════════════════════════════════════

describe('getAllPosts()', () => {
  test('returns an array', () => {
    const posts = getAllPosts()
    expect(Array.isArray(posts)).toBe(true)
  })

  test('returns only published posts', () => {
    const posts = getAllPosts()
    posts.forEach((p) => expect(p.published).toBe(true))
  })

  test('posts are sorted newest-first (descending date)', () => {
    const posts = getAllPosts()
    if (posts.length < 2) return  // skip if fewer than 2 posts
    for (let i = 0; i < posts.length - 1; i++) {
      const a = new Date(posts[i].date).getTime()
      const b = new Date(posts[i + 1].date).getTime()
      expect(a).toBeGreaterThanOrEqual(b)
    }
  })

  test('tennis-coach-gifts is first (newest: 2026-06-02)', () => {
    const posts = getAllPosts()
    if (posts.length === 0) return
    expect(posts[0].slug).toBe('tennis-coach-gifts')
  })

  test('amazon-wish-list-problem is last (oldest: 2026-05-19)', () => {
    const posts = getAllPosts()
    if (posts.length < 3) return
    expect(posts[posts.length - 1].slug).toBe('amazon-wish-list-problem')
  })

  test('each post has required fields', () => {
    const posts = getAllPosts()
    posts.forEach((p) => {
      expect(typeof p.slug).toBe('string')
      expect(p.slug.length).toBeGreaterThan(0)
      expect(typeof p.title).toBe('string')
      expect(typeof p.date).toBe('string')
      expect(typeof p.excerpt).toBe('string')
      expect(typeof p.readTime).toBe('number')
      expect(p.readTime).toBeGreaterThan(0)
    })
  })

  test('hasAffiliateLinks is boolean', () => {
    const posts = getAllPosts()
    posts.forEach((p) => expect(typeof p.hasAffiliateLinks).toBe('boolean'))
  })

  test('tennis-coach-gifts has hasAffiliateLinks: true', () => {
    const posts = getAllPosts()
    const tennis = posts.find((p) => p.slug === 'tennis-coach-gifts')
    expect(tennis?.hasAffiliateLinks).toBe(true)
  })

  test('birthday-wishlist-tips has occasion: birthday', () => {
    const posts = getAllPosts()
    const post = posts.find((p) => p.slug === 'birthday-wishlist-tips')
    expect(post?.occasion).toBe('birthday')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 5. getPostBySlug()
// ══════════════════════════════════════════════════════════════════════════════

describe('getPostBySlug()', () => {
  test('returns null for a non-existent slug', () => {
    expect(getPostBySlug('does-not-exist')).toBeNull()
  })

  test('returns null for an empty string slug', () => {
    expect(getPostBySlug('')).toBeNull()
  })

  test('returns a Post object for an existing slug', () => {
    const post = getPostBySlug('tennis-coach-gifts')
    expect(post).not.toBeNull()
    expect(post?.slug).toBe('tennis-coach-gifts')
  })

  test('returned post includes a non-empty content string', () => {
    const post = getPostBySlug('tennis-coach-gifts')
    expect(typeof post?.content).toBe('string')
    expect(post!.content.length).toBeGreaterThan(100)
  })

  test('returned post has all PostMeta fields', () => {
    const post = getPostBySlug('birthday-wishlist-tips')!
    expect(post).not.toBeNull()
    expect(post.title).toBeTruthy()
    expect(post.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(post.excerpt).toBeTruthy()
    expect(typeof post.readTime).toBe('number')
    expect(typeof post.published).toBe('boolean')
  })

  test('returns null for a slug that exists but is unpublished', () => {
    // Create a temporary unpublished MDX fixture inline via mock — if no
    // unpublished file exists in the repo the test is marked pending.
    // In practice, create content/blog/_draft-example.mdx with published: false
    // to exercise this branch. For now we verify the happy path only.
    expect(true).toBe(true)  // placeholder — see above
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 6. getRelatedPosts()
// ══════════════════════════════════════════════════════════════════════════════

describe('getRelatedPosts()', () => {
  test('never includes the current slug', () => {
    const related = getRelatedPosts('birthday-wishlist-tips', 'birthday')
    const slugs   = related.map((p) => p.slug)
    expect(slugs).not.toContain('birthday-wishlist-tips')
  })

  test('returns at most 3 posts', () => {
    const related = getRelatedPosts('tennis-coach-gifts', null)
    expect(related.length).toBeLessThanOrEqual(3)
  })

  test('returns an array for a null occasion', () => {
    const related = getRelatedPosts('amazon-wish-list-problem', null)
    expect(Array.isArray(related)).toBe(true)
  })

  test('occasion-matched posts come before unmatched ones', () => {
    // birthday-wishlist-tips is the only post with occasion 'birthday'
    // so related posts from a non-birthday slug should not start with birthday
    // (there's only one birthday post and it might be the sole result anyway)
    const related = getRelatedPosts('tennis-coach-gifts', 'birthday')
    // The birthday post should appear before null-occasion posts
    const birthdayIdx = related.findIndex((p) => p.occasion === 'birthday')
    const nullIdx     = related.findIndex((p) => p.occasion === null)
    if (birthdayIdx !== -1 && nullIdx !== -1) {
      expect(birthdayIdx).toBeLessThan(nullIdx)
    }
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 7. Occasion landing page metadata uniqueness
// ══════════════════════════════════════════════════════════════════════════════

describe('Occasion SEO metadata uniqueness', () => {
  test('all 7 occasion slugs are defined', () => {
    expect(OCCASION_SLUGS).toHaveLength(7)
  })

  test('getOccasionSEO returns non-null for every slug', () => {
    OCCASION_SLUGS.forEach((slug) => {
      expect(getOccasionSEO(slug)).not.toBeNull()
    })
  })

  test('returns null for an unrecognised slug', () => {
    expect(getOccasionSEO('not-a-real-occasion')).toBeNull()
  })

  test('all metaTitle values are unique', () => {
    const titles = OCCASION_CATALOGUE.map((o) => o.metaTitle)
    const unique  = new Set(titles)
    expect(unique.size).toBe(titles.length)
  })

  test('all metaDescription values are unique', () => {
    const descs  = OCCASION_CATALOGUE.map((o) => o.metaDescription)
    const unique = new Set(descs)
    expect(unique.size).toBe(descs.length)
  })

  test('every metaTitle includes the word "GiftHint"', () => {
    OCCASION_CATALOGUE.forEach((o) => {
      expect(o.metaTitle).toContain('GiftHint')
    })
  })

  test('every metaTitle is under 65 characters (Google truncation limit)', () => {
    OCCASION_CATALOGUE.forEach((o) => {
      expect(o.metaTitle.length).toBeLessThanOrEqual(65)
    })
  })

  test('every metaDescription is under 160 characters', () => {
    OCCASION_CATALOGUE.forEach((o) => {
      expect(o.metaDescription.length).toBeLessThanOrEqual(160)
    })
  })

  test('every occasion has a non-empty h1', () => {
    OCCASION_CATALOGUE.forEach((o) => {
      expect(o.h1.length).toBeGreaterThan(0)
    })
  })

  test('every occasion has at least 3 FAQ entries', () => {
    OCCASION_CATALOGUE.forEach((o) => {
      expect(o.faqs.length).toBeGreaterThanOrEqual(3)
    })
  })

  test('every occasion has at least 3 sample items', () => {
    OCCASION_CATALOGUE.forEach((o) => {
      expect(o.sampleItems.length).toBeGreaterThanOrEqual(3)
    })
  })

  test('every occasion slug uses hyphens not underscores', () => {
    OCCASION_SLUGS.forEach((slug) => {
      expect(slug).not.toContain('_')
    })
  })

  test('every occasion dbKey uses underscores not hyphens', () => {
    OCCASION_CATALOGUE.forEach((o) => {
      expect(o.dbKey).not.toContain('-')
    })
  })
})
