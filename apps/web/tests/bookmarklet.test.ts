/**
 * tests/bookmarklet.test.ts — GiftHint
 *
 * Tests for the bookmarklet ecosystem:
 *   • scrapeOG()        — server-side OG scraper (lib/scrape-og.ts)
 *   • minify()          — bookmarklet JS minifier (lib/bookmarklet-minifier.ts)
 *   • getBookmarkletHref() — final javascript: URI
 *
 * Coverage
 * ────────
 *   scrapeOG: canonical OG tags extracted correctly
 *   scrapeOG: reversed attribute order (<meta content="…" property="og:title">)
 *   scrapeOG: og:price missing → JSON-LD offers.price fallback
 *   scrapeOG: og:price missing, no JSON-LD → price is empty string (not broken)
 *   scrapeOG: og:url missing → falls back to the requested URL
 *   scrapeOG: og:title missing → falls back to <title> tag
 *   scrapeOG: stops reading after </head> (efficiency check)
 *   scrapeOG: fetch timeout → throws (caller shows manual form)
 *   scrapeOG: non-2xx HTTP status → throws
 *   scrapeOG: missing response body → throws
 *   minify:   strips block comments
 *   minify:   strips line comments (preserves https://)
 *   minify:   collapses whitespace to a single line
 *   getBookmarkletHref: output starts with javascript:void(
 *   getBookmarkletHref: output is a single line (no newlines)
 *   getBookmarkletHref: encodeURIComponent is present (encoding preserved)
 *   getBookmarkletHref: gifthint.io guard is present
 *
 * Mock strategy
 * ─────────────
 *   global.fetch is replaced with jest.fn() before each test and restored
 *   after.  The streaming reader interface (getReader / read / cancel) is
 *   implemented inline per test so each case can control exactly what bytes
 *   the scraper sees.
 *
 * Run with: npm test
 */

import { scrapeOG }                         from '@/lib/scrape-og'
import { minify, getBookmarkletHref }       from '@/lib/bookmarklet-minifier'

// ── Fetch mock helpers ─────────────────────────────────────────────────────────

/**
 * Creates a mock fetch response that streams the given HTML string
 * through the ReadableStream reader interface that scrapeOG uses.
 */
function mockFetchWithHtml(html: string, status = 200): jest.Mock {
  const encoded = new TextEncoder().encode(html)

  // The scraper calls reader.read() in a while loop until done=true or
  // MAX_BYTES is reached. We return the full HTML on the first read, then
  // signal done on the second read.
  let readCount = 0
  const reader = {
    read: jest.fn().mockImplementation(() => {
      readCount++
      if (readCount === 1) return Promise.resolve({ done: false, value: encoded })
      return Promise.resolve({ done: true, value: undefined })
    }),
    cancel: jest.fn().mockResolvedValue(undefined),
  }

  return jest.fn().mockResolvedValue({
    ok:     status >= 200 && status < 300,
    status,
    body:   { getReader: () => reader },
  })
}

/** Creates a mock fetch that rejects immediately (simulates timeout / abort). */
function mockFetchTimeout(): jest.Mock {
  const err = Object.assign(
    new Error('The operation was aborted due to timeout'),
    { name: 'AbortError' },
  )
  return jest.fn().mockRejectedValue(err)
}

/** Creates a mock fetch that returns a non-2xx status. */
function mockFetchError(status: number): jest.Mock {
  return jest.fn().mockResolvedValue({
    ok:     false,
    status,
    body:   null,
  })
}

// ── HTML fixtures ──────────────────────────────────────────────────────────────

const FULL_OG_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta property="og:title"          content="Sony WH-1000XM5 Headphones">
  <meta property="og:image"          content="https://example.com/images/wh1000xm5.jpg">
  <meta property="og:price:amount"   content="279.99">
  <meta property="og:price:currency" content="USD">
  <meta property="og:url"            content="https://example.com/products/wh1000xm5">
</head>
<body><p>Product page</p></body>
</html>
`.trim()

const REVERSED_ATTR_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta content="Linen Shirt - Natural" property="og:title">
  <meta content="https://cdn.example.com/linen.jpg" property="og:image">
  <meta content="89.00"  property="og:price:amount">
  <meta content="GBP"    property="og:price:currency">
  <meta content="https://example.com/linen-shirt" property="og:url">
</head>
<body></body>
</html>
`.trim()

const NO_PRICE_OG_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta property="og:title" content="Generic Product">
  <meta property="og:image" content="https://example.com/img.jpg">
  <meta property="og:url"   content="https://example.com/product">
</head>
<body></body>
</html>
`.trim()

const JSON_LD_PRICE_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta property="og:title" content="Espresso Machine">
  <meta property="og:image" content="https://example.com/espresso.jpg">
  <meta property="og:url"   content="https://example.com/espresso">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": "Espresso Machine",
    "offers": {
      "@type": "Offer",
      "price": "349.00",
      "priceCurrency": "USD"
    }
  }
  </script>
</head>
<body></body>
</html>
`.trim()

