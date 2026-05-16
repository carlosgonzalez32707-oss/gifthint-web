/**
 * extension/floating-button.js — GiftHint Content Script v1.1
 *
 * Injects a floating 💜 save button into every product page.
 * The button appears after a short delay to avoid layout conflicts with
 * retailer on-page animations.
 *
 * Save flow:
 *   ┌─ Not signed in ─────────────────────────────────────────┐
 *   │  Show "Sign in to GiftHint" tooltip                    │
 *   └─────────────────────────────────────────────────────────┘
 *   ┌─ Signed in, 1 list ─────────────────────────────────────┐
 *   │  Save directly → show ✓ confirmation toast              │
 *   └─────────────────────────────────────────────────────────┘
 *   ┌─ Signed in, 2+ lists ───────────────────────────────────┐
 *   │  Show mini list picker card                             │
 *   │  User picks list → save → show ✓ confirmation toast    │
 *   │  Last-used list is remembered for next time            │
 *   └─────────────────────────────────────────────────────────┘
 *
 * Product detection:
 *   Reads OG meta tags + JSON-LD from the page DOM directly (same logic
 *   as product-extractor.js but inline, since content scripts can access
 *   the live DOM without chrome.scripting.executeScript).
 *
 * Auth:
 *   Reads `gh_user` from chrome.storage.local (written by auth.js on sign-in).
 *   Does NOT call chrome.identity — that API is unavailable in content scripts.
 *
 * Module imports (type:module content script, MV3):
 *   supabase.js  — Supabase REST helpers
 *   wishlists.js — getWishlists, getLastUsedWishlist, setLastUsedWishlist
 */

import { supabasePost }                                        from './supabase.js'
import { getWishlists, getLastUsedWishlist, setLastUsedWishlist, OCCASION_LABELS } from './wishlists.js'

// ── Configuration ─────────────────────────────────────────────────────────────

const USER_STORAGE_KEY = 'gh_user'       // mirrors auth.js USER_KEY
const SITE_URL         = 'https://gifthint.io'
const BUTTON_ID        = 'gifthint-float-btn'
const PICKER_ID        = 'gifthint-list-picker'
const TOAST_ID         = 'gifthint-toast'
const PURPLE           = '#8B83F0'
const INJECT_DELAY_MS  = 1_200           // wait for retailer animations

// ── Auth (storage-based — no chrome.identity in content scripts) ──────────────

async function getCachedUser() {
  try {
    const result = await chrome.storage.local.get(USER_STORAGE_KEY)
    return result[USER_STORAGE_KEY] ?? null
  } catch {
    return null
  }
}

// ── Product detection (inline OG reader) ─────────────────────────────────────

/**
 * Extracts product metadata from the current page's OG meta tags and
 * Schema.org JSON-LD. Mirrors the key fields from product-extractor.js
 * so the data shape is compatible with saveItem().
 *
 * @returns {{ title, price, currency, imageUrl, url, retailer, isProductPage }}
 */
function extractProductFromPage() {
  const og = (prop) =>
    document.querySelector(`meta[property="${prop}"]`)?.content ??
    document.querySelector(`meta[name="${prop}"]`)?.content ?? null

  const title    = og('og:title')           || document.title || null
  const imageUrl = og('og:image')           || null
  const ogType   = og('og:type')            || ''
  const siteName = og('og:site_name')       || ''

  // Price — try OG first, then Schema.org JSON-LD
  let price    = null
  let currency = 'USD'

  const ogPrice = og('product:price:amount')
  if (ogPrice) {
    price    = parseFloat(ogPrice) || null
    currency = og('product:price:currency') ?? 'USD'
  }

  if (!price) {
    for (const scriptEl of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const ld = JSON.parse(scriptEl.textContent ?? '')
        const offers = ld.offers ?? ld['@graph']?.[0]?.offers
        const offerPrice = Array.isArray(offers) ? offers[0]?.price : offers?.price
        if (offerPrice) {
          price    = parseFloat(offerPrice) || null
          currency = (Array.isArray(offers) ? offers[0]?.priceCurrency : offers?.priceCurrency) ?? 'USD'
          break
        }
      } catch { /* malformed JSON-LD — skip */ }
    }
  }

  // Retailer: prefer og:site_name, fall back to hostname
  const retailer = siteName || location.hostname.replace(/^www\./, '')

  // A page is a "product page" if it has a title AND either an image or a price.
  // Being og:type=product is a strong signal, but not all retailers set it.
  const isProductPage =
    !!title &&
    (ogType.includes('product') || !!(imageUrl || price))

  return {
    title,
    imageUrl,
    price,
    currency,
    url: location.href,
    source_url: location.href,
    retailer,
    isProductPage,
  }
}

