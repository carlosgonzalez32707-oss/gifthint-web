/**
 * components/GiftGridSkeleton.tsx — GiftHint
 *
 * Skeleton loader for the gift grid — shown via Next.js Suspense (loading.tsx)
 * while the server component fetches wishlist data.
 *
 * Matches the exact dimensions of GiftCard so the layout doesn't shift when
 * real cards replace placeholders.
 *
 * Shimmer animation is defined in globals.css (.shimmer keyframe).
 */

import { tokens } from '@/tokens'

// ── Types ─────────────────────────────────────────────────────────────────────

interface GiftGridSkeletonProps {
  /** Number of placeholder cards to render (default 6) */
  count?: number
}

// ── GiftGridSkeleton ──────────────────────────────────────────────────────────

export function GiftGridSkeleton({ count = 6 }: GiftGridSkeletonProps) {
  return (
    <section className="px-4 pb-16" aria-busy="true" aria-label="Loading gifts…">
      {/* Filter bar placeholder */}
      <div className="flex gap-2 mb-6 overflow-hidden">
        {[72, 90, 80, 95].map((w, i) => (
          <div
            key={i}
            className="shimmer h-7 rounded-full flex-shrink-0"
            style={{ width: w, background: tokens.colors.surface2 }}
          />
        ))}
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: count }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </section>
  )
}

// ── SkeletonCard ──────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden"
      style={{
        background: tokens.colors.surface,
        border:     `1px solid ${tokens.colors.border}`,
        boxShadow:  tokens.shadow.card,
      }}
    >
      {/* Square image placeholder */}
      <div
        className="w-full aspect-square shimmer"
        style={{ background: tokens.colors.surface2 }}
      />

      {/* Body */}
      <div className="flex flex-col gap-3 p-4">
        {/* Title lines */}
        <div
          className="shimmer h-3.5 rounded-full"
          style={{ background: tokens.colors.surface2, width: '85%' }}
        />
        <div
          className="shimmer h-3 rounded-full"
          style={{ background: tokens.colors.surface2, width: '60%' }}
        />

        {/* Price */}
        <div
          className="shimmer h-4 rounded-full"
          style={{ background: tokens.colors.surface2, width: '35%' }}
        />

        {/* Tag pills */}
        <div className="flex gap-1.5">
          <div
            className="shimmer h-5 w-14 rounded-full"
            style={{ background: tokens.colors.surface2 }}
          />
          <div
            className="shimmer h-5 w-16 rounded-full"
            style={{ background: tokens.colors.surface2 }}
          />
        </div>

        <div className="flex-1" style={{ minHeight: 8 }} />

        {/* CTA button */}
        <div
          className="shimmer h-10 rounded-xl mt-1"
          style={{ background: tokens.colors.surface2 }}
        />
      </div>
    </div>
  )
}

// ── HeroSkeleton ──────────────────────────────────────────────────────────────

/** Skeleton for the avatar + name + item count hero above the grid */
export function HeroSkeleton() {
  return (
    <section className="flex flex-col items-center gap-4 px-4 py-12">
      {/* Avatar */}
      <div
        className="shimmer w-20 h-20 rounded-full"
        style={{ background: tokens.colors.surface2 }}
      />
      {/* Name */}
      <div
        className="shimmer h-6 w-48 rounded-full"
        style={{ background: tokens.colors.surface2 }}
      />
      {/* Subtitle */}
      <div
        className="shimmer h-3.5 w-32 rounded-full"
        style={{ background: tokens.colors.surface2 }}
      />
      {/* Copy button */}
      <div
        className="shimmer h-9 w-40 rounded-full"
        style={{ background: tokens.colors.surface2 }}
      />
    </section>
  )
}
