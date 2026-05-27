/**
 * components/ChipInModal.tsx — GiftHint
 *
 * Stripe payment modal for group-gift contributions.
 * Follows the same bottom-sheet / centered-card pattern as ClaimModal.tsx.
 *
 * Phase state machine:
 *   'form'       — name / email / anonymous / Stripe Elements card input
 *   'processing' — payment in-flight, inputs disabled
 *   'success'    — thank-you screen
 *   'error'      — Stripe or API error with retry option
 *
 * Flow:
 *   1. POST /api/group-gift/contribute → receives { clientSecret }
 *   2. stripe.confirmPayment() with Stripe Elements
 *   3. On success → show thank-you, call onContributed()
 *
 * NOTE: This component must be wrapped in a <Stripe Elements> provider at
 * the page level (see GroupGiftCard.tsx which supplies the StripeProvider).
 */

'use client'

import {
  useState,
  useEffect,
  useRef,
  useCallback,
}                               from 'react'
import {
  PaymentElement,
  useStripe,
  useElements,
}                               from '@stripe/react-stripe-js'
import { tokens }               from '@/tokens'
import type { WishlistItem }    from '@/types/wishlist'

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = 'form' | 'processing' | 'success' | 'error'

export interface ChipInModalProps {
  item:            WishlistItem | null
  poolId:          string | null
  amount:          number        // major currency units e.g. 10.00
  currency?:       string        // default 'gbp'
  onClose:         () => void
  onContributed:   () => void    // called after successful payment
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatMoney(amount: number, currency = 'gbp'): string {
  try {
    return new Intl.NumberFormat('en-GB', {
      style:                 'currency',
      currency,
      minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `£${amount.toFixed(2)}`
  }
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg
      width="14" height="14" viewBox="0 0 14 14" fill="none"
      aria-hidden="true"
      style={{ animation: 'gh-spin 0.7s linear infinite', flexShrink: 0 }}
    >
      <circle cx="7" cy="7" r="5.5" stroke="rgba(255,255,255,0.35)" strokeWidth="2" />
      <path d="M7 1.5A5.5 5.5 0 0 1 12.5 7" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

// ── Input component ───────────────────────────────────────────────────────────

function Field({
  id, label, type = 'text', value, onChange, placeholder, disabled, required,
}: {
  id:          string
  label:       string
  type?:       string
  value:       string
  onChange:    (v: string) => void
  placeholder: string
  disabled?:   boolean
  required?:   boolean
}) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ marginBottom: '14px' }}>
      <label
        htmlFor={id}
        style={{
          display:       'block',
          fontSize:      '11px',
          fontWeight:    600,
          color:         tokens.colors.muted,
          marginBottom:  '5px',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}
      >
        {label}{required && <span style={{ color: tokens.colors.red, marginLeft: '2px' }}>*</span>}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width:        '100%',
          boxSizing:    'border-box',
          background:   tokens.colors.surface2,
          border:       `1px solid ${focused ? tokens.colors.purple : tokens.colors.border}`,
          borderRadius: tokens.radius.sm,
          padding:      '10px 12px',
          fontSize:     '13px',
          color:        tokens.colors.text,
          outline:      'none',
          transition:   'border-color 150ms ease',
          opacity:      disabled ? 0.55 : 1,
        }}
      />
    </div>
  )
}

// ── ChipInModal ───────────────────────────────────────────────────────────────

