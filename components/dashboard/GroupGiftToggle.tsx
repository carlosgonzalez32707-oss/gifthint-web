/**
 * components/dashboard/GroupGiftToggle.tsx — GiftHint
 *
 * In-editor toggle that lets the wisher convert any item into a group gift.
 *
 * Flow when enabling:
 *   1. Toggle turns on → expand form (target amount, organiser name & email).
 *   2. "Create pool" → POST /api/group-gift/create-pool with wisher's google_id.
 *   3. On success: collapses form, shows green confirmation banner.
 *      item.is_group_gift / group_gift_target are updated via onSaved().
 *
 * Flow when disabling:
 *   1. Toggle turns off → checks for an existing open pool.
 *   2. If no pool: toggles off silently.
 *   3. If pool exists: shows warning modal with contributor count.
 *   4. On confirm: POST /api/group-gift/refund (issues Stripe refunds).
 *   5. Pool cancelled; item returned to regular gift via onSaved().
 *
 * Locked states:
 *   - Pool status 'funded' → toggle read-only; directs wisher to group-gifts page.
 *   - Pool status 'purchased' → read-only; shows completed badge.
 *
 * Props:
 *   item     — item snapshot (only id, price, currency, is_group_gift, group_gift_target)
 *   accent   — theme accent colour for the save button
 *   onSaved  — called with updated group-gift fields after create / cancel
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { tokens }          from '@/tokens'
import { getBrowserClient } from '@/lib/supabase-browser'

// ── Auth helper ───────────────────────────────────────────────────────────────
// create-pool and refund routes authenticate via google_id as Bearer token.
// Supabase stores the Google OAuth subject claim in user_metadata.sub.

async function getGoogleId(): Promise<string | null> {
  const supabase = getBrowserClient()
  const { data: { session } } = await supabase.auth.getSession()
  return (session?.user?.user_metadata?.sub as string | undefined) ?? null
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GroupGiftToggleItem {
  id:                 string
  price:              number | null
  currency:           string
  is_group_gift?:     boolean
  group_gift_target?: number | null
}

interface GiftPool {
  id:               string
  status:           'open' | 'funded' | 'purchased' | 'cancelled'
  target_amount:    number
  collected_amount: number
  organiser_name:   string
  organiser_email:  string
}

interface GroupGiftToggleProps {
  item:     GroupGiftToggleItem
  accent?:  string
  onSaved?: (patch: { is_group_gift: boolean; group_gift_target: number | null }) => void
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ToggleSwitch({
  checked, onChange, disabled,
}: {
  checked:   boolean
  onChange:  (val: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        position:     'relative',
        width:        '40px',
        height:       '22px',
        borderRadius: '999px',
        border:       'none',
        cursor:       disabled ? 'not-allowed' : 'pointer',
        background:   checked ? tokens.colors.purple : tokens.colors.surface3,
        transition:   'background 200ms',
        flexShrink:   0,
        padding:      0,
        opacity:      disabled ? 0.5 : 1,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position:     'absolute',
          top:          '3px',
          left:         checked ? '21px' : '3px',
          width:        '16px',
          height:       '16px',
          borderRadius: '50%',
          background:   '#fff',
          transition:   'left 200ms',
          boxShadow:    '0 1px 3px rgba(0,0,0,0.35)',
        }}
      />
    </button>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      margin:          '0 0 5px',
      fontSize:        '10.5px',
      fontWeight:      700,
      color:           tokens.colors.muted,
      textTransform:   'uppercase',
      letterSpacing:   '0.06em',
    }}>
      {children}
    </p>
  )
}

function TextInput({
  value, onChange, placeholder, type = 'text', disabled,
}: {
  value:        string
  onChange:     (v: string) => void
  placeholder?: string
  type?:        string
  disabled?:    boolean
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width:        '100%',
        boxSizing:    'border-box',
        padding:      '8px 10px',
        borderRadius: tokens.radius.sm,
        border:       `1px solid ${tokens.colors.border}`,
        background:   tokens.colors.surface2,
        color:        tokens.colors.text,
        fontSize:     '13px',
        outline:      'none',
        opacity:      disabled ? 0.6 : 1,
        fontFamily:   tokens.font.sans,
      }}
    />
  )
}

function CancelWarningModal({
  contributorCount, onConfirm, onCancel, isLoading,
}: {
  contributorCount: number
  onConfirm:        () => void
  onCancel:         () => void
  isLoading:        boolean
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-pool-title"
      style={{
        position:       'fixed',
        inset:          0,
        zIndex:         1000,
        background:     'rgba(0,0,0,0.65)',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        padding:        '16px',
      }}
    >
      <div style={{
        background:   tokens.colors.surface,
        borderRadius: tokens.radius.xl,
        border:       `1px solid ${tokens.colors.border}`,
        padding:      '28px',
        maxWidth:     '380px',
        width:        '100%',
        boxShadow:    tokens.shadow.pop,
      }}>
        <p style={{ fontSize: '28px', margin: '0 0 10px', textAlign: 'center' }}>⚠️</p>
        <h3
          id="cancel-pool-title"
          style={{
            margin:     '0 0 10px',
            fontSize:   '16px',
            fontWeight: 700,
            color:      tokens.colors.text,
            textAlign:  'center',
          }}
        >
          Cancel group gift?
        </h3>
        <p style={{
          margin:     '0 0 22px',
          fontSize:   '13.5px',
          color:      tokens.colors.muted,
          lineHeight: 1.6,
          textAlign:  'center',
        }}>
          {contributorCount > 0
            ? `${contributorCount} contributor${contributorCount === 1 ? '' : 's'} will be refunded automatically via Stripe. This cannot be undone.`
            : 'The pool will be cancelled. There are no contributions to refund.'}
        </p>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            style={{
              flex:         1,
              padding:      '10px',
              borderRadius: tokens.radius.sm,
              border:       `1px solid ${tokens.colors.border}`,
              background:   'transparent',
              color:        tokens.colors.text,
              fontSize:     '13px',
              fontWeight:   600,
              cursor:       'pointer',
            }}
          >
            Keep pool
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            style={{
              flex:         1,
              padding:      '10px',
              borderRadius: tokens.radius.sm,
              border:       'none',
              background:   tokens.colors.red,
              color:        '#fff',
              fontSize:     '13px',
              fontWeight:   700,
              cursor:       isLoading ? 'not-allowed' : 'pointer',
              opacity:      isLoading ? 0.7 : 1,
            }}
          >
            {isLoading ? 'Cancelling…' : 'Confirm cancel'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function GroupGiftToggle({ item, accent = tokens.colors.purple, onSaved }: GroupGiftToggleProps) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [enabled,          setEnabled]          = useState(item.is_group_gift ?? false)
  const [pool,             setPool]             = useState<GiftPool | null>(null)
  const [poolLoading,      setPoolLoading]      = useState(item.is_group_gift ?? false)

  // Form fields — pre-populate from item
  const [target,   setTarget]   = useState(String(item.group_gift_target ?? item.price ?? ''))
  const [orgName,  setOrgName]  = useState('')
  const [orgEmail, setOrgEmail] = useState('')

  // UI
  const [saving,            setSaving]            = useState(false)
  const [error,             setError]             = useState<string | null>(null)
  const [showWarning,       setShowWarning]       = useState(false)
  const [cancelling,        setCancelling]        = useState(false)
  const [contributorCount,  setContributorCount]  = useState(0)

  // ── Load existing pool on mount ────────────────────────────────────────────
  const fetchPool = useCallback(async () => {
    if (!item.is_group_gift) { setPoolLoading(false); return }

    setPoolLoading(true)
    try {
      const supabase = getBrowserClient()

      const { data: poolData } = await supabase
        .from('gift_pools')
        .select('id, status, target_amount, collected_amount, organiser_name, organiser_email')
        .eq('item_id', item.id)
        .in('status', ['open', 'funded', 'purchased'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (poolData) {
        setPool(poolData as GiftPool)
        setTarget(String(poolData.target_amount))
        setOrgName(poolData.organiser_name ?? '')
        setOrgEmail(poolData.organiser_email ?? '')

        // Count contributors who have paid (for the cancel warning copy)
        const { count } = await supabase
          .from('gift_contributions')
          .select('*', { count: 'exact', head: true })
          .eq('pool_id', poolData.id)
          .eq('stripe_payment_status', 'succeeded')

        setContributorCount(count ?? 0)
      }
    } finally {
      setPoolLoading(false)
    }
  }, [item.id, item.is_group_gift])

  useEffect(() => { fetchPool() }, [fetchPool])

  // ── Create pool ────────────────────────────────────────────────────────────
  async function handleSave() {
    setError(null)

    const targetNum = parseFloat(target)
    if (!target || isNaN(targetNum) || targetNum <= 0) {
      setError('Target amount must be a positive number.')
      return
    }
    if (!orgName.trim()) {
      setError('Organiser name is required.')
      return
    }
    if (!orgEmail.trim() || !orgEmail.includes('@')) {
      setError('A valid organiser email is required.')
      return
    }

    setSaving(true)
    try {
      const googleId = await getGoogleId()
      if (!googleId) { setError('Not signed in.'); setSaving(false); return }

      const res = await fetch('/api/group-gift/create-pool', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${googleId}`,
        },
        body: JSON.stringify({
          itemId:         item.id,
          targetAmount:   targetNum,
          organiserName:  orgName.trim(),
          organiserEmail: orgEmail.trim().toLowerCase(),
        }),
      })

      const json = await res.json()

      if (!res.ok) {
        if (res.status === 409) { await fetchPool(); return }
        setError(json.message ?? json.error ?? 'Failed to create pool.')
        return
      }

      setPool(json.pool as GiftPool)
      onSaved?.({ is_group_gift: true, group_gift_target: targetNum })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error.')
    } finally {
      setSaving(false)
    }
  }

  // ── Cancel / disable ───────────────────────────────────────────────────────
  function handleToggleOff() {
    if (pool) {
      setShowWarning(true)
    } else {
      setEnabled(false)
    }
  }

  async function confirmCancel() {
    if (!pool) { setEnabled(false); setShowWarning(false); return }

    setCancelling(true)
    try {
      const googleId = await getGoogleId()
      if (!googleId) { setError('Not signed in.'); setShowWarning(false); return }

      const res = await fetch('/api/group-gift/refund', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${googleId}`,
        },
        body: JSON.stringify({ poolId: pool.id }),
      })

      const json = await res.json()
      if (!res.ok) {
        setError(json.message ?? json.error ?? 'Failed to cancel pool.')
        setShowWarning(false)
        return
      }

      setPool(null)
      setEnabled(false)
      setShowWarning(false)
      onSaved?.({ is_group_gift: false, group_gift_target: null })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error.')
    } finally {
      setCancelling(false)
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const isSaved  = !!pool
  const isLocked = pool?.status === 'funded' || pool?.status === 'purchased'

  const poolSummary = pool
    ? `£${Number(pool.collected_amount).toFixed(2)} of £${Number(pool.target_amount).toFixed(2)} collected`
    : null

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Cancel warning modal */}
      {showWarning && (
        <CancelWarningModal
          contributorCount={contributorCount}
          onConfirm={confirmCancel}
          onCancel={() => setShowWarning(false)}
          isLoading={cancelling}
        />
      )}

      {/* Toggle row */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '13px 14px',
        borderRadius:   tokens.radius.md,
        background:     enabled ? tokens.colors.surface2 : 'transparent',
        border:         `1px solid ${enabled ? tokens.colors.purpleRing : tokens.colors.border}`,
        transition:     'all 200ms',
        gap:            '12px',
      }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: '13.5px', fontWeight: 600, color: tokens.colors.text }}>
            Group gift
          </p>
          <p style={{
            margin:   '2px 0 0',
            fontSize: '11.5px',
            color:    tokens.colors.muted,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {poolLoading
              ? 'Loading pool…'
              : isSaved
              ? `Pool ${pool!.status} · ${poolSummary}`
              : 'Let friends chip in together for this item'}
          </p>
        </div>
        <ToggleSwitch
          checked={enabled}
          disabled={poolLoading || isLocked}
          onChange={(val) => val ? setEnabled(true) : handleToggleOff()}
        />
      </div>

      {/* Form — shown when toggled on but pool not yet saved */}
      {enabled && !isSaved && (
        <div style={{
          marginTop:     '10px',
          padding:       '16px',
          borderRadius:  tokens.radius.md,
          border:        `1px solid ${tokens.colors.border}`,
          background:    tokens.colors.surface,
          display:       'flex',
          flexDirection: 'column',
          gap:           '14px',
        }}>
          <div>
            <FieldLabel>Target amount (£)</FieldLabel>
            <TextInput
              type="number"
              value={target}
              onChange={setTarget}
              placeholder={item.price ? String(item.price) : 'e.g. 50'}
              disabled={saving}
            />
          </div>

          <div>
            <FieldLabel>Your name (organiser)</FieldLabel>
            <TextInput
              value={orgName}
              onChange={setOrgName}
              placeholder="e.g. Sarah"
              disabled={saving}
            />
          </div>

          <div>
            <FieldLabel>Your email</FieldLabel>
            <TextInput
              type="email"
              value={orgEmail}
              onChange={setOrgEmail}
              placeholder="you@example.com"
              disabled={saving}
            />
            <p style={{ margin: '4px 0 0', fontSize: '11px', color: tokens.colors.muted }}>
              We'll email you when the pool is fully funded.
            </p>
          </div>

          {error && (
            <p style={{
              margin:       0,
              padding:      '8px 10px',
              borderRadius: tokens.radius.sm,
              background:   'rgba(226,75,74,0.1)',
              border:       '1px solid rgba(226,75,74,0.25)',
              fontSize:     '12.5px',
              color:        tokens.colors.red,
            }}>
              {error}
            </p>
          )}

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => { setEnabled(false); setError(null) }}
              disabled={saving}
              style={{
                padding:      '10px 14px',
                borderRadius: tokens.radius.sm,
                border:       `1px solid ${tokens.colors.border}`,
                background:   'transparent',
                color:        tokens.colors.muted,
                fontSize:     '13px',
                fontWeight:   600,
                cursor:       'pointer',
                flexShrink:   0,
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{
                flex:         1,
                padding:      '10px',
                borderRadius: tokens.radius.sm,
                border:       'none',
                background:   saving ? tokens.colors.surface3 : accent,
                color:        '#fff',
                fontSize:     '13px',
                fontWeight:   700,
                cursor:       saving ? 'not-allowed' : 'pointer',
                transition:   'background 150ms',
              }}
            >
              {saving ? 'Creating pool…' : 'Create group gift pool'}
            </button>
          </div>
        </div>
      )}

      {/* Pool open — success banner */}
      {enabled && isSaved && !isLocked && (
        <div style={{
          marginTop:    '10px',
          padding:      '11px 14px',
          borderRadius: tokens.radius.md,
          border:       `1px solid ${tokens.colors.greenRing}`,
          background:   tokens.colors.greenDim,
          display:      'flex',
          alignItems:   'center',
          gap:          '8px',
        }}>
          <span style={{ fontSize: '13px', flexShrink: 0 }}>✓</span>
          <p style={{ margin: 0, fontSize: '12.5px', color: tokens.colors.green, fontWeight: 600 }}>
            Pool is open — gifters can chip in from your wishlist page.
          </p>
        </div>
      )}

      {/* Funded / purchased lock notice */}
      {enabled && isLocked && (
        <div style={{
          marginTop:    '10px',
          padding:      '10px 14px',
          borderRadius: tokens.radius.sm,
          border:       `1px solid ${tokens.colors.amberRing}`,
          background:   tokens.colors.amberDim,
          fontSize:     '12px',
          color:        tokens.colors.amber,
          lineHeight:   1.5,
        }}>
          {pool?.status === 'funded'
            ? <>🎉 Pool fully funded! <a href="/dashboard/group-gifts" style={{ color: tokens.colors.amber, fontWeight: 700 }}>Go to Group Gifts</a> to mark it as purchased.</>
            : '✅ Pool is purchased and closed. Toggle cannot be changed.'}
        </div>
      )}

      {/* Post-save error (e.g. cancel failure) */}
      {error && isSaved && (
        <p style={{ margin: '8px 0 0', fontSize: '12.5px', color: tokens.colors.red }}>
          {error}
        </p>
      )}
    </div>
  )
}
