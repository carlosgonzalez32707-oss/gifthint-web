/**
 * extension/background.js — GiftHint Chrome Extension v1.1
 *
 * MV3 service worker. Runs in the background and handles:
 *   1. Extension error reporting → POST /api/extension-error
 *
 * SERVICE WORKER CONSTRAINTS
 * ──────────────────────────
 * MV3 service workers have no persistent state, no DOM, and no window object.
 * They are suspended after ~30 s of inactivity. Do NOT use:
 *   - window.onerror (doesn't exist in service workers)
 *   - localStorage / sessionStorage
 *   - long-running setInterval
 *
 * Use self.addEventListener('error') and self.addEventListener('unhandledrejection')
 * instead of window.onerror. These are the service-worker equivalents.
 *
 * REPORTING ENDPOINT
 * ──────────────────
 * Errors POST to /api/extension-error on the GiftHint server.
 * The server stores them in extension_errors and forwards to Sentry.
 * Reports are fire-and-forget — a failed report never affects UX.
 *
 * RATE LIMITING
 * ─────────────
 * We debounce reports: max 1 report per error message per session to avoid
 * flooding the server if an error fires repeatedly (e.g. in a render loop).
 * The deduplication Set is cleared when the service worker is restarted.
 */

const SITE_URL       = 'https://gifthint.io'
const REPORT_URL     = `${SITE_URL}/api/extension-error`
const EXTENSION_VER  = chrome.runtime.getManifest().version

// ── Deduplication ─────────────────────────────────────────────────────────────
// Prevent the same error from being reported more than once per service-worker
// lifecycle. Cleared automatically when the service worker is restarted.
const _reported = new Set()

// ── Core reporter ─────────────────────────────────────────────────────────────

/**
 * Sends an error report to /api/extension-error.
 *
 * @param {string} message   — error.message or event.reason?.message
 * @param {string|null} stack — error.stack (null for non-Error rejections)
 * @param {string} source    — 'uncaught_error' | 'unhandled_rejection'
 * @param {string|null} retailer — active retailer domain if known (set by content script)
 */
async function reportError(message, stack, source, retailer = null) {
  // Dedup: skip if this exact message was already reported this session
  const key = `${source}:${message}`
  if (_reported.has(key)) return
  _reported.add(key)

  // Ignore internal Chrome extension errors outside our control
  if (
    message.includes('Extension context invalidated') ||
    message.includes('The message port closed')
  ) return

  try {
    await fetch(REPORT_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message:  message?.slice(0, 500) ?? 'Unknown error',
        stack:    stack?.slice(0, 2000) ?? null,
        version:  EXTENSION_VER,
        retailer: retailer?.slice(0, 100) ?? null,
        source,
      }),
    })
  } catch {
    // fetch itself failed (network offline, service worker suspended mid-request).
    // Silently discard — we must never throw inside an error handler.
  }
}

// ── Uncaught synchronous errors ───────────────────────────────────────────────
// Equivalent of window.onerror in a service worker context.

self.addEventListener('error', (event) => {
  reportError(
    event.message ?? 'Uncaught error',
    event.error?.stack ?? null,
    'uncaught_error',
  )
})

// ── Unhandled promise rejections ──────────────────────────────────────────────
// Catches rejected Promises that nobody .catch()'d — the most common class of
// extension bugs (failed supabase calls, network timeouts, etc.).

self.addEventListener('unhandledrejection', (event) => {
  const reason  = event.reason
  const message = reason instanceof Error
    ? reason.message
    : typeof reason === 'string'
      ? reason
      : JSON.stringify(reason)?.slice(0, 500) ?? 'Unhandled rejection'
  const stack = reason instanceof Error ? reason.stack ?? null : null

  reportError(message, stack, 'unhandled_rejection')
})

// ── Message handler ───────────────────────────────────────────────────────────
// Content scripts (product-extractor.js) can send errors with retailer context
// that the service worker itself doesn't know about.
//
// Usage from a content script:
//   chrome.runtime.sendMessage({
//     type:     'REPORT_ERROR',
//     message:  'Failed to extract price',
//     stack:    err.stack,
//     retailer: 'amazon.com',
//   })

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== 'REPORT_ERROR') return

  reportError(
    msg.message ?? 'Content script error',
    msg.stack   ?? null,
    'content_script',
    msg.retailer ?? null,
  )

  // Return false — no async response needed
  return false
})
