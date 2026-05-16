/**
 * extension/popup.js — GiftHint Chrome Extension v1.1
 *
 * Controls the 360×540 px popup.
 *
 * v1.1 additions:
 *   - Rich list selector dropdown replaces plain <select>:
 *       occasion emoji + name + item count, active list highlighted,
 *       "Create new list" at the bottom, persisted in chrome.storage.local
 *   - Occasion countdown badge in the header ("🎂 Birthday in 21 days")
 *   - Quick-actions row: "📊 View analytics" and "🔗 Share [list]" (copy URL)
 *
 * State machine: loading → signed-out → signed-in
 *
 * The signed-in screen is DOM-rendered via innerHTML; event listeners are
 * wired after each render so there are no stale handler leaks.
 */

import {
  getCachedUser,
  signIn,
  signOut,
  withAuth,
} from './auth.js'

import {
  saveItem,
  getWishlists,
  getLastUsedWishlist,
  setLastUsedWishlist,
} from './items.js'

import { getPublicUsername, OCCASION_LABELS } from './wishlists.js'

// ── Constants ─────────────────────────────────────────────────────────────────

const SITE_URL      = 'https://gifthint.io'
const DASHBOARD_URL = `${SITE_URL}/dashboard`
const PURPLE        = '#8B83F0'

// ── DOM helpers ───────────────────────────────────────────────────────────────

function render(html) {
  const root = document.getElementById('root')
  if (root) root.innerHTML = html
}

function el(id) {
  return document.getElementById(id)
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function escHtml(str) {
  if (str == null) return ''
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;')
}

function formatPrice(price) {
  if (!price) return ''
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price)
}

/**
 * Returns calendar days between today (midnight local) and a date string.
 * Negative means the date is in the past. Null if no date provided.
 */
function daysUntil(dateStr) {
  if (!dateStr) return null
  const today  = new Date(); today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr); target.setHours(0, 0, 0, 0)
  return Math.round((target - today) / 86_400_000)
}

/**
 * Returns occasion emoji from OCCASION_LABELS, falling back to 🎁.
 * @param {string} occasionKey
 */
function occasionEmoji(occasionKey) {
  return OCCASION_LABELS[occasionKey]?.emoji ?? '🎁'
}

/**
 * Builds the shareable gifter-page URL for the active wishlist.
 * Returns null if either the username or the wishlist slug is missing.
 *
 * @param {string|null} publicUsername
 * @param {{ slug: string }|null} wishlist
 */
function buildShareUrl(publicUsername, wishlist) {
  if (!publicUsername || !wishlist?.slug) return null
  return `${SITE_URL}/list/${publicUsername}/${wishlist.slug}`
}

// ── Countdown badge HTML ──────────────────────────────────────────────────────

/**
 * Returns HTML for the occasion countdown badge, or an empty string.
 * Shown only when the occasion date is 0–90 days away.
 *
 * @param {{ occasion: string, occasion_date: string|null }|null} wishlist
 */
function countdownBadgeHtml(wishlist) {
  if (!wishlist?.occasion_date) return ''
  const days = daysUntil(wishlist.occasion_date)
  if (days === null || days < 0 || days > 90) return ''

  const emoji = occasionEmoji(wishlist.occasion)
  const label = OCCASION_LABELS[wishlist.occasion]?.label ?? 'Occasion'

  let text, modifier
  if (days === 0)       { text = `${emoji} ${label} is today!`;       modifier = 'tomorrow' }
  else if (days === 1)  { text = `${emoji} ${label} tomorrow`;         modifier = 'tomorrow' }
  else if (days <= 7)   { text = `${emoji} ${label} in ${days} days`;  modifier = 'soon'     }
  else                  { text = `${emoji} ${label} in ${days} days`;  modifier = ''         }

  return `<span class="countdown-badge ${modifier}">${escHtml(text)}</span>`
}

// ── List selector dropdown HTML ───────────────────────────────────────────────

/**
 * Renders the custom dropdown trigger (collapsed state).
 *
 * @param {object}   activeList  The currently selected wishlist
 * @param {boolean}  open        Whether the dropdown is expanded
 */
