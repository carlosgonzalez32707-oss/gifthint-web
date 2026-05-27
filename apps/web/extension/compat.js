/**
 * extension/compat.js — GiftHint Browser Compatibility Shim
 *
 * Provides a unified `ext` object that abstracts the differences between
 * Chrome MV3 and Firefox MV2, letting the rest of the codebase use one
 * consistent API surface.
 *
 * ┌──────────────────────────┬──────────────────────────────────────────────────┐
 * │ Feature                  │ Detail                                           │
 * ├──────────────────────────┼──────────────────────────────────────────────────┤
 * │ Namespace                │ Chrome: chrome.*   Firefox: browser.*            │
 * │ Promises                 │ Both return Promises from all storage/tabs APIs  │
 * │ identity                 │ NOT unified here — auth.js / auth.firefox.js     │
 * │                          │ handle each browser's identity API directly      │
 * │ action vs browserAction  │ Unified under ext.action                        │
 * └──────────────────────────┴──────────────────────────────────────────────────┘
 *
 * USAGE
 * ─────
 * Replace:  chrome.storage.local.get(key)
 * With:     ext.storage.local.get(key)
 *
 * Replace:  chrome.tabs.create({ url })
 * With:     ext.tabs.create({ url })
 *
 * Import in any extension file:
 *   import { ext } from './compat.js'
 *
 * Identity is handled by separate files:
 *   Chrome:  auth.js           uses chrome.identity.getAuthToken()
 *   Firefox: auth.firefox.js   uses browser.identity.launchWebAuthFlow()
 *
 * NOTE ON EXISTING FILES
 * ──────────────────────
 * Firefox exposes a `chrome.*` alias for `browser.*` so most existing
 * chrome.storage / chrome.tabs calls work in Firefox without changes.
 * The main incompatibility is chrome.identity.getAuthToken() (Chrome-only)
 * and chrome.action vs browser.browserAction — both handled separately.
 * Migrate existing files to `ext.*` incrementally; no big-bang rewrite needed.
 */

// ── Environment detection ──────────────────────────────────────────────────────

/**
 * true when running inside Firefox or Firefox-based browsers.
 *
 * Firefox exposes a global `browser` object with a Promise-based API;
 * Chrome does not (it uses `chrome.*` with callback-or-Promise APIs in MV3).
 * We check `typeof browser !== 'undefined'` — this is reliable at extension
 * load time in both popup and content-script contexts.
 */
export const IS_FIREFOX =
  typeof browser !== 'undefined' &&
  typeof browser.runtime !== 'undefined'

// Primary namespace: browser.* (Firefox) or chrome.* (Chrome / Edge)
const _api = IS_FIREFOX
  ? /* global browser */ browser
  : /* global chrome  */ chrome

// ── Unified ext object ─────────────────────────────────────────────────────────

/**
 * Unified browser extension API.
 *
 * All methods return Promises.
 * In Chrome MV3, the chrome.* APIs return Promises natively (no callbacks
 * required).  In Firefox, browser.* has always been Promise-based.
 * Result: ext.* calls are await-able in both browsers identically.
 *
 * ext.identity is intentionally omitted.
 * Use auth.js (Chrome) or auth.firefox.js (Firefox) for sign-in flows.
 */
export const ext = {

  /**
   * chrome.storage.local / browser.storage.local
   *
   * ext.storage.local.get(key | [key] | {key: default})  → Promise<object>
   * ext.storage.local.set({key: value, ...})              → Promise<void>
   * ext.storage.local.remove(key | [key])                 → Promise<void>
   */
  storage: {
    local: _api.storage.local,
  },

  /**
   * chrome.runtime / browser.runtime
   *
   * ext.runtime.id          — extension ID string
   * ext.runtime.lastError   — last error (check after callbacks, if any)
   * ext.runtime.getURL(path) — extension resource URL
   */
  runtime: _api.runtime,

  /**
   * chrome.tabs / browser.tabs
   *
   * ext.tabs.create({ url })                     → Promise<Tab>
   * ext.tabs.query({ active, currentWindow })    → Promise<Tab[]>
   * ext.tabs.sendMessage(tabId, msg)             → Promise<any>
   */
  tabs: _api.tabs,

  /**
   * chrome.scripting / browser.scripting
   *
   * ext.scripting.executeScript({ target, func, args }) → Promise<InjectionResult[]>
   *
   * Available in Chrome MV3 and Firefox MV2 (Firefox 102+) / MV3.
   */
  scripting: _api.scripting,

  /**
   * Unified popup-icon / badge API.
   *
   * Chrome MV3:   chrome.action
   * Firefox MV2:  browser.browserAction
   * Firefox MV3:  browser.action
   *
   * ext.action.setBadgeText({ text })          → Promise<void>
   * ext.action.setBadgeBackgroundColor({ color }) → Promise<void>
   */
  action: (
    _api.action ??
    (IS_FIREFOX ? (browser.browserAction ?? null) : null)
  ),

  /** true when running in Firefox / Firefox-based browsers */
  isFirefox: IS_FIREFOX,
}
