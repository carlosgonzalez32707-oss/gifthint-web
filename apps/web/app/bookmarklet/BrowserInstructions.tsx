'use client'

/**
 * app/bookmarklet/BrowserInstructions.tsx — GiftHint
 *
 * Client component — renders a tabbed step-by-step install guide for
 * Chrome, Safari, Firefox, Edge, and iOS Shortcuts, plus a separate
 * iOS / Android bookmarklet section.
 *
 * Accepts the minified bookmarklet href so the "copy javascript: URL"
 * fallback on mobile shows the correct string.
 */

import { useState } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────

type BrowserId = 'chrome' | 'safari' | 'firefox' | 'edge' | 'shortcuts'

interface BrowserTab {
  id:       BrowserId
  label:    string
  shortcut?: string
  steps:    string[]
}

// ── Data ───────────────────────────────────────────────────────────────────────

const BROWSERS: BrowserTab[] = [
  {
    id:       'chrome',
    label:    'Chrome',
    shortcut: '⌘ Shift B  (Mac) · Ctrl Shift B  (Windows)',
    steps: [
      'Show your bookmarks bar — press ⌘ Shift B on Mac or Ctrl Shift B on Windows. A bar appears below the address bar.',
      'Drag the purple "🎁 Save to GiftHint" button above and drop it anywhere on the bookmarks bar.',
      'Visit any product page on Amazon, Etsy, ASOS, or anywhere else. Click the bookmark. A save window opens.',
    ],
  },
  {
    id:       'safari',
    label:    'Safari',
    shortcut: '⌘ Shift B',
    steps: [
      'Show your Favorites Bar — press ⌘ Shift B, or go to View → Show Favorites Bar.',
      'Drag the purple "🎁 Save to GiftHint" button above and drop it onto the Favorites Bar.',
      'Visit any product page and click the bookmark. The GiftHint save sheet opens in a popup.',
    ],
  },
  {
    id:       'firefox',
    label:    'Firefox',
    shortcut: '⌘ Shift B  (Mac) · Ctrl Shift B  (Windows)',
    steps: [
      'Show your bookmarks toolbar — press ⌘ Shift B (Mac) or Ctrl Shift B (Windows), or go to View → Toolbars → Bookmarks Toolbar.',
      'Drag the purple "🎁 Save to GiftHint" button and drop it onto the toolbar.',
      'Visit any product page and click the bookmark. The GiftHint save popup opens.',
    ],
  },
  {
    id:       'edge',
    label:    'Edge',
    shortcut: '⌘ Shift B  (Mac) · Ctrl Shift B  (Windows)',
    steps: [
      'Show the Favorites Bar — press Ctrl Shift B (Windows) or ⌘ Shift B (Mac), or go to Settings → Appearance → Favorites Bar.',
      'Drag the purple "🎁 Save to GiftHint" button and drop it onto the Favorites Bar.',
      'Visit any product page and click the bookmark to open the GiftHint save window.',
    ],
  },
  {
    id:    'shortcuts',
    label: 'iOS',
    steps: [
      'Open the Shortcuts app on your iPhone or iPad. Tap + to create a new Shortcut.',
      'Tap "Add Action" → search for "Run JavaScript on Webpage" → add it. Paste the GiftHint script (download button below) into the script field.',
      'Add a second action: "Open URL". In the URL field, tap the Magic Variable icon and select the result from Step 1. Then type:\n\nhttps://gifthint.io/save?source=ios_share&url=[url]&title=[title]&image=[image]&price=[price]&currency=[currency]',
      'Tap the Shortcut name at the top and rename it "Save to GiftHint". Tap Done.',
      'While browsing a product in Safari, tap the Share button (□↑) → scroll down → tap "Save to GiftHint". The save sheet opens in Safari.',
    ],
  },
]

// ── Component ──────────────────────────────────────────────────────────────────