function listSelectorTriggerHtml(activeList, open = false) {
  const emoji = occasionEmoji(activeList?.occasion)
  const name  = escHtml(activeList?.title ?? 'Select a list')
  const count = activeList?.itemCount ?? 0
  const countLabel = count === 1 ? '1 item' : `${count} items`

  return `
    <button class="list-selector__trigger${open ? ' open' : ''}" id="ls-trigger" aria-expanded="${open}" aria-haspopup="listbox">
      <span class="list-selector__trigger-emoji">${emoji}</span>
      <span class="list-selector__trigger-name">${name}</span>
      <span class="list-selector__trigger-count">${escHtml(countLabel)}</span>
      <span class="list-selector__trigger-chevron">▾</span>
    </button>
  `
}

/**
 * Renders the full list selector dropdown (trigger + dropdown menu).
 *
 * @param {Array}        wishlists   All user's wishlists
 * @param {object|null}  activeList  Currently selected wishlist
 * @param {boolean}      open        Dropdown expanded?
 */
function listSelectorHtml(wishlists, activeList, open = false) {
  const items = wishlists.map((w) => {
    const isActive  = w.id === activeList?.id
    const emoji     = occasionEmoji(w.occasion)
    const count     = w.itemCount ?? 0
    const countText = count === 1 ? '1 item' : `${count} items`
    return `
      <div class="list-selector__item${isActive ? ' active' : ''}" data-list-id="${escHtml(w.id)}" role="option" aria-selected="${isActive}">
        <span class="list-selector__item-emoji">${emoji}</span>
        <span class="ls-name">${escHtml(w.title)}</span>
        <span class="ls-count">${escHtml(countText)}</span>
        <span class="list-selector__item-check">${isActive ? '✓' : ''}</span>
      </div>
    `
  }).join('')

  return `
    <div class="list-selector" id="list-selector">
      ${listSelectorTriggerHtml(activeList, open)}
      <div class="list-selector__menu${open ? ' open' : ''}" id="ls-menu" role="listbox">
        ${items}
        <div class="list-selector__divider"></div>
        <div class="list-selector__create" id="ls-create-new">
          ＋ Create new list
        </div>
      </div>
    </div>
  `
}

// ── Screens ───────────────────────────────────────────────────────────────────

function renderLoading() {
  render(`
    <div class="skeleton-list">
      ${[1, 2, 3].map(() => `
        <div class="skeleton-card">
          <div class="skeleton-card__thumb gh-shimmer"></div>
          <div class="skeleton-card__lines">
            <div class="skeleton-card__line skeleton-card__line--title gh-shimmer"></div>
            <div class="skeleton-card__line skeleton-card__line--sub gh-shimmer"></div>
          </div>
        </div>
      `).join('')}
    </div>
  `)
}

function renderSignedOut() {
  render(`
    <div style="
      display:flex;flex-direction:column;align-items:center;
      justify-content:center;height:100%;padding:32px 20px;text-align:center;gap:0;
    ">
      <div style="font-size:40px;margin-bottom:14px;">🎁</div>

      <h1 style="margin:0 0 8px;font-size:16px;font-weight:800;color:#F0EEE8;letter-spacing:-0.03em;">
        Save gifts while you shop
      </h1>

      <p style="margin:0 0 24px;font-size:12px;color:#7A7870;line-height:1.55;max-width:220px;">
        Sign in to save products to multiple wishlists with occasion tagging and share links.
      </p>

      <button id="btn-signin" style="
        display:inline-flex;align-items:center;gap:10px;
        padding:10px 22px;border-radius:999px;background:#fff;
        border:none;color:#1a1a1a;font-size:13px;font-weight:700;
        cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,0.3);
        letter-spacing:-0.01em;font-family:inherit;
      ">
        <svg width="16" height="16" viewBox="0 0 18 18" style="flex-shrink:0">
          <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
          <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
          <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
          <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
        </svg>
        Continue with Google
      </button>

      <a id="link-dashboard-out" href="${DASHBOARD_URL}" target="_blank" rel="noopener noreferrer" style="
        margin-top:20px;font-size:11px;color:#7A7870;text-decoration:none;opacity:0.7;
      ">Open dashboard ↗</a>
    </div>
  `)

  el('btn-signin').addEventListener('click', handleSignIn)
}

