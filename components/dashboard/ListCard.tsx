/**
 * components/dashboard/ListCard.tsx — GiftHint
 *
 * Displays a single wishlist as a card in the wisher dashboard grid.
 *
 * Shows:
 *   - Occasion emoji + themed accent border
 *   - List title + occasion label + "default" badge
 *   - Item count / claimed count
 *   - Occasion date + days-remaining countdown
 *   - Share button: copies /list/[username]/[slug] to clipboard (✓ feedback)
 *   - Edit button: inline form to edit title + occasion_date (PATCH API)
 *   - Delete button: confirmation dialog, soft-delete (is_public = false)
 *
 * Props:
 *   onUpdated(patch) — called after a successful inline edit so the parent
 *                      can patch its local state without a full reload.
 *   onDeleted()      — called after successful soft-delete.
 */

'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { tokens }                                   from '@/tokens'
import { getOccasionTheme }                         from '@/lib/occasion-themes'
import type { DbWishlist }                          from '@/lib/wishlists'
import { getBrowserClient }                         from '@/lib/supabase-browser'

// ── Types ──────────────────────────────────────────────────────────────────────

interface ListCardProps {
  wishlist:   DbWishlist & { item_count?: number; claimed_count?: number }
  username:   string
  onUpdated:  (patch: Partial<DbWishlist>) => void
  onDeleted:  () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day:   'numeric',
    year:  'numeric',
  })
}

function daysUntil(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number)
  const occasion  = Date.UTC(y, m - 1, d)
  const now       = new Date()
  const today     = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.round((occasion - today) / (1000 * 60 * 60 * 24))
}

async function getToken(): Promise<string | undefined> {
  const { data: { session } } = await getBrowserClient().auth.getSession()
  return session?.access_token
}

// ── ListCard ──────────────────────────────────────────────────────────────────

