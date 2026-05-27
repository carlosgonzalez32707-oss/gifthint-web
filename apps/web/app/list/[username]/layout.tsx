/**
 * app/list/[username]/layout.tsx — GiftHint gifter page layout
 *
 * Route-segment layout that wraps every page under /list/[username].
 * Currently this is just the one gifter page, but the layout exists so
 * Skimlinks (and any other gifter-only scripts) load ONLY on gifter routes —
 * never on the landing page, /privacy, /terms, or any other top-level route.
 *
 * SKIMLINKS SCOPE:
 *   Skimlinks must only run where there are product links to monetise.
 *   Loading it globally (in the root layout) would waste bytes on every page
 *   and could interfere with other outbound links across the site.
 */

import { SkimlinksScript } from '@/components/SkimlinksScript'

export default function GifterLayout({ children }: { children: React.ReactNode }) {
  // NEXT_PUBLIC_ prefix makes this available in the browser bundle.
  // Skimlinks publisher ID is intentionally public — it appears in the script
  // URL and is not a secret. Do NOT use the secret API key here.
  const publisherId = process.env.NEXT_PUBLIC_SKIMLINKS_PUBLISHER_ID ?? ''

  return (
    <>
      {/*
       * SkimlinksScript renders two <Script> tags:
       *   1. A tiny inline that sets window.skimlinks_pub_id (beforeInteractive)
       *   2. The full Skimlinks bundle (afterInteractive — non-blocking)
       *
       * Amazon links in GiftCard already carry data-skimlinks-excluded="true"
       * so Skimlinks will not touch them.
       */}
      <SkimlinksScript publisherId={publisherId} />
      {children}
    </>
  )
}
