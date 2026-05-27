/**
 * app/dashboard/group-gifts/page.tsx — GiftHint
 *
 * Organiser management dashboard for the wisher's group gift pools.
 *
 * Features:
 *   - Lists every group gift pool across all of this wisher's items.
 *   - Per pool card:
 *       • Item thumbnail, title, retailer
 *       • Progress bar (collected / target)
 *       • Status badge: Open | Funded | Purchased | Cancelled
 *       • Expandable contributor list with amounts
 *       • "Mark as purchased" button (funded pools only)
 *
 *   - Mark-as-purchased modal:
 *       • Optional receipt URL field
 *       • On confirm: POST /api/group-gift/mark-purchased
 *       • Contributors automatically receive thank-you emails
 *
 * Auth: Client-side via useAuth() → redirects to /dashboard if not signed in.
 */

'use client'

import {
  useState,
  useEffect,
  useCallback,
  type FormEvent,
} from 'react'
import Link             from 'next/link'
import { useRouter }    from 'next/navigation'
import { tokens }       from '@/tokens'
import { useAuth }      from '@/hooks/useAuth'
import { getBrowserClient } from '@/lib/supabase-browser'

// ── Types ─────────────────────────────────────────────────────────────────────

type PoolStatus = 'open' | 'funded' | 'purchased' | 'cancelled'

interface Contribution {
  id:               string
  contributor_name: string | null
  amount:           number
  anonymous:        boolean
  contributed_at:   string
}

interface Pool {
  id:               string
  item_id:          string
  status:           PoolStatus
  target_amount:    number
  collected_amount: number
  organiser_name:   string
  organiser_email:  string
  created_at:       string
  funded_at:        string | null
  // denormalized from wishlist_items join
  item_title:       string
  item_image_url:   string | null
  item_source_url:  string
  item_price:       number | null
  item_currency:    string
  contributions:    Contribution[]
}

// ── Auth helper ───────────────────────────────────────────────────────────────

async function getGoogleId(): Promise<string | null> {
  const supabase = getBrowserClient()
  const { data: { session } } = await supabase.auth.getSession()
  return (session?.user?.user_metadata?.sub as string | undefined) ?? null
}

// ── Formatters ─────────────────────────────────────────────────────────────────

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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

// ── Status badge ───────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<PoolStatus, { label: string; color: string; bg: string; border: string }> = {
  open:      { label: 'Open',      color: tokens.colors.purple, bg: tokens.colors.purpleDim,  border: tokens.colors.purpleRing  },
  funded:    { label: 'Funded',    color: tokens.colors.green,  bg: tokens.colors.greenDim,   border: tokens.colors.greenRing   },
  purchased: { label: 'Purchased', color: tokens.colors.amber,  bg: tokens.colors.amberDim,   border: tokens.colors.amberRing   },
  cancelled: { label: 'Cancelled', color: tokens.colors.muted,  bg: tokens.colors.surface2,   border: tokens.colors.border      },
}

function StatusBadge({ status }: { status: PoolStatus }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span style={{
      display:      'inline-flex',
      alignItems:   'center',
      gap:          '5px',
      padding:      '3px 9px',
      borderRadius: tokens.radius.pill,
      border:       `1px solid ${cfg.border}`,
      background:   cfg.bg,
      color:        cfg.color,
      fontSize:     '11px',
      fontWeight:   700,
      letterSpacing:'0.04em',
      whiteSpace:   'nowrap',
    }}>
      {status === 'open'      && <span aria-hidden>●</span>}
      {status === 'funded'    && <span aria-hidden>🎉</span>}
      {status === 'purchased' && <span aria-hidden>✓</span>}
      {cfg.label}
    </span>
  )
}

// ── Progress bar ───────────────────────────────────────────────────────────────