const JSON_LD_ARRAY_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta property="og:title" content="Running Shoes">
  <script type="application/ld+json">
  [{
    "@type": "Product",
    "offers": [{"price": "129.95", "priceCurrency": "USD"}]
  }]
  </script>
</head>
<body></body>
</html>
`.trim()

const NO_OG_TITLE_HTML = `
<!DOCTYPE html>
<html>
<head>
  <title>My Awesome Product | Brand Co.</title>
  <meta property="og:image" content="https://example.com/img.jpg">
</head>
<body></body>
</html>
`.trim()

const NO_OG_URL_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta property="og:title" content="Widget Pro">
</head>
<body></body>
</html>
`.trim()

// ── scrapeOG tests ─────────────────────────────────────────────────────────────

describe('scrapeOG — OG tag extraction', () => {

  let originalFetch: typeof global.fetch

  beforeAll(() => { originalFetch = global.fetch })
  afterAll(()  => { global.fetch = originalFetch  })
  afterEach(()  => jest.restoreAllMocks())

  // ── Happy-path extraction ───────────────────────────────────────────────────

  it('extracts title, image, price, currency, and url from canonical OG tags', async () => {
    global.fetch = mockFetchWithHtml(FULL_OG_HTML)

    const result = await scrapeOG('https://example.com/products/wh1000xm5')

    expect(result.title).toBe('Sony WH-1000XM5 Headphones')
    expect(result.image).toBe('https://example.com/images/wh1000xm5.jpg')
    expect(result.price).toBe('279.99')
    expect(result.currency).toBe('USD')
    expect(result.url).toBe('https://example.com/products/wh1000xm5')
  })

  it('extracts data when content= comes before property= in meta tags (reversed attribute order)', async () => {
    global.fetch = mockFetchWithHtml(REVERSED_ATTR_HTML)

    const result = await scrapeOG('https://example.com/linen-shirt')

    expect(result.title).toBe('Linen Shirt - Natural')
    expect(result.image).toBe('https://cdn.example.com/linen.jpg')
    expect(result.price).toBe('89.00')
    expect(result.currency).toBe('GBP')
    expect(result.url).toBe('https://example.com/linen-shirt')
  })

  // ── Price fallbacks ─────────────────────────────────────────────────────────

  it('returns empty string for price when og:price:amount is absent and there is no JSON-LD', async () => {
    global.fetch = mockFetchWithHtml(NO_PRICE_OG_HTML)

    const result = await scrapeOG('https://example.com/product')

    expect(result.price).toBe('')
    // Other fields should still be populated normally
    expect(result.title).toBe('Generic Product')
    expect(result.image).toBe('https://example.com/img.jpg')
  })

  it('falls back to JSON-LD offers.price when og:price:amount is absent (object form)', async () => {
    global.fetch = mockFetchWithHtml(JSON_LD_PRICE_HTML)

    const result = await scrapeOG('https://example.com/espresso')

    expect(result.price).toBe('349.00')
  })

  it('falls back to JSON-LD offers[0].price when offers is an array', async () => {
    global.fetch = mockFetchWithHtml(JSON_LD_ARRAY_HTML)

    const result = await scrapeOG('https://example.com/shoes')

    expect(result.price).toBe('129.95')
  })

  // ── Title and URL fallbacks ─────────────────────────────────────────────────

  it('falls back to <title> tag when og:title is absent', async () => {
    global.fetch = mockFetchWithHtml(NO_OG_TITLE_HTML)

    const result = await scrapeOG('https://example.com/product')

    expect(result.title).toBe('My Awesome Product | Brand Co.')
  })

  it('falls back to the requested URL when og:url is absent', async () => {
    const requestedUrl = 'https://example.com/widget-pro'
    global.fetch = mockFetchWithHtml(NO_OG_URL_HTML)

    const result = await scrapeOG(requestedUrl)

    expect(result.url).toBe(requestedUrl)
  })

  // ── Efficiency ──────────────────────────────────────────────────────────────

  it('calls reader.cancel() after finding </head> to stop reading the body', async () => {
    const encoded = new TextEncoder().encode(FULL_OG_HTML)
    let readCount = 0
    const cancel  = jest.fn().mockResolvedValue(undefined)
    const reader  = {
      read: jest.fn().mockImplementation(() => {
        readCount++
        if (readCount === 1) return Promise.resolve({ done: false, value: encoded })
        return Promise.resolve({ done: true, value: undefined })
      }),
      cancel,
    }
    global.fetch = jest.fn().mockResolvedValue({
      ok:   true,
      status: 200,
      body: { getReader: () => reader },
    })

    await scrapeOG('https://example.com')

    // The HTML contains </head> so cancel() should have been called after
    // the first read chunk rather than waiting for the full body
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  // ── Error handling ──────────────────────────────────────────────────────────

  it('throws when fetch times out (AbortError)', async () => {
    global.fetch = mockFetchTimeout()

    await expect(scrapeOG('https://slow-site.example.com')).rejects.toThrow()
  })

  it('throws when the server returns a non-2xx status', async () => {
    global.fetch = mockFetchError(404)

    await expect(scrapeOG('https://example.com/gone')).rejects.toThrow('HTTP 404')
  })

  it('throws when the response has no body', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, body: null })

    await expect(scrapeOG('https://example.com')).rejects.toThrow()
  })

  // ── Title length cap ────────────────────────────────────────────────────────

  it('caps the title at 300 characters', async () => {
    const longTitle = 'A'.repeat(400)
    const html = `<html><head>
      <meta property="og:title" content="${longTitle}">
    </head></html>`
    global.fetch = mockFetchWithHtml(html)

    const result = await scrapeOG('https://example.com')

    expect(result.title.length).toBe(300)
  })

  // ── HTML entity decoding in <title> ─────────────────────────────────────────

  it('decodes common HTML entities in the <title> fallback', async () => {
    // scrapeOG's extractTitle handles the five most common entities:
    // &amp; &lt; &gt; &quot; &#39;
    // Named entities like &mdash; are not decoded (no full HTML parser).
    const html = `<html><head>
      <title>Gifts &amp; Gadgets &lt;2024&gt; &#39;Best&#39; &quot;Shop&quot;</title>
    </head></html>`
    global.fetch = mockFetchWithHtml(html)

    const result = await scrapeOG('https://example.com')

    expect(result.title).toBe(`Gifts & Gadgets <2024> 'Best' "Shop"`)
  })
})