/**
 * Renders the full signed-in popup.
 *
 * @param {{ name:string, given_name?:string, picture?:string, id:string }} user
 * @param {{ wishlists:Array, lastWishlist:object|null }}                   listData
 * @param {{ title?:string, price?:number, imageUrl?:string }|null}        product
 * @param {string|null}                                                     publicUsername
 */
function renderSignedIn(user, { wishlists, lastWishlist }, product, publicUsername) {
  const name     = user.given_name ?? user.name ?? 'there'
  const hasLists = wishlists && wishlists.length > 0

  // Resolve which list is "active" (last used, or default, or first)
  const activeList = hasLists
    ? (wishlists.find((w) => w.id === lastWishlist?.id)
       ?? wishlists.find((w) => w.is_default)
       ?? wishlists[0])
    : null

  const shareUrl    = buildShareUrl(publicUsername, activeList)
  const countdownHtml = countdownBadgeHtml(activeList)

  render(`
    <!-- ── Header ──────────────────────────────────────────────────────── -->
    <div style="
      padding:12px 14px 10px;
      border-bottom:1px solid rgba(240,238,232,0.07);
    ">
      <!-- Row 1: avatar + name + sign-out -->
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <div style="display:flex;align-items:center;gap:8px;min-width:0;">
          ${user.picture
            ? `<img src="${escHtml(user.picture)}" alt="" style="width:26px;height:26px;border-radius:50%;flex-shrink:0;">`
            : `<div style="width:26px;height:26px;border-radius:50%;background:${PURPLE};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#fff;flex-shrink:0;">${escHtml(name[0].toUpperCase())}</div>`
          }
          <span style="font-size:12px;font-weight:600;color:#F0EEE8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Hi, ${escHtml(name)}</span>
        </div>
        <button id="btn-signout" style="
          background:transparent;border:none;color:#7A7870;
          font-size:10px;cursor:pointer;padding:3px 6px;
          border-radius:4px;font-family:inherit;flex-shrink:0;
        ">Sign out</button>
      </div>

      <!-- Row 2: occasion countdown (shown only when upcoming) -->
      ${countdownHtml
        ? `<div style="margin-top:8px;">${countdownHtml}</div>`
        : ''
      }
    </div>

    <!-- ── List selector ────────────────────────────────────────────────── -->
    <div style="padding:12px 14px 0;">
      <label style="
        display:block;font-size:10px;font-weight:600;color:#7A7870;
        letter-spacing:.06em;text-transform:uppercase;margin-bottom:6px;
      ">Active list</label>

      ${hasLists
        ? listSelectorHtml(wishlists, activeList, false)
        : `<div style="padding:9px 12px;border-radius:10px;border:1px solid rgba(240,238,232,0.1);font-size:12px;color:#7A7870;">
             No lists yet — <a href="${DASHBOARD_URL}" target="_blank" style="color:${PURPLE};text-decoration:none;">create one in the dashboard ↗</a>
           </div>`
      }
    </div>

    <!-- ── Quick actions: analytics + share ─────────────────────────────── -->
    <div class="quick-actions">
      <a href="${DASHBOARD_URL}" target="_blank" rel="noopener noreferrer" class="quick-btn" id="btn-analytics">
        📊 Analytics
      </a>
      <button class="quick-btn" id="btn-share" ${!shareUrl ? 'disabled style="opacity:0.4;cursor:not-allowed;"' : ''}>
        🔗 Share list
      </button>
    </div>

    <!-- ── Product preview ───────────────────────────────────────────────── -->
    ${product ? `
      <div style="
        margin:12px 14px 0;padding:10px;border-radius:10px;
        border:1px solid rgba(240,238,232,0.07);background:#141418;
        display:flex;align-items:center;gap:10px;
      ">
        ${product.imageUrl
          ? `<img src="${escHtml(product.imageUrl)}" alt="" style="width:44px;height:44px;object-fit:cover;border-radius:6px;flex-shrink:0;">`
          : `<div style="width:44px;height:44px;border-radius:6px;background:#1C1C22;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:20px;">🛍️</div>`
        }
        <div style="min-width:0;flex:1;">
          <p style="margin:0;font-size:12px;font-weight:600;color:#F0EEE8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            ${escHtml(product.title ?? 'Product')}
          </p>
          ${product.price
            ? `<p style="margin:2px 0 0;font-size:11px;color:#4EC99A;font-weight:600;">${formatPrice(product.price)}</p>`
            : ''
          }
        </div>
      </div>
    ` : `
      <div style="
        margin:12px 14px 0;padding:10px 12px;border-radius:10px;
        border:1px dashed rgba(240,238,232,0.1);text-align:center;
      ">
        <p style="margin:0;font-size:12px;color:#7A7870;">
          Navigate to a product page to save an item.
        </p>
      </div>
    `}

    <!-- ── Save button ───────────────────────────────────────────────────── -->
    <div style="padding:12px 14px;">
      <button id="btn-save" ${(!product || !hasLists) ? 'disabled' : ''} style="
        width:100%;padding:11px;border-radius:999px;border:none;
        background:${(!product || !hasLists) ? '#1C1C22' : PURPLE};
        color:${(!product || !hasLists) ? '#7A7870' : '#fff'};
        font-size:13px;font-weight:700;
        cursor:${(!product || !hasLists) ? 'not-allowed' : 'pointer'};
        letter-spacing:-0.01em;font-family:inherit;transition:opacity 120ms ease;
      ">
        🎁 Save to wishlist
      </button>
      <p id="save-status" style="margin:8px 0 0;font-size:11px;text-align:center;color:#7A7870;min-height:14px;"></p>
    </div>
  `)

  // ── Wire event listeners ────────────────────────────────────────────────

  el('btn-signout').addEventListener('click', handleSignOut)

  // List selector dropdown
  if (hasLists) {
    wireListSelector(wishlists, activeList, user)
  }

  // Share button
  if (shareUrl) {
    el('btn-share')?.addEventListener('click', () => handleShare(shareUrl))
  }

  // Save button
  const saveBtn = el('btn-save')
  if (saveBtn && product && hasLists) {
    saveBtn.addEventListener('click', () => handleSaveItem(user, wishlists, activeList, product))
  }

  // Store state we need for "re-render on list change"
  el('root').__listData    = { wishlists, lastWishlist }
  el('root').__product     = product
  el('root').__publicUser  = publicUsername
  el('root').__user        = user
}