function ProgressBar({ collected, target }: { collected: number; target: number }) {
  const pct     = target > 0 ? Math.min(100, (collected / target) * 100) : 0
  const isFull  = pct >= 100
  const display = `${Math.round(pct)}%`

  return (
    <div>
      <div style={{
        display:        'flex',
        justifyContent: 'space-between',
        marginBottom:   '6px',
      }}>
        <span style={{ fontSize: '12px', color: tokens.colors.muted }}>
          {formatMoney(collected)} raised
        </span>
        <span style={{ fontSize: '12px', color: tokens.colors.muted, fontWeight: 600 }}>
          {display} of {formatMoney(target)}
        </span>
      </div>
      <div style={{
        height:       '6px',
        borderRadius: '999px',
        background:   tokens.colors.surface3,
        overflow:     'hidden',
      }}>
        <div style={{
          height:     '100%',
          width:      `${pct}%`,
          borderRadius: '999px',
          background:  isFull
            ? tokens.colors.green
            : 'linear-gradient(90deg, #6C63E8 0%, #8B83F0 100%)',
          transition:  'width 600ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        }} />
      </div>
    </div>
  )
}

// ── Contributor row ─────────────────────────────────────────────────────────────

function ContributorRow({ contribution }: { contribution: Contribution }) {
  const name = contribution.anonymous || !contribution.contributor_name
    ? 'Anonymous'
    : contribution.contributor_name

  const initials = name === 'Anonymous'
    ? '?'
    : name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()

  // deterministic hue from name for avatar
  const hue = name.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 360

  return (
    <div style={{
      display:     'flex',
      alignItems:  'center',
      gap:         '10px',
      padding:     '8px 0',
      borderBottom: `1px solid ${tokens.colors.border}`,
    }}>
      <div style={{
        width:          '28px',
        height:         '28px',
        borderRadius:   '50%',
        background:     `hsl(${hue} 55% 38%)`,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        fontSize:       '11px',
        fontWeight:     700,
        color:          '#fff',
        flexShrink:     0,
        userSelect:     'none',
      }}>
        {initials}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: '13px', color: tokens.colors.text, fontWeight: 500 }}>
          {name}
        </p>
        <p style={{ margin: '1px 0 0', fontSize: '11px', color: tokens.colors.muted }}>
          {formatDate(contribution.contributed_at)}
        </p>
      </div>
      <span style={{ fontSize: '13px', color: tokens.colors.green, fontWeight: 700, flexShrink: 0 }}>
        {formatMoney(contribution.amount)}
      </span>
    </div>
  )
}

// ── Mark-as-purchased modal ───────────────────────────────────────────────────

