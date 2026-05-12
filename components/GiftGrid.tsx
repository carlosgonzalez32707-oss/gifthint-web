/**
 * components/GiftGrid.tsx — GiftHint
 *
 * Renders the filter bar + responsive gift card grid.
 *
 * Filter bar tabs (client-side state, no page reload):
 *   All items    — every item regardless of status
 *   Still needed — unclaimed items only
 *   Under $50    — items with price < 50 (USD or any currency)
 *   Group gifts  — items with price ≥ 50 (worth pooling for)
 *
 * Grid layout: CSS grid with repeat(auto-fill, minmax(185px, 1fr)) so cards
 * naturally reflow from 1 column on narrow mobile up to 4+ on wide desktop.
 * Uses an inline style because Tailwind has no direct utility for this pattern.
 */

'use client'

import { useState, useMemo }  from 'react'
import { tokens }             from '@/tokens'
import { GiftCard }           from './GiftCard'
import type { WishlistItem, FilterKey } from '@/types/wishlist'

// ── Filter configuration ──────────────────────────────────────────────────────

interface FilterConfig {
  key:       FilterKey
  label:     string
  /** Returns true if an item should be included under this filter */
  test:      (item: WishlistItem) => boolean
  /** Message shown when the filter produces zero results */
  emptyLine: string
  emptyIcon: string
}

const FILTERS: FilterConfig[] = [
  {
    key:       'all',
    label:     'All items',
    test:      () => true,
    emptyLine: 'This list is empty.',
    emptyIcon: '🎁',
  },
  {
    key:       'needed',
    label:     'Still needed',
    test:      (item) => !item.is_claimed,
    emptyLine: "Everything has been claimed — you're all too generous! 🎉",
    emptyIcon: '🎉',
  },
  {
    key:       'under50',
    label:     'Under $50',
    // Include items with no price so gifters can still see/buy them
    test:      (item) => item.price === null || item.price < 50,
    emptyLine: 'No gifts under $50 on this list.',
    emptyIcon: '💸',
  },
  {
    key:       'group',
    label:     'Group gifts',
    // $50+ items are good candidates to pool money on
    test:      (item) => item.price !== null && item.price >= 50,
    emptyLine: 'No group-gift suggestions right now.',
    emptyIcon: '👥',
  },
]

// ── Utility ───────────────────────────────────────────────────────────────────

function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

// ── GiftGrid ──────────────────────────────────────────────────────────────────

interface GiftGridProps {
  items: WishlistItem[]
}

export function GiftGrid({ items }: GiftGridProps) {
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all')

  const currentFilter = FILTERS.find((f) => f.key === activeFilter) ?? FILTERS[0]

  // Apply the active filter; useMemo avoids re-scanning on unrelated re-renders
  const visibleItems = useMemo<WishlistItem[]>(
    () => items.filter(currentFilter.test),
    [items, currentFilter],
  )

  return (
    <section>
      {/* ── Filter bar ─────────────────────────────────────────────────── */}
      <FilterBar
        filters={FILTERS}
        active={activeFilter}
        counts={
          // Pre-compute counts so each tab label can show how many items match
          Object.fromEntries(
            FILTERS.map((f) => [f.key, items.filter(f.test).length]),
          ) as Record<FilterKey, number>
        }
        onChange={setActiveFilter}
      />

      {/* ── Grid or empty state ─────────────────────────────────────────── */}
      {visibleItems.length === 0 ? (
        <EmptyState
          icon={currentFilter.emptyIcon}
          message={currentFilter.emptyLine}
          showClear={activeFilter !== 'all'}
          onClear={() => setActiveFilter('all')}
        />
      ) : (
        <div
          style={{
            display:             'grid',
            // auto-fill so the number of columns adapts to the container width;
            // 185 px is narrow enough for 2 cols on a 390 px phone with padding.
            gridTemplateColumns: 'repeat(auto-fill, minmax(185px, 1fr))',
            gap:                 '12px',
          }}
        >
          {visibleItems.map((item) => (
            <GiftCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
  )
}

// ── FilterBar ─────────────────────────────────────────────────────────────────

interface FilterBarProps {
  filters:  FilterConfig[]
  active:   FilterKey
  counts:   Record<FilterKey, number>
  onChange: (key: FilterKey) => void
}

function FilterBar({ filters, active, counts, onChange }: FilterBarProps) {
  return (
    <div
      className="flex gap-2 mb-5 overflow-x-auto pb-1"
      role="tablist"
      aria-label="Filter gifts"
      // Hide scrollbar while still allowing horizontal scroll on mobile
      style={{ scrollbarWidth: 'none' }}
    >
      {filters.map((filter) => {
        const isActive = filter.key === active
        const count    = counts[filter.key]

        return (
          <button
            key={filter.key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(filter.key)}
            className={cn(
              'flex items-center gap-1.5 rounded-full whitespace-nowrap',
              'transition-all duration-150',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
            )}
            style={{
              fontSize:       '12px',
              fontWeight:     isActive ? 600 : 500,
              padding:        '5px 13px',
              background:     isActive ? tokens.colors.purple    : tokens.colors.surface2,
              border:         `1px solid ${isActive ? tokens.colors.purple : tokens.colors.border}`,
              color:          isActive ? '#fff'                  : tokens.colors.muted,
              cursor:         'pointer',
              // Subtle ring on active so it reads well on any background
              boxShadow:      isActive ? `0 0 0 1px ${tokens.colors.purpleGlow}` : 'none',
              outlineColor:   tokens.colors.purple,
            }}
          >
            {filter.label}
            {/* Item count badge — hidden on the "All" tab to reduce noise */}
            {filter.key !== 'all' && (
              <span
                className="rounded-full tabular-nums"
                style={{
                  fontSize:   '10px',
                  fontWeight: 700,
                  padding:    '1px 5px',
                  background: isActive
                    ? 'rgba(255,255,255,0.20)'
                    : tokens.colors.surface,
                  color: isActive ? '#fff' : tokens.colors.muted,
                  lineHeight: 1.6,
                }}
              >
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ── EmptyState ────────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon:      string
  message:   string
  showClear: boolean
  onClear:   () => void
}

function EmptyState({ icon, message, showClear, onClear }: EmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center gap-3 py-16 text-center"
      role="status"
      aria-live="polite"
    >
      <span
        className="select-none"
        style={{ fontSize: '40px', lineHeight: 1 }}
        aria-hidden="true"
      >
        {icon}
      </span>

      <p
        style={{
          fontSize:  '13.5px',
          fontWeight: 500,
          color:      tokens.colors.muted,
          maxWidth:   '240px',
          lineHeight: 1.55,
        }}
      >
        {message}
      </p>

      {showClear && (
        <button
          onClick={onClear}
          className="rounded-full transition-all hover:opacity-80"
          style={{
            fontSize:   '12px',
            fontWeight: 600,
            padding:    '6px 16px',
            background: tokens.colors.surface2,
            border:     `1px solid ${tokens.colors.border}`,
            color:      tokens.colors.muted,
            cursor:     'pointer',
            marginTop:  '4px',
          }}
        >
          Clear filter
        </button>
      )}
    </div>
  )
}
