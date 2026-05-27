/**
 * components/dashboard/ListAnalyticsCard.tsx — GiftHint
 *
 * Per-wishlist analytics section shown on the wisher dashboard.
 *
 * Displays:
 *   👀  Total page views
 *   🛒  Total buy-clicks (gifters clicked "Buy" on any item)
 *   ✓   Claimed items count
 *   📅  Unique days with views (engagement breadth)
 *   📈  14-day sparkline (Recharts AreaChart — no axes for minimal footprint)
 *   🔗  Share button — copies the gifter URL to clipboard
 *   🏆  Most-clicked item title
 *   TopItemsAnalytics — per-item breakdown table (collapsible)
 *
 * Props:
 *   wishlistId  — UUID of the wishlist to fetch analytics for
 *   username    — wisher's public_username (used to build the share URL)
 *   slug        — wishlist slug (used to build the share URL)
 *   accent      — accent colour from the list's occasion theme
 *
 * Data flow:
 *   On mount, fetches GET /api/analytics/wishlist/[wishlistId] with the
 *   current user's Bearer token and renders the result.  Errors are shown
 *   inline rather than thrown so surrounding dashboard content stays visible.
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from 'recharts'
import { getBrowserClient } from '@/lib/supabase-browser'
import { tokens }           from '@/tokens'
import { TopItemsAnalytics, type AnalyticsItem } from './TopItemsAnalytics'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AnalyticsSummary {
  total_views:             number
  unique_view_days:        number
  total_buy_clicks:        number
  claimed_items_count:     number
  most_clicked_item_title: string | null
}

interface SparklinePoint {
  date:  string
  views: number
}

interface AnalyticsPayload {
  summary:   AnalyticsSummary
  sparkline: SparklinePoint[]
  topItems:  AnalyticsItem[]
}

interface ListAnalyticsCardProps {
  wishlistId: string
  username:   string
  slug:       string
  accent:     string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchToken(): Promise<string | undefined> {
  const { data: { session } } = await getBrowserClient().auth.getSession()
  return session?.access_token
}

/** Formats a short date label for the sparkline tooltip. */
function shortDate(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${parseInt(m)}/${parseInt(d)}`
}

// ── Stat tile ─────────────────────────────────────────────────────────────────

function StatTile({
  emoji,
  value,
  label,
  accent,
}: {
  emoji:  string
  value:  string | number
  label:  string
  accent: string
}) {
  return (
    <div
      style={{
        display:        'flex',
        flexDirection:  'column',
        gap:            '3px',
        padding:        '10px 12px',
        borderRadius:   tokens.radius.md,
        background:     tokens.colors.surface2,
        border:         `1px solid ${tokens.colors.border}`,
        flex:           '1 1 auto',
        minWidth:       '90px',
      }}
    >
      <span style={{ fontSize: '18px', lineHeight: 1 }}>{emoji}</span>
      <span
        style={{
          fontSize:    '20px',
          fontWeight:  700,
          color:       accent,
          lineHeight:  1.1,
          letterSpacing: '-0.03em',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {typeof value === 'number' ? value.toLocaleString() : value}
      </span>
      <span style={{ fontSize: '10px', color: tokens.colors.muted, lineHeight: 1.3, fontWeight: 500 }}>
        {label}
      </span>
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function AnalyticsSkeleton({ accent }: { accent: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {[80, 72, 88, 76].map((w, i) => (
          <div
            key={i}
            style={{
              height:       '72px',
              width:        `${w}px`,
              borderRadius: tokens.radius.md,
              background:   tokens.colors.surface2,
              animation:    'pulse 1.5s ease-in-out infinite',
              opacity:      0.6,
            }}
          />
        ))}
      </div>
      <div
        style={{
          height:       '60px',
          borderRadius: tokens.radius.md,
          background:   tokens.colors.surface2,
          opacity:      0.4,
        }}
      />
    </div>
  )
}

// ── Custom sparkline tooltip ───────────────────────────────────────────────────

function SparklineTooltip({
  active,
  payload,
}: {
  active?:  boolean
  payload?: Array<{ payload: SparklinePoint }>
}) {
  if (!active || !payload?.length) return null
  const { date, views } = payload[0].payload
  return (
    <div
      style={{
        background:   tokens.colors.surface,
        border:       `1px solid ${tokens.colors.border}`,
        borderRadius: tokens.radius.sm,
        padding:      '5px 9px',
        fontSize:     '11px',
        color:        tokens.colors.text,
        boxShadow:    tokens.shadow.pop,
      }}
    >
      <span style={{ color: tokens.colors.muted }}>{shortDate(date)}</span>
      {' '}
      <strong>{views} {views === 1 ? 'view' : 'views'}</strong>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function ListAnalyticsCard({
  wishlistId,
  username,
  slug,
  accent,
}: ListAnalyticsCardProps) {
  const [data,         setData]         = useState<AnalyticsPayload | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [copied,       setCopied]       = useState(false)
  const [itemsExpanded, setItemsExpanded] = useState(false)

  // ── Fetch analytics ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const token = await fetchToken()
        const res   = await fetch(`/api/analytics/wishlist/${wishlistId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })

        if (!res.ok) {
          const json = await res.json().catch(() => ({}))
          throw new Error(json.error ?? `HTTP ${res.status}`)
        }

        const payload: AnalyticsPayload = await res.json()
        if (!cancelled) setData(payload)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load analytics')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [wishlistId])

  // ── Share handler ───────────────────────────────────────────────────────────
  const gifterUrl = `${typeof window !== 'undefined' ? window.location.origin : 'https://gifthint.io'}/list/${username}/${slug}`

  const handleShare = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(gifterUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2_000)
    } catch {
      window.prompt('Copy this link:', gifterUrl)
    }
  }, [gifterUrl])

  // ── Accent tints (inline — no CSS vars needed) ──────────────────────────────
  const accentDim  = `${accent}22`   // 13 % opacity via hex alpha
  const accentRing = `${accent}48`   // 28 % opacity

  // ── Loading state ───────────────────────────────────────────────────────────
  if (loading) return <AnalyticsSkeleton accent={accent} />

  // ── Error state ─────────────────────────────────────────────────────────────
  if (error) {
    return (
      <p style={{ margin: 0, fontSize: '12px', color: tokens.colors.muted, fontStyle: 'italic' }}>
        Analytics unavailable — {error}
      </p>
    )
  }

  if (!data) return null

  const { summary, sparkline, topItems } = data
  const hasViews = summary.total_views > 0

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <section aria-label="List analytics" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

      {/* ── Stat tiles ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <StatTile
          emoji="👀"
          value={summary.total_views}
          label={summary.total_views === 1 ? 'person viewed' : 'people viewed'}
          accent={accent}
        />
        <StatTile
          emoji="🛒"
          value={summary.total_buy_clicks}
          label={summary.total_buy_clicks === 1 ? 'item clicked to buy' : 'items clicked to buy'}
          accent={accent}
        />
        <StatTile
          emoji="✓"
          value={summary.claimed_items_count}
          label={summary.claimed_items_count === 1 ? 'item claimed' : 'items claimed'}
          accent={tokens.colors.green}
        />
        <StatTile
          emoji="📅"
          value={summary.unique_view_days}
          label={summary.unique_view_days === 1 ? 'day with views' : 'days with views'}
          accent={accent}
        />
      </div>

      {/* ── Sparkline — last 14 days ─────────────────────────────────────────── */}
      <div
        aria-label="Views over the last 14 days"
        style={{
          background:   tokens.colors.surface2,
          borderRadius: tokens.radius.md,
          border:       `1px solid ${tokens.colors.border}`,
          padding:      '10px 12px 6px',
        }}
      >
        <p style={{ margin: '0 0 6px', fontSize: '11px', color: tokens.colors.muted, fontWeight: 600 }}>
          Views — last 14 days
        </p>

        {hasViews ? (
          <ResponsiveContainer width="100%" height={60}>
            <AreaChart data={sparkline} margin={{ top: 2, right: 4, left: 4, bottom: 2 }}>
              <defs>
                <linearGradient id={`grad-${wishlistId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={accent} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={accent} stopOpacity={0.02} />
                </linearGradient>
              </defs>

              <Area
                type="monotone"
                dataKey="views"
                stroke={accent}
                strokeWidth={2}
                fill={`url(#grad-${wishlistId})`}
                dot={false}
                activeDot={{ r: 3, fill: accent, strokeWidth: 0 }}
                isAnimationActive={false}
              />

              <RechartsTooltip
                content={<SparklineTooltip />}
                cursor={{ stroke: accentRing, strokeWidth: 1 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div
            style={{
              height:      '60px',
              display:     'flex',
              alignItems:  'center',
              justifyContent: 'center',
              fontSize:    '11px',
              color:       tokens.colors.muted,
              fontStyle:   'italic',
            }}
          >
            No views yet — share your list to get started
          </div>
        )}
      </div>

      {/* ── Most-clicked item ─────────────────────────────────────────────────── */}
      {summary.most_clicked_item_title && summary.total_buy_clicks > 0 && (
        <div
          style={{
            padding:      '8px 12px',
            borderRadius: tokens.radius.md,
            background:   accentDim,
            border:       `1px solid ${accentRing}`,
            fontSize:     '12px',
            color:        tokens.colors.text,
            display:      'flex',
            alignItems:   'center',
            gap:          '8px',
          }}
        >
          <span style={{ fontSize: '16px' }}>🔥</span>
          <span>
            <strong style={{ color: accent }}>Most viewed: </strong>
            {summary.most_clicked_item_title}
          </span>
        </div>
      )}

      {/* ── Share button ─────────────────────────────────────────────────────── */}
      <button
        onClick={handleShare}
        style={{
          display:        'inline-flex',
          alignItems:     'center',
          justifyContent: 'center',
          gap:            '6px',
          padding:        '9px 16px',
          borderRadius:   tokens.radius.sm,
          border:         `1px solid ${copied ? tokens.colors.greenRing : accentRing}`,
          background:     copied ? tokens.colors.greenDim : accentDim,
          color:          copied ? tokens.colors.green    : accent,
          fontSize:       '13px',
          fontWeight:     600,
          cursor:         'pointer',
          transition:     'background 150ms ease, border-color 150ms ease, color 150ms ease',
          alignSelf:      'flex-start',
        }}
        aria-label="Copy shareable link to clipboard"
      >
        {copied ? '✓ Link copied!' : '🔗 Share this list'}
      </button>

      {/* ── Per-item breakdown ─────────────────────────────────────────────────── */}
      {topItems.length > 0 && (
        <div
          style={{
            background:   tokens.colors.surface2,
            borderRadius: tokens.radius.md,
            border:       `1px solid ${tokens.colors.border}`,
            overflow:     'hidden',
          }}
        >
          {/* Collapsible header */}
          <button
            onClick={() => setItemsExpanded((v) => !v)}
            style={{
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'space-between',
              width:          '100%',
              padding:        '10px 12px',
              background:     'transparent',
              border:         'none',
              cursor:         'pointer',
              color:          tokens.colors.text,
              fontSize:       '12px',
              fontWeight:     600,
              textAlign:      'left',
            }}
            aria-expanded={itemsExpanded}
          >
            <span>🏆 Item breakdown</span>
            <span
              aria-hidden="true"
              style={{
                fontSize:   '10px',
                color:      tokens.colors.muted,
                transform:  itemsExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 200ms ease',
                display:    'inline-block',
              }}
            >
              ▼
            </span>
          </button>

          {itemsExpanded && (
            <div style={{ padding: '0 4px 8px' }}>
              <TopItemsAnalytics items={topItems} accent={accent} />
            </div>
          )}
        </div>
      )}
    </section>
  )
}