export function ChipInModal({
  item,
  poolId,
  amount,
  currency = 'gbp',
  onClose,
  onContributed,
}: ChipInModalProps) {
  const stripe   = useStripe()
  const elements = useElements()

  const [phase,         setPhase]         = useState<Phase>('form')
  const [name,          setName]          = useState('')
  const [email,         setEmail]         = useState('')
  const [anonymous,     setAnonymous]     = useState(false)
  const [clientSecret,  setClientSecret]  = useState<string | null>(null)
  const [contributionId, setContributionId] = useState<string | null>(null)
  const [errorMsg,      setErrorMsg]      = useState<string | null>(null)
  const [visible,       setVisible]       = useState(false)
  const [intentReady,   setIntentReady]   = useState(false)

  const nameRef = useRef<HTMLInputElement>(null)

  // ── Enter animation ────────────────────────────────────────────────────────
  useEffect(() => {
    if (item && poolId) {
      setPhase('form')
      setName('')
      setEmail('')
      setAnonymous(false)
      setClientSecret(null)
      setContributionId(null)
      setErrorMsg(null)
      setIntentReady(false)
      setVisible(false)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setVisible(true)
          setTimeout(() => nameRef.current?.focus(), 80)
        })
      })
    }
    if (!item) setVisible(false)
  }, [item, poolId])

  // ── Escape to close ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!item) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [item, onClose])

  // ── Create PaymentIntent when form is valid ────────────────────────────────
  // Called once the user clicks "Contribute X" — creates the pending intent
  // and stores the clientSecret so Stripe Elements can confirm it.
  const initPayment = useCallback(async (): Promise<boolean> => {
    if (!poolId) return false

    try {
      const res = await fetch('/api/group-gift/contribute', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          poolId,
          contributorName:  anonymous ? 'Anonymous' : name.trim(),
          contributorEmail: email.trim().toLowerCase(),
          amount,
          anonymous,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        const msg =
          data.message ??
          (data.error === 'pool_not_open'   ? 'This pool is no longer accepting contributions.' :
           data.error === 'amount_exceeds_remaining' ? `Maximum contribution remaining is ${formatMoney(data.remaining, currency)}.` :
           'Something went wrong. Please try again.')
        setErrorMsg(msg)
        return false
      }

      setClientSecret(data.clientSecret)
      setContributionId(data.contributionId)
      return true

    } catch {
      setErrorMsg('Network error. Please check your connection and try again.')
      return false
    }
  }, [poolId, name, email, amount, anonymous, currency])

  // ── Submit: create intent + confirm payment ────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!stripe || !elements || !item) return

    // Client-side validation
    if (!anonymous && !name.trim()) {
      setErrorMsg('Please enter your name, or check "Contribute anonymously".')
      return
    }
    if (!email.trim() || !email.includes('@')) {
      setErrorMsg('Please enter a valid email address.')
      return
    }

    setPhase('processing')
    setErrorMsg(null)

    // Step 1: create payment intent
    const ok = await initPayment()
    if (!ok) {
      setPhase('error')
      return
    }

    // Step 2: confirm payment with Stripe Elements
    // clientSecret is now set — trigger a re-render via state, then confirm
    setIntentReady(true)
  }, [stripe, elements, item, name, email, anonymous, initPayment])

  // When intentReady flips to true, clientSecret is guaranteed to be set.
  // Use an effect so Elements has had one render cycle with the clientSecret prop.
  useEffect(() => {
    if (!intentReady || !clientSecret || !stripe || !elements) return

    const confirm = async () => {
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url:     `${window.location.origin}/group-gift/thanks?c=${contributionId ?? ''}`,
          receipt_email:  email.trim().toLowerCase(),
        },
        redirect: 'if_required',
      })

      if (error) {
        setErrorMsg(error.message ?? 'Payment failed. Please try a different card.')
        setPhase('error')
        setIntentReady(false)
      } else {
        setPhase('success')
        onContributed()
      }
    }

    confirm()
  }, [intentReady, clientSecret, stripe, elements, email, contributionId, onContributed])

  if (!item || !poolId) return null

  const amountLabel = formatMoney(amount, currency)
  const isDisabled  = phase === 'processing'

  return (
    <>
      <style>{`@keyframes gh-spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── Backdrop ─────────────────────────────────────────────────────── */}
      <div
        aria-hidden="true"
        onClick={phase !== 'processing' ? onClose : undefined}
        style={{
          position:        'fixed',
          inset:           0,
          zIndex:          9998,
          background:      'rgba(0,0,0,0.70)',
          backdropFilter:  'blur(5px)',
          WebkitBackdropFilter: 'blur(5px)',
          opacity:         visible ? 1 : 0,
          transition:      'opacity 220ms ease',
        }}
      />

      {/* ── Modal ────────────────────────────────────────────────────────── */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Chip in ${amountLabel} for ${item.title}`}
        style={{
          position:       'fixed',
          inset:          0,
          zIndex:         9999,
          display:        'flex',
          alignItems:     'flex-end',
          justifyContent: 'center',
          pointerEvents:  'none',
        }}
      >
        <div
          style={{
            pointerEvents: 'auto',
            width:         '100%',
            maxWidth:      '520px',
            background:    tokens.colors.surface,
            borderTop:     `1px solid ${tokens.colors.border}`,
            borderLeft:    `1px solid ${tokens.colors.border}`,
            borderRight:   `1px solid ${tokens.colors.border}`,
            borderRadius:  '20px 20px 0 0',
            padding:       '24px 20px 36px',
            boxShadow:     tokens.shadow.pop,
            opacity:       visible ? 1 : 0,
            transform:     visible ? 'translateY(0)' : 'translateY(20px)',
            transition:    'opacity 220ms ease, transform 220ms ease',
            maxHeight:     '92dvh',
            overflowY:     'auto',
          }}
        >
          {/* Close */}
          <button
            onClick={onClose}
            disabled={isDisabled}
            aria-label="Close"
            style={{
              position:       'absolute',
              top:            '16px',
              right:          '16px',
              background:     tokens.colors.surface2,
              border:         `1px solid ${tokens.colors.border}`,
              borderRadius:   '50%',
              width:          '28px',
              height:         '28px',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              cursor:         isDisabled ? 'default' : 'pointer',
              color:          tokens.colors.muted,
              padding:        0,
              opacity:        isDisabled ? 0.4 : 1,
            }}
          >
            <CloseIcon />
          </button>

          {/* ── Item preview ──────────────────────────────────────────── */}
          {phase !== 'success' && (
            <div
              style={{
                display:      'flex',
                gap:          '12px',
                alignItems:   'flex-start',
                marginBottom: '16px',
                paddingRight: '32px',
              }}
            >
              {item.image_url && (
                <div
                  style={{
                    flexShrink:   0,
                    width:        '48px',
                    height:       '48px',
                    borderRadius: tokens.radius.md,
                    overflow:     'hidden',
                    background:   tokens.colors.surface2,
                    border:       `1px solid ${tokens.colors.border}`,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.image_url} alt="" aria-hidden="true"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              )}
              <div>
                <p style={{
                  fontSize:   '12.5px',
                  fontWeight: 600,
                  color:      tokens.colors.text,
                  marginBottom: '2px',
                  display:    '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow:   'hidden',
                }}>
                  {item.title}
                </p>
                <p style={{ fontSize: '12px', color: tokens.colors.green, fontWeight: 600 }}>
                  Contributing {amountLabel}
                </p>
              </div>
            </div>
          )}

          {/* ── Phase: form ───────────────────────────────────────────── */}
          {(phase === 'form' || phase === 'processing') && (
            <>
              <Field
                id="chip-name" label="Your name"
                value={anonymous ? '' : name}
                onChange={setName}
                placeholder={anonymous ? 'Staying anonymous…' : 'e.g. Aunt Maria'}
                disabled={isDisabled || anonymous}
                required={!anonymous}
              />
              <Field
                id="chip-email" label="Email for receipt"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="you@example.com"
                disabled={isDisabled}
                required
              />

              {/* Anonymous checkbox */}
              <label style={{
                display:      'flex',
                alignItems:   'center',
                gap:          '8px',
                cursor:       isDisabled ? 'default' : 'pointer',
                marginBottom: '20px',
              }}>
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
                <span style={{ fontSize: '12.5px', color: tokens.colors.muted, userSelect: 'none' }}>
                  Contribute anonymously
                </span>
              </label>

              {/* Stripe PaymentElement */}
              <div style={{ marginBottom: '20px' }}>
                <p style={{
                  fontSize:      '11px',
                  fontWeight:    600,
                  color:         tokens.colors.muted,
                  marginBottom:  '8px',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                }}>
                  Card details
                </p>
                <div style={{
                  background:   tokens.colors.surface2,
                  border:       `1px solid ${tokens.colors.border}`,
                  borderRadius: tokens.radius.sm,
                  padding:      '12px',
                }}>
                  <PaymentElement
                    options={{
                      layout: 'tabs',
                    }}
                  />
                </div>
              </div>

              {/* Error */}
              {errorMsg && (
                <div style={{
                  background:   'rgba(226,75,74,0.12)',
                  border:       `1px solid rgba(226,75,74,0.28)`,
                  borderRadius: tokens.radius.sm,
                  padding:      '10px 12px',
                  marginBottom: '14px',
                  fontSize:     '12px',
                  color:        tokens.colors.red,
                  lineHeight:   1.5,
                }}>
                  {errorMsg}
                </div>
              )}

              {/* CTA */}
              <button
                onClick={handleSubmit}
                disabled={isDisabled || !stripe}
                style={{
                  width:          '100%',
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  gap:            '8px',
                  background:     tokens.colors.purple,
                  color:          '#fff',
                  border:         'none',
                  borderRadius:   tokens.radius.md,
                  padding:        '13px 16px',
                  fontSize:       '13.5px',
                  fontWeight:     700,
                  cursor:         isDisabled || !stripe ? 'default' : 'pointer',
                  opacity:        isDisabled || !stripe ? 0.7 : 1,
                  transition:     'opacity 150ms ease',
                  letterSpacing:  '0.1px',
                }}
              >
                {phase === 'processing' ? (
                  <><Spinner /> Processing…</>
                ) : (
                  `Contribute ${amountLabel} 💚`
                )}
              </button>

              <p style={{
                fontSize:  '10.5px',
                color:     tokens.colors.muted,
                textAlign: 'center',
                marginTop: '10px',
                opacity:   0.7,
                lineHeight: 1.5,
              }}>
                Payments secured by Stripe. GiftHint never stores card details.
              </p>
            </>
          )}

          {/* ── Phase: error (non-form errors) ────────────────────────── */}
          {phase === 'error' && (
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '36px', lineHeight: 1, marginBottom: '12px' }}>😞</p>
              <p style={{ fontSize: '14px', fontWeight: 700, color: tokens.colors.text, marginBottom: '8px' }}>
                Payment didn't go through
              </p>
              <p style={{
                fontSize:    '12.5px',
                color:       tokens.colors.muted,
                lineHeight:  1.55,
                maxWidth:    '300px',
                margin:      '0 auto 20px',
              }}>
                {errorMsg ?? 'Something went wrong. Please try again.'}
              </p>
              <button
                onClick={() => { setPhase('form'); setErrorMsg(null); setClientSecret(null); setIntentReady(false) }}
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
                }}
              >
                Try again
              </button>
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
                Cancel
              </button>
            </div>
          )}

          {/* ── Phase: success ────────────────────────────────────────── */}
          {phase === 'success' && (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <p style={{ fontSize: '48px', lineHeight: 1, marginBottom: '12px' }}>🎉</p>
              <p style={{ fontSize: '16px', fontWeight: 700, color: tokens.colors.text, marginBottom: '8px' }}>
                Thank you!
              </p>
              <p style={{
                fontSize:   '13px',
                color:      tokens.colors.muted,
                lineHeight: 1.6,
                maxWidth:   '300px',
                margin:     '0 auto 24px',
              }}>
                Your {amountLabel} contribution has been added to the pool.
                You'll receive a receipt by email.
              </p>
              <button
                onClick={onClose}
                style={{
                  background:   tokens.colors.green,
                  color:        '#0C0C0E',
                  border:       'none',
                  borderRadius: tokens.radius.md,
                  padding:      '12px 28px',
                  fontSize:     '13px',
                  fontWeight:   700,
                  cursor:       'pointer',
                  letterSpacing: '0.05px',
                }}
              >
                Done ✓
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Desktop override */}
      <style>{`
        @media (min-width: 640px) {
          [data-gh-chipin-modal] {
            align-items: center !important;
          }
          [data-gh-chipin-card] {
            border-radius: 20px !important;
            border: 1px solid ${tokens.colors.border} !important;
          }
        }
      `}</style>
    </>
  )
}