export function BrowserInstructions({ bookmarkletHref }: { bookmarkletHref: string }) {
  const [activeId, setActiveId] = useState<BrowserId>('chrome')
  const [copied,   setCopied]   = useState(false)

  const activeBrowser = BROWSERS.find(b => b.id === activeId)!
  const isShortcuts   = activeId === 'shortcuts'

  function copyHref() {
    navigator.clipboard.writeText(bookmarkletHref).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  return (
    <div>

      {/* ── Desktop/iOS browser tabs ─────────────────────────────────────── */}
      <section style={{ marginBottom: '48px' }}>
        <h2 style={{
          fontSize: '13px', fontWeight: 700, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: '#7A7870', marginBottom: '16px',
        }}>
          Step-by-step for your browser
        </h2>

        {/* Tab bar */}
        <div style={{
          display: 'flex', gap: '4px', padding: '4px',
          background: '#1C1C22', borderRadius: '10px',
          border: '1px solid rgba(240,238,232,0.08)',
          marginBottom: '24px',
        }}>
          {BROWSERS.map(b => (
            <button
              key={b.id}
              onClick={() => setActiveId(b.id)}
              style={{
                flex: 1, padding: '8px 0', borderRadius: '7px', border: 'none',
                fontFamily: 'inherit', fontSize: '13px', fontWeight: 600,
                cursor: 'pointer', transition: 'all 120ms ease',
                background: activeId === b.id ? '#8B83F0' : 'transparent',
                color:      activeId === b.id ? '#fff'     : '#7A7870',
              }}
            >
              {b.label}
            </button>
          ))}
        </div>

        {/* Steps */}
        <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {activeBrowser.steps.map((step, i) => (
            <li key={i} style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
              <span style={{
                flexShrink: 0,
                width: '26px', height: '26px',
                borderRadius: '50%',
                background: isShortcuts ? 'rgba(78,201,154,0.15)' : 'rgba(139,131,240,0.18)',
                border: isShortcuts
                  ? '1px solid rgba(78,201,154,0.3)'
                  : '1px solid rgba(139,131,240,0.35)',
                color: isShortcuts ? '#4EC99A' : '#8B83F0',
                fontSize: '12px', fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {i + 1}
              </span>
              <span style={{
                color: '#C8C4BC', fontSize: '14px', lineHeight: 1.6,
                paddingTop: '3px', whiteSpace: 'pre-line',
              }}>
                {step}
              </span>
            </li>
          ))}
        </ol>

        {/* Shortcut: keyboard hint OR iOS Shortcuts script download */}
        {!isShortcuts && activeBrowser.shortcut && (
          <p style={{
            marginTop: '18px', fontSize: '12px', color: '#7A7870',
            padding: '10px 14px', background: '#1C1C22',
            borderRadius: '8px', border: '1px solid rgba(240,238,232,0.07)',
          }}>
            💡 <strong style={{ color: '#A09AF2' }}>Shortcut to show bookmarks bar:</strong>{' '}
            {activeBrowser.shortcut}
          </p>
        )}

        {isShortcuts && (
          <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Download script button */}
            <a
              href="/gifthint-share.js"
              download="gifthint-share.js"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                gap: '8px', padding: '12px 20px', borderRadius: '10px',
                background: 'rgba(78,201,154,0.12)',
                border: '1px solid rgba(78,201,154,0.35)',
                color: '#4EC99A', textDecoration: 'none',
                fontFamily: 'inherit', fontSize: '13px', fontWeight: 700,
                textAlign: 'center',
              }}
            >
              ↓ Download GiftHint Shortcuts script
            </a>

            <p style={{
              fontSize: '12px', color: '#7A7870',
              padding: '10px 14px', background: '#1C1C22',
              borderRadius: '8px', border: '1px solid rgba(240,238,232,0.07)',
              lineHeight: 1.6, margin: 0,
            }}>
              💡 <strong style={{ color: '#4EC99A' }}>Tip:</strong>{' '}
              After creating the Shortcut, long-press its icon → Edit → enable{' '}
              <em>Show in Share Sheet</em> so it appears every time you tap Share in Safari.
            </p>
          </div>
        )}
      </section>

      {/* ── iOS / Android bookmarklet fallback ───────────────────────────── */}
      <section style={{
        borderRadius: '14px',
        border: '1px solid rgba(240,238,232,0.1)',
        background: '#13131A',
        padding: '24px',
        marginBottom: '48px',
      }}>
        <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#F0EEE8', marginBottom: '6px' }}>
          📱 iPhone / iPad — bookmarklet alternative
        </h2>
        <p style={{ fontSize: '13px', color: '#7A7870', marginBottom: '20px', lineHeight: 1.6 }}>
          Prefer not to use Shortcuts? You can manually install the bookmarklet
          in Safari — it takes about 60 seconds.
        </p>

        <ol style={{ listStyle: 'none', padding: 0, margin: '0 0 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[
            'Bookmark this page — tap the Share button (□↑) at the bottom of Safari, then tap "Add Bookmark". Name it anything.',
            'Open your Bookmarks — tap the book icon in the toolbar, find the bookmark you just created.',
            'Long-press the bookmark and tap "Edit". Replace everything in the URL/Address field with the code below.',
            'Tap Save. Now visit any product page, tap the bookmark, and the GiftHint save sheet will open.',
          ].map((step, i) => (
            <li key={i} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <span style={{
                flexShrink: 0, width: '24px', height: '24px', borderRadius: '50%',
                background: 'rgba(78,201,154,0.15)', border: '1px solid rgba(78,201,154,0.3)',
                color: '#4EC99A', fontSize: '11px', fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {i + 1}
              </span>
              <span style={{ fontSize: '13px', color: '#C8C4BC', lineHeight: 1.6, paddingTop: '3px' }}>
                {step}
              </span>
            </li>
          ))}
        </ol>

        {/* javascript: URL copy block */}
        <div style={{
          background: '#0C0C0E', borderRadius: '8px',
          border: '1px solid rgba(240,238,232,0.1)',
          padding: '12px 14px', marginBottom: '12px',
        }}>
          <p style={{ fontSize: '11px', color: '#7A7870', marginBottom: '8px', fontWeight: 600 }}>
            PASTE THIS AS YOUR BOOKMARK URL:
          </p>
          <code style={{
            display: 'block', fontSize: '11px', color: '#A09AF2',
            wordBreak: 'break-all', lineHeight: 1.5,
            maxHeight: '80px', overflow: 'hidden',
          }}>
            {bookmarkletHref.slice(0, 200)}&hellip;
          </code>
        </div>

        <button
          onClick={copyHref}
          style={{
            width: '100%', padding: '10px', borderRadius: '8px',
            border: '1px solid rgba(139,131,240,0.4)',
            background: copied ? 'rgba(78,201,154,0.12)' : 'rgba(139,131,240,0.12)',
            color:  copied ? '#4EC99A' : '#8B83F0',
            fontFamily: 'inherit', fontSize: '13px', fontWeight: 700,
            cursor: 'pointer', transition: 'all 150ms ease',
          }}
        >
          {copied ? '✓ Copied to clipboard' : '📋 Copy bookmarklet code'}
        </button>
      </section>

    </div>
  )
}
