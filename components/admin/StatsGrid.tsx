/**
 * components/admin/StatsGrid.tsx — GiftHint admin dashboard
 *
 * Six KPI cards rendered in a responsive grid. Server component — no interactivity.
 */

import { tokens } from '@/tokens'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AdminStats {
  totalUsers:           number
  totalItems:           number
  totalClicks:          number
  estimatedRevenue:     number
  ctaClicks:            number
  affiliateCoveragePct: number
}

interface StatsGridProps {
  stats: AdminStats
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtInt(n: number): string {
  return n.toLocaleString('en-US')
}

function fmtUsd(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style:                 'currency',
    currency:              'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

function fmtPct(n: number): string {
  return `${n}%`
}

// ── KPI card definition ───────────────────────────────────────────────────────

interface KpiCard {
  label:     string
  value:     string
  sublabel?: string
  accent:    string
  accentDim: string
  icon:      string
}

function buildCards(stats: AdminStats): KpiCard[] {
  return [
    {
      label:     'Total Users',
      value:     fmtInt(stats.totalUsers),
      sublabel:  'registered accounts',
      accent:    tokens.colors.purple,
      accentDim: tokens.colors.purpleDim,
      icon:      '👤',
    },
    {
      label:     'Items Saved',
      value:     fmtInt(stats.totalItems),
      sublabel:  'across all wishlists',
      accent:    tokens.colors.purple,
      accentDim: tokens.colors.purpleDim,
      icon:      '💾',
    },
    {
      label:     'Total Buy Clicks',
      value:     fmtInt(stats.totalClicks),
      sublabel:  'gifter → retailer navigations',
      accent:    tokens.colors.green,
      accentDim: tokens.colors.greenDim,
      icon:      '🛒',
    },
    {
      label:     'Estimated Revenue',
      value:     fmtUsd(stats.estimatedRevenue),
      sublabel:  'sum of estimated_commission',
      accent:    tokens.colors.green,
      accentDim: tokens.colors.greenDim,
      icon:      '💰',
    },
    {
      label:     'Viral CTA Clicks',
      value:     fmtInt(stats.ctaClicks),
      sublabel:  '"Create your free list →" taps',
      accent:    tokens.colors.amber,
      accentDim: tokens.colors.amberDim,
      icon:      '📣',
    },
    {
      label:     'Affiliate Coverage',
      value:     fmtPct(stats.affiliateCoveragePct),
      sublabel:  'items with an affiliate programme',
      accent:    tokens.colors.amber,
      accentDim: tokens.colors.amberDim,
      icon:      stats.affiliateCoveragePct >= 70 ? '✅' : '⚠️',
    },
  ]
}

// ── Component ─────────────────────────────────────────────────────────────────

export function StatsGrid({ stats }: StatsGridProps) {
  const cards = buildCards(stats)

  return (
    <>
      {/* CSS grid for the cards — 2 cols on mobile, 3 on md, 6 on xl */}
      <style>{`
        .gh-stats-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }
        @media (min-width: 768px) {
          .gh-stats-grid { grid-template-columns: repeat(3, 1fr); }
        }
        @media (min-width: 1100px) {
          .gh-stats-grid { grid-template-columns: repeat(6, 1fr); }
        }
      `}</style>

      <div className="gh-stats-grid">
        {cards.map((card) => (
          <div
            key={card.label}
            style={{
              background:   tokens.colors.surface,
              border:       `1px solid ${tokens.colors.border}`,
              borderRadius: tokens.radius.lg,
              padding:      '16px',
              display:      'flex',
              flexDirection: 'column',
              gap:          '6px',
            }}
          >
            {/* Icon + label row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  fontSize:     '16px',
                  lineHeight:   1,
                  display:      'flex',
                  alignItems:   'center',
                  justifyContent: 'center',
                  width:        '28px',
                  height:       '28px',
                  borderRadius: tokens.radius.sm,
                  background:   card.accentDim,
                }}
                aria-hidden="true"
              >
                {card.icon}
              </span>
              <span
                style={{
                  fontSize:  '10.5px',
                  fontWeight: 600,
                  color:     tokens.colors.muted,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                {card.label}
              </span>
            </div>

            {/* Value */}
            <p
              style={{
                margin:     0,
                fontSize:   '22px',
                fontWeight: 700,
                color:      card.accent,
                lineHeight: 1.1,
                letterSpacing: '-0.5px',
              }}
            >
              {card.value}
            </p>

            {/* Sublabel */}
            {card.sublabel && (
              <p
                style={{
                  margin:   0,
                  fontSize: '10.5px',
                  color:    tokens.colors.muted,
                  opacity:  0.75,
                }}
              >
                {card.sublabel}
              </p>
            )}
          </div>
        ))}
      </div>
    </>
  )
}
