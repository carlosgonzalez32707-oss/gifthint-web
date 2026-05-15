/**
 * components/ReminderSignup.tsx — GiftHint
 *
 * Gifter email capture widget shown at the bottom of every public wishlist.
 * Submits to POST /api/reminder-signup and stores the sent flag in localStorage
 * so the form doesn't re-appear after a page reload.
 *
 * States:
 *   idle      → email input + optional occasion date + "Remind me" button
 *   submitting → button shows spinner text, inputs disabled
 *   sent      → green "✓ We'll remind you 7 days before!" pill
 *   error     → amber inline message below the form
 *
 * Design notes:
 *   - Self-contained: owns its own email/date/submitting/sent/error state
 *   - No external state management — GifterPage only passes username + name
 *   - Occasion date is optional; skipping it still registers for "new items" pings
 *   - localStorage key is per-wisher so one browser can track multiple lists
 *
 * IMPORT RULE: 'use client' — fetch + localStorage are browser-only.
 */

'use client'

import { useState, useEffect } from 'react'
import { tokens }              from '@/tokens'

// ── Types ──────────────────────────────────────────────────────────────────────

interface ReminderSignupProps {
  /** Public username of the list owner — used as the API param + localStorage key */
  wisherUsername: string
  /** First name (or username) shown in the heading copy */
  wisherName:     string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function storageKey(username: string): string {
  return `gifthint_reminder_${username}`
}

function readSentFromStorage(username: string): boolean {
  try {
    return localStorage.getItem(storageKey(username)) === 'true'
  } catch {
    return false // private browsing / storage unavailable
  }
}

function persistSentToStorage(username: string): void {
  try {
    localStorage.setItem(storageKey(username), 'true')
  } catch {
    // ignore — the UI already shows success
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ReminderSignup({ wisherUsername, wisherName }: ReminderSignupProps) {
  const [email,        setEmail]        = useState('')
  const [occasionDate, setOccasionDate] = useState('')
  const [submitting,   setSubmitting]   = useState(false)
  const [sent,         setSent]         = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  // On mount: check if this browser already signed up for this list
  useEffect(() => {
    if (readSentFromStorage(wisherUsername)) {
      setSent(true)
    }
  }, [wisherUsername])

  // ── Submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || submitting) return

    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/reminder-signup', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wisherUsername,
          gifterEmail:  email.trim(),
          occasionDate: occasionDate || null,
        }),
      })

      const json: { success?: boolean; error?: string } = await res.json()

      if (!res.ok || json.error) {
        if (json.error === 'invalid_email') {
          setError('Invalid email — please try again.')
        } else if (json.error === 'invalid_date') {
          setError('That date looks invalid — use YYYY-MM-DD format.')
        } else {
          setError('Something went wrong. Please try again.')
        }
        return
      }

      // Success
      setSent(true)
      persistSentToStorage(wisherUsername)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <section
      aria-label="Reminder signup"
      style={{
        margin:       '0 16px 64px',
        borderRadius: tokens.radius.xl,
        padding:      '32px',
        textAlign:    'center',
        background:   tokens.colors.surface,
        border:       `1px solid ${tokens.colors.border}`,
      }}
    >
      <div style={{ fontSize: '30px', marginBottom: '12px' }}>🔔</div>

      <h2
        style={{
          fontSize:   '15px',
          fontWeight: 700,
          color:      tokens.colors.text,
          fontFamily: tokens.font.sans,
          margin:     '0 0 6px',
        }}
      >
        Want to know when {wisherName} adds more gifts?
      </h2>

      <p
        style={{
          fontSize:   '13px',
          color:      tokens.colors.muted,
          fontFamily: tokens.font.sans,
          margin:     '0 0 20px',
          maxWidth:   '280px',
          marginLeft: 'auto',
          marginRight: 'auto',
        }}
      >
        One email, no spam. Get a reminder 7 days before the big occasion.
      </p>

      {/* ── Success state ─────────────────────────────────────────────────── */}
      {sent ? (
        <p
          role="status"
          style={{
            display:      'inline-flex',
            alignItems:   'center',
            gap:          '6px',
            fontSize:     '13px',
            fontWeight:   600,
            fontFamily:   tokens.font.sans,
            padding:      '10px 20px',
            borderRadius: tokens.radius.pill,
            background:   tokens.colors.greenDim,
            border:       `1px solid ${tokens.colors.greenRing}`,
            color:        tokens.colors.green,
          }}
        >
          ✓ We&apos;ll remind you 7 days before!
        </p>

      ) : (

        /* ── Input form ───────────────────────────────────────────────────── */
        <form
          onSubmit={handleSubmit}
          noValidate
          style={{
            display:       'flex',
            flexDirection: 'column',
            gap:           '10px',
            maxWidth:      '340px',
            margin:        '0 auto',
          }}
        >
          {/* Email */}
          <input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
            required
            aria-label="Your email address"
            style={{
              width:        '100%',
              padding:      '10px 14px',
              borderRadius: tokens.radius.md,
              fontSize:     '13px',
              fontFamily:   tokens.font.sans,
              outline:      'none',
              background:   tokens.colors.surface2,
              border:       `1px solid rgba(255,255,255,0.10)`,
              color:        tokens.colors.text,
              boxSizing:    'border-box',
              opacity:      submitting ? 0.5 : 1,
              transition:   'opacity 150ms',
            }}
          />

          {/* Occasion date (optional) */}
          <div style={{ position: 'relative' }}>
            <input
              type="date"
              value={occasionDate}
              onChange={(e) => setOccasionDate(e.target.value)}
              disabled={submitting}
              aria-label="Occasion date (optional)"
              style={{
                width:        '100%',
                padding:      '10px 14px',
                borderRadius: tokens.radius.md,
                fontSize:     '13px',
                fontFamily:   tokens.font.sans,
                outline:      'none',
                background:   tokens.colors.surface2,
                border:       `1px solid rgba(255,255,255,0.10)`,
                color:        occasionDate ? tokens.colors.text : tokens.colors.muted,
                boxSizing:    'border-box',
                opacity:      submitting ? 0.5 : 1,
                transition:   'opacity 150ms',
                colorScheme:  'dark',
              } as React.CSSProperties}
            />
            {!occasionDate && (
              <span
                aria-hidden="true"
                style={{
                  position:      'absolute',
                  left:          '14px',
                  top:           '50%',
                  transform:     'translateY(-50%)',
                  fontSize:      '13px',
                  color:         tokens.colors.muted,
                  fontFamily:    tokens.font.sans,
                  pointerEvents: 'none',
                }}
              >
                Occasion date (optional)
              </span>
            )}
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={submitting || !email.trim()}
            style={{
              padding:      '10px 20px',
              borderRadius: tokens.radius.md,
              fontSize:     '13px',
              fontWeight:   700,
              fontFamily:   tokens.font.sans,
              cursor:       submitting || !email.trim() ? 'not-allowed' : 'pointer',
              border:       'none',
              background:   tokens.colors.purple,
              color:        '#fff',
              opacity:      submitting || !email.trim() ? 0.55 : 1,
              transition:   'opacity 150ms',
            }}
          >
            {submitting ? 'Saving…' : 'Remind me 🔔'}
          </button>

          {/* Inline error */}
          {error && (
            <p
              role="alert"
              style={{
                margin:     0,
                fontSize:   '12px',
                fontFamily: tokens.font.sans,
                color:      tokens.colors.amber,
                textAlign:  'center',
              }}
            >
              {error}
            </p>
          )}
        </form>
      )}
    </section>
  )
}
