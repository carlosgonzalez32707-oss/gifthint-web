/**
 * components/dashboard/CustomUsernameEditor.tsx — GiftHint
 *
 * Allows users who have unlocked the custom username reward (1 referral) to
 * set their public_username.
 *
 * Features:
 *   - Controlled input with 300ms debounced availability check
 *   - Real-time validation feedback (format rules + taken/available)
 *   - Live URL preview: gifthint.io/list/[username]/[slug]
 *   - PATCH /api/username/update on save
 *   - Locked state shown to users who haven't unlocked the feature yet
 *
 * Props:
 *   userId      — authenticated user UUID
 *   currentUsername — existing public_username (or null for unset)
 *   unlocked    — whether custom_username_enabled = true for this user
 *   onUpdated   — callback with the new username after a successful save
 */

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { tokens }                                   from '@/tokens'
import { getBrowserClient }                         from '@/lib/supabase-browser'

// ── Types ──────────────────────────────────────────────────────────────────────

interface CustomUsernameEditorProps {
  userId:          string
  currentUsername: string | null
  unlocked:        boolean
  onUpdated?:      (newUsername: string) => void
}

type CheckState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid'

// ── Design tokens ─────────────────────────────────────────────────────────────

const c = tokens.colors
const r = tokens.radius

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusColor(state: CheckState, c: typeof tokens.colors): string {
  if (state === 'available') return c.green
  if (state === 'taken' || state === 'invalid') return c.red ?? '#E24B4A'
  return c.muted
}

function statusBg(state: CheckState, c: typeof tokens.colors): string {
  if (state === 'available') return c.greenDim
  if (state === 'taken' || state === 'invalid') return 'rgba(226, 75, 74, 0.10)'
  return 'transparent'
}

