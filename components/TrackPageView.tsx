/**
 * components/TrackPageView.tsx — GiftHint
 *
 * Fires a single POST /api/track-view after the gifter page hydrates.
 * Renders nothing — purely a side-effect component.
 *
 * Usage (in the gifter page server component):
 *   import { TrackPageView } from '@/components/TrackPageView'
 *   <TrackPageView wishlistId={wishlist.id} />
 *
 * The call is:
 *   - Non-blocking (keepalive fetch in a useEffect)
 *   - Deduplicated by the API's in-memory rate limit (1/hour/IP)
 *   - Silently ignored on failure (analytics are best-effort)
 */

'use client'

import { useEffect } from 'react'

interface TrackPageViewProps {
  wishlistId: string
}

export function TrackPageView({ wishlistId }: TrackPageViewProps) {
  useEffect(() => {
    // Fire-and-forget — do not await, do not block render
    fetch('/api/track-view', {
      method:    'POST',
      headers:   { 'Content-Type': 'application/json' },
      body:      JSON.stringify({ wishlistId }),
      keepalive: true,   // survives page unload on some browsers
    }).catch(() => {
      // Swallow errors — analytics are best-effort
    })
  }, [wishlistId])   // only fires once per wishlist (page load)

  return null
}