// ── Supabase save (direct, using cached token) ────────────────────────────────

/**
 * Inserts a wishlist item directly via the Supabase REST API.
 * Uses the token cached in chrome.storage.local by auth.js.
 *
 * @param {object} user     Cached user object (includes .id and .token)
 * @param {object} product  Product data from extractProductFromPage()
 * @param {string} wishlistId  UUID of the target wishlist
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function saveProductToList(user, product, wishlistId) {
  const payload = {
    user_id:     user.id,
    wishlist_id: wishlistId,
    title:       product.title       ?? 'Saved item',
    price:       product.price       ?? null,
    currency:    product.currency    ?? 'USD',
    image_url:   product.imageUrl    ?? null,
    source_url:  product.url,
    retailer:    product.retailer    ?? null,
    dna_tags:    [],
    is_claimed:  false,
  }

  const { error } = await supabasePost('wishlist_items', payload, user.token)
  if (error) return { ok: false, error: error.message ?? 'Save failed' }
  return { ok: true }
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

function escHtml(str) {
  if (str == null) return ''
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function occasionEmoji(key) {
  return OCCASION_LABELS[key]?.emoji ?? '🎁'
}

// ── Floating button ───────────────────────────────────────────────────────────

function createFloatingButton() {
  if (document.getElementById(BUTTON_ID)) return // already injected

  const btn = document.createElement('button')
  btn.id = BUTTON_ID
  Object.assign(btn.style, {
    position:     'fixed',
    bottom:       '24px',
    right:        '24px',
    width:        '52px',
    height:       '52px',
    borderRadius: '50%',
    border:       'none',
    background:   PURPLE,
    boxShadow:    '0 4px 20px rgba(139,131,240,0.45)',
    cursor:       'pointer',
    zIndex:       '2147483647',  // max z-index
    display:      'flex',
    alignItems:   'center',
    justifyContent: 'center',
    fontSize:     '22px',
    transition:   'transform 120ms ease, box-shadow 120ms ease',
    outline:      'none',
    padding:      '0',
  })
  btn.title   = 'Save to GiftHint wishlist'
  btn.setAttribute('aria-label', 'Save to GiftHint wishlist')
  btn.textContent = '🎁'

  btn.addEventListener('mouseenter', () => {
    btn.style.transform  = 'scale(1.08)'
    btn.style.boxShadow  = '0 6px 28px rgba(139,131,240,0.6)'
  })
  btn.addEventListener('mouseleave', () => {
    btn.style.transform  = 'scale(1)'
    btn.style.boxShadow  = '0 4px 20px rgba(139,131,240,0.45)'
  })

  btn.addEventListener('click', handleButtonClick)
  document.body.appendChild(btn)
}

function removeFloatingButton() {
  document.getElementById(BUTTON_ID)?.remove()
}

// ── Mini list picker ──────────────────────────────────────────────────────────

/**
 * Shows a small floating card above the button listing all wishlists.
 * The user selects a list → item is saved → picker dismissed.
 *
 * @param {Array}  wishlists
 * @param {object} user
 * @param {object} product
 * @param {string|null} lastUsedId  Pre-highlight the most recently used list
 */
