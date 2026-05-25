'use client'

/**
 * components/dashboard/PriceAlertSettings.tsx — GiftHint
 *
 * Per-item price alert controls shown inside the ItemEditor.
 *
 * Features:
 *   - Toggle price_alert_enabled on/off
 *   - Threshold slider: "alert me when price drops by X%"
 *     (maps to price_alert_threshold as a percentage, default 90 = 10% off)
 *   - "Last checked" relative timestamp
 *   - Recharts sparkline of the last 30 price_history rows
 *
 * Props:
 *   itemId          — wishlist_items.id
 *   initialEnabled  — current price_alert_enabled value
 *   initialThreshold — current price_alert_threshold (90 = alert at 10% off)
 *   lastCheckedAt   — ISO 8601 or null (last_checked_at)
 *   lowestPrice     — lowest_price from wishlist_items
 *   currency        — ISO 4217
 *   accent          — brand accent colour for the toggle/button
 *
 * Server interaction:
 *   PATCH /api/items/[id]/price-alert — { enabled, threshold }
 *   GET   /api/items/[id]/price-history — returns last 30 rows for sparkline
 */

import React, { useEffect, useState, useCallback } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { getBrowserClient } from '@/lib/supabase-browser'

// ── Auth helper ───────────────────────────────────────────────────────────────

