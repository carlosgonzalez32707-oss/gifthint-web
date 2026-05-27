/**
 * components/GroupGiftCard.tsx — GiftHint
 *
 * Drop-in replacement for GiftCard when item.is_group_gift === true.
 * Wraps Stripe Elements so ChipInModal has access to the Stripe context.
 *
 * Visual states:
 *   open      — progress bar + "Chip in" CTA + amount selector
 *   funded    — 🎉 Fully funded banner, no CTA
 *   purchased — greyed out ✓ Gift purchased
 *   cancelled — greyed out notice
 *
 * Real-time:
 *   useGroupGiftPool subscribes to Supabase Realtime — progress bar updates
 *   live as other gifters contribute without a page refresh.
 *
 * Stripe Elements:
 *   The <Elements> provider is mounted here (not at the page level) so the
 *   payment context is scoped to this card. clientSecret is loaded lazily
 *   when the user clicks "Chip in" via ChipInModal → POST /api/group-gift/contribute.
 *   We pass a blank intent to Elements at mount and let ChipInModal manage
 *   the actual PaymentIntent creation.
 */

'use client'

import { useState, useMemo }        from 'react'
import Image                        from 'next/image'
import { loadStripe }               from '@stripe/stripe-js'
import { Elements }                 from '@stripe/react-stripe-js'
import { tokens }                   from '@/tokens'
import { useGroupGiftPool }         from '@/hooks/useGroupGiftPool'
import { ChipInModal }              from '@/components/ChipInModal'
import type { WishlistItem }        from '@/types/wishlist'

// ── Stripe singleton ──────────────────────────────────────────────────────────
// loadStripe is called once per page render — safe to call outside components.

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '',
)

// ── Preset contribution amounts ───────────────────────────────────────────────

const PRESET_AMOUNTS = [10, 25, 50]

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

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// Deterministic pastel hue from a string — gives each contributor a unique colour
function getAvatarHue(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 55%, 45%)`
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ContributorAvatar({ name }: { name: string }) {
  return (
    <div
      title={name}
      aria-label={name}
      style={{
        width:          '26px',
        height:         '26px',
        borderRadius:   '50%',
        background:     getAvatarHue(name),
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        fontSize:       '9.5px',
        fontWeight:     700,
        color:          '#fff',
        border:         `2px solid ${tokens.colors.surface}`,
        flexShrink:     0,
        marginLeft:     '-6px',
        userSelect:     'none',
      }}
    >
      {getInitials(name)}
    </div>
  )
}

// ── ProgressBar ───────────────────────────────────────────────────────────────

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${percent}% funded`}
      style={{
        width:        '100%',
        height:       '7px',
        borderRadius: '999px',
        background:   tokens.colors.surface3,
        overflow:     'hidden',
      }}
    >
      <div
        style={{
          width:      `${percent}%`,
          height:     '100%',
          borderRadius: '999px',
          background: percent >= 100
            ? tokens.colors.green
            : 'linear-gradient(90deg, #2DD4BF 0%, #14B8A6 100%)',
          transition: 'width 600ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      />
    </div>
  )
}

// ── AmountSelector ────────────────────────────────────────────────────────────

