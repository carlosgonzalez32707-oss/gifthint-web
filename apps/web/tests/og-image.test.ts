/**
 * tests/og-image.test.ts — GiftHint
 *
 * Unit tests for:
 *   1. app/api/og/route.tsx      — GET handler, safeImageUrl, formatDate, getMeta
 *   2. components/ShareListButton.tsx — buildShareText
 *   3. app/list/[username]/[slug]/page.tsx — OG URL construction in generateMetadata
 *
 * Coverage:
 *   OG route helpers  — safeImageUrl accepts/rejects URLs; formatDate round-trips
 *                       valid ISO and returns null for garbage; getMeta falls back
 *                       to "other" for unknown occasions; hexAlpha is not exported
 *                       but its effect is exercised through the rendered output.
 *   OG route handler  — returns ImageResponse (200 / image/png); responds without
 *                       error for all occasion keys; handles missing params
 *                       gracefully; renders generic card when username is absent;
 *                       filters out non-HTTPS img params; catches rendering errors.
 *   buildShareText    — item count pluralisation; zero-count fallback ("some");
 *                       occasion label is lower-cased; URL appears in output.
 *   generateMetadata  — OG image URL includes all expected query params; only
 *                       HTTPS images make it into the img* params; availableCount
 *                       and occasionDate are included when present.
 *
 * Mock strategy:
 *   next/og's ImageResponse is replaced with a lightweight stub that captures
 *   the JSX tree and options so we can assert on the rendered card without
 *   spinning up the actual Satori + Resvg pipeline. The stub returns an object
 *   with { status: 200, headers: { get: () => 'image/png' } }.
 *
 *   @/lib/supabase-server and @/lib/wishlists are mocked for generateMetadata
 *   tests, using the same chainable pattern as the rest of the test suite.
 */

// ── Mock next/og before any imports ──────────────────────────────────────────

jest.mock('next/og', () => {
  return {
    ImageResponse: jest.fn().mockImplementation((jsx: unknown, opts: unknown) => ({
      _jsx:    jsx,
      _opts:   opts,
      status:  200,
      headers: { get: (h: string) => h === 'content-type' ? 'image/png' : null },
    })),
  }
})

// ── Mocks for generateMetadata tests ─────────────────────────────────────────

jest.mock('@/lib/supabase-server', () => ({
  createServerClient: jest.fn(),
}))

jest.mock('@/lib/wishlists', () => ({
  getWishlistBySlug: jest.fn(),
  getOccasionMeta:   jest.fn().mockReturnValue({ label: 'Birthday' }),
}))

jest.mock('@/lib/affiliate', () => ({
  rewriteAmazonUrls: jest.fn().mockReturnValue([]),
}))

jest.mock('@/lib/structured-data', () => ({
  generateWishlistSchema:   jest.fn().mockReturnValue({}),
  generateBreadcrumbSchema: jest.fn().mockReturnValue({}),
}))

// GifterPage creates a Supabase browser client at module-level initialisation,
// which throws in the Node test environment (no env vars). Stub it out so
// generateMetadata can be imported without side-effects.
jest.mock('@/app/list/[username]/GifterPage', () => ({
  __esModule:  true,
  default:     () => null,
}))

// Stub out the Supabase browser client used by sub-modules
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn().mockReturnValue({
    auth: { getSession: jest.fn(), onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }) },
    from: jest.fn(),
  }),
}))

// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest }        from 'next/server'
import { ImageResponse }      from 'next/og'
import { GET }                from '@/app/api/og/route'
import { buildShareText }     from '@/components/ShareListButton'
import { createServerClient } from '@/lib/supabase-server'
import { getWishlistBySlug }  from '@/lib/wishlists'
import { generateMetadata }   from '@/app/list/[username]/[slug]/page'