function statusBorder(state: CheckState, c: typeof tokens.colors): string {
  if (state === 'available') return c.greenRing
  if (state === 'taken' || state === 'invalid') return 'rgba(226, 75, 74, 0.28)'
  return c.border
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CustomUsernameEditor({
  userId,
  currentUsername,
  unlocked,
  onUpdated,
}: CustomUsernameEditorProps) {
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://gifthint.io'

  const [value,       setValue]       = useState(currentUsername ?? '')
  const [checkState,  setCheckState]  = useState<CheckState>('idle')
  const [checkMsg,    setCheckMsg]    = useState<string>('')
  const [saving,      setSaving]      = useState(false)
  const [saveError,   setSaveError]   = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const valueRef    = useRef(value)
  valueRef.current  = value

  // ── Debounced availability check ───────────────────────────────────────────

  const checkAvailability = useCallback(async (username: string) => {
    if (!username || username === currentUsername) {
      setCheckState('idle')
      setCheckMsg('')
      return
    }

    setCheckState('checking')

    const params = new URLSearchParams({ username, userId })
    const res    = await fetch(`/api/username/available?${params}`)
    const data   = await res.json() as { available: boolean; reason?: string }

    if (username !== valueRef.current) return // stale response — discard

    if (data.available) {
      setCheckState('available')
      setCheckMsg('Username is available')
    } else {
      setCheckState(data.reason?.includes('Must') || data.reason?.includes('Only') || data.reason?.includes('reserved')
        ? 'invalid'
        : 'taken')
      setCheckMsg(data.reason ?? 'Not available')
    }
  }, [currentUsername, userId])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    const trimmed = value.trim().toLowerCase()
    if (!trimmed) {
      setCheckState('idle')
      setCheckMsg('')
      return
    }

    debounceRef.current = setTimeout(() => {
      checkAvailability(trimmed)
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [value, checkAvailability])

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    const username = value.trim().toLowerCase()
    if (!username || checkState !== 'available') return

    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)

    try {
      const { data: { session } } = await getBrowserClient().auth.getSession()
      const token = session?.access_token

      const res  = await fetch('/api/username/update', {
        method:  'PATCH',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify({ userId, username }),
      })

      const data = await res.json() as { ok?: boolean; error?: string; username?: string }

      if (!res.ok || !data.ok) {
        setSaveError(data.error ?? 'Could not save username.')
        return
      }

      setSaveSuccess(true)
      setCheckState('idle')
      setCheckMsg('')
      onUpdated?.(data.username ?? username)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch {
      setSaveError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // ── Locked state ───────────────────────────────────────────────────────────

  if (!unlocked) {
    return (
      <div
        style={{
          background:   c.surface,
          borderRadius: r.xl,
          border:       `1px solid ${c.border}`,
          padding:      '24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
          <span style={{ fontSize: '24px' }}>✏️</span>
          <div>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: c.text }}>
              Custom username
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: c.muted }}>
              Unlocks at 1 referral
            </p>
          </div>
          <span
            style={{
              marginLeft:   'auto',
              fontSize:     '11px',
              fontWeight:   600,
              padding:      '3px 10px',
              borderRadius: r.pill,
              background:   c.surface3,
              color:        c.muted,
              border:       `1px solid ${c.border}`,
            }}
          >
            Locked 🔒
          </span>
        </div>
        <p style={{ margin: 0, fontSize: '13px', color: c.muted, lineHeight: 1.5 }}>
          Refer one friend to unlock a custom URL for all your GiftHint lists —{' '}
          <span style={{ color: c.text, fontFamily: tokens.font.mono, fontSize: '12px' }}>
            gifthint.io/list/yourname
          </span>
        </p>
      </div>
    )
  }

  // ── Unlocked state ─────────────────────────────────────────────────────────

  const displayUsername = value.trim().toLowerCase() || currentUsername || 'yourname'
  const inputBorder     = checkState === 'idle' ? c.borderSoft : statusBorder(checkState, c)

  return (
    <div
      style={{
        background:   c.surface,
        borderRadius: r.xl,
        border:       `1px solid ${c.border}`,
        padding:      '24px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <span style={{ fontSize: '24px' }}>✏️</span>
        <div>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: c.text }}>
            Custom username
          </h3>
          <p style={{ margin: '2px 0 0', fontSize: '12px', color: c.muted }}>
            Sets the URL for all your GiftHint lists
          </p>
        </div>
        <span
          style={{
            marginLeft:   'auto',
            fontSize:     '11px',
            fontWeight:   600,
            padding:      '3px 10px',
            borderRadius: r.pill,
            background:   c.greenDim,
            color:        c.green,
            border:       `1px solid ${c.greenRing}`,
          }}
        >
          Unlocked ✓
        </span>
      </div>

      {/* Input */}
      <div style={{ position: 'relative', marginBottom: '10px' }}>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={currentUsername ?? 'choose-a-username'}
          maxLength={24}
          spellCheck={false}
          autoCapitalize="none"
          style={{
            width:          '100%',
            boxSizing:      'border-box',
            background:     checkState === 'idle' ? c.surface2 : statusBg(checkState, c),
            border:         `1px solid ${inputBorder}`,
            borderRadius:   r.md,
            color:          c.text,
            fontSize:       '15px',
            fontWeight:     600,
            fontFamily:     tokens.font.mono,
            padding:        '12px 14px',
            outline:        'none',
            transition:     'border-color 150ms, background 150ms',
          }}
        />
        {checkState === 'checking' && (
          <div
            style={{
              position: 'absolute',
              right:    '12px',
              top:      '50%',
              transform: 'translateY(-50%)',
              fontSize: '11px',
              color:    c.muted,
            }}
          >
            Checking…
          </div>
        )}
      </div>

      {/* Status message */}
      {checkMsg && (
        <p style={{ margin: '0 0 12px', fontSize: '12px', color: statusColor(checkState, c) }}>
          {checkState === 'available' ? '✓ ' : '✕ '}{checkMsg}
        </p>
      )}

      {/* URL preview */}
      <div
        style={{
          background:   c.surface2,
          borderRadius: r.sm,
          border:       `1px solid ${c.border}`,
          padding:      '10px 14px',
          marginBottom: '16px',
        }}
      >
        <div style={{ fontSize: '10px', color: c.muted, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Preview
        </div>
        <div style={{ fontSize: '13px', color: c.text, fontFamily: tokens.font.mono }}>
          <span style={{ color: c.muted }}>{siteUrl}/list/</span>
          <span style={{ color: c.purple, fontWeight: 700 }}>{displayUsername}</span>
          <span style={{ color: c.muted }}>/my-wishlist</span>
        </div>
      </div>

      {/* Save button + feedback */}
      {saveError && (
        <p style={{ margin: '0 0 10px', fontSize: '12px', color: c.red ?? '#E24B4A' }}>
          {saveError}
        </p>
      )}
      {saveSuccess && (
        <p style={{ margin: '0 0 10px', fontSize: '12px', color: c.green }}>
          ✓ Username updated!
        </p>
      )}

      <button
        onClick={handleSave}
        disabled={checkState !== 'available' || saving}
        style={{
          padding:      '10px 24px',
          borderRadius: r.pill,
          background:   checkState === 'available' && !saving ? c.purple : c.surface3,
          border:       'none',
          color:        checkState === 'available' && !saving ? '#fff' : c.muted,
          fontSize:     '13px',
          fontWeight:   700,
          cursor:       checkState === 'available' && !saving ? 'pointer' : 'not-allowed',
          transition:   'background 150ms',
        }}
      >
        {saving ? 'Saving…' : 'Save username'}
      </button>

      <p style={{ margin: '10px 0 0', fontSize: '11px', color: c.muted, lineHeight: 1.5 }}>
        Changing your username updates all your list URLs automatically.
        Old links will still redirect to your new username.
      </p>
    </div>
  )
}
