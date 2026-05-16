/**
 * components/dashboard/CreateListModal.tsx — GiftHint
 *
 * Modal dialog for creating a new wishlist.
 *
 * UX flow:
 *   1. Occasion grid (8 tiles, one required) — selecting one pre-fills the title
 *   2. Title field (editable, 1–100 chars)
 *   3. Optional date picker (occasion_date)
 *   4. Submit → POST /api/wishlists → onCreated(newWishlist)
 *
 * Usage:
 *   <CreateListModal userId={user.id} onCreated={(w) => refresh()} onClose={() => setOpen(false)} />
 */

'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { tokens }                                    from '@/tokens'
import { getOccasionTheme }                          from '@/lib/occasion-themes'
import type { DbWishlist, OccasionKey }              from '@/lib/wishlists'
import { getBrowserClient }                          from '@/lib/supabase-browser'

// ── Occasion catalogue (client-safe — no server imports) ──────────────────────

interface OccasionOption {
  key:   OccasionKey
  label: string
  emoji: string
  defaultTitle: string
}

const OCCASIONS: OccasionOption[] = [
  { key: 'birthday',    label: 'Birthday',    emoji: '🎂', defaultTitle: 'Birthday Wishlist'    },
  { key: 'christmas',   label: 'Christmas',   emoji: '🎄', defaultTitle: 'Christmas Wishlist'   },
  { key: 'wedding',     label: 'Wedding',     emoji: '💍', defaultTitle: 'Wedding Registry'     },
  { key: 'baby_shower', label: 'Baby Shower', emoji: '🍼', defaultTitle: 'Baby Shower Registry' },
  { key: 'graduation',  label: 'Graduation',  emoji: '🎓', defaultTitle: 'Graduation Wishlist'  },
  { key: 'housewarming',label: 'Housewarming',emoji: '🏠', defaultTitle: 'Housewarming Wishlist'},
  { key: 'anniversary', label: 'Anniversary', emoji: '🥂', defaultTitle: 'Anniversary Wishlist' },
  { key: 'other',       label: 'Other',       emoji: '🎁', defaultTitle: 'My Wishlist'          },
]

// ── CreateListModal ────────────────────────────────────────────────────────────

interface CreateListModalProps {
  userId:    string
  onCreated: (wishlist: DbWishlist) => void
  onClose:   () => void
}