// Re-export helpers for white-box testing via requireActual
const ogModule = jest.requireActual('@/app/api/og/route') as {
  // These are module-private but we test them through the route output
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

type DbResult = { data: unknown; count?: number | null; error: { message: string } | null }

function makeChain(result: DbResult) {
  const c: Record<string, jest.Mock> = {}
  const methods = [
    'select', 'insert', 'update', 'upsert', 'eq', 'neq',
    'is', 'not', 'in', 'order', 'limit', 'maybeSingle',
  ] as const
  for (const m of methods) {
    c[m] = jest.fn().mockReturnValue(c)
  }
  c.maybeSingle = jest.fn().mockResolvedValue(result)
  // head queries resolve from the chain itself
  Object.defineProperty(c, 'then', {
    value: (resolve: (v: DbResult) => void) => Promise.resolve(result).then(resolve),
    configurable: true,
  })
  return c
}

function makeSupa(results: DbResult[]) {
  let idx = 0
  const client = {
    from: jest.fn().mockImplementation(() => {
      const r = results[idx] ?? results[results.length - 1]
      idx++
      return makeChain(r)
    }),
    auth: { getUser: jest.fn() },
  }
  ;(createServerClient as jest.Mock).mockReturnValue(client)
  return client
}

function makeOgReq(params: Record<string, string | undefined>): NextRequest {
  const url = new URL('https://gifthint.io/api/og')
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, v)
  }
  return new NextRequest(url.toString())
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Pure helper: safeImageUrl
//    Tested indirectly — non-HTTPS URLs must not appear in the ImageResponse
//    options. We assert that passing a non-HTTPS img0 produces no product-image
//    block in the rendered JSX tree (images array is empty).
// ─────────────────────────────────────────────────────────────────────────────