export function ListCard({ wishlist, username, onUpdated, onDeleted }: ListCardProps) {
  const theme = getOccasionTheme(wishlist.occasion)

  // ── Share / copy state ─────────────────────────────────────────────────────
  const [copied,   setCopied]   = useState(false)

  // ── Inline edit state ──────────────────────────────────────────────────────
  const [editing,     setEditing]     = useState(false)
  const [titleDraft,  setTitleDraft]  = useState(wishlist.title)
  const [dateDraft,   setDateDraft]   = useState(wishlist.occasion_date ?? '')
  const [saving,      setSaving]      = useState(false)
  const [editError,   setEditError]   = useState<string | null>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)

  // ── Delete state ───────────────────────────────────────────────────────────
  const [deleting, setDeleting] = useState(false)
  const [delError, setDelError] = useState<string | null>(null)

  // Focus title input when edit mode opens
  useEffect(() => {
    if (editing) titleInputRef.current?.focus()
  }, [editing])

  // Sync drafts when wishlist prop changes (after external updates)
  useEffect(() => {
    setTitleDraft(wishlist.title)
    setDateDraft(wishlist.occasion_date ?? '')
  }, [wishlist.title, wishlist.occasion_date])

  // ── Share handler ──────────────────────────────────────────────────────────
  const gifterUrl = `${typeof window !== 'undefined' ? window.location.origin : 'https://gifthint.io'}/list/${username}/${wishlist.slug}`

  const handleShare = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(gifterUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2_000)
    } catch {
      // Clipboard unavailable (http:// or blocked) — fall back to selecting text
      window.prompt('Copy this link:', gifterUrl)
    }
  }, [gifterUrl])

  // ── Edit handlers ──────────────────────────────────────────────────────────
  const handleOpenEdit = useCallback(() => {
    setEditError(null)
    setEditing(true)
  }, [])

  const handleCancelEdit = useCallback(() => {
    setEditing(false)
    setEditError(null)
    setTitleDraft(wishlist.title)
    setDateDraft(wishlist.occasion_date ?? '')
  }, [wishlist.title, wishlist.occasion_date])

  const handleSaveEdit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedTitle = titleDraft.trim()
    if (!trimmedTitle || trimmedTitle.length > 100) {
      setEditError('Title must be 1–100 characters.')
      return
    }

    setSaving(true)
    setEditError(null)

    try {
      const token = await getToken()
      const res = await fetch(`/api/wishlists/${wishlist.id}`, {
        method:  'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title:        trimmedTitle,
          occasionDate: dateDraft || null,
        }),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.message ?? 'Save failed.')
      }

      const { wishlist: updated } = await res.json()
      onUpdated({ title: updated.title, occasion_date: updated.occasion_date })
      setEditing(false)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }, [wishlist.id, titleDraft, dateDraft, onUpdated])

  // ── Delete handler ─────────────────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (!confirm(`Delete "${wishlist.title}"? This hides it from gifters but keeps your items.`)) return

    setDeleting(true)
    setDelError(null)

    try {
      const token = await getToken()
      const res = await fetch(`/api/wishlists/${wishlist.id}`, {
        method:  'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.message ?? 'Delete failed.')
      }

      onDeleted()
    } catch (err) {
      setDelError(err instanceof Error ? err.message : 'Something went wrong.')
      setDeleting(false)
    }
  }, [wishlist.id, wishlist.title, onDeleted])

  // ── Derived display values ─────────────────────────────────────────────────
  const days = wishlist.occasion_date ? daysUntil(wishlist.occasion_date) : null
  const countdownColour =
    days === null ? tokens.colors.muted :
    days < 0      ? tokens.colors.muted :
    days === 0    ? '#4EC99A' :
    days < 7      ? '#E24B4A' :
    days < 14     ? '#F5A94E' : '#4EC99A'

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <article
      style={{
        background:    tokens.colors.surface,
        border:        `1px solid ${theme.accentRing}`,
        borderRadius:  tokens.radius.lg,
        padding:       '20px',
        display:       'flex',
        flexDirection: 'column',
        gap:           '12px',
        boxShadow:     `0 2px 12px rgba(0,0,0,0.3), inset 0 1px 0 ${theme.accentRing}`,
        position:      'relative',
        overflow:      'hidden',
      }}
    >
      {/* Accent glow strip */}
      <div
        aria-hidden="true"
        style={{
          position:   'absolute',
          top:        0,
          left:       0,
          right:      0,
          height:     '2px',
          background: `linear-gradient(90deg, transparent, ${theme.accent}, transparent)`,
          opacity:    0.6,
        }}
      />

      {/* ── Header: emoji + title ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        <span aria-hidden="true" style={{ fontSize: '28px', lineHeight: 1, flexShrink: 0, marginTop: '2px' }}>
          {theme.emoji}
        </span>

        <div style={{ minWidth: 0, flex: 1 }}>
          <h3
            style={{
              margin:       0,
              fontSize:     '15px',
              fontWeight:   700,
              color:        tokens.colors.text,
              lineHeight:   1.3,
              overflow:     'hidden',
              textOverflow: 'ellipsis',
              whiteSpace:   'nowrap',
              letterSpacing: '-0.02em',
            }}
          >
            {wishlist.title}
          </h3>
          <p style={{ margin: '3px 0 0', fontSize: '12px', color: tokens.colors.muted, lineHeight: 1.4 }}>
            {wishlist.occasion.replace('_', ' ')}
            {wishlist.is_default && (
              <span
                style={{
                  marginLeft:    '6px',
                  fontSize:      '10px',
                  fontWeight:    600,
                  color:         theme.accent,
                  background:    theme.accentDim,
                  border:        `1px solid ${theme.accentRing}`,
                  borderRadius:  tokens.radius.pill,
                  padding:       '1px 6px',
                  letterSpacing: '0.03em',
                  textTransform: 'uppercase',
                }}
              >
                default
              </span>
            )}
          </p>
        </div>
      </div>

      {/* ── Stats ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: tokens.colors.muted }}>
        <span>
          <strong style={{ color: tokens.colors.text, fontWeight: 700 }}>
            {wishlist.item_count ?? 0}
          </strong>{' '}
          {(wishlist.item_count ?? 0) === 1 ? 'gift' : 'gifts'}
        </span>
        <span>
          <strong style={{ color: '#4EC99A', fontWeight: 700 }}>
            {wishlist.claimed_count ?? 0}
          </strong>{' '}
          of{' '}
          <strong style={{ color: tokens.colors.text, fontWeight: 700 }}>
            {wishlist.item_count ?? 0}
          </strong>{' '}
          claimed
        </span>
      </div>

      {/* ── Date / countdown ──────────────────────────────────────────────── */}
      {wishlist.occasion_date && !editing && (
        <p style={{ margin: 0, fontSize: '12px', color: countdownColour, fontWeight: days !== null && days >= 0 && days <= 14 ? 600 : 400 }}>
          {days === null || days < 0
            ? formatDate(wishlist.occasion_date)
            : days === 0
              ? '🎉 Today!'
              : `⏳ ${days} ${days === 1 ? 'day' : 'days'} away · ${formatDate(wishlist.occasion_date)}`}
        </p>
      )}

      {/* ── Inline edit form ──────────────────────────────────────────────── */}
      {editing && (
        <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <input
            ref={titleInputRef}
            type="text"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            maxLength={100}
            required
            placeholder="List title"
            style={{
              padding:      '8px 10px',
              borderRadius: tokens.radius.sm,
              border:       `1px solid ${theme.accentRing}`,
              background:   tokens.colors.surface2,
              color:        tokens.colors.text,
              fontSize:     '13px',
              fontWeight:   600,
              outline:      'none',
              width:        '100%',
              boxSizing:    'border-box',
            }}
          />
          <input
            type="date"
            value={dateDraft}
            onChange={(e) => setDateDraft(e.target.value)}
            style={{
              padding:     '8px 10px',
              borderRadius: tokens.radius.sm,
              border:       `1px solid ${tokens.colors.border}`,
              background:   tokens.colors.surface2,
              color:        tokens.colors.text,
              fontSize:     '13px',
              outline:      'none',
              width:        '100%',
              boxSizing:    'border-box',
              colorScheme:  'dark',
            }}
          />
          {editError && (
            <p style={{ margin: 0, fontSize: '11px', color: tokens.colors.red }}>
              {editError}
            </p>
          )}
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                flex:         1,
                padding:      '7px',
                borderRadius: tokens.radius.sm,
                border:       'none',
                background:   theme.accent,
                color:        '#fff',
                fontSize:     '12px',
                fontWeight:   700,
                cursor:       saving ? 'not-allowed' : 'pointer',
                opacity:      saving ? 0.7 : 1,
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={handleCancelEdit}
              disabled={saving}
              style={{
                flex:         1,
                padding:      '7px',
                borderRadius: tokens.radius.sm,
                border:       `1px solid ${tokens.colors.border}`,
                background:   'transparent',
                color:        tokens.colors.muted,
                fontSize:     '12px',
                cursor:       'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* ── Errors ────────────────────────────────────────────────────────── */}
      {delError && (
        <p style={{ margin: 0, fontSize: '12px', color: tokens.colors.red }}>{delError}</p>
      )}

      {/* ── Action buttons ────────────────────────────────────────────────── */}
      {!editing && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: 'auto', paddingTop: '4px' }}>

          {/* Share — copies URL to clipboard */}
          <button
            onClick={handleShare}
            style={{
              flex:           1,
              display:        'inline-flex',
              alignItems:     'center',
              justifyContent: 'center',
              gap:            '5px',
              padding:        '8px 12px',
              borderRadius:   tokens.radius.sm,
              background:     copied ? 'rgba(78,201,154,0.12)' : theme.accentDim,
              border:         `1px solid ${copied ? 'rgba(78,201,154,0.30)' : theme.accentRing}`,
              color:          copied ? '#4EC99A' : theme.accent,
              fontSize:       '12px',
              fontWeight:     600,
              cursor:         'pointer',
              whiteSpace:     'nowrap',
              transition:     'background 150ms ease, border-color 150ms ease, color 150ms ease',
            }}
          >
            {copied ? '✓ Copied!' : '🔗 Share'}
          </button>

          {/* Edit — opens inline form */}
          <button
            onClick={handleOpenEdit}
            style={{
              flex:           1,
              display:        'inline-flex',
              alignItems:     'center',
              justifyContent: 'center',
              gap:            '5px',
              padding:        '8px 12px',
              borderRadius:   tokens.radius.sm,
              background:     tokens.colors.surface2,
              border:         `1px solid ${tokens.colors.border}`,
              color:          tokens.colors.muted,
              fontSize:       '12px',
              fontWeight:     600,
              cursor:         'pointer',
              whiteSpace:     'nowrap',
              transition:     'border-color 120ms ease, color 120ms ease',
            }}
          >
            ✏️ Edit
          </button>

          {/* Delete */}
          <button
            onClick={handleDelete}
            disabled={deleting}
            aria-label={`Delete ${wishlist.title}`}
            style={{
              display:        'inline-flex',
              alignItems:     'center',
              justifyContent: 'center',
              padding:        '8px 10px',
              borderRadius:   tokens.radius.sm,
              background:     'transparent',
              border:         `1px solid ${tokens.colors.border}`,
              color:          deleting ? tokens.colors.muted : 'rgba(226,75,74,0.7)',
              fontSize:       '13px',
              cursor:         deleting ? 'not-allowed' : 'pointer',
              transition:     'border-color 120ms ease, color 120ms ease',
              flexShrink:     0,
            }}
          >
            {deleting ? '…' : '🗑'}
          </button>
        </div>
      )}
    </article>
  )
}