function showListPicker(wishlists, user, product, lastUsedId) {
  removePicker() // close any existing picker

  const card = document.createElement('div')
  card.id = PICKER_ID

  Object.assign(card.style, {
    position:       'fixed',
    bottom:         '88px',           // sits above the 52px button + 12px gap
    right:          '24px',
    width:          '220px',
    background:     '#1C1C22',
    border:         '1px solid rgba(139,131,240,0.35)',
    borderRadius:   '14px',
    boxShadow:      '0 8px 32px rgba(0,0,0,0.55)',
    zIndex:         '2147483646',
    overflow:       'hidden',
    fontFamily:     '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    fontSize:       '13px',
    color:          '#F0EEE8',
    animation:      'gh-picker-in 150ms ease forwards',
  })

  // Inject keyframe once
  if (!document.getElementById('gh-picker-style')) {
    const style = document.createElement('style')
    style.id = 'gh-picker-style'
    style.textContent = `
      @keyframes gh-picker-in {
        from { opacity: 0; transform: translateY(8px) scale(0.96); }
        to   { opacity: 1; transform: translateY(0)   scale(1);    }
      }
    `
    document.head.appendChild(style)
  }

  // Header
  const header = document.createElement('div')
  Object.assign(header.style, {
    padding:      '10px 12px 8px',
    borderBottom: '1px solid rgba(240,238,232,0.08)',
    display:      'flex',
    justifyContent: 'space-between',
    alignItems:   'center',
  })
  header.innerHTML = `
    <span style="font-size:11px;font-weight:700;color:#7A7870;letter-spacing:.05em;text-transform:uppercase;">Save to list</span>
    <button id="gh-picker-close" style="background:none;border:none;color:#7A7870;cursor:pointer;font-size:16px;padding:0;line-height:1;" aria-label="Close">✕</button>
  `
  card.appendChild(header)

  // List items
  const listEl = document.createElement('div')
  Object.assign(listEl.style, { maxHeight: '180px', overflowY: 'auto' })

  wishlists.forEach((w) => {
    const row = document.createElement('button')
    const isLast = w.id === lastUsedId
    Object.assign(row.style, {
      width:       '100%',
      display:     'flex',
      alignItems:  'center',
      gap:         '8px',
      padding:     '9px 12px',
      border:      'none',
      background:  isLast ? 'rgba(139,131,240,0.12)' : 'transparent',
      color:       '#F0EEE8',
      fontFamily:  'inherit',
      fontSize:    '13px',
      cursor:      'pointer',
      textAlign:   'left',
      borderLeft:  isLast ? `2px solid ${PURPLE}` : '2px solid transparent',
      transition:  'background 80ms ease',
    })

    const count      = w.itemCount ?? 0
    const countLabel = count === 1 ? '1 item' : `${count} items`

    row.innerHTML = `
      <span style="font-size:15px;flex-shrink:0;line-height:1;">${occasionEmoji(w.occasion)}</span>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;">${escHtml(w.title)}</span>
      <span style="font-size:11px;color:#7A7870;flex-shrink:0;">${escHtml(countLabel)}</span>
    `

    row.addEventListener('mouseenter', () => { if (!isLast) row.style.background = 'rgba(240,238,232,0.05)' })
    row.addEventListener('mouseleave', () => { if (!isLast) row.style.background = 'transparent'            })

    row.addEventListener('click', async () => {
      row.textContent = 'Saving…'
      row.disabled = true

      const { ok, error } = await saveProductToList(user, product, w.id)
      removePicker()

      if (ok) {
        await setLastUsedWishlist(user.id, w)
        showToast(`✓ Saved to "${w.title}"`, false)
      } else {
        showToast(error ?? 'Save failed — try again', true)
      }
    })

    listEl.appendChild(row)
  })

  card.appendChild(listEl)

  // "Open dashboard" footer
  const footer = document.createElement('div')
  Object.assign(footer.style, {
    padding:    '8px 12px',
    borderTop:  '1px solid rgba(240,238,232,0.08)',
  })
  footer.innerHTML = `
    <a href="${SITE_URL}/dashboard" target="_blank" rel="noopener noreferrer"
       style="font-size:11px;color:#7A7870;text-decoration:none;display:block;text-align:center;">
       Open dashboard ↗
    </a>
  `
  card.appendChild(footer)

  document.body.appendChild(card)

  // Close button + outside-click dismiss
  document.getElementById('gh-picker-close')?.addEventListener('click', removePicker)
  setTimeout(() => {
    document.addEventListener('click', outsidePickerClick)
  }, 50)
}

function outsidePickerClick(e) {
  const picker = document.getElementById(PICKER_ID)
  const btn    = document.getElementById(BUTTON_ID)
  if (picker && !picker.contains(e.target) && e.target !== btn) {
    removePicker()
    document.removeEventListener('click', outsidePickerClick)
  }
}

function removePicker() {
  document.getElementById(PICKER_ID)?.remove()
  document.removeEventListener('click', outsidePickerClick)
}

// ── Toast notification ────────────────────────────────────────────────────────

/**
 * Shows a brief floating toast above the save button.
 * @param {string}  message
 * @param {boolean} isError  true → amber, false → green
 */
