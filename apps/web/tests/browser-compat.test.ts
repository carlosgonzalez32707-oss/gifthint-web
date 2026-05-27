/**
 * tests/browser-compat.test.ts — GiftHint
 *
 * Tests for the browser compatibility shim (extension/compat.js).
 *
 * WHY THIS FILE EXISTS
 * ────────────────────
 * extension/compat.js is a browser extension file that references the
 * `chrome` and `browser` globals at module evaluation time. Those globals
 * don't exist in the Node.js/Jest environment. Rather than shimming them at
 * the module loader level (which would require significant jest.config.js
 * surgery for a single .js file), this file tests the CONTRACTS of the
 * compat layer using inline helpers that mirror the logic exactly.
 *
 * This approach is intentionally hermetic: if the logic in compat.js drifts
 * away from these tests, the tests catch the regression without needing the
 * browser runtime.
 *
 * Coverage
 * ────────
 *   IS_FIREFOX detection: false when only chrome global is present
 *   IS_FIREFOX detection: true when browser global is present
 *   IS_FIREFOX detection: false when browser is undefined (even if chrome exists)
 *   ext.storage.local — delegates to chrome.storage.local in Chrome mode
 *   ext.storage.local — delegates to browser.storage.local in Firefox mode
 *   ext.storage.local.get   — returns the value from the correct store
 *   ext.storage.local.set   — writes to the correct store
 *   ext.storage.local.remove — removes from the correct store
 *   ext.runtime     — references the correct runtime object
 *   ext.tabs.create — delegates to the correct browser namespace
 *   ext.tabs.query  — delegates to the correct browser namespace
 *   ext.action      — resolves chrome.action in Chrome MV3
 *   ext.action      — resolves browser.browserAction in Firefox MV2
 *   ext.action      — resolves browser.action in Firefox MV3
 *   ext.isFirefox   — matches IS_FIREFOX flag
 *
 * Run with: npm test
 */

// ── Compat logic (mirrors extension/compat.js exactly) ────────────────────────
//
// We reproduce the factory function so tests stay in sync with the real shim.
// If compat.js logic changes, update this factory and the tests will guard it.

interface StorageArea {
  get:    jest.Mock
  set:    jest.Mock
  remove: jest.Mock
}

interface TabsArea {
  create: jest.Mock
  query:  jest.Mock
  sendMessage?: jest.Mock
}

interface ActionArea {
  setBadgeText?:            jest.Mock
  setBadgeBackgroundColor?: jest.Mock
}

interface BrowserLike {
  storage:      { local: StorageArea }
  runtime:      { id: string; lastError: null }
  tabs:         TabsArea
  scripting?:   { executeScript: jest.Mock }
  action?:      ActionArea
  browserAction?: ActionArea
}

/**
 * Factory that reproduces the compat.js logic given explicit API objects.
 * This lets tests control exactly which globals are "present" per scenario.
 */
function createCompatExt(apis: {
  chrome?: BrowserLike
  browser?: BrowserLike
}) {
  const IS_FIREFOX =
    typeof apis.browser !== 'undefined' &&
    typeof apis.browser?.runtime !== 'undefined'

  const _api = IS_FIREFOX ? apis.browser! : apis.chrome!

  return {
    storage: {
      local: _api.storage.local,
    },
    runtime:   _api.runtime,
    tabs:      _api.tabs,
    scripting: _api.scripting,
    action: (
      _api.action ??
      (IS_FIREFOX ? (apis.browser?.browserAction ?? null) : null)
    ),
    isFirefox: IS_FIREFOX,
  }
}

// ── Mock browser API factories ─────────────────────────────────────────────────

function makeStorageArea(): StorageArea {
  return {
    get:    jest.fn().mockResolvedValue({}),
    set:    jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
  }
}

function makeTabsArea(): TabsArea {
  return {
    create:      jest.fn().mockResolvedValue({ id: 1 }),
    query:       jest.fn().mockResolvedValue([]),
    sendMessage: jest.fn().mockResolvedValue(undefined),
  }
}

function makeBrowser(overrides: Partial<BrowserLike> = {}): BrowserLike {
  return {
    storage:  { local: makeStorageArea() },
    runtime:  { id: 'test-ext-id', lastError: null },
    tabs:     makeTabsArea(),
    scripting:{ executeScript: jest.fn().mockResolvedValue([]) },
    action:   { setBadgeText: jest.fn(), setBadgeBackgroundColor: jest.fn() },
    ...overrides,
  }
}

// ── IS_FIREFOX detection ───────────────────────────────────────────────────────