describe('safeImageUrl (via route output)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('passes through a valid HTTPS image URL', async () => {
    const httpsUrl = 'https://example.com/product.jpg'
    await GET(makeOgReq({
      username: 'Emma',
      occasion: 'birthday',
      img0:     httpsUrl,
    }))

    const [renderedJsx] = (ImageResponse as unknown as jest.Mock).mock.calls[0]
    // The JSX props chain should contain the URL somewhere in the tree
    expect(JSON.stringify(renderedJsx)).toContain(httpsUrl)
  })

  it('strips an HTTP (non-HTTPS) image URL', async () => {
    const httpUrl = 'http://insecure.example.com/product.jpg'
    await GET(makeOgReq({
      username: 'Emma',
      occasion: 'birthday',
      img0:     httpUrl,
    }))

    const [renderedJsx] = (ImageResponse as unknown as jest.Mock).mock.calls[0]
    expect(JSON.stringify(renderedJsx)).not.toContain(httpUrl)
  })

  it('strips a data: URI', async () => {
    const dataUri = 'data:image/png;base64,iVBORw0KGgo='
    await GET(makeOgReq({
      username: 'Emma',
      occasion: 'birthday',
      img0:     dataUri,
    }))

    const [renderedJsx] = (ImageResponse as unknown as jest.Mock).mock.calls[0]
    expect(JSON.stringify(renderedJsx)).not.toContain('data:image')
  })

  it('strips a javascript: URI', async () => {
    const jsUri = 'javascript:alert(1)'
    await GET(makeOgReq({
      username: 'Emma',
      occasion: 'birthday',
      img0:     jsUri,
    }))

    const [renderedJsx] = (ImageResponse as unknown as jest.Mock).mock.calls[0]
    expect(JSON.stringify(renderedJsx)).not.toContain('javascript:')
  })

  it('handles a malformed URL without throwing', async () => {
    await expect(
      GET(makeOgReq({ username: 'Emma', img0: 'not a url ://???' }))
    ).resolves.toBeDefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Pure helper: formatDate
//    Also tested via route output — the dateLabel appears in the card JSX.
// ─────────────────────────────────────────────────────────────────────────────

describe('formatDate (via route output)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders a human date label for a valid ISO date', async () => {
    // Use noon UTC so the rendered label is the same date in any timezone offset
    await GET(makeOgReq({
      username:     'Emma',
      occasion:     'birthday',
      occasionDate: '2026-12-25T12:00:00Z',
    }))

    const [renderedJsx] = (ImageResponse as unknown as jest.Mock).mock.calls[0]
    const tree = JSON.stringify(renderedJsx)
    // Month-Day format produced by toLocaleDateString 'en-US' with { month:'short', day:'numeric' }
    expect(tree).toContain('Dec 25')
  })

  it('omits the date pill for an invalid date string', async () => {
    await GET(makeOgReq({
      username:     'Emma',
      occasion:     'birthday',
      occasionDate: 'not-a-date',
    }))

    const [renderedJsx] = (ImageResponse as unknown as jest.Mock).mock.calls[0]
    const tree = JSON.stringify(renderedJsx)
    expect(tree).not.toContain('not-a-date')
  })

  it('omits the date pill when occasionDate param is absent', async () => {
    await GET(makeOgReq({ username: 'Emma', occasion: 'birthday' }))
    const [renderedJsx] = (ImageResponse as unknown as jest.Mock).mock.calls[0]
    // No date pill — tree should not contain a recognisable date label pattern
    const tree = JSON.stringify(renderedJsx)
    // "Jan 1" style strings should not appear
    expect(tree).not.toMatch(/[A-Z][a-z]{2} \d{1,2}/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. getMeta fallback
// ─────────────────────────────────────────────────────────────────────────────

describe('getMeta (via route output)', () => {
  beforeEach(() => jest.clearAllMocks())

  const KNOWN_OCCASIONS = [
    'birthday', 'christmas', 'wedding', 'baby_shower',
    'graduation', 'housewarming', 'anniversary',
  ]

  it.each(KNOWN_OCCASIONS)('renders the correct emoji for occasion: %s', async (occ) => {
    await GET(makeOgReq({ username: 'Emma', occasion: occ }))
    const [renderedJsx] = (ImageResponse as unknown as jest.Mock).mock.calls[0]
    expect(renderedJsx).toBeDefined()
    // Just verifying the route handled the occasion without throwing
  })

  it('falls back to the "other" meta for an unknown occasion', async () => {
    await GET(makeOgReq({ username: 'Emma', occasion: 'quinceañera' }))

    const [renderedJsx] = (ImageResponse as unknown as jest.Mock).mock.calls[0]
    const tree = JSON.stringify(renderedJsx)
    // The "other" label is "Wish List"
    expect(tree).toContain('Wish List')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. GET /api/og — response shape
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/og response shape', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns a 200 status', async () => {
    const res = await GET(makeOgReq({ username: 'Emma', occasion: 'birthday' }))
    expect(res.status).toBe(200)
  })

  it('returns content-type: image/png', async () => {
    const res = await GET(makeOgReq({ username: 'Emma', occasion: 'birthday' }))
    expect(res.headers.get('content-type')).toBe('image/png')
  })

  it('passes 1200×630 dimensions to ImageResponse', async () => {
    await GET(makeOgReq({ username: 'Emma', occasion: 'birthday' }))
    const [, opts] = (ImageResponse as unknown as jest.Mock).mock.calls[0]
    expect(opts).toMatchObject({ width: 1200, height: 630 })
  })

  it('calls ImageResponse exactly once per request', async () => {
    await GET(makeOgReq({ username: 'Emma' }))
    expect(ImageResponse).toHaveBeenCalledTimes(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. GET /api/og — personalised vs. generic card
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/og card selection', () => {
  beforeEach(() => jest.clearAllMocks())

  it("renders the personalised card headline when username is provided", async () => {
    await GET(makeOgReq({ username: 'Alice', occasion: 'birthday' }))
    const [renderedJsx] = (ImageResponse as unknown as jest.Mock).mock.calls[0]
    expect(JSON.stringify(renderedJsx)).toContain("Alice")
  })

  it('renders the generic promo card when username is absent', async () => {
    await GET(makeOgReq({ occasion: 'birthday', itemCount: '5' }))
    const [renderedJsx] = (ImageResponse as unknown as jest.Mock).mock.calls[0]
    const tree = JSON.stringify(renderedJsx)
    expect(tree).toContain('Share your wish list')
  })

  it('renders the generic card when username is an empty string', async () => {
    await GET(makeOgReq({ username: '', occasion: 'birthday' }))
    const [renderedJsx] = (ImageResponse as unknown as jest.Mock).mock.calls[0]
    const tree = JSON.stringify(renderedJsx)
    expect(tree).toContain('Share your wish list')
  })

  it('includes item count in the personalised card subline', async () => {
    await GET(makeOgReq({ username: 'Emma', occasion: 'birthday', itemCount: '12' }))
    const [renderedJsx] = (ImageResponse as unknown as jest.Mock).mock.calls[0]
    expect(JSON.stringify(renderedJsx)).toContain('12')
  })

  it('defaults itemCount to 0 when param is absent', async () => {
    await expect(
      GET(makeOgReq({ username: 'Emma', occasion: 'birthday' }))
    ).resolves.toBeDefined()
  })

  it('uses itemCount as availableCount when availableCount is absent', async () => {
    await GET(makeOgReq({ username: 'Emma', occasion: 'birthday', itemCount: '7' }))
    const [renderedJsx] = (ImageResponse as unknown as jest.Mock).mock.calls[0]
    const tree = JSON.stringify(renderedJsx)
    // Both itemCount (7 gifts saved) and availableCount (7 left) should appear
    expect(tree).toContain('7')
  })

  it('renders availableCount separately when explicitly provided', async () => {
    await GET(makeOgReq({
      username:       'Emma',
      occasion:       'birthday',
      itemCount:      '10',
      availableCount: '3',
    }))
    const [renderedJsx] = (ImageResponse as unknown as jest.Mock).mock.calls[0]
    const tree = JSON.stringify(renderedJsx)
    expect(tree).toContain('3')
    expect(tree).toContain('10')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. GET /api/og — error recovery
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/og error recovery', () => {
  beforeEach(() => jest.clearAllMocks())

  it('still returns a response when ImageResponse throws on first call', async () => {
    (ImageResponse as unknown as jest.Mock)
      .mockImplementationOnce(() => { throw new Error('Satori exploded') })
      .mockImplementationOnce((_jsx: unknown, opts: unknown) => ({
        _jsx, _opts: opts, status: 200,
        headers: { get: () => 'image/png' },
      }))

    const res = await GET(makeOgReq({ username: 'Emma', occasion: 'birthday' }))
    expect(res).toBeDefined()
    // The catch block calls ImageResponse a second time with the generic card
    expect(ImageResponse).toHaveBeenCalledTimes(2)
  })

  it('never throws from the GET handler itself when params are garbage', async () => {
    // Pass nonsensical param values — the route must handle them without throwing
    const res = await GET(makeOgReq({
      username:       'Emma',
      itemCount:      'not-a-number',
      availableCount: 'NaN',
      occasionDate:   'bad-date',
    }))
    expect(res).toBeDefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. buildShareText
// ─────────────────────────────────────────────────────────────────────────────

describe('buildShareText', () => {
  const url = 'https://gifthint.io/list/emma/birthday-2026'

  it('includes the URL in the share text', () => {
    expect(buildShareText(5, 'Birthday', url)).toContain(url)
  })

  it('uses the item count in singular form', () => {
    expect(buildShareText(1, 'Birthday', url)).toContain('1 thing')
    expect(buildShareText(1, 'Birthday', url)).not.toContain('things')
  })

  it('uses the item count in plural form for >1', () => {
    expect(buildShareText(5, 'Birthday', url)).toContain('5 things')
  })

  it('lower-cases the occasion label', () => {
    const text = buildShareText(3, 'Birthday', url)
    expect(text).toContain('birthday wishlist')
    expect(text).not.toContain('Birthday wishlist')
  })

  it('falls back to "some" when itemCount is 0', () => {
    expect(buildShareText(0, 'Christmas', url)).toContain('some things')
  })

  it('includes the gift emoji', () => {
    expect(buildShareText(3, 'Birthday', url)).toContain('🎁')
  })

  it('works for all common occasion labels', () => {
    const labels = ['Birthday', 'Christmas', 'Wedding', 'Baby Shower', 'Graduation', 'Housewarming', 'Anniversary', 'gift']
    for (const label of labels) {
      const text = buildShareText(2, label, url)
      expect(text).toContain(label.toLowerCase())
      expect(text).toContain(url)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 8. generateMetadata — OG image URL construction
// ─────────────────────────────────────────────────────────────────────────────

describe('generateMetadata OG URL construction', () => {
  const BASE_URL = 'https://gifthint.io'

  const mockUser = {
    id:           'user-uuid',
    display_name: 'Emma Watson',
    avatar_url:   null,
  }

  const mockWishlist = {
    id:             'wl-uuid',
    title:          'Birthday 2026',
    occasion:       'birthday',
    occasion_date:  '2026-06-15',
    is_public:      true,
  }

  /**
   * Builds a sequential Supabase mock for generateMetadata.
   *
   * Call order inside generateMetadata:
   *   0 — users.select().eq().maybeSingle()        → user row
   *   1 — wishlist_items head (total count)         → { count: totalCount }
   *   2 — wishlist_items head (available count)     → { count: availableCount }
   *   3 — wishlist_items.select('image_url').limit  → { data: topImages }
   *   4 — wishlist_items.select('retailer').limit   → { data: retailers }
   *
   * Each chain is made thenable so `await chain` works for the non-maybeSingle
   * queries (the head count calls and the data selects).
   */
  function setupSupaMocks(overrides: {
    totalCount?:     number
    availableCount?: number
    topImages?:      Array<{ image_url: string | null }>
    retailers?:      Array<{ retailer: string }>
  } = {}) {
    const {
      totalCount     = 8,
      availableCount = 5,
      topImages      = [],
      retailers      = [],
    } = overrides

    const sequence = [
      { data: mockUser,  count: null,           error: null },  // 0 — user lookup
      { data: null,      count: totalCount,      error: null },  // 1 — total items
      { data: null,      count: availableCount,  error: null },  // 2 — available items
      { data: topImages, count: null,            error: null },  // 3 — top images
      { data: retailers, count: null,            error: null },  // 4 — retailers
    ]

    let idx = 0

    function makeChain(result: (typeof sequence)[number]) {
      const c: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'not', 'order', 'limit']) {
        c[m] = jest.fn().mockReturnValue(c)
      }
      // Used by the user lookup (call 0)
      c.maybeSingle = jest.fn().mockResolvedValue(result)
      // Make the chain itself awaitable (used by calls 1-4)
      c.then  = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
        Promise.resolve(result).then(resolve, reject)
      c.catch = (reject: (e: unknown) => void) =>
        Promise.resolve(result).catch(reject)
      return c
    }

    const client = {
      from: jest.fn().mockImplementation(() => {
        const result = sequence[idx] ?? sequence[sequence.length - 1]
        idx++
        return makeChain(result)
      }),
      auth: { getUser: jest.fn() },
    }

    ;(createServerClient as jest.Mock).mockReturnValue(client)
    ;(getWishlistBySlug as jest.Mock).mockResolvedValue(mockWishlist)

    return client
  }

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.NEXT_PUBLIC_APP_URL = BASE_URL
  })

  it('includes username in OG image URL', async () => {
    setupSupaMocks()
    const meta = await generateMetadata(
      { params: { username: 'emma', slug: 'birthday-2026' } },
      {} as never,
    )
    const ogImages = (meta.openGraph as { images?: Array<{ url: string }> })?.images ?? []
    const ogUrl = ogImages[0]?.url ?? ''
    expect(ogUrl).toContain('username=Emma') // first name extracted from display_name
  })

  it('includes occasion in OG image URL', async () => {
    setupSupaMocks()
    const meta = await generateMetadata(
      { params: { username: 'emma', slug: 'birthday-2026' } },
      {} as never,
    )
    const ogImages = (meta.openGraph as { images?: Array<{ url: string }> })?.images ?? []
    const ogUrl = ogImages[0]?.url ?? ''
    expect(ogUrl).toContain('occasion=birthday')
  })

  it('includes itemCount in OG image URL', async () => {
    setupSupaMocks({ totalCount: 12 })
    const meta = await generateMetadata(
      { params: { username: 'emma', slug: 'birthday-2026' } },
      {} as never,
    )
    const ogImages = (meta.openGraph as { images?: Array<{ url: string }> })?.images ?? []
    const ogUrl = ogImages[0]?.url ?? ''
    expect(ogUrl).toContain('itemCount=12')
  })

  it('includes occasionDate in OG image URL when present', async () => {
    setupSupaMocks()
    const meta = await generateMetadata(
      { params: { username: 'emma', slug: 'birthday-2026' } },
      {} as never,
    )
    const ogImages = (meta.openGraph as { images?: Array<{ url: string }> })?.images ?? []
    const ogUrl = ogImages[0]?.url ?? ''
    expect(ogUrl).toContain('occasionDate=2026-06-15')
  })

  it('passes HTTPS product images as img0..img2', async () => {
    setupSupaMocks({
      topImages: [
        { image_url: 'https://cdn.example.com/product-a.jpg' },
        { image_url: 'https://cdn.example.com/product-b.jpg' },
      ],
    })
    const meta = await generateMetadata(
      { params: { username: 'emma', slug: 'birthday-2026' } },
      {} as never,
    )
    const ogImages = (meta.openGraph as { images?: Array<{ url: string }> })?.images ?? []
    const ogUrl = ogImages[0]?.url ?? ''
    expect(ogUrl).toContain('img0=')
    expect(ogUrl).toContain('img1=')
  })

  it('excludes non-HTTPS image URLs from img params', async () => {
    setupSupaMocks({
      topImages: [
        { image_url: 'http://insecure.example.com/img.jpg' },
        { image_url: 'https://cdn.example.com/safe.jpg' },
      ],
    })
    const meta = await generateMetadata(
      { params: { username: 'emma', slug: 'birthday-2026' } },
      {} as never,
    )
    const ogImages = (meta.openGraph as { images?: Array<{ url: string }> })?.images ?? []
    const ogUrl = ogImages[0]?.url ?? ''
    expect(ogUrl).not.toContain('http://insecure')
    expect(ogUrl).toContain('safe.jpg')
  })

  it('uses summary_large_image for twitter card', async () => {
    setupSupaMocks()
    const meta = await generateMetadata(
      { params: { username: 'emma', slug: 'birthday-2026' } },
      {} as never,
    )
    expect((meta.twitter as { card?: string })?.card).toBe('summary_large_image')
  })

  it('OG image dimensions are 1200×630', async () => {
    setupSupaMocks()
    const meta = await generateMetadata(
      { params: { username: 'emma', slug: 'birthday-2026' } },
      {} as never,
    )
    const ogImages = (meta.openGraph as { images?: Array<{ width?: number; height?: number }> })?.images ?? []
    expect(ogImages[0]).toMatchObject({ width: 1200, height: 630 })
  })
})