export function CreateListModal({ userId, onCreated, onClose }: CreateListModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  const [occasion,      setOccasion]      = useState<OccasionKey | null>(null)
  const [title,         setTitle]         = useState('')
  const [occasionDate,  setOccasionDate]  = useState('')
  const [submitting,    setSubmitting]    = useState(false)
  const [error,         setError]         = useState<string | null>(null)

  // Pre-fill title when occasion is selected
  const handleSelectOccasion = useCallback((opt: OccasionOption) => {
    setOccasion(opt.key)
    // Only auto-fill if the user hasn't typed anything yet
    setTitle((prev) => (prev === '' || OCCASIONS.some((o) => o.defaultTitle === prev))
      ? opt.defaultTitle
      : prev
    )
    setError(null)
  }, [])

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Trap focus inside the dialog
  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!occasion) {
      setError('Please choose an occasion.')
      return
    }
    const trimmedTitle = title.trim()
    if (!trimmedTitle || trimmedTitle.length > 100) {
      setError('Title must be 1–100 characters.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const supabase = getBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      const res = await fetch('/api/wishlists', {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          userId,
          title:        trimmedTitle,
          occasion,
          occasionDate: occasionDate || null,
        }),
      })

      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.message ?? 'Failed to create list.')
      }

      onCreated(json.wishlist as DbWishlist)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setSubmitting(false)
    }
  }, [occasion, title, occasionDate, userId, onCreated])

  const selectedTheme = occasion ? getOccasionTheme(occasion) : null

  return (
    /* Backdrop */
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position:   'fixed',
        inset:      0,
        zIndex:     200,
        background: 'rgba(0,0,0,0.72)',
        display:    'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding:    '16px',
      }}
    >
      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-list-title"
        tabIndex={-1}
        style={{
          background:   tokens.colors.surface,
          border:       `1px solid ${tokens.colors.borderSoft}`,
          borderRadius: tokens.radius.xl,
          boxShadow:    tokens.shadow.pop,
          width:        '100%',
          maxWidth:     '480px',
          maxHeight:    '90vh',
          overflowY:    'auto',
          padding:      '28px 24px 24px',
          outline:      'none',
        }}
      >
        {/* Header */}
        <div
          style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            marginBottom:   '20px',
          }}
        >
          <h2
            id="create-list-title"
            style={{
              margin:        0,
              fontSize:      '17px',
              fontWeight:    700,
              color:         tokens.colors.text,
              letterSpacing: '-0.02em',
            }}
          >
            Create a new list
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background:  'transparent',
              border:      'none',
              color:       tokens.colors.muted,
              cursor:      'pointer',
              padding:     '4px',
              borderRadius: tokens.radius.xs,
              display:     'flex',
              alignItems:  'center',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* ── Occasion grid ───────────────────────────────────────────────── */}
          <fieldset style={{ border: 'none', padding: 0, margin: '0 0 20px' }}>
            <legend
              style={{
                fontSize:     '12px',
                fontWeight:   600,
                color:        tokens.colors.muted,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                marginBottom: '10px',
              }}
            >
              Occasion
            </legend>

            <div
              style={{
                display:             'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap:                 '8px',
              }}
            >
              {OCCASIONS.map((opt) => {
                const isSelected = occasion === opt.key
                const theme      = getOccasionTheme(opt.key)
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => handleSelectOccasion(opt)}
                    style={{
                      display:        'flex',
                      flexDirection:  'column',
                      alignItems:     'center',
                      gap:            '5px',
                      padding:        '10px 6px',
                      borderRadius:   tokens.radius.md,
                      border:         isSelected
                        ? `2px solid ${theme.accent}`
                        : `1px solid ${tokens.colors.border}`,
                      background:     isSelected ? theme.accentDim : tokens.colors.surface2,
                      cursor:         'pointer',
                      transition:     'border-color 120ms ease, background 120ms ease',
                      outline:        'none',
                    }}
                    aria-pressed={isSelected}
                  >
                    <span style={{ fontSize: '20px', lineHeight: 1 }}>{opt.emoji}</span>
                    <span
                      style={{
                        fontSize:  '10px',
                        fontWeight: 600,
                        color:     isSelected ? theme.accent : tokens.colors.muted,
                        textAlign: 'center',
                        lineHeight: 1.2,
                        transition: 'color 120ms ease',
                      }}
                    >
                      {opt.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </fieldset>

          {/* ── Title ───────────────────────────────────────────────────────── */}
          <div style={{ marginBottom: '16px' }}>
            <label
              htmlFor="list-title"
              style={{
                display:      'block',
                fontSize:     '12px',
                fontWeight:   600,
                color:        tokens.colors.muted,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                marginBottom: '6px',
              }}
            >
              List title
            </label>
            <input
              id="list-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              placeholder="e.g. Sarah's Birthday Wishlist"
              required
              style={{
                width:        '100%',
                boxSizing:    'border-box',
                padding:      '10px 12px',
                borderRadius: tokens.radius.sm,
                border:       `1px solid ${selectedTheme ? selectedTheme.accentRing : tokens.colors.border}`,
                background:   tokens.colors.surface2,
                color:        tokens.colors.text,
                fontSize:     '14px',
                outline:      'none',
                transition:   'border-color 120ms ease',
              }}
            />
          </div>

          {/* ── Date ────────────────────────────────────────────────────────── */}
          <div style={{ marginBottom: '24px' }}>
            <label
              htmlFor="list-date"
              style={{
                display:      'block',
                fontSize:     '12px',
                fontWeight:   600,
                color:        tokens.colors.muted,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                marginBottom: '6px',
              }}
            >
              Date <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional)</span>
            </label>
            <input
              id="list-date"
              type="date"
              value={occasionDate}
              onChange={(e) => setOccasionDate(e.target.value)}
              style={{
                width:        '100%',
                boxSizing:    'border-box',
                padding:      '10px 12px',
                borderRadius: tokens.radius.sm,
                border:       `1px solid ${tokens.colors.border}`,
                background:   tokens.colors.surface2,
                color:        tokens.colors.text,
                fontSize:     '14px',
                outline:      'none',
                colorScheme:  'dark',
              }}
            />
          </div>

          {/* ── Error ───────────────────────────────────────────────────────── */}
          {error && (
            <p
              style={{
                margin:       '0 0 16px',
                fontSize:     '13px',
                color:        tokens.colors.red,
                background:   'rgba(226,75,74,0.08)',
                border:       '1px solid rgba(226,75,74,0.2)',
                borderRadius: tokens.radius.sm,
                padding:      '8px 12px',
              }}
            >
              {error}
            </p>
          )}

          {/* ── Submit ──────────────────────────────────────────────────────── */}
          <button
            type="submit"
            disabled={submitting || !occasion}
            style={{
              width:          '100%',
              padding:        '12px',
              borderRadius:   tokens.radius.sm,
              border:         'none',
              background:     selectedTheme ? selectedTheme.accent : tokens.colors.purple,
              color:          '#fff',
              fontSize:       '14px',
              fontWeight:     700,
              cursor:         submitting || !occasion ? 'not-allowed' : 'pointer',
              opacity:        submitting || !occasion ? 0.6 : 1,
              letterSpacing:  '-0.01em',
              transition:     'opacity 150ms ease',
            }}
          >
            {submitting ? 'Creating…' : '✨ Create list'}
          </button>
        </form>
      </div>
    </div>
  )
}