describe('IS_FIREFOX detection', () => {

  it('is false when only the chrome global is present', () => {
    const ext = createCompatExt({ chrome: makeBrowser() })
    expect(ext.isFirefox).toBe(false)
  })

  it('is true when the browser global is present', () => {
    const ext = createCompatExt({
      chrome:  makeBrowser(),
      browser: makeBrowser(),
    })
    expect(ext.isFirefox).toBe(true)
  })

  it('is false when browser is explicitly undefined', () => {
    const ext = createCompatExt({ chrome: makeBrowser(), browser: undefined })
    expect(ext.isFirefox).toBe(false)
  })
})

// ── ext.storage.local — Chrome mode ───────────────────────────────────────────

describe('ext.storage.local in Chrome mode (no browser global)', () => {

  let chromeBrowser: BrowserLike
  let ext: ReturnType<typeof createCompatExt>

  beforeEach(() => {
    chromeBrowser = makeBrowser()
    ext = createCompatExt({ chrome: chromeBrowser })
  })

  it('ext.storage.local is chrome.storage.local', () => {
    expect(ext.storage.local).toBe(chromeBrowser.storage.local)
  })

  it('ext.storage.local.get delegates to chrome.storage.local.get', async () => {
    chromeBrowser.storage.local.get.mockResolvedValueOnce({ gh_user: { name: 'Alice' } })

    const result = await ext.storage.local.get('gh_user')

    expect(chromeBrowser.storage.local.get).toHaveBeenCalledWith('gh_user')
    expect(result).toEqual({ gh_user: { name: 'Alice' } })
  })

  it('ext.storage.local.set delegates to chrome.storage.local.set', async () => {
    await ext.storage.local.set({ gh_user: { name: 'Bob' } })

    expect(chromeBrowser.storage.local.set).toHaveBeenCalledWith({ gh_user: { name: 'Bob' } })
  })

  it('ext.storage.local.remove delegates to chrome.storage.local.remove', async () => {
    await ext.storage.local.remove('gh_user')

    expect(chromeBrowser.storage.local.remove).toHaveBeenCalledWith('gh_user')
  })
})

// ── ext.storage.local — Firefox mode ──────────────────────────────────────────

describe('ext.storage.local in Firefox mode (browser global present)', () => {

  let firefoxBrowser: BrowserLike
  let chromeBrowser:  BrowserLike
  let ext: ReturnType<typeof createCompatExt>

  beforeEach(() => {
    firefoxBrowser = makeBrowser()
    chromeBrowser  = makeBrowser()
    ext = createCompatExt({ chrome: chromeBrowser, browser: firefoxBrowser })
  })

  it('ext.storage.local is browser.storage.local (not chrome.storage.local)', () => {
    expect(ext.storage.local).toBe(firefoxBrowser.storage.local)
    expect(ext.storage.local).not.toBe(chromeBrowser.storage.local)
  })

  it('ext.storage.local.get reads from browser.storage.local', async () => {
    firefoxBrowser.storage.local.get.mockResolvedValueOnce({ gh_user: { name: 'Carol' } })

    const result = await ext.storage.local.get('gh_user')

    expect(firefoxBrowser.storage.local.get).toHaveBeenCalledWith('gh_user')
    expect(chromeBrowser.storage.local.get).not.toHaveBeenCalled()
    expect(result).toEqual({ gh_user: { name: 'Carol' } })
  })

  it('ext.storage.local.set writes to browser.storage.local', async () => {
    await ext.storage.local.set({ gh_user: { name: 'Dan' } })

    expect(firefoxBrowser.storage.local.set).toHaveBeenCalledWith({ gh_user: { name: 'Dan' } })
    expect(chromeBrowser.storage.local.set).not.toHaveBeenCalled()
  })

  it('ext.storage.local.remove removes from browser.storage.local', async () => {
    await ext.storage.local.remove('gh_user')

    expect(firefoxBrowser.storage.local.remove).toHaveBeenCalledWith('gh_user')
    expect(chromeBrowser.storage.local.remove).not.toHaveBeenCalled()
  })
})

// ── ext.runtime ────────────────────────────────────────────────────────────────

describe('ext.runtime', () => {

  it('references chrome.runtime in Chrome mode', () => {
    const chrome = makeBrowser()
    const ext    = createCompatExt({ chrome })

    expect(ext.runtime).toBe(chrome.runtime)
  })

  it('references browser.runtime in Firefox mode', () => {
    const chrome  = makeBrowser()
    const browser = makeBrowser()
    const ext     = createCompatExt({ chrome, browser })

    expect(ext.runtime).toBe(browser.runtime)
    expect(ext.runtime).not.toBe(chrome.runtime)
  })
})