function AmountSelector({
  value,
  onChange,
  currency,
  maxRemaining,
  disabled,
}: {
  value:        number
  onChange:     (v: number) => void
  currency:     string
  maxRemaining: number
  disabled:     boolean
}) {
  const [customRaw, setCustomRaw] = useState('')
  const [showCustom, setShowCustom] = useState(false)

  const handlePreset = (amount: number) => {
    setShowCustom(false)
    setCustomRaw('')
    onChange(Math.min(amount, maxRemaining))
  }

  const handleCustomChange = (raw: string) => {
    setCustomRaw(raw)
    const parsed = parseFloat(raw)
    if (!isNaN(parsed) && parsed > 0) {
      onChange(Math.min(parsed, maxRemaining))
    }
  }

  return (
    <div>
      {/* Preset buttons */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
        {PRESET_AMOUNTS.map((preset) => {
          const capped   = Math.min(preset, maxRemaining)
          const selected = !showCustom && value === capped && capped > 0
          return (
            <button
              key={preset}
              onClick={() => handlePreset(preset)}
              disabled={disabled || maxRemaining <= 0}
              style={{
                flex:         1,
                padding:      '7px 4px',
                borderRadius: tokens.radius.sm,
                border:       `1px solid ${selected ? tokens.colors.purple : tokens.colors.border}`,
                background:   selected ? tokens.colors.purpleDim : tokens.colors.surface2,
                color:        selected ? tokens.colors.purple : tokens.colors.text,
                fontSize:     '12px',
                fontWeight:   600,
                cursor:       disabled || maxRemaining <= 0 ? 'default' : 'pointer',
                transition:   'all 150ms ease',
                opacity:      disabled ? 0.5 : 1,
              }}
            >
              {formatMoney(preset, currency)}
            </button>
          )
        })}

        {/* Custom amount toggle */}
        <button
          onClick={() => setShowCustom((s) => !s)}
          disabled={disabled || maxRemaining <= 0}
          style={{
            flex:         1,
            padding:      '7px 4px',
            borderRadius: tokens.radius.sm,
            border:       `1px solid ${showCustom ? tokens.colors.purple : tokens.colors.border}`,
            background:   showCustom ? tokens.colors.purpleDim : tokens.colors.surface2,
            color:        showCustom ? tokens.colors.purple : tokens.colors.muted,
            fontSize:     '12px',
            fontWeight:   600,
            cursor:       disabled || maxRemaining <= 0 ? 'default' : 'pointer',
            transition:   'all 150ms ease',
          }}
        >
          Other
        </button>
      </div>

      {/* Custom input */}
      {showCustom && (
        <input
          type="number"
          min={0.30}
          max={maxRemaining}
          step={0.01}
          value={customRaw}
          onChange={(e) => handleCustomChange(e.target.value)}
          placeholder={`Max ${formatMoney(maxRemaining, currency)}`}
          disabled={disabled}
          style={{
            width:        '100%',
            boxSizing:    'border-box',
            background:   tokens.colors.surface2,
            border:       `1px solid ${tokens.colors.border}`,
            borderRadius: tokens.radius.sm,
            padding:      '9px 12px',
            fontSize:     '13px',
            color:        tokens.colors.text,
            outline:      'none',
          }}
          onFocus={(e) => { e.target.style.borderColor = tokens.colors.purple }}
          onBlur={(e)  => { e.target.style.borderColor = tokens.colors.border  }}
        />
      )}
    </div>
  )
}

// ── GroupGiftCard ─────────────────────────────────────────────────────────────

interface GroupGiftCardProps {
  item:       WishlistItem
  currency?:  string
}

function GroupGiftCardInner({ item, currency = 'gbp' }: GroupGiftCardProps) {
  const {
    pool,
    contributions,
    totalCollected,
    percentFunded,
    isFullyFunded,
    isLoading,
  } = useGroupGiftPool(item.id)

  const [selectedAmount, setSelectedAmount] = useState(PRESET_AMOUNTS[0])
  const [modalOpen,      setModalOpen]      = useState(false)

  const [imgState, setImgState] = useState<'loading' | 'loaded' | 'error'>(
    item.image_url ? 'loading' : 'error',
  )

  // Named (non-anonymous) contributors
  const namedContributors = useMemo(
    () => contributions.filter((c) => !c.anonymous && c.contributor_name),
    [contributions],
  )

  const visibleAvatars = namedContributors.slice(0, 5)
  const extraCount     = namedContributors.length - visibleAvatars.length

  const targetAmount  = pool ? Number(pool.target_amount) : (item.group_gift_target ?? 0)
  const remaining     = Math.max(0, targetAmount - totalCollected)
  const isPurchased   = pool?.status === 'purchased'
  const isCancelled   = pool?.status === 'cancelled'
  const isOpen        = pool?.status === 'open' && !isFullyFunded
  const isDimmed      = isPurchased || isCancelled

  // ── Stripe Elements options ────────────────────────────────────────────────
  // We don't have a clientSecret at card-mount time (it's created on-demand
  // in ChipInModal). Pass a `mode` configuration instead — Stripe Elements
  // supports "deferred intent" mode for exactly this pattern.
  const elementsOptions = useMemo(() => ({
    mode:     'payment' as const,
    amount:   Math.round(selectedAmount * 100),
    currency: currency.toLowerCase(),
    appearance: {
      theme:     'night' as const,
      variables: {
        colorPrimary:    tokens.colors.purple,
        colorBackground: tokens.colors.surface2,
        colorText:       tokens.colors.text,
        colorDanger:     tokens.colors.red,
        borderRadius:    '6px',
        fontFamily:      tokens.font.sans,
      },
    },
  }), [selectedAmount, currency])

  return (
    <>
      <article
        style={{
          background:   tokens.colors.surface,
          border:       `1px solid ${tokens.colors.border}`,
          borderRadius: '16px',
          overflow:     'hidden',
          display:      'flex',
          flexDirection: 'column',
          opacity:      isDimmed ? 0.55 : 1,
          filter:       isDimmed ? 'grayscale(0.4)' : 'none',
          transition:   'opacity 200ms ease, filter 200ms ease',
        }}
        aria-label={`${item.title} — group gift`}
      >
        {/* ── Product image ──────────────────────────────────────────── */}
        <div
          style={{
            position:    'relative',
            width:       '100%',
            aspectRatio: '1 / 1',
            background:  tokens.colors.surface2,
          }}
        >
          {imgState !== 'error' && item.image_url ? (
            <Image
              src={item.image_url}
              alt={item.title}
              fill
              sizes="(max-width: 480px) 50vw, (max-width: 768px) 33vw, 200px"
              className="object-cover"
              onLoad={() => setImgState('loaded')}
              onError={() => setImgState('error')}
              unoptimized
            />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '40px' }}>
              🎁
            </div>
          )}

          {/* Group gift badge */}
          <div
            aria-hidden="true"
            style={{
              position:     'absolute',
              top:          '8px',
              left:         '8px',
              background:   'rgba(20,20,24,0.88)',
              borderRadius: tokens.radius.pill,
              padding:      '3px 8px',
              fontSize:     '9.5px',
              fontWeight:   700,
              color:        tokens.colors.text,
              backdropFilter: 'blur(6px)',
              letterSpacing: '0.05em',
            }}
          >
            👥 Group gift
          </div>
        </div>

        {/* ── Card body ──────────────────────────────────────────────── */}
        <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>

          {/* Title */}
          <p style={{
            fontSize:   '13px',
            fontWeight: 500,
            color:      tokens.colors.text,
            lineHeight: 1.4,
            display:    '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow:   'hidden',
          }}>
            {item.title}
          </p>

          {/* Target price */}
          {targetAmount > 0 && (
            <p style={{ fontSize: '12.5px', fontWeight: 600, color: tokens.colors.green }}>
              Target: {formatMoney(targetAmount, currency)}
            </p>
          )}

          {/* ── Progress section ────────────────────────────────────── */}
          {!isLoading && pool && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <ProgressBar percent={percentFunded} />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: tokens.colors.text, fontWeight: 600 }}>
                  {formatMoney(totalCollected, currency)}
                  <span style={{ color: tokens.colors.muted, fontWeight: 400 }}>
                    {' '}of {formatMoney(targetAmount, currency)}
                  </span>
                </span>
                <span style={{ fontSize: '11px', color: tokens.colors.muted }}>
                  {percentFunded}%
                </span>
              </div>

              {/* Contributor count */}
              {contributions.length > 0 && (
                <p style={{ fontSize: '11px', color: tokens.colors.muted }}>
                  {contributions.length} {contributions.length === 1 ? 'person has' : 'people have'} contributed
                </p>
              )}

              {/* Contributor avatars */}
              {visibleAvatars.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  {/* First avatar has no negative margin */}
                  <div key={visibleAvatars[0].id} title={visibleAvatars[0].contributor_name!} style={{
                    width: '26px', height: '26px', borderRadius: '50%',
                    background: getAvatarHue(visibleAvatars[0].contributor_name!),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '9.5px', fontWeight: 700, color: '#fff',
                    border: `2px solid ${tokens.colors.surface}`,
                    flexShrink: 0, userSelect: 'none',
                  }}>
                    {getInitials(visibleAvatars[0].contributor_name!)}
                  </div>
                  {visibleAvatars.slice(1).map((c) => (
                    <ContributorAvatar key={c.id} name={c.contributor_name!} />
                  ))}
                  {extraCount > 0 && (
                    <span style={{
                      marginLeft:   '6px',
                      fontSize:     '10.5px',
                      color:        tokens.colors.muted,
                    }}>
                      and {extraCount} more
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Loading skeleton for progress */}
          {isLoading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ height: '7px', borderRadius: '999px', background: tokens.colors.surface2 }} className="shimmer" />
              <div style={{ height: '11px', width: '60%', borderRadius: '4px', background: tokens.colors.surface2 }} className="shimmer" />
            </div>
          )}

          <div style={{ flex: 1, minHeight: '4px' }} />

          {/* ── State-dependent action area ─────────────────────────── */}

          {/* Open: amount selector + chip in button */}
          {isOpen && (
            <>
              <AmountSelector
                value={selectedAmount}
                onChange={setSelectedAmount}
                currency={currency}
                maxRemaining={remaining}
                disabled={false}
              />
              <button
                onClick={() => setModalOpen(true)}
                disabled={selectedAmount <= 0 || remaining <= 0}
                style={{
                  width:          '100%',
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  gap:            '6px',
                  background:     'linear-gradient(135deg, #2DD4BF 0%, #0D9488 100%)',
                  color:          '#fff',
                  border:         'none',
                  borderRadius:   tokens.radius.md,
                  padding:        '11px 12px',
                  fontSize:       '12.5px',
                  fontWeight:     700,
                  cursor:         selectedAmount <= 0 || remaining <= 0 ? 'default' : 'pointer',
                  opacity:        selectedAmount <= 0 || remaining <= 0 ? 0.5 : 1,
                  letterSpacing:  '0.05px',
                  transition:     'opacity 150ms ease',
                }}
                aria-label={`Chip in ${formatMoney(selectedAmount, currency)}`}
              >
                💚 Chip in {formatMoney(selectedAmount, currency)}
              </button>
            </>
          )}

          {/* Funded */}
          {isFullyFunded && !isPurchased && (
            <div style={{
              textAlign:    'center',
              padding:      '10px 12px',
              background:   tokens.colors.greenDim,
              border:       `1px solid ${tokens.colors.greenRing}`,
              borderRadius: tokens.radius.md,
              fontSize:     '12px',
              color:        tokens.colors.green,
              fontWeight:   600,
              lineHeight:   1.5,
            }}>
              🎉 Fully funded! The organiser will purchase this soon.
            </div>
          )}

          {/* Purchased */}
          {isPurchased && (
            <div style={{
              textAlign:    'center',
              padding:      '10px 12px',
              background:   tokens.colors.surface2,
              border:       `1px solid ${tokens.colors.border}`,
              borderRadius: tokens.radius.md,
              fontSize:     '12px',
              color:        tokens.colors.muted,
              fontWeight:   600,
            }}>
              ✓ Gift purchased
            </div>
          )}

          {/* Cancelled */}
          {isCancelled && (
            <div style={{
              textAlign:    'center',
              padding:      '10px 12px',
              background:   tokens.colors.surface2,
              border:       `1px solid ${tokens.colors.border}`,
              borderRadius: tokens.radius.md,
              fontSize:     '12px',
              color:        tokens.colors.muted,
            }}>
              This pool was cancelled
            </div>
          )}

        </div>
      </article>

      {/* ── ChipInModal — inside Elements so it has Stripe context ──── */}
      <Elements stripe={stripePromise} options={elementsOptions}>
        <ChipInModal
          item={modalOpen ? item : null}
          poolId={pool?.id ?? null}
          amount={selectedAmount}
          currency={currency}
          onClose={() => setModalOpen(false)}
          onContributed={() => setModalOpen(false)}
        />
      </Elements>
    </>
  )
}

// ── Public export — wraps with error boundary guard ───────────────────────────

export function GroupGiftCard(props: GroupGiftCardProps) {
  if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        '[GiftHint] NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set. ' +
        'GroupGiftCard will not render the payment modal.',
      )
    }
    return null
  }
  return <GroupGiftCardInner {...props} />
}
