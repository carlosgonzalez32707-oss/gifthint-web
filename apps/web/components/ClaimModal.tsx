/**
 * components/ClaimModal.tsx — GiftHint
 *
 * Modal / bottom-sheet that lets a gifter claim a wishlist item.
 *
 * Layout:
 *   mobile  → bottom sheet (slides up from bottom, rounded-t-2xl)
 *   desktop → centered card (sm:rounded-2xl, sm:items-center)
 *
 * Phase state machine:
 *   'form'           — name input + anon checkbox + CTA
 *   'submitting'     — CTA shows spinner, inputs disabled
 *   'already_claimed'— someone beat them to it; offer "Buy anyway"
 *
 * On confirm:
 *   POST /api/claim → open affiliate URL in new tab → close modal → call onClaimed()
 */

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { tokens } from '@/tokens'
import type { WishlistItem } from '@/types/wishlist'

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = 'form' | 'submitting' | 'already_claimed'

export interface ClaimModalProps {
  /** null = modal is hidden */
  item:      WishlistItem | null
  ownerName: string
  onClose:   () => void
  onClaimed: (update: { claimedBy: string | null; anonymous: boolean }) => void
}

// ── Price formatting ──────────────────────────────────────────────────────────

function formatPrice(price: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style:                 'currency',
      currency,
      minimumFractionDigits: price % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(price)
  } catch {
    return `$${price.toFixed(2)}`
  }
}

// ── Spinner icon ──────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      style={{
        animation:   'gh-spin 0.7s linear infinite',
        flexShrink:  0,
      }}
    >
      <circle
        cx="7" cy="7" r="5.5"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth="2"
      />
      <path
        d="M7 1.5A5.5 5.5 0 0 1 12.5 7"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

// ── CloseIcon ─────────────────────────────────────────────────────────────────

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3 3l10 10M13 3L3 13"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}

// ── ClaimModal ────────────────────────────────────────────────────────────────