async function getAccessToken(): Promise<string | undefined> {
  const supabase = getBrowserClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PriceAlertSettingsProps {
  itemId:            string
  initialEnabled:    boolean
  initialThreshold:  number          // 50–99; default 90 (= alert at ≥10% drop)
  lastCheckedAt:     string | null   // ISO 8601 or null
  lowestPrice:       number | null
  currency:          string
  accent?:           string
}

interface PriceHistoryRow {
  price:      number
  checked_at: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPrice(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-GB', {
      style:    'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hrs   = Math.floor(mins / 60)
  const days  = Math.floor(hrs  / 24)
  if (days  > 0) return `${days}d ago`
  if (hrs   > 0) return `${hrs}h ago`
  if (mins  > 0) return `${mins}m ago`
  return 'just now'
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

interface TooltipPayload {
  value: number
  payload: PriceHistoryRow
}

function ChartTooltip({
  active,
  payload,
  currency,
}: {
  active?:   boolean
  payload?:  TooltipPayload[]
  currency:  string
}) {
  if (!active || !payload?.length) return null
  const row = payload[0]
  return (
    <div
      style={{
        background:   '#1C1C22',
        border:       '1px solid rgba(240,238,232,0.1)',
        borderRadius: '8px',
        padding:      '6px 10px',
        fontSize:     '11px',
        color:        '#F0EEE8',
        fontFamily:   '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div style={{ fontWeight: 700, color: '#4EC99A' }}>
        {formatPrice(row.value, currency)}
      </div>
      <div style={{ color: '#7A7870', marginTop: '2px' }}>
        {shortDate(row.payload.checked_at)}
      </div>
    </div>
  )
}

// ── Toggle ────────────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  accent,
}: {
  checked:  boolean
  onChange: (v: boolean) => void
  accent:   string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        display:         'inline-flex',
        alignItems:      'center',
        width:           '40px',
        height:          '22px',
        borderRadius:    '100px',
        backgroundColor: checked ? accent : 'rgba(240,238,232,0.12)',
        border:          'none',
        cursor:          'pointer',
        padding:         '2px',
        transition:      'background-color 200ms ease',
        flexShrink:      0,
      }}
    >
      <span
        style={{
          display:         'block',
          width:           '18px',
          height:          '18px',
          borderRadius:    '50%',
          backgroundColor: '#ffffff',
          transform:       checked ? 'translateX(18px)' : 'translateX(0)',
          transition:      'transform 200ms ease',
          boxShadow:       '0 1px 3px rgba(0,0,0,0.35)',
        }}
      />
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function PriceAlertSettings({
  itemId,
  initialEnabled,
  initialThreshold,
  lastCheckedAt,
  lowestPrice,
  currency,
  accent = '#8B83F0',
}: PriceAlertSettingsProps) {
  const [enabled,    setEnabled]    = useState(initialEnabled)
  const [threshold,  setThreshold]  = useState(initialThreshold ?? 90)
  const [history,    setHistory]    = useState<PriceHistoryRow[]>([])
  const [saving,     setSaving]     = useState(false)
  const [saveError,  setSaveError]  = useState<string | null>(null)
  const [histLoading, setHistLoading] = useState(false)

  // ── Fetch price history for sparkline ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    setHistLoading(true)
    getAccessToken().then((token) => {
      return fetch(`/api/items/${itemId}/price-history`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
    })
      .then((r) => r.ok ? r.json() as Promise<{ rows: PriceHistoryRow[] }> : Promise.reject(r.statusText))
      .then((data) => { if (!cancelled) setHistory(data.rows ?? []) })
      .catch(() => { if (!cancelled) setHistory([]) })
      .finally(() => { if (!cancelled) setHistLoading(false) })

    return () => { cancelled = true }
  }, [itemId])

  // ── Debounced save ────────────────────────────────────────────────────────
  const save = useCallback(
    async (nextEnabled: boolean, nextThreshold: number) => {
      setSaving(true)
      setSaveError(null)
      try {
        const token = await getAccessToken()
        const res = await fetch(`/api/items/${itemId}/price-alert`, {
          method:  'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body:    JSON.stringify({ enabled: nextEnabled, threshold: nextThreshold }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string }
          throw new Error(body.error ?? `HTTP ${res.status}`)
        }
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Failed to save')
      } finally {
        setSaving(false)
      }
    },
    [itemId],
  )

  function handleToggle(next: boolean) {
    setEnabled(next)
    void save(next, threshold)
  }

  function handleThresholdChange(e: React.ChangeEvent<HTMLInputElement>) {
    setThreshold(Number(e.target.value))
  }

  function handleThresholdCommit() {
    void save(enabled, threshold)
  }

  const dropPct = 100 - threshold   // e.g. threshold=90 → 10% off required

  // Chart data — oldest first (already ordered ASC by the API)
  const chartData = history.map((row) => ({
    price:      row.price,
    checked_at: row.checked_at,
    label:      shortDate(row.checked_at),
  }))

  const prices  = history.map((r) => r.price)
  const minP    = prices.length ? Math.min(...prices) : null
  const maxP    = prices.length ? Math.max(...prices) : null

  return (
    <div
      style={{
        backgroundColor: 'rgba(240,238,232,0.04)',
        border:          '1px solid rgba(240,238,232,0.08)',
        borderRadius:    '14px',
        padding:         '18px 20px',
        marginTop:       '4px',
      }}
    >
      {/* ── Header row ──────────────────────────────────────────────────────── */}
      <div
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          marginBottom:   enabled ? '16px' : '0',
        }}
      >
        <div>
          <div
            style={{
              fontSize:   '13px',
              fontWeight: 600,
              color:      '#F0EEE8',
              marginBottom: '2px',
            }}
          >
            Price drop alerts
          </div>
          {lastCheckedAt ? (
            <div style={{ fontSize: '11px', color: '#7A7870' }}>
              Last checked {relativeTime(lastCheckedAt)}
            </div>
          ) : (
            <div style={{ fontSize: '11px', color: '#7A7870' }}>
              Not checked yet
            </div>
          )}
        </div>

        <Toggle checked={enabled} onChange={handleToggle} accent={accent} />
      </div>

      {/* ── Expanded controls — only when enabled ────────────────────────────── */}
      {enabled && (
        <>
          {/* Threshold slider */}
          <div style={{ marginBottom: '18px' }}>
            <div
              style={{
                display:        'flex',
                justifyContent: 'space-between',
                alignItems:     'baseline',
                marginBottom:   '8px',
              }}
            >
              <label
                style={{
                  fontSize:   '12px',
                  color:      '#7A7870',
                  fontWeight: 500,
                }}
              >
                Alert me when price drops by at least
              </label>
              <span
                style={{
                  fontSize:   '13px',
                  fontWeight: 700,
                  color:      accent,
                  minWidth:   '36px',
                  textAlign:  'right',
                }}
              >
                {dropPct}%
              </span>
            </div>

            <input
              type="range"
              min={1}
              max={50}
              value={dropPct}
              onChange={(e) => setThreshold(100 - Number(e.target.value))}
              onMouseUp={handleThresholdCommit}
              onTouchEnd={handleThresholdCommit}
              style={{
                width:       '100%',
                accentColor: accent,
                cursor:      'pointer',
              }}
            />

            <div
              style={{
                display:        'flex',
                justifyContent: 'space-between',
                fontSize:       '10px',
                color:          '#555450',
                marginTop:      '4px',
              }}
            >
              <span>1% off</span>
              <span>50% off</span>
            </div>
          </div>

          {/* Lowest price badge */}
          {lowestPrice !== null && (
            <div
              style={{
                display:         'inline-flex',
                alignItems:      'center',
                gap:             '5px',
                backgroundColor: 'rgba(78,201,154,0.10)',
                border:          '1px solid rgba(78,201,154,0.22)',
                borderRadius:    '8px',
                padding:         '5px 10px',
                marginBottom:    '16px',
              }}
            >
              <span style={{ fontSize: '12px' }}>🏆</span>
              <span
                style={{
                  fontSize:   '11px',
                  fontWeight: 600,
                  color:      '#4EC99A',
                }}
              >
                All-time low: {formatPrice(lowestPrice, currency)}
              </span>
            </div>
          )}

          {/* Sparkline */}
          {histLoading ? (
            <div
              style={{
                height:          '80px',
                backgroundColor: 'rgba(240,238,232,0.04)',
                borderRadius:    '8px',
                display:         'flex',
                alignItems:      'center',
                justifyContent:  'center',
                fontSize:        '11px',
                color:           '#555450',
              }}
            >
              Loading price history…
            </div>
          ) : chartData.length >= 2 ? (
            <div>
              <div
                style={{
                  fontSize:     '10px',
                  color:        '#555450',
                  marginBottom: '6px',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}
              >
                {chartData.length}-day price history
              </div>
              <ResponsiveContainer width="100%" height={80}>
                <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <XAxis dataKey="label" hide />
                  <YAxis
                    domain={[
                      minP !== null ? minP * 0.97 : 'auto',
                      maxP !== null ? maxP * 1.03 : 'auto',
                    ]}
                    hide
                  />
                  <Tooltip
                    content={
                      <ChartTooltip currency={currency} />
                    }
                    isAnimationActive={false}
                  />
                  {/* Reference line at the lowest-ever price */}
                  {lowestPrice !== null && (
                    <ReferenceLine
                      y={lowestPrice}
                      stroke="rgba(78,201,154,0.3)"
                      strokeDasharray="3 3"
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="price"
                    stroke={accent}
                    strokeWidth={1.5}
                    dot={false}
                    activeDot={{ r: 3, fill: accent, strokeWidth: 0 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div
              style={{
                height:          '60px',
                backgroundColor: 'rgba(240,238,232,0.04)',
                borderRadius:    '8px',
                display:         'flex',
                alignItems:      'center',
                justifyContent:  'center',
                fontSize:        '11px',
                color:           '#555450',
              }}
            >
              Price history will appear after the first check
            </div>
          )}

          {/* Save indicator */}
          <div style={{ marginTop: '10px', minHeight: '16px' }}>
            {saving && (
              <span style={{ fontSize: '11px', color: '#7A7870' }}>Saving…</span>
            )}
            {saveError && (
              <span style={{ fontSize: '11px', color: '#E25E5E' }}>
                ⚠ {saveError}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
