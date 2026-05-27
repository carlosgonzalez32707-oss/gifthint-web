/**
 * components/ShareListButton.tsx — GiftHint
 *
 * Smart share button used on gifter pages and the dashboard.
 *
 * Behaviour by context:
 *   Mobile (navigator.share available) → native iOS/Android share sheet,
 *     which lets the user pick Messages, WhatsApp, iMessage, AirDrop, etc.
 *   Desktop → clipboard copy + optional WhatsApp and Twitter/X share links
 *     revealed in a small popover below the button.
 *
 * Share text format:
 *   "I've added [X] things to my [occasion] wishlist — you can buy me exactly
 *    what I want! 🎁 [URL]"
 *
 * Props:
 *   listUrl       — full https URL of the gifter page
 *   itemCount     — how many items on the list (used in the share message)
 *   occasion      — occasion key (birthday, christmas, …) for label
 *   occasionLabel — human-readable label ("Birthday", "Christmas", …)
 *   compact       — renders a smaller icon-only pill (default: false)
 */

'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { tokens }                                   from '@/tokens'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ShareListButtonProps {
  listUrl:       string
  itemCount:     number
  occasionLabel: string
  /** Optional accent colour from OccasionThemeContext — falls back to purple */
  accent?:       string
  compact?:      boolean
  className?:    string
}

// ── Design tokens ─────────────────────────────────────────────────────────────

const c = tokens.colors
const r = tokens.radius

// ── Helpers ────────────────────────────────────────────────────────────────────

export function buildShareText(itemCount: number, occasionLabel: string, url: string): string {
  const label = occasionLabel.toLowerCase()
  const count = itemCount > 0 ? itemCount : 'some'
  return `I've added ${count} thing${count !== 1 ? 's' : ''} to my ${label} wishlist — you can buy me exactly what I want! 🎁 ${url}`
}

function supportsNativeShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
}

// ── ShareListButton ────────────────────────────────────────────────────────────