export function ClaimModal({ item, ownerName, onClose, onClaimed }: ClaimModalProps) {
  const [phase,     setPhase]     = useState<Phase>('form')
  const [name,      setName]      = useState('')
  const [anonymous, setAnonymous] = useState(false)
  const [visible,   setVisible]   = useState(false)

  const nameInputRef = useRef<HTMLInputElement>(null)
  const prevItemId   = useRef<string | null>(null)

  // Reset state when a new item is opened; trigger enter animation
  useEffect(() => {
    if (item && item.id !== prevItemId.current) {
      prevItemId.current = item.id
      setPhase('form')
      setName('')
      setAnonymous(false)
      // Two-frame trick: set visible after paint so CSS transition fires
      setVisible(false)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setVisible(true)
          // Auto-focus name input after animation starts
          setTimeout(() => nameInputRef.current?.focus(), 80)
        })
      })
    }
    if (!item) setVisible(false)
  }, [item])

  // Close on Escape
  useEffect(() => {
    if (!item) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [item, onClose])

  const handleSubmit = useCallback(async () => {
    if (!item) return
    setPhase('submitting')

    const finalName = anonymous ? null : name.trim().slice(0, 80) || null

    try {
      const res  = await fetch('/api/claim', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          itemId:    item.id,
          claimedBy: finalName,
          anonymous,
        }),
      })

      if (res.status === 409) {
        setPhase('already_claimed')
        return
      }

      if (!res.ok) {
        // Unexpected error — re-enable form
        setPhase('form')
        return
      }

      // Success: open retailer URL then notify parent
      const buyUrl = item.affiliate_url ?? item.source_url
      window.open(buyUrl, '_blank', 'noopener,noreferrer')
      onClaimed({ claimedBy: finalName, anonymous })
      onClose()

    } catch {
      setPhase('form')
    }
  }, [item, name, anonymous, onClaimed, onClose])

  // "Buy anyway" from the already-claimed state — just opens the URL
  const handleBuyAnyway = useCallback(() => {
    if (!item) return
    const buyUrl = item.affiliate_url ?? item.source_url
    window.open(buyUrl, '_blank', 'noopener,noreferrer')
    onClose()
  }, [item, onClose])

  if (!item) return null

  const retailerLabel = item.retailer
    ? item.retailer.charAt(0).toUpperCase() + item.retailer.slice(1)
    : 'Store'

  const priceLabel = item.price != null
    ? ` · ${formatPrice(item.price, item.currency)}`
    : ''

  const isDisabled = phase === 'submitting'

  return (
    <>
      {/* ── Keyframe injection ───────────────────────────────────────────────── */}
      <style>{`
        @keyframes gh-spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* ── Backdrop ─────────────────────────────────────────────────────────── */}
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{
          position:        'fixed',
          inset:           0,
          zIndex:          9998,
          background:      'rgba(0,0,0,0.65)',
          backdropFilter:  'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          opacity:         visible ? 1 : 0,
          transition:      'opacity 220ms ease',
        }}
      />

      {/* ── Modal wrapper — bottom-sheet on mobile, centered on desktop ───────── */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Claim ${item.title}`}
        style={{
          position:        'fixed',
          inset:           0,
          zIndex:          9999,
          display:         'flex',
          alignItems:      'flex-end',   // bottom-sheet on mobile
          justifyContent:  'center',
          padding:         '0',
          pointerEvents:   'none',
        }}
      >
        {/* ── Card ───────────────────────────────────────────────────────────── */}
        <div
          style={{
            pointerEvents:    'auto',
            width:            '100%',
            maxWidth:         '480px',
            background:       tokens.colors.surface,
            borderTop:        `1px solid ${tokens.colors.border}`,
            borderLeft:       `1px solid ${tokens.colors.border}`,
            borderRight:      `1px solid ${tokens.colors.border}`,
            borderRadius:     '20px 20px 0 0',
            padding:          '24px 20px 32px',
            boxShadow:        tokens.shadow.pop,
            // Enter animation: slide up + fade
            opacity:          visible ? 1 : 0,
            transform:        visible ? 'translateY(0)' : 'translateY(16px)',
            transition:       'opacity 220ms ease, transform 220ms ease',
            // Desktop: centered card
            ...(typeof window !== 'undefined' && window.innerWidth >= 640
              ? { borderRadius: '20px', marginBottom: '0', alignSelf: 'center' }
              : {}),
          }}
        >
          {/* ── Close button ─────────────────────────────────────────────────── */}
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              position:   'absolute',
              top:        '16px',
              right:      '16px',
              background: tokens.colors.surface2,
              border:     `1px solid ${tokens.colors.border}`,
              borderRadius: '50%',
              width:      '28px',
              height:     '28px',
              display:    'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor:     'pointer',
              color:      tokens.colors.muted,
              padding:    0,
            }}
          >
            <CloseIcon />
          </button>

          {/* ── Item preview ─────────────────────────────────────────────────── */}
          <div
            style={{
              display:     'flex',
              gap:         '12px',
              alignItems:  'flex-start',
              marginBottom: '16px',
              paddingRight: '28px',   // clear close button
            }}
          >
            {/* Thumbnail */}
            {item.image_url && (
              <div
                style={{
                  flexShrink:   0,
                  width:        '52px',
                  height:       '52px',
                  borderRadius: tokens.radius.md,
                  overflow:     'hidden',
                  background:   tokens.colors.surface2,
                  border:       `1px solid ${tokens.colors.border}`,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.image_url}
                  alt=""
                  aria-hidden="true"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
            )}

            {/* Title + price */}
            <div>
              <p
                style={{
                  fontSize:   '13.5px',
                  fontWeight: 600,
                  color:      tokens.colors.text,
                  lineHeight: 1.35,
                  marginBottom: '3px',
                  display:    '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow:   'hidden',
                }}
              >
                {item.title}
              </p>
              {item.price != null && (
                <p
                  style={{
                    fontSize:   '12px',
                    fontWeight: 500,
                    color:      tokens.colors.green,
                  }}
                >
                  {formatPrice(item.price, item.currency)}
                </p>
              )}
            </div>
          </div>

          {/* ── Privacy bar ──────────────────────────────────────────────────── */}
          <div
            style={{
              display:      'flex',
              alignItems:   'flex-start',
              gap:          '8px',
              background:   '#3D2E12',
              borderRadius: tokens.radius.md,
              padding:      '10px 12px',
              marginBottom: '20px',
            }}
          >
            <span style={{ fontSize: '13px', lineHeight: 1 }}>🔒</span>
            <p
              style={{
                fontSize:   '11.5px',
                color:      tokens.colors.amber,
                lineHeight: 1.5,
                margin:     0,
              }}
            >
              {ownerName} won{"'"}t see who claimed this until after the occasion — so
              the surprise is safe.
            </p>
          </div>

          {/* ── Phase: form ──────────────────────────────────────────────────── */}
          {(phase === 'form' || phase === 'submitting') && (
            <>
              {/* Name input */}
              <label
                htmlFor="claim-name"
                style={{
                  display:    'block',
                  fontSize:   '11.5px',
                  fontWeight: 600,
                  color:      tokens.colors.muted,
                  marginBottom: '6px',
                  letterSpacing: '0.03em',
                  textTransform: 'uppercase',
                }}
              >
                Your name
              </label>
              <input
                id="claim-name"
                ref={nameInputRef}
                type="text"
                placeholder={anonymous ? 'Staying anonymous…' : 'e.g. Aunt Maria'}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isDisabled || anonymous}
                maxLength={80}
                onKeyDown={(e) => { if (e.key === 'Enter' && !isDisabled) handleSubmit() }}
                style={{
                  width:        '100%',
                  boxSizing:    'border-box',
                  background:   anonymous ? tokens.colors.surface2 : tokens.colors.surface2,
                  border:       `1px solid ${tokens.colors.border}`,
                  borderRadius: tokens.radius.sm,
                  padding:      '10px 12px',
                  fontSize:     '13.5px',
                  color:        anonymous ? tokens.colors.muted : tokens.colors.text,
                  outline:      'none',
                  marginBottom: '12px',
                  opacity:      anonymous ? 0.6 : 1,
                  transition:   'opacity 150ms ease, border-color 150ms ease',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = tokens.colors.purple
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = tokens.colors.border
                }}
              />

              {/* Anonymous checkbox */}
              <label
                style={{
                  display:    'flex',
                  alignItems: 'center',
                  gap:        '8px',
                  cursor:     isDisabled ? 'default' : 'pointer',
                  marginBottom: '20px',
                }}
              >
                <input
                  type="checkbox"
                  checked={anonymous}
                  onChange={(e) => {
                    setAnonymous(e.target.checked)
                    if (e.target.checked) setName('')
                  }}
                  disabled={isDisabled}
                  style={{ accentColor: tokens.colors.purple, width: '14px', height: '14px' }}
                />
                <span
                  style={{
                    fontSize:   '12.5px',
                    color:      tokens.colors.muted,
                    userSelect: 'none',
                  }}
                >
                  Stay anonymous
                </span>
              </label>

              {/* CTA button */}
              <button
                onClick={handleSubmit}
                disabled={isDisabled}
                style={{
                  width:        '100%',
                  display:      'flex',
                  alignItems:   'center',
                  justifyContent: 'center',
                  gap:          '8px',
                  background:   tokens.colors.purple,
                  color:        '#fff',
                  border:       'none',
                  borderRadius: tokens.radius.md,
                  padding:      '13px 16px',
                  fontSize:     '13.5px',
                  fontWeight:   700,
                  cursor:       isDisabled ? 'default' : 'pointer',
                  opacity:      isDisabled ? 0.75 : 1,
                  transition:   'opacity 150ms ease',
                  letterSpacing: '0.1px',
                }}
              >
                {phase === 'submitting' ? (
                  <>
                    <Spinner />
                    Confirming…
                  </>
                ) : (
                  `Continue to ${retailerLabel}${priceLabel} →`
                )}
              </button>

              {/* Fine print */}
              <p
                style={{
                  fontSize:   '10.5px',
                  color:      tokens.colors.muted,
                  textAlign:  'center',
                  marginTop:  '10px',
                  opacity:    0.7,
                  lineHeight: 1.5,
                }}
              >
                Opens retailer in a new tab. Item will be marked as claimed.
              </p>
            </>
          )}

          {/* ── Phase: already_claimed ───────────────────────────────────────── */}
          {phase === 'already_claimed' && (
            <div style={{ textAlign: 'center' }}>
              <p
                style={{
                  fontSize:   '36px',
                  lineHeight: 1,
                  marginBottom: '10px',
                }}
                aria-hidden="true"
              >
                😬
              </p>
              <p
                style={{
                  fontSize:   '14.5px',
                  fontWeight: 700,
                  color:      tokens.colors.text,
                  marginBottom: '6px',
                }}
              >
                Someone is already gifting this
              </p>
              <p
                style={{
                  fontSize:   '12.5px',
                  color:      tokens.colors.muted,
                  lineHeight: 1.55,
                  maxWidth:   '300px',
                  margin:     '0 auto 20px',
                }}
              >
                Another gifter just claimed this item. You can still buy it — just
                coordinate with the group so {ownerName} doesn{"'"}t receive two!
              </p>

              {/* Buy anyway */}
              <button
                onClick={handleBuyAnyway}
                style={{
                  width:        '100%',
                  background:   tokens.colors.purple,
                  color:        '#fff',
                  border:       'none',
                  borderRadius: tokens.radius.md,
                  padding:      '12px 16px',
                  fontSize:     '13px',
                  fontWeight:   700,
                  cursor:       'pointer',
                  marginBottom: '10px',
                  letterSpacing: '0.1px',
                }}
              >
                Buy anyway on {retailerLabel} →
              </button>

              {/* Back to list */}
              <button
                onClick={onClose}
                style={{
                  width:        '100%',
                  background:   'transparent',
                  color:        tokens.colors.muted,
                  border:       `1px solid ${tokens.colors.border}`,
                  borderRadius: tokens.radius.md,
                  padding:      '11px 16px',
                  fontSize:     '12.5px',
                  fontWeight:   600,
                  cursor:       'pointer',
                }}
              >
                Back to list
              </button>
            </div>
          )}

        </div>
      </div>

      {/* ── Desktop layout override via media query ──────────────────────────── */}
      <style>{`
        @media (min-width: 640px) {
          [data-gh-modal-wrapper] {
            align-items: center !important;
            padding: 24px !important;
          }
          [data-gh-modal-card] {
            border-radius: 20px !important;
            border: 1px solid ${tokens.colors.border} !important;
          }
        }
      `}</style>
    </>
  )
}