function PurchaseModal({
  pool,
  onClose,
  onSuccess,
}: {
  pool:      Pool
  onClose:   () => void
  onSuccess: (poolId: string) => void
}) {
  const [receiptUrl, setReceiptUrl] = useState('')
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const googleId = await getGoogleId()
      if (!googleId) { setError('Not signed in.'); setSaving(false); return }

      const res = await fetch('/api/group-gift/mark-purchased', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${googleId}`,
        },
        body: JSON.stringify({
          poolId:     pool.id,
          receiptUrl: receiptUrl.trim() || undefined,
        }),
      })

      const json = await res.json()
      if (!res.ok) {
        setError(json.message ?? json.error ?? 'Failed to update pool.')
        return
      }

      onSuccess(pool.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="purchase-modal-title"
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
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background:   tokens.colors.surface,
        borderRadius: tokens.radius.xl,
        border:       `1px solid ${tokens.colors.border}`,
        padding:      '28px',
        maxWidth:     '420px',
        width:        '100%',
        boxShadow:    tokens.shadow.pop,
      }}>
        <p style={{ fontSize: '28px', margin: '0 0 10px', textAlign: 'center' }}>🛍️</p>
        <h3
          id="purchase-modal-title"
          style={{
            margin:     '0 0 6px',
            fontSize:   '17px',
            fontWeight: 700,
            color:      tokens.colors.text,
            textAlign:  'center',
          }}
        >
          Mark as purchased
        </h3>
        <p style={{
          margin:     '0 0 22px',
          fontSize:   '13px',
          color:      tokens.colors.muted,
          lineHeight: 1.6,
          textAlign:  'center',
        }}>
          Confirming this will send a thank-you email to all{' '}
          {pool.contributions.length > 0
            ? `${pool.contributions.length} contributor${pool.contributions.length === 1 ? '' : 's'}`
            : 'contributors'}
          . The pool will be permanently closed.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <p style={{
              margin:        '0 0 5px',
              fontSize:      '10.5px',
              fontWeight:    700,
              color:         tokens.colors.muted,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}>
              Receipt URL <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
            </p>
            <input
              type="url"
              value={receiptUrl}
              onChange={(e) => setReceiptUrl(e.target.value)}
              placeholder="https://..."
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
                fontFamily:   tokens.font.sans,
              }}
            />
            <p style={{ margin: '4px 0 0', fontSize: '11px', color: tokens.colors.muted }}>
              Attached to thank-you emails so contributors can verify the purchase.
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

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
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
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                flex:         1,
                padding:      '10px',
                borderRadius: tokens.radius.sm,
                border:       'none',
                background:   saving ? tokens.colors.surface3 : tokens.colors.green,
                color:        '#fff',
                fontSize:     '13px',
                fontWeight:   700,
                cursor:       saving ? 'not-allowed' : 'pointer',
                opacity:      saving ? 0.8 : 1,
              }}
            >
              {saving ? 'Sending emails…' : 'Confirm purchase'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Pool card ─────────────────────────────────────────────────────────────────

function PoolCard({
  pool,
  onMarkPurchased,
}: {
  pool:             Pool
  onMarkPurchased:  (pool: Pool) => void
}) {
  const [expanded, setExpanded] = useState(false)

  const pct = pool.target_amount > 0
    ? Math.min(100, (pool.collected_amount / pool.target_amount) * 100)
    : 0

  return (
    <div style={{
      background:   tokens.colors.surface,
      borderRadius: tokens.radius.lg,
      border:       `1px solid ${pool.status === 'funded' ? tokens.colors.greenRing : tokens.colors.border}`,
      overflow:     'hidden',
      boxShadow:    pool.status === 'funded' ? `0 0 0 1px ${tokens.colors.greenRing}` : 'none',
      transition:   'box-shadow 200ms',
    }}>
      {/* Card header */}
      <div style={{ padding: '18px 20px', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
        {/* Thumbnail */}
        <div style={{
          width:      '52px',
          height:     '52px',
          flexShrink: 0,
          borderRadius: tokens.radius.sm,
          overflow:   'hidden',
          background: tokens.colors.surface2,
          border:     `1px solid ${tokens.colors.border}`,
          display:    'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize:   '22px',
        }}>
          {pool.item_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={pool.item_image_url}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : '🎁'}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
            <StatusBadge status={pool.status} />
            <span style={{ fontSize: '11px', color: tokens.colors.muted }}>
              Created {formatDate(pool.created_at)}
            </span>
          </div>
          <p style={{
            margin:       '0 0 2px',
            fontSize:     '14px',
            fontWeight:   600,
            color:        tokens.colors.text,
            overflow:     'hidden',
            textOverflow: 'ellipsis',
            whiteSpace:   'nowrap',
          }}>
            {pool.item_title}
          </p>
          <p style={{ margin: 0, fontSize: '11.5px', color: tokens.colors.muted }}>
            Organised by {pool.organiser_name} · {pool.contributions.length} contributor{pool.contributions.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0, alignItems: 'flex-end' }}>
          {pool.status === 'funded' && (
            <button
              type="button"
              onClick={() => onMarkPurchased(pool)}
              style={{
                padding:      '7px 14px',
                borderRadius: tokens.radius.sm,
                border:       'none',
                background:   tokens.colors.green,
                color:        '#fff',
                fontSize:     '12px',
                fontWeight:   700,
                cursor:       'pointer',
                whiteSpace:   'nowrap',
              }}
            >
              Mark purchased →
            </button>
          )}
          <a
            href={pool.item_source_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding:      '5px 10px',
              borderRadius: tokens.radius.sm,
              border:       `1px solid ${tokens.colors.border}`,
              background:   'transparent',
              color:        tokens.colors.muted,
              fontSize:     '11px',
              fontWeight:   600,
              textDecoration: 'none',
              whiteSpace:   'nowrap',
            }}
          >
            View item ↗
          </a>
        </div>
      </div>

      {/* Progress */}
      <div style={{ padding: '0 20px 16px' }}>
        <ProgressBar collected={pool.collected_amount} target={pool.target_amount} />
      </div>

      {/* Funded-at timestamp */}
      {pool.funded_at && (
        <div style={{
          padding:      '8px 20px',
          borderTop:    `1px solid ${tokens.colors.border}`,
          background:   tokens.colors.greenDim,
          fontSize:     '11.5px',
          color:        tokens.colors.green,
        }}>
          🎉 Fully funded on {formatDate(pool.funded_at)}
        </div>
      )}

      {/* Contributors accordion */}
      {pool.contributions.length > 0 && (
        <div style={{ borderTop: `1px solid ${tokens.colors.border}` }}>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            style={{
              width:      '100%',
              padding:    '11px 20px',
              background: 'transparent',
              border:     'none',
              display:    'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor:     'pointer',
              color:      tokens.colors.muted,
              fontSize:   '12px',
              fontWeight: 600,
            }}
          >
            <span>
              {pool.contributions.length} contributor{pool.contributions.length !== 1 ? 's' : ''}
              {' '}·{' '}
              <span style={{ color: tokens.colors.green }}>
                {formatMoney(pool.collected_amount)} total
              </span>
            </span>
            <span style={{
              transform:  expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 200ms',
              display:    'inline-block',
              fontSize:   '10px',
            }}>
              ▼
            </span>
          </button>

          {expanded && (
            <div style={{ padding: '0 20px 4px' }}>
              {pool.contributions.map((c) => (
                <ContributorRow key={c.id} contribution={c} />
              ))}
            </div>
          )}
        </div>
      )}

      {pool.contributions.length === 0 && pool.status === 'open' && (
        <div style={{
          borderTop:  `1px solid ${tokens.colors.border}`,
          padding:    '12px 20px',
          fontSize:   '12.5px',
          color:      tokens.colors.muted,
          textAlign:  'center',
        }}>
          No contributions yet. Share your wishlist to get started.
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GroupGiftsPage() {
  const router              = useRouter()
  const { user, loading }   = useAuth()
  const [pools,    setPools]    = useState<Pool[]>([])
  const [fetching, setFetching] = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [activeModal, setActiveModal] = useState<Pool | null>(null)

  // ── Filter state ───────────────────────────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState<PoolStatus | 'all'>('all')

  const visiblePools = statusFilter === 'all'
    ? pools
    : pools.filter((p) => p.status === statusFilter)

  // ── Auth redirect ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!loading && !user) router.replace('/dashboard')
  }, [loading, user, router])

  // ── Data fetch ─────────────────────────────────────────────────────────────
  const fetchPools = useCallback(async () => {
    if (!user) return
    setFetching(true)
    setError(null)

    try {
      const supabase = getBrowserClient()

      // Resolve internal user_id from auth session
      const googleId = await getGoogleId()
      if (!googleId) return

      const { data: dbUser } = await supabase
        .from('users')
        .select('id')
        .eq('google_id', googleId)
        .maybeSingle()

      if (!dbUser) return

      // Fetch wishlist_items owned by this user that are group gifts
      const { data: items } = await supabase
        .from('wishlist_items')
        .select('id, title, image_url, source_url, price, currency')
        .eq('user_id', dbUser.id)
        .eq('is_group_gift', true)

      if (!items || items.length === 0) {
        setPools([])
        return
      }

      const itemIds = items.map((i) => i.id)
      const itemMap = new Map(items.map((i) => [i.id, i]))

      // Fetch pools for those items
      const { data: poolRows, error: poolErr } = await supabase
        .from('gift_pools')
        .select('*')
        .in('item_id', itemIds)
        .order('created_at', { ascending: false })

      if (poolErr) { setError(poolErr.message); return }
      if (!poolRows) { setPools([]); return }

      // Fetch contributions for all pools
      const poolIds = poolRows.map((p) => p.id)
      const { data: contribRows } = await supabase
        .from('gift_contributions')
        .select('id, pool_id, contributor_name, amount, anonymous, contributed_at')
        .in('pool_id', poolIds)
        .eq('stripe_payment_status', 'succeeded')
        .order('contributed_at', { ascending: true })

      const contribsByPool = new Map<string, Contribution[]>()
      for (const c of contribRows ?? []) {
        const arr = contribsByPool.get(c.pool_id) ?? []
        arr.push({
          id:               c.id,
          contributor_name: c.contributor_name,
          amount:           Number(c.amount),
          anonymous:        c.anonymous,
          contributed_at:   c.contributed_at,
        })
        contribsByPool.set(c.pool_id, arr)
      }

      // Assemble pool objects
      const assembled: Pool[] = poolRows.map((p) => {
        const item = itemMap.get(p.item_id)!
        return {
          id:               p.id,
          item_id:          p.item_id,
          status:           p.status as PoolStatus,
          target_amount:    Number(p.target_amount),
          collected_amount: Number(p.collected_amount),
          organiser_name:   p.organiser_name ?? '',
          organiser_email:  p.organiser_email ?? '',
          created_at:       p.created_at,
          funded_at:        p.funded_at ?? null,
          item_title:       item.title,
          item_image_url:   item.image_url,
          item_source_url:  item.source_url,
          item_price:       item.price,
          item_currency:    item.currency,
          contributions:    contribsByPool.get(p.id) ?? [],
        }
      })

      setPools(assembled)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pools.')
    } finally {
      setFetching(false)
    }
  }, [user])

  useEffect(() => { fetchPools() }, [fetchPools])

  // ── Mark purchased success ─────────────────────────────────────────────────
  function handlePurchaseSuccess(poolId: string) {
    setPools((prev) => prev.map((p) =>
      p.id === poolId ? { ...p, status: 'purchased' as PoolStatus } : p,
    ))
    setActiveModal(null)
  }

  // ── Counts for filter pills ────────────────────────────────────────────────
  const counts: Record<string, number> = {
    all:       pools.length,
    open:      pools.filter((p) => p.status === 'open').length,
    funded:    pools.filter((p) => p.status === 'funded').length,
    purchased: pools.filter((p) => p.status === 'purchased').length,
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading || (!user && !error)) {
    return (
      <div style={{
        minHeight:      '100vh',
        background:     tokens.colors.bg,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
      }}>
        <p style={{ color: tokens.colors.muted, fontSize: '14px' }}>Loading…</p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: tokens.colors.bg, fontFamily: tokens.font.sans }}>
      {/* Purchase modal */}
      {activeModal && (
        <PurchaseModal
          pool={activeModal}
          onClose={() => setActiveModal(null)}
          onSuccess={handlePurchaseSuccess}
        />
      )}

      {/* Header */}
      <header style={{
        borderBottom: `1px solid ${tokens.colors.border}`,
        background:   tokens.colors.surface,
      }}>
        <div style={{
          maxWidth: '780px',
          margin:   '0 auto',
          padding:  '0 20px',
          height:   '60px',
          display:  'flex',
          alignItems: 'center',
          gap:      '16px',
        }}>
          <Link
            href="/dashboard"
            style={{
              color:          tokens.colors.muted,
              textDecoration: 'none',
              fontSize:       '13px',
              display:        'flex',
              alignItems:     'center',
              gap:            '4px',
            }}
          >
            ← Dashboard
          </Link>
          <span style={{ color: tokens.colors.border }}>|</span>
          <h1 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: tokens.colors.text }}>
            Group Gifts
          </h1>
        </div>
      </header>

      <main style={{ maxWidth: '780px', margin: '0 auto', padding: '32px 20px' }}>
        {/* Page title */}
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ margin: '0 0 6px', fontSize: '22px', fontWeight: 800, color: tokens.colors.text, letterSpacing: '-0.03em' }}>
            Your group gift pools
          </h2>
          <p style={{ margin: 0, fontSize: '13.5px', color: tokens.colors.muted }}>
            Track contributions and mark gifts as purchased when the money is collected.
          </p>
        </div>

        {/* Status filter pills */}
        <div style={{
          display:    'flex',
          gap:        '8px',
          flexWrap:   'wrap',
          marginBottom: '20px',
        }}>
          {(['all', 'open', 'funded', 'purchased'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              style={{
                padding:      '5px 13px',
                borderRadius: tokens.radius.pill,
                border:       `1px solid ${statusFilter === s ? tokens.colors.purple : tokens.colors.border}`,
                background:   statusFilter === s ? tokens.colors.purpleDim : 'transparent',
                color:        statusFilter === s ? tokens.colors.purple : tokens.colors.muted,
                fontSize:     '12px',
                fontWeight:   statusFilter === s ? 700 : 500,
                cursor:       'pointer',
                transition:   'all 150ms',
              }}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
              {counts[s] > 0 && (
                <span style={{ marginLeft: '5px', opacity: 0.7 }}>({counts[s]})</span>
              )}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div style={{
            padding:      '12px 16px',
            borderRadius: tokens.radius.md,
            background:   'rgba(226,75,74,0.1)',
            border:       '1px solid rgba(226,75,74,0.25)',
            marginBottom: '20px',
            fontSize:     '13.5px',
            color:        tokens.colors.red,
          }}>
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {fetching && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[1, 2].map((i) => (
              <div
                key={i}
                style={{
                  height:       '120px',
                  borderRadius: tokens.radius.lg,
                  background:   tokens.colors.surface,
                  border:       `1px solid ${tokens.colors.border}`,
                  animation:    'pulse 1.5s ease-in-out infinite',
                }}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!fetching && visiblePools.length === 0 && (
          <div style={{
            textAlign:    'center',
            padding:      '60px 20px',
            borderRadius: tokens.radius.xl,
            border:       `1px dashed ${tokens.colors.border}`,
          }}>
            <p style={{ fontSize: '32px', margin: '0 0 12px' }}>🎁</p>
            <p style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: 600, color: tokens.colors.text }}>
              {statusFilter === 'all'
                ? 'No group gift pools yet'
                : `No ${statusFilter} pools`}
            </p>
            <p style={{ margin: '0 0 20px', fontSize: '13px', color: tokens.colors.muted }}>
              {statusFilter === 'all'
                ? 'Enable "Group gift" on any item in your dashboard to let friends chip in.'
                : 'Try a different filter.'}
            </p>
            {statusFilter === 'all' && (
              <Link
                href="/dashboard"
                style={{
                  display:        'inline-block',
                  padding:        '9px 20px',
                  borderRadius:   tokens.radius.sm,
                  background:     tokens.colors.purple,
                  color:          '#fff',
                  textDecoration: 'none',
                  fontSize:       '13px',
                  fontWeight:     700,
                }}
              >
                Go to dashboard →
              </Link>
            )}
          </div>
        )}

        {/* Pool list */}
        {!fetching && visiblePools.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {visiblePools.map((pool) => (
              <PoolCard
                key={pool.id}
                pool={pool}
                onMarkPurchased={setActiveModal}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