export function ShareListButton({
  listUrl,
  itemCount,
  occasionLabel,
  accent   = c.purple,
  compact  = false,
  className,
}: ShareListButtonProps) {
  const shareText = buildShareText(itemCount, occasionLabel, listUrl)

  const [state,     setState]     = useState<'idle' | 'copied' | 'error'>('idle')
  const [popover,   setPopover]   = useState(false)
  const popoverRef                = useRef<HTMLDivElement>(null)
  const buttonRef                 = useRef<HTMLButtonElement>(null)

  // Close popover on outside click
  useEffect(() => {
    if (!popover) return
    function onDown(e: MouseEvent) {
      if (
        popoverRef.current  && !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current   && !buttonRef.current.contains(e.target as Node)
      ) {
        setPopover(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [popover])

  // ── Native share (mobile) ──────────────────────────────────────────────────
  const handleNativeShare = useCallback(async () => {
    try {
      await navigator.share({
        title: `${occasionLabel} wish list`,
        text:  shareText,
        url:   listUrl,
      })
    } catch {
      // User cancelled or permission denied — not an error worth surfacing
    }
  }, [listUrl, occasionLabel, shareText])

  // ── Copy to clipboard (desktop) ────────────────────────────────────────────
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(listUrl)
      setState('copied')
      setTimeout(() => setState('idle'), 2_200)
    } catch {
      setState('error')
      setTimeout(() => setState('idle'), 2_200)
    }
  }, [listUrl])

  // ── Main click handler ─────────────────────────────────────────────────────
  const handleClick = useCallback(() => {
    if (supportsNativeShare()) {
      handleNativeShare()
    } else {
      setPopover((prev) => !prev)
      // Also immediately copy the link on first click so clipboard is ready
      handleCopy()
    }
  }, [handleNativeShare, handleCopy])

  // ── Social share URLs ──────────────────────────────────────────────────────
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`
  const twitterUrl  = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`

  // ── Label / icon for the main button ──────────────────────────────────────
  const buttonLabel =
    state === 'copied' ? (compact ? '✓' : '✓ Link copied!')  :
    state === 'error'  ? (compact ? '?' : 'Copy failed')     :
    compact            ? '🔗'                                  :
                         '🔗 Share list'

  const isSuccess = state === 'copied'

  return (
    <div style={{ position: 'relative', display: 'inline-block' }} className={className}>

      {/* ── Main share button ─────────────────────────────────────────────── */}
      <button
        ref={buttonRef}
        onClick={handleClick}
        aria-label="Share this wish list"
        style={{
          display:      'inline-flex',
          alignItems:   'center',
          gap:          compact ? '0' : '6px',
          padding:      compact ? '8px 12px' : '9px 18px',
          borderRadius: r.pill,
          background:   isSuccess
            ? c.greenDim
            : `rgba(${hexComponents(accent)},0.12)`,
          border:       `1px solid ${isSuccess
            ? c.greenRing
            : `rgba(${hexComponents(accent)},0.30)`}`,
          color:        isSuccess ? c.green : accent,
          fontSize:     compact ? '14px' : '13px',
          fontWeight:   600,
          fontFamily:   tokens.font.sans,
          cursor:       'pointer',
          transition:   'background 150ms, border-color 150ms, color 150ms',
          whiteSpace:   'nowrap',
        }}
      >
        {buttonLabel}
      </button>

      {/* ── Desktop popover ───────────────────────────────────────────────── */}
      {popover && !supportsNativeShare() && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Share options"
          style={{
            position:     'absolute',
            top:          'calc(100% + 8px)',
            left:         compact ? 'auto' : '0',
            right:        compact ? '0'    : 'auto',
            zIndex:       50,
            background:   c.surface,
            border:       `1px solid ${c.borderSoft}`,
            borderRadius: r.lg,
            boxShadow:    tokens.shadow.pop,
            padding:      '12px',
            minWidth:     '220px',
            display:      'flex',
            flexDirection:'column',
            gap:          '6px',
          }}
        >
          {/* Copied confirmation row */}
          <div
            style={{
              display:      'flex',
              alignItems:   'center',
              gap:          '8px',
              padding:      '9px 12px',
              borderRadius: r.md,
              background:   state === 'copied' ? c.greenDim : c.surface2,
              border:       `1px solid ${state === 'copied' ? c.greenRing : c.border}`,
              fontSize:     '13px',
              color:        state === 'copied' ? c.green : c.muted,
              fontFamily:   tokens.font.sans,
            }}
          >
            <span style={{ flexShrink: 0 }}>{state === 'copied' ? '✓' : '🔗'}</span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {state === 'copied' ? 'Link copied to clipboard!' : listUrl.replace('https://', '')}
            </span>
            {state !== 'copied' && (
              <button
                onClick={handleCopy}
                style={{
                  background:   'transparent',
                  border:       'none',
                  color:        accent,
                  fontSize:     '12px',
                  fontWeight:   600,
                  cursor:       'pointer',
                  padding:      '0',
                  flexShrink:   0,
                  fontFamily:   tokens.font.sans,
                }}
              >
                Copy
              </button>
            )}
          </div>

          {/* Divider */}
          <div style={{ height: '1px', background: c.border, margin: '2px 0' }} />

          {/* WhatsApp */}
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display:        'flex',
              alignItems:     'center',
              gap:            '10px',
              padding:        '9px 12px',
              borderRadius:   r.md,
              textDecoration: 'none',
              color:          '#25D366',
              fontSize:       '13px',
              fontWeight:     600,
              fontFamily:     tokens.font.sans,
              background:     'rgba(37,211,102,0.07)',
              border:         '1px solid rgba(37,211,102,0.18)',
            }}
          >
            <span style={{ fontSize: '16px' }}>💬</span>
            Share on WhatsApp
          </a>

          {/* Twitter/X */}
          <a
            href={twitterUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display:        'flex',
              alignItems:     'center',
              gap:            '10px',
              padding:        '9px 12px',
              borderRadius:   r.md,
              textDecoration: 'none',
              color:          '#1DA1F2',
              fontSize:       '13px',
              fontWeight:     600,
              fontFamily:     tokens.font.sans,
              background:     'rgba(29,161,242,0.07)',
              border:         '1px solid rgba(29,161,242,0.18)',
            }}
          >
            <span style={{ fontSize: '15px', fontWeight: 900 }}>𝕏</span>
            Post on Twitter/X
          </a>
        </div>
      )}
    </div>
  )
}

// ── Internal hex helper (keeps this file self-contained) ─────────────────────

function hexComponents(hex: string): string {
  try {
    const h = hex.replace('#', '')
    const r = parseInt(h.slice(0, 2), 16)
    const g = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    return `${r},${g},${b}`
  } catch {
    return '139,131,240' // purple fallback
  }
}
