/**
 * GiftHint iOS Share Sheet Script
 * ================================
 * Use this in an iOS Shortcut with the "Run JavaScript on Webpage" action.
 *
 * SETUP (one-time, ~2 minutes)
 * ─────────────────────────────
 *  1. Open the Shortcuts app → tap the + to create a new Shortcut.
 *  2. Add action: "Run JavaScript on Webpage"
 *  3. Paste this entire file into the script field.
 *  4. Add action: "Open URL"
 *  5. In the URL field, tap the variable picker and insert the result as a
 *     Magic Variable, then type:
 *
 *       https://gifthint.io/save?source=ios_share
 *         &url=[url]&title=[title]&image=[image]
 *         &price=[price]&currency=[currency]
 *
 *     (Replace each [field] with the matching key from the result dictionary.)
 *  6. Name the Shortcut "Save to GiftHint" and add it to your Share Sheet
 *     (Settings → Shortcuts → Advanced → Allow Sharing Large Amounts of Data).
 *
 * WHAT IT DOES
 * ─────────────
 *  Reads Open Graph meta tags + JSON-LD structured data from the current page
 *  and returns a dictionary via completion().  The next Shortcut step opens
 *  https://gifthint.io/save with all product details pre-filled.
 *
 * Compatibility: iOS Safari 15+, iPadOS 15+
 * Dependencies:  none — vanilla ES5-compatible JavaScript
 */

/* jshint esversion: 5 */
/* global completion */

(function () {
  'use strict'

  /* ── Read a single <meta> tag by property or name ── */

  function meta(prop) {
    var el =
      document.querySelector('meta[property="' + prop + '"]') ||
      document.querySelector('meta[name="'     + prop + '"]')
    return (el && el.getAttribute('content')) || ''
  }

  /* ── JSON-LD price fallback ── */

  function jsonLdPrice() {
    try {
      var scripts = document.querySelectorAll('script[type="application/ld+json"]')
      for (var i = 0; i < scripts.length; i++) {
        var data  = JSON.parse(scripts[i].textContent || scripts[i].innerText || '')
        var items = Array.isArray(data) ? data : [data]
        for (var j = 0; j < items.length; j++) {
          var offers = items[j] && items[j].offers
          if (!offers) continue
          var offer  = Array.isArray(offers) ? offers[0] : offers
          if (offer && offer.price != null && offer.price !== '') {
            return String(offer.price)
          }
        }
      }
    } catch (e) { /* ignore parse errors */ }
    return ''
  }

  /* ── Assemble result and hand off to the next Shortcut action ── */

  completion({
    url:      meta('og:url') || window.location.href,
    title:    (meta('og:title') || document.title || '').slice(0, 300),
    image:    meta('og:image').slice(0, 500),
    price:    meta('og:price:amount') || meta('product:price:amount') || jsonLdPrice(),
    currency: meta('og:price:currency') || meta('product:price:currency') || '',
    source:   'ios_share',
  })
}())
