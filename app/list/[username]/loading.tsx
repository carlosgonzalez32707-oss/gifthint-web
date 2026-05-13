/**
 * app/list/[username]/loading.tsx — GiftHint
 *
 * Next.js 14 automatic Suspense boundary: this component renders instantly
 * while page.tsx is awaiting its Supabase fetch. Replaced by the real page
 * as soon as data arrives — zero layout shift because skeleton dimensions
 * match the real components exactly.
 *
 * The CtaBar and top-nav are outside the Suspense boundary (they live in
 * layout.tsx), so they paint immediately regardless.
 */

import { tokens }         from '@/tokens'
import { GiftGridSkeleton, HeroSkeleton } from '@/components/GiftGridSkeleton'

export default function Loading() {
  return (
    <div
      style={{
        background: tokens.colors.bg,
        color:      tokens.colors.text,
        minHeight:  '100vh',
      }}
    >
      <main className="max-w-4xl mx-auto">
        <HeroSkeleton />
        <GiftGridSkeleton count={6} />
      </main>
    </div>
  )
}
