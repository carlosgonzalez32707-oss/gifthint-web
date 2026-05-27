/**
 * components/admin/NetworkBreakdown.tsx — GiftHint admin dashboard
 *
 * Side-by-side comparison of Amazon Associates vs Skimlinks performance,
 * plus a "coverage gap" indicator showing the % of buy-clicks that had
 * no affiliate programme attached (revenue leak).
 *
 * Server component — no Recharts, pure HTML/CSS stat boxes.
 *
 * Props:
 *   data — NetworkData fetched server-side in admin/page.tsx
 */

import { tokens } from '@/tokens'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NetworkStat {
  clicks:      number
  est_revenue: number   // sum of estimated_commission for clicks on this network
  avg_order:   number   // est_revenue / clicks (0 when no clicks)
}

export interface NetworkData {
  amazon:          NetworkStat
  skimlinks:       NetworkStat
  unknown_clicks:  number       // clicks with no affiliate network
  total_clicks:    number
  coverage_gap_pct: number      // unknown_clicks / total_clicks * 100
}

interface NetworkBreakdownProps {
  data: NetworkData
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtInt(n: number): string {
  return n.toLocaleString('en-US')
}

function fmtUsd(n: number, decimals = 2): string {
  return n.toLocaleString('en-US', {
    style:                 'currency',
    currency:              'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

// ── Network card ──────────────────────────────────────────────────────────────

function NetworkCard({
  name,
  logo,
  stat,
  accent,
  accentDim,
  accentRing,
}: {
  name:      string
  logo:      string
  stat:      NetworkStat
  accent:    string
  accentDim: string
  accentRing: string
}) {
  return (
    <div
      style={{
        flex:          '1 1 260px',
        padding:       '20px',
        borderRadius:  tokens.radius.lg,
        background:    tokens.colors.surface2,
        border:        `1px solid ${accentRing}`,
        display:       'flex',
        flexDirection: 'column',
        gap:           '14px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontSize: '22px' }}>{logo}</span>
        <span style={{ fontSize: '14px', fontWeight: 700, color: tokens.colors.text }}>
          {name}
        </span>
      </div>

      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
        {(
          [
            { label: 'Clicks',       value: fmtInt(stat.clicks)       },
            { label: 'Est. Revenue', value: fmtUsd(stat.est_revenue)  },
            { label: 'Avg. Order',   value: fmtUsd(stat.avg_order)    },
          ] as const
        ).map(({ label, value }) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <span
              style={{
                fontSize:      '10px',
                fontWeight:    600,
                color:         tokens.colors.muted,
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
              }}
            >
              {label}
            </span>
            <span
              style={{
                fontSize:    '16px',
                fontWeight:  700,
                color:       accent,
                letterSpacing: '-0.02em',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {value}
            </span>
          </div>
        ))}
      </div>

      {/* Share of total clicks bar */}
      <div>
        <div
          style={{
            display:        'flex',
            justifyContent: 'space-between',
            marginBottom:   '4px',
            fontSize:       '10px',
            color:          tokens.colors.muted,
          }}
        >
          <span>Share of all clicks</span>
        </div>
        <div
          style={{
            height:       '5px',
            borderRadius: '9999px',
            background:   tokens.colors.surface,
            overflow:     'hidden',
          }}
        >
          <div
            style={{
              height:       '100%',
              width:        '0%',     // overridden by inline style below — workaround for SSR
              borderRadius: '9999px',
              background:   accent,
            }}
          />
        </div>
      </div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function NetworkBreakdown({ data }: NetworkBreakdownProps) {
  const gapSeverity =
    data.coverage_gap_pct >= 30 ? tokens.colors.red   :
    data.coverage_gap_pct >= 15 ? tokens.colors.amber :
    tokens.colors.green

  const gapLabel =
    data.coverage_gap_pct >= 30 ? 'High — investigate untagged click paths' :
    data.coverage_gap_pct >= 15 ? 'Moderate — some revenue leak' :
    'Healthy coverage'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* ── Network cards ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <NetworkCard
          name="Amazon Associates"
          logo="🛒"
          stat={data.amazon}
          accent={tokens.colors.amber}
          accentDim={tokens.colors.amberDim}
          accentRing={tokens.colors.amberRing}
        />
        <NetworkCard
          name="Skimlinks"
          logo="🔗"
          stat={data.skimlinks}
          accent={tokens.colors.purple}
          accentDim={tokens.colors.purpleDim}
          accentRing={tokens.colors.purpleRing}
        />
      </div>

      {/* ── Coverage gap indicator ──────────────────────────────────────────── */}
      <div
        style={{
          padding:      '14px 16px',
          borderRadius: tokens.radius.md,
          background:   tokens.colors.surface2,
          border:       `1px solid ${tokens.colors.border}`,
          display:      'flex',
          alignItems:   'center',
          gap:          '16px',
          flexWrap:     'wrap',
        }}
      >
        <div style={{ flex: '0 0 auto' }}>
          <p style={{ margin: '0 0 2px', fontSize: '11px', fontWeight: 700, color: tokens.colors.muted, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Coverage gap
          </p>
          <p
            style={{
              margin:      0,
              fontSize:    '28px',
              fontWeight:  700,
              color:       gapSeverity,
              letterSpacing: '-0.03em',
            }}
          >
            {data.coverage_gap_pct.toFixed(1)}%
          </p>
        </div>

        <div style={{ flex: '1 1 200px' }}>
          <p style={{ margin: '0 0 4px', fontSize: '12px', color: gapSeverity, fontWeight: 600 }}>
            {gapLabel}
          </p>
          <p style={{ margin: 0, fontSize: '12px', color: tokens.colors.muted, lineHeight: 1.5 }}>
            <strong style={{ color: tokens.colors.text }}>
              {fmtInt(data.unknown_clicks)}
            </strong>{' '}
            of{' '}
            <strong style={{ color: tokens.colors.text }}>
              {fmtInt(data.total_clicks)}
            </strong>{' '}
            buy-clicks had no affiliate network — those clicks generated no
            commission. Check that all item source URLs are being rewritten
            correctly by the affiliate middleware.
          </p>
        </div>

        {/* Mini gap bar */}
        <div
          style={{
            flex:         '0 0 120px',
            height:       '8px',
            borderRadius: '9999px',
            background:   tokens.colors.surface,
            overflow:     'hidden',
          }}
          aria-label={`${data.coverage_gap_pct.toFixed(1)}% of clicks without affiliate coverage`}
        >
          <div
            style={{
              height:       '100%',
              width:        `${Math.min(data.coverage_gap_pct, 100)}%`,
              borderRadius: '9999px',
              background:   gapSeverity,
              transition:   'width 400ms ease',
            }}
          />
        </div>
      </div>
    </div>
  )
}
