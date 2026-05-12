/**
 * components/SkimlinksScript.tsx — GiftHint
 *
 * Loads the Skimlinks publisher script on gifter pages only.
 *
 * HOW SKIMLINKS WORKS:
 *   Skimlinks scans the DOM for plain <a href="..."> tags pointing at
 *   supported retailers and rewrites them with affiliate tracking in the
 *   browser at click time. It is opt-out (not opt-in) — by default it will
 *   attempt to rewrite every outbound link it sees.
 *
 * AMAZON / SKIMLINKS SEPARATION:
 *   Amazon links are already monetised server-side with our Associates tag
 *   (lib/affiliate.ts). If Skimlinks also rewrote them it would:
 *     a) Strip our Associates tag (losing that commission)
 *     b) Potentially violate Amazon Associates ToS (no sub-affiliate stacking)
 *   Solution: GiftCard adds data-skimlinks-excluded="true" to every Amazon
 *   anchor. Skimlinks respects this attribute and skips those links entirely.
 *
 * PLACEMENT:
 *   This component is rendered from app/list/[username]/layout.tsx only,
 *   so the script never loads on the landing page, /privacy, /terms, etc.
 *   That keeps page-weight down for non-gifter routes.
 *
 * STRATEGY — afterInteractive:
 *   next/script afterInteractive defers loading until the page is interactive,
 *   so it never blocks the LCP image or the initial paint.
 */

'use client'

import Script from 'next/script'

interface SkimlinksScriptProps {
  /**
   * Your Skimlinks publisher ID.
   * Found in: Skimlinks dashboard → Account → Publisher ID
   * Passed as a prop (sourced from NEXT_PUBLIC_SKIMLINKS_PUBLISHER_ID)
   * so the component itself stays testable with any ID.
   */
  publisherId: string
}

export function SkimlinksScript({ publisherId }: SkimlinksScriptProps) {
  // Don't render at all if no publisher ID is configured — avoids a broken
  // script request in development before the account is set up.
  if (!publisherId) return null

  const scriptSrc = `https://s.skimresources.com/js/${publisherId}X.skimlinks.js`

  return (
    <>
      {/*
       * Set the publisher ID on window BEFORE the Skimlinks script executes.
       * Skimlinks reads window.skimlinks_pub_id on initialisation.
       * Using beforeInteractive here would block hydration; instead we inline
       * the assignment as a tiny beforeInteractive script which runs first,
       * then load the heavier Skimlinks bundle afterInteractive.
       */}
      <Script
        id="skimlinks-pubid"
        strategy="beforeInteractive"
        dangerouslySetInnerHTML={{
          __html: `window.skimlinks_pub_id = "${publisherId}";`,
        }}
      />

      {/* Main Skimlinks bundle — deferred until page is interactive */}
      <Script
        id="skimlinks-main"
        src={scriptSrc}
        strategy="afterInteractive"
      />
    </>
  )
}