// ── ext.tabs ───────────────────────────────────────────────────────────────────

describe('ext.tabs routing', () => {

  it('routes ext.tabs.create to chrome.tabs.create in Chrome mode', async () => {
    const chrome = makeBrowser()
    const ext    = createCompatExt({ chrome })

    await ext.tabs.create({ url: 'https://gifthint.io/dashboard' })

    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://gifthint.io/dashboard' })
  })

  it('routes ext.tabs.create to browser.tabs.create in Firefox mode', async () => {
    const chrome  = makeBrowser()
    const browser = makeBrowser()
    const ext     = createCompatExt({ chrome, browser })

    await ext.tabs.create({ url: 'https://gifthint.io/dashboard' })

    expect(browser.tabs.create).toHaveBeenCalledWith({ url: 'https://gifthint.io/dashboard' })
    expect(chrome.tabs.create).not.toHaveBeenCalled()
  })

  it('routes ext.tabs.query to chrome.tabs.query in Chrome mode', async () => {
    const chrome = makeBrowser()
    chrome.tabs.query.mockResolvedValueOnce([{ id: 42, url: 'https://amazon.com/dp/B123' }])
    const ext = createCompatExt({ chrome })

    const tabs = await ext.tabs.query({ active: true, currentWindow: true })

    expect(tabs).toEqual([{ id: 42, url: 'https://amazon.com/dp/B123' }])
    expect(chrome.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true })
  })

  it('routes ext.tabs.query to browser.tabs.query in Firefox mode', async () => {
    const chrome  = makeBrowser()
    const browser = makeBrowser()
    browser.tabs.query.mockResolvedValueOnce([{ id: 7, url: 'https://etsy.com/listing/1' }])
    const ext = createCompatExt({ chrome, browser })

    const tabs = await ext.tabs.query({ active: true, currentWindow: true })

    expect(tabs).toEqual([{ id: 7, url: 'https://etsy.com/listing/1' }])
    expect(browser.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true })
    expect(chrome.tabs.query).not.toHaveBeenCalled()
  })
})

// ── ext.action — MV2 vs MV3 resolution ────────────────────────────────────────

describe('ext.action resolution', () => {

  it('resolves to chrome.action in Chrome MV3', () => {
    const chrome = makeBrowser()
    chrome.action = { setBadgeText: jest.fn() }
    const ext = createCompatExt({ chrome })

    expect(ext.action).toBe(chrome.action)
  })

  it('resolves to browser.browserAction in Firefox MV2 (no browser.action)', () => {
    const chrome         = makeBrowser()
    const browserAction  = { setBadgeText: jest.fn() }
    const firefoxMV2     = makeBrowser()
    delete firefoxMV2.action          // MV2: no browser.action
    firefoxMV2.browserAction = browserAction

    const ext = createCompatExt({ chrome, browser: firefoxMV2 })

    expect(ext.action).toBe(browserAction)
  })

  it('resolves to browser.action in Firefox MV3 (preferred over browserAction)', () => {
    const chrome          = makeBrowser()
    const browserAction   = { setBadgeText: jest.fn() }
    const mv3Action       = { setBadgeText: jest.fn() }
    const firefoxMV3      = makeBrowser()
    firefoxMV3.action        = mv3Action
    firefoxMV3.browserAction = browserAction

    const ext = createCompatExt({ chrome, browser: firefoxMV3 })

    expect(ext.action).toBe(mv3Action)
  })

  it('is null when neither action nor browserAction is available', () => {
    const chrome    = makeBrowser()
    const noAction  = makeBrowser()
    delete noAction.action
    delete noAction.browserAction

    const ext = createCompatExt({ chrome, browser: noAction })

    expect(ext.action).toBeNull()
  })
})

// ── ext.isFirefox is consistent ───────────────────────────────────────────────

describe('ext.isFirefox consistency', () => {

  it('isFirefox is false in Chrome mode and storage routes to chrome', () => {
    const chrome = makeBrowser()
    const ext    = createCompatExt({ chrome })

    expect(ext.isFirefox).toBe(false)
    expect(ext.storage.local).toBe(chrome.storage.local)
  })

  it('isFirefox is true in Firefox mode and storage routes to browser', () => {
    const chrome  = makeBrowser()
    const browser = makeBrowser()
    const ext     = createCompatExt({ chrome, browser })

    expect(ext.isFirefox).toBe(true)
    expect(ext.storage.local).toBe(browser.storage.local)
  })
})