// ── minify() tests ─────────────────────────────────────────────────────────────

describe('minify — bookmarklet JS minifier', () => {

  it('strips block comments', () => {
    const src = '/* This is a comment */ var x = 1;'
    expect(minify(src)).toBe('var x = 1;')
  })

  it('strips multi-line block comments', () => {
    const src = `/*
     * Multi-line comment
     */
     var y = 2;`
    expect(minify(src)).toBe('var y = 2;')
  })

  it('strips line comments', () => {
    const src = `var a = 1; // this is a comment
var b = 2;`
    const result = minify(src)
    expect(result).not.toContain('// this is a comment')
    expect(result).toContain('var a = 1;')
    expect(result).toContain('var b = 2;')
  })

  it('preserves https:// inside strings (negative lookbehind for colon)', () => {
    const src = `var url = 'https://gifthint.io/save'; // fetch`
    const result = minify(src)
    expect(result).toContain('https://gifthint.io/save')
  })

  it('collapses all whitespace runs to a single space', () => {
    const src = `var   a  =  1;\n\nvar   b\t=\t2;`
    const result = minify(src)
    expect(result).toBe('var a = 1; var b = 2;')
  })

  it('returns a single-line string (no newline characters)', () => {
    const src = `line one\nline two\nline three`
    expect(minify(src)).not.toMatch(/\n/)
  })

  it('trims leading and trailing whitespace', () => {
    const src = '   var x = 1;   '
    expect(minify(src)).toBe('var x = 1;')
  })
})

// ── getBookmarkletHref() tests ─────────────────────────────────────────────────

describe('getBookmarkletHref — bookmarklet javascript: URI', () => {

  const href = getBookmarkletHref()

  it('starts with javascript:void(', () => {
    expect(href.startsWith('javascript:void(')).toBe(true)
  })

  it('ends with )', () => {
    expect(href.endsWith(')')).toBe(true)
  })

  it('is a single line — no newline characters', () => {
    expect(href).not.toMatch(/[\n\r]/)
  })

  it('does not contain block comment markers', () => {
    expect(href).not.toContain('/*')
    expect(href).not.toContain('*/')
  })

  it('does not contain standalone line comment markers (// not preceded by colon)', () => {
    // After minification, no // comments should remain.
    // We allow https:// and similar (preceded by colon).
    // Strip all protocol:// patterns then check for remaining //
    const withoutProtocols = href.replace(/[a-z]+:\/\//gi, '')
    expect(withoutProtocols).not.toContain('//')
  })

  it('preserves encodeURIComponent calls (URL encoding of product data)', () => {
    expect(href).toContain('encodeURIComponent')
  })

  it('preserves the gifthint.io same-site guard', () => {
    expect(href).toContain('gifthint.io')
  })

  it('preserves window.open call (popup behaviour)', () => {
    expect(href).toContain('window.open')
  })

  it('preserves the fallback redirect for popup-blocked browsers', () => {
    expect(href).toContain('window.location.href')
  })

  it('contains the /save path (bookmarklet target)', () => {
    expect(href).toContain('/save?')
  })
})
