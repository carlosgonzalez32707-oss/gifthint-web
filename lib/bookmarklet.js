/**
 * lib/bookmarklet.js — GiftHint Bookmarklet Source
 *
 * This is the HUMAN-READABLE canonical source of the GiftHint bookmarklet.
 * It is NOT imported directly by the application.
 *
 * The minified copy is embedded in lib/bookmarklet-minifier.ts as the
 * SOURCE constant. When you edit this file, paste the updated IIFE body
 * into SOURCE (or run:  node scripts/sync-bookmarklet.js  if that script exists).
 *
 * What it does:
 *   1. Aborts if the user is already on gifthint.io
 *   2. Reads product data from Open Graph / product meta tags on the page
 *   3. Opens a 400 × 560 popup at gifthint.io/save with the product data
 *   4. Falls back to a full-page redirect if the popup is blocked
 *
 * Compatibility: Chrome, Firefox, Safari, Edge, iOS Safari ≥ 15
 * Dependencies:  none — vanilla ES5-compatible JS
 */

(function () {
  'use strict'

  /* ── 1. Abort if already on GiftHint ───────────────────────────────────── */

  var host = window.location.hostname.replace(/^www\./, '')
  if (host === 'gifthint.io') {
    alert('You are already on GiftHint. Go to a product page on any other site, then click your bookmark to save it.')
    return
  }

  /* ── 2. Extract product data from page meta tags ───────────────────────── */

  function meta(prop) {
    var el =
      document.querySelector('meta[property="' + prop + '"]') ||
      document.querySelector('meta[name="' + prop + '"]')
    return (el && el.getAttribute('content')) || ''
  }

  /* Try JSON-LD for price when OG tags are absent */
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
    } catch (e) { /* ignore parse errors */ }
    return ''
  }

  var title    = (meta('og:title') || document.title || '').slice(0, 300)
  var image    = meta('og:image').slice(0, 500)
  var price    = meta('og:price:amount') || meta('product:price:amount') || jsonLdPrice()
  var currency = meta('og:price:currency') || meta('product:price:currency') || ''
  var url      = meta('og:url') || window.location.href

  /* ── 3. Build the gifthint.io/save URL ─────────────────────────────────── */

  var saveUrl =
    'https://gifthint.io/save?' +
    [
      'url='      + encodeURIComponent(url),
      'title='    + encodeURIComponent(title),
      'price='    + encodeURIComponent(price),
      'currency=' + encodeURIComponent(currency),
      'image='    + encodeURIComponent(image),
    ].join('&')

  /* ── 4. Open centred 400 × 560 popup ───────────────────────────────────── */

  var pw = 400
  var ph = 560
  var pl = Math.max(0, Math.round((screen.width  - pw) / 2))
  var pt = Math.max(0, Math.round((screen.height - ph) / 2))
  var feat =
    'width='     + pw  +
    ',height='   + ph  +
    ',left='     + pl  +
    ',top='      + pt  +
    ',scrollbars=yes,resizable=yes'

  var popup = window.open(saveUrl, 'gifthint_save', feat)

  /* ── 5. Fallback: redirect current tab if popup was blocked ────────────── */

  if (!popup || popup.closed || typeof popup.closed === 'undefined') {
    window.location.href = saveUrl
  }
}())