// ── List selector wiring ──────────────────────────────────────────────────────

/**
 * Attaches toggle + selection logic to the custom list dropdown.
 * Selecting a list:
 *   1. Saves to chrome.storage.local via setLastUsedWishlist
 *   2. Re-renders the signed-in view with the new active list
 */
function wireListSelector(wishlists, activeList, user) {
  let isOpen = false

  const trigger = el('ls-trigger')
  const menu    = el('ls-menu')

  function openMenu() {
    isOpen = true
    trigger?.classList.add('open')
    menu?.classList.add('open')
    trigger?.setAttribute('aria-expanded', 'true')
  }

  function closeMenu() {
    isOpen = false
    trigger?.classList.remove('open')
    menu?.classList.remove('open')
    trigger?.setAttribute('aria-expanded', 'false')
  }

  trigger?.addEventListener('click', (e) => {
    e.stopPropagation()
    isOpen ? closeMenu() : openMenu()
  })

  // Close when clicking outside the dropdown
  document.addEventListener('click', (e) => {
    if (isOpen && !el('list-selector')?.contains(e.target)) closeMenu()
  }, { once: false })

  // List item selection
  menu?.addEventListener('click', async (e) => {
    const item = e.target.closest('[data-list-id]')
    if (item) {
      const listId  = item.dataset.listId
      const chosen  = wishlists.find((w) => w.id === listId)
      if (!chosen) return
      closeMenu()
      await setLastUsedWishlist(user.id, chosen)
      // Re-render with the new active list (preserves product + publicUsername)
      const root = el('root')
      renderSignedIn(
        root.__user,
        { wishlists, lastWishlist: chosen },
        root.__product,
        root.__publicUser,
      )
      return
    }

    // "Create new list" option
    if (e.target.closest('#ls-create-new')) {
      closeMenu()
      chrome.tabs.create({ url: `${DASHBOARD_URL}#new-list` })
    }
  })
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleSignIn() {
  const btn = el('btn-signin')
  if (btn) { btn.disabled = true; btn.textContent = 'Signing in…' }

  const result = await signIn()
  if (result.error) {
    render(`
      <div style="padding:24px;text-align:center;color:#E24B4A;font-size:13px;">
        ${escHtml(result.error)}
        <br><br>
        <button id="btn-retry" style="
          padding:8px 16px;border-radius:999px;
          border:1px solid rgba(240,238,232,0.12);
          background:transparent;color:#7A7870;font-size:12px;
          cursor:pointer;font-family:inherit;
        ">Try again</button>
      </div>
    `)
    el('btn-retry')?.addEventListener('click', () => renderSignedOut())
    return
  }

  await initSignedIn(result.user)
}

async function handleSignOut() {
  await signOut()
  renderSignedOut()
}

/**
 * Copies the share URL to the clipboard and shows a brief "Copied!" confirmation.
 * @param {string} url
 */
async function handleShare(url) {
  try {
    await navigator.clipboard.writeText(url)
    const btn = el('btn-share')
    if (btn) {
      btn.classList.add('copied')
      btn.textContent = '✓ Copied!'
      setTimeout(() => {
        btn.classList.remove('copied')
        btn.textContent = '🔗 Share list'
      }, 2_000)
    }
  } catch {
    // Clipboard API can fail in some contexts — open the URL as fallback
    chrome.tabs.create({ url })
  }
}

async function handleSaveItem(user, wishlists, activeList, product) {
  const saveBtn  = el('btn-save')
  const statusEl = el('save-status')

  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…' }

  const { error } = await withAuth((token) =>
    saveItem(
      user.id,
      {
        title:     product.title    ?? 'Saved item',
        price:     product.price    ?? null,
        imageUrl:  product.imageUrl ?? null,
        sourceUrl: product.url      ?? '',
        currency:  product.currency ?? 'USD',
      },
      token,
      activeList?.id ?? null,
    )
  )

  if (error) {
    if (statusEl) { statusEl.style.color = '#E24B4A'; statusEl.textContent = error.message ?? 'Save failed.' }
    if (saveBtn)  { saveBtn.disabled = false; saveBtn.textContent = '🎁 Save to wishlist' }
    return
  }

  if (statusEl) { statusEl.style.color = '#4EC99A'; statusEl.textContent = '✓ Saved!' }
  if (saveBtn)  saveBtn.textContent = '✓ Saved!'

  setTimeout(() => {
    if (saveBtn)  { saveBtn.textContent = '🎁 Save to wishlist'; saveBtn.disabled = false }
    if (statusEl) statusEl.textContent = ''
  }, 2_000)
}

// ── Initialise signed-in state ─────────────────────────────────────────────────

/**
 * Kicks off all async data fetches in parallel, then renders the signed-in view.
 * Parallel: wishlists + product extraction + public username (for share URL)
 */
async function initSignedIn(user) {
  const [listResult, product, publicUsername] = await Promise.all([
    withAuth((token) => getWishlists(user.id, token)),
    detectProduct(),
    withAuth((token) => getPublicUsername(user.id, token)),
  ])

  const wishlists    = listResult.data ?? listResult.wishlists ?? []
  const lastWishlist = await getLastUsedWishlist(user.id)

  renderSignedIn(user, { wishlists, lastWishlist }, product, publicUsername)
}

// ── Product detection ─────────────────────────────────────────────────────────

async function detectProduct() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id || !tab.url || tab.url.startsWith('chrome://')) return null

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files:  ['product-extractor.js'],
    })

    const result = results?.[0]?.result
    if (!result || !result.title) return null
    return result
  } catch {
    return null
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function boot() {
  renderLoading()

  const cachedUser = await getCachedUser()
  if (!cachedUser) {
    renderSignedOut()
    return
  }

  await initSignedIn(cachedUser)
}

document.addEventListener('DOMContentLoaded', boot)
