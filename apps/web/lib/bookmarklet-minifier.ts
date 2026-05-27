/**
 * lib/bookmarklet-minifier.ts — GiftHint
 *
 * Produces the javascript: href string used by the bookmarklet install page.
 * Safe to import in both Server Components and Client Components — no fs,
 * no Node-only APIs. SOURCE is embedded as a string constant.
 *
 * KEEPING SOURCE IN SYNC
 * ──────────────────────
 * The human-readable version lives in lib/bookmarklet.js.
 * When you update that file, paste the IIFE body here into SOURCE.
 * (A future build script can automate this — see Phase 3 debt log.)
 *
 * MINIFICATION STRATEGY (zero external dependencies)
 * ───────────────────────────────────────────────────
 *  1. Strip block comments   /* ... *\/
 *  2. Strip line comments    // ...   (negative lookbehind preserves https://)
 *  3. Collapse all whitespace (newlines, tabs, runs of spaces) → single space
 *  4. Trim
 *  5. Wrap in javascript:void(...)  — prevents the browser navigating to the
 *     return value of the IIFE (which would be undefined)
 */

// ── Embedded source ────────────────────────────────────────────────────────────
// Keep in sync with lib/bookmarklet.js.
// Backslash-escaped where the template literal would otherwise consume them:
//   /^www\\./ in the source = /^www\./ in the actual regex

const SOURCE = `
(function () {
  'use strict'

  var host = window.location.hostname.replace(/^www\\./, '')
  if (host === 'gifthint.io') {
    alert('You are already on GiftHint. Go to a product page on any other site, then click your bookmark to save it.')
    return
  }

  function meta(prop) {
    var el =
      document.querySelector('meta[property="' + prop + '"]') ||
      document.querySelector('meta[name="' + prop + '"]')
    return (el && el.getAttribute('content')) || ''
  }

  function jsonLdPrice() {
    try {
      var scripts = document.querySelectorAll('script[type="application/ld+json"]')
      for (var i = 0; i < scripts.length; i++) {
        var data = JSON.parse(scripts[i].textContent || scripts[i].innerText || '')
        var offers = data.offers || (Array.isArray(data) && data[0] && data[0].offers)
        if (offers) {
          var price = (Array.isArray(offers) ? offers[0] : offers).price
          if (price) return String(price)
        }
      }
    } catch (e) {}
    return ''
  }

  var title    = (meta('og:title') || document.title || '').slice(0, 300)
  var image    = meta('og:image').slice(0, 500)
  var price    = meta('og:price:amount') || meta('product:price:amount') || jsonLdPrice()
  var currency = meta('og:price:currency') || meta('product:price:currency') || ''
  var url      = meta('og:url') || window.location.href

  var saveUrl =
    'https://gifthint.io/save?' +
    [
      'url='      + encodeURIComponent(url),
      'title='    + encodeURIComponent(title),
      'price='    + encodeURIComponent(price),
      'currency=' + encodeURIComponent(currency),
      'image='    + encodeURIComponent(image),
    ].join('&')

  var pw = 400, ph = 560
  var pl = Math.max(0, Math.round((screen.width  - pw) / 2))
  var pt = Math.max(0, Math.round((screen.height - ph) / 2))
  var feat =
    'width='   + pw + ',height=' + ph +
    ',left='   + pl + ',top='    + pt +
    ',scrollbars=yes,resizable=yes'

  var popup = window.open(saveUrl, 'gifthint_save', feat)

  if (!popup || popup.closed || typeof popup.closed === 'undefined') {
    window.location.href = saveUrl
  }
}())
`

// ── Minification steps ─────────────────────────────────────────────────────────

/** Strips block comments  /* ... *\/ */
function stripBlockComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '')
}

/**
 * Strips line comments  // ...
 * Uses a negative lookbehind so protocol strings (https://, http://) are
 * preserved — the // in those is always preceded by a colon.
 */
function stripLineComments(src: string): string {
  return src
    .split('\n')
    .map((line) => {
      const m = line.match(/(?<!:)\/\//)
      return m && m.index !== undefined ? line.slice(0, m.index) : line
    })
    .join('\n')
}

/** Collapses all whitespace runs (including newlines) to a single space. */
function collapseWhitespace(src: string): string {
  return src
    .replace(/\r?\n/g, ' ')   // newlines → space
    .replace(/\t/g, ' ')      // tabs → space
    .replace(/  +/g, ' ')     // multiple spaces → single space
    .trim()
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Minifies a bookmarklet source string.
 * Suitable for the GiftHint bookmarklet; not a general-purpose JS minifier.
 *
 * @param source  Raw JavaScript source (the IIFE string)
 * @returns       Minified single-line JavaScript string
 */
export function minify(source: string): string {
  return collapseWhitespace(stripLineComments(stripBlockComments(source)))
}

/**
 * Returns the complete javascript: href string for the GiftHint bookmarklet,
 * ready to drop into an <a href="..."> element.
 *
 * Works in both Server Components and Client Components — no I/O involved.
 *
 * @example
 *   // In a Server Component page:
 *   const href = getBookmarkletHref()
 *   return <a href={href}>🎁 Save to GiftHint</a>
 */
export function getBookmarkletHref(): string {
  const minified = minify(SOURCE)
  // void() prevents the browser from navigating to the IIFE's return value
  return `javascript:void(${minified})`
}