function showToast(message, isError = false) {
  document.getElementById(TOAST_ID)?.remove()

  const toast = document.createElement('div')
  toast.id = TOAST_ID
  Object.assign(toast.style, {
    position:     'fixed',
    bottom:       '88px',
    right:        '24px',
    maxWidth:     '240px',
    padding:      '10px 14px',
    borderRadius: '10px',
    background:   isError ? '#2A1A0E' : '#0A1A12',
    border:       `1px solid ${isError ? 'rgba(226,162,74,0.4)' : 'rgba(78,201,154,0.4)'}`,
    color:        isError ? '#E2A24A' : '#4EC99A',
    fontSize:     '12px',
    fontWeight:   '600',
    fontFamily:   '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    boxShadow:    '0 4px 20px rgba(0,0,0,0.5)',
    zIndex:       '2147483646',
    animation:    'gh-picker-in 150ms ease forwards',
    pointerEvents: 'none',
  })
  toast.textContent = message

  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), 2_800)
}

// ── Sign-in tooltip ───────────────────────────────────────────────────────────

function showSignInTooltip() {
  document.getElementById(TOAST_ID)?.remove()

  const tip = document.createElement('div')
  tip.id = TOAST_ID
  Object.assign(tip.style, {
    position:   'fixed',
    bottom:     '88px',
    right:      '24px',
    width:      '200px',
    padding:    '12px',
    borderRadius: '12px',
    background: '#141418',
    border:     `1px solid rgba(139,131,240,0.3)`,
    color:      '#F0EEE8',
    fontSize:   '12px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    boxShadow:  '0 4px 20px rgba(0,0,0,0.5)',
    zIndex:     '2147483646',
    lineHeight: '1.5',
  })
  tip.innerHTML = `
    <p style="margin:0 0 8px;font-weight:700;color:#8B83F0;font-size:13px;">Sign in first</p>
    <p style="margin:0 0 10px;color:#7A7870;font-size:11px;">Open the GiftHint extension and sign in to start saving gifts.</p>
    <button onclick="this.parentElement.remove()" style="
      width:100%;padding:6px;border-radius:999px;border:none;
      background:#8B83F0;color:#fff;font-size:11px;font-weight:700;
      cursor:pointer;font-family:inherit;
    ">Got it</button>
  `
  document.body.appendChild(tip)
  setTimeout(() => tip.remove(), 5_000)
}

// ── Main click handler ────────────────────────────────────────────────────────

async function handleButtonClick(e) {
  e.stopPropagation()

  // If picker is already open, close it
  if (document.getElementById(PICKER_ID)) {
    removePicker()
    return
  }

  const user = await getCachedUser()

  if (!user?.token) {
    showSignInTooltip()
    return
  }

  const product = extractProductFromPage()
  if (!product.isProductPage) {
    showToast('This doesn\'t look like a product page', true)
    return
  }

  // Visual feedback: animate button while loading wishlists
  const btn = document.getElementById(BUTTON_ID)
  if (btn) { btn.textContent = '⏳'; btn.style.cursor = 'wait' }

  const [{ wishlists, error }, lastWishlist] = await Promise.all([
    getWishlists(user.id, user.token),
    getLastUsedWishlist(user.id),
  ])

  if (btn) { btn.textContent = '🎁'; btn.style.cursor = 'pointer' }

  if (error || !wishlists.length) {
    showToast(error ?? 'Create a wishlist first in the GiftHint dashboard.', true)
    return
  }

  if (wishlists.length === 1) {
    // Single list: save directly, no picker needed
    const targetList = wishlists[0]
    if (btn) btn.textContent = '⏳'

    const { ok, error: saveErr } = await saveProductToList(user, product, targetList.id)

    if (btn) btn.textContent = '🎁'

    if (ok) {
      await setLastUsedWishlist(user.id, targetList)
      showToast(`✓ Saved to "${targetList.title}"`, false)
    } else {
      showToast(saveErr ?? 'Save failed — try again', true)
    }
    return
  }

  // Multiple lists: show picker
  showListPicker(wishlists, user, product, lastWishlist?.id ?? null)
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

/**
 * Detects whether the current page looks like a product page and, if so,
 * injects the floating button after a short delay.
 *
 * We defer the check to let the page fully render (many SPAs update OG tags
 * after the initial HTML response), then show the button if warranted.
 */
function boot() {
  // Don't inject on the GiftHint dashboard itself
  if (location.hostname === 'gifthint.io') return

  setTimeout(() => {
    const product = extractProductFromPage()
    if (product.isProductPage) {
      createFloatingButton()
    }
  }, INJECT_DELAY_MS)

  // Re-check on SPA navigation (popstate / pushState)
  window.addEventListener('popstate', () => {
    removeFloatingButton()
    removePicker()
    setTimeout(() => {
      const p = extractProductFromPage()
      if (p.isProductPage) createFloatingButton()
    }, INJECT_DELAY_MS)
  })
}

boot()
