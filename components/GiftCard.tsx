/**
 * components/GiftCard.tsx — GiftHint
 *
 * Individual gift card rendered inside GiftGrid.
 * Handles three visual states:
 *   default  — product image, price, hint, tags, "Buy on [Retailer]" CTA
 *   claimed  — greyscale + opacity-50, buy button → "✓ Already claimed" pill
 *   no-image — retailer-category emoji centred on surface2 background
 *
 * DNA tag display:
 *   Each tag pill shows a plain-English tooltip on hover via DNA_TAG_TOOLTIPS.
 *   Claimed items with tags show an AlternativeGiftPanel below the action area.
 *   Unclaimed items with tags show a collapsible "💡 Gifting tips" section.
 *
 * NOTE: next/image requires remotePatterns in next.config.js for external
 * image domains. Add the CDN hostnames for each retailer you support, e.g.:
 *   images: { remotePatterns: [{ protocol: 'https', hostname: '**.amazon.com' }, ...] }
 */

'use client'

import { useState, useCallback }        from 'react'
import Image                            from 'next/image'
import { tokens }                       from '@/tokens'
import { shouldSkipSkimlinks,
         shouldUseFallbackRedirect }    from '@/lib/affiliate'
import { trackBuyClick,
         inferAffiliateNetwork }        from '@/lib/analytics'
import { DNA_TAG_TOOLTIPS }             from '@/lib/dna-tags'
import { generateAlternativeGuidance }  from '@/lib/alternative-guidance'
import { AlternativeGiftPanel }         from '@/components/AlternativeGiftPanel'
import type { WishlistItem }            from '@/types/wishlist'

// ── Retailer → fallback emoji ─────────────────────────────────────────────────
// Matches on a substring of the normalised retailer string so "amazon.com"
// and "Amazon" both map to the same emoji.

const RETAILER_EMOJI: Array<[match: string, emoji: string]> = [
  ['amazon',     '📦'],
  ['etsy',       '🎨'],
  ['walmart',    '🛒'],
  ['target',     '🎯'],
  ['apple',      '🍎'],
  ['nike',       '👟'],
  ['adidas',     '👟'],
  ['nordstrom',  '👗'],
  ['zara',       '👗'],
  ['book',       '📚'],
  ['sport',      '🏋️'],
  ['fitness',    '🏋️'],
  ['home depot', '🔨'],
  ['ikea',       '🛋️'],
  ['sephora',    '💄'],
  ['ulta',       '💄'],
]

function getRetailerEmoji(retailer: string | null): string {
  if (!retailer) return '🎁'
  const lower = retailer.toLowerCase()
  const hit   = RETAILER_EMOJI.find(([match]) => lower.includes(match))
  return hit ? hit[1] : '🎁'
}

// ── Price formatting ──────────────────────────────────────────────────────────

function formatPrice(price: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style:                 'currency',
      currency,
      minimumFractionDigits: price % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(price)
  } catch {
    // Unknown currency code — fall back to plain symbol
    return `$${price.toFixed(2)}`
  }
}

// ── Utility ───────────────────────────────────────────────────────────────────

function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

// ── DNA tag pill with hover tooltip ──────────────────────────────────────────

/**
 * Renders a single DNA tag pill with a plain-English tooltip on hover.
 * The tooltip is an absolutely-positioned div anchored below the pill so it
 * stays within the card and avoids overflow clipping at the viewport edge.
 */
function DnaTagPill({ tag }: { tag: string }) {
  const [hovered, setHovered] = useState(false)
  const tooltip = DNA_TAG_TOOLTIPS[tag]

  return (
    <span
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <span
        className="rounded-full"
        style={{
          display:     'inline-block',
          fontSize:    '10px',
          fontWeight:  600,
          padding:     '2px 7px',
          background:  tokens.colors.purpleDim,
          border:      `1px solid ${tokens.colors.purpleRing}`,
          color:       tokens.colors.purple,
          lineHeight:  1.6,
          whiteSpace:  'nowrap',
          cursor:      tooltip ? 'default' : undefined,
          userSelect:  'none',
        }}
      >
        {tag}
      </span>

      {/* Tooltip — only rendered when hovered and a tooltip string exists */}
      {hovered && tooltip && (
        <span
          role="tooltip"
          style={{
            position:     'absolute',
            top:          'calc(100% + 5px)',
            left:         '50%',
            transform:    'translateX(-50%)',
            zIndex:       50,
            minWidth:     '150px',
            maxWidth:     '220px',
            padding:      '6px 9px',
            borderRadius: '6px',
            background:   tokens.colors.text,
            color:        tokens.colors.surface,
            fontSize:     '10.5px',
            fontWeight:   400,
            lineHeight:   1.45,
            textAlign:    'center',
            whiteSpace:   'normal',
            pointerEvents:'none',
            boxShadow:    '0 4px 12px rgba(0,0,0,0.25)',
          }}
        >
          {tooltip}
        </span>
      )}
    </span>
  )
}

// ── Gifting tips section (unclaimed items only) ───────────────────────────────

/**
 * Collapsible "💡 Gifting tips" section for unclaimed items that carry DNA tags.
 * Shows the plain-English guidance sentence from generateAlternativeGuidance so
 * gifters know what kind of item the wisher actually prefers — even before the
 * item is claimed.
 */
function GiftingTipsSection({ guidance }: { guidance: string }) {
  const [open, setOpen] = useState(false)

  return (
    <div
      style={{
        marginTop:    '4px',
        borderRadius: '8px',
        overflow:     'hidden',
        border:       `1px solid ${open ? tokens.colors.purpleRing : tokens.colors.border}`,
        transition:   'border-color 150ms ease',
      }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          width:          '100%',
          padding:        '6px 10px',
          background:     open ? tokens.colors.purpleDim : tokens.colors.surface2,
          border:         'none',
          cursor:         'pointer',
          textAlign:      'left',
          gap:            '6px',
          transition:     'background 150ms ease',
        }}
      >
        <span
          style={{
            fontSize:   '10.5px',
            fontWeight: 600,
            color:      open ? tokens.colors.purple : tokens.colors.muted,
            lineHeight: 1.4,
            transition: 'color 150ms ease',
          }}
        >
          💡 Gifting tips
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
          style={{
            flexShrink: 0,
            transition: 'transform 200ms ease',
            transform:  open ? 'rotate(90deg)' : 'rotate(0deg)',
            color:      tokens.colors.muted,
          }}
        >
          <path
            d="M4.5 2.5L8 6l-3.5 3.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div
          style={{
            padding:    '8px 10px',
            background: tokens.colors.surface,
            borderTop:  `1px solid ${tokens.colors.purpleRing}`,
          }}
        >
          <p
            style={{
              margin:     0,
              fontSize:   '11px',
              color:      tokens.colors.text,
              lineHeight: 1.5,
            }}
          >
            {guidance}
          </p>
        </div>
      )}
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function ExternalLinkIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 11 11"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      {/* Box */}
      <path
        d="M4.5 2H2a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V6.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Arrow */}
      <path
        d="M6.5 1H10m0 0v3.5M10 1 5 6"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

interface GiftCardProps {
  item:               WishlistItem
  /** UUID of the wishlist owner — passed through for click attribution */
  wisherUserId:       string
  /** Public username slug — used to identify the gifter page in analytics */
  gifterPageUsername: string
  /**
   * First name of the wisher, forwarded to AlternativeGiftPanel.
   * Used in "Can't find this? Here's what [Name] actually wants".
   * Defaults to "they" / "their" inside the panel when not provided.
   */
  wisherFirstName?:   string
}

export function GiftCard({ item, wisherUserId, gifterPageUsername, wisherFirstName }: GiftCardProps) {
  // Track image load state: 'loading' | 'loaded' | 'error'
  const [imgState, setImgState] = useState<'loading' | 'loaded' | 'error'>(
    item.image_url ? 'loading' : 'error',
  )

  const isClaimed  = item.is_claimed
  const hasTags    = Array.isArray(item.dna_tags) && item.dna_tags.length > 0

  // Pre-compute guidance for unclaimed items so we only call generateAlternativeGuidance once
  const guidance   = !isClaimed && hasTags ? generateAlternativeGuidance(item) : null

  // ── Resolve the best buy URL for this item ───────────────────────────────
  //
  // Priority order:
  //   1. skimlinks_fallback_url — for ineligible retailers: manual Skimlinks
  //      redirect built server-side (go.skimresources.com). Used when neither
  //      Associates nor Skimlinks' JS auto-detection covers this retailer.
  //   2. affiliate_url — server-side rewritten (Associates tag for Amazon,
  //      plain source_url for Skimlinks-eligible retailers).
  //   3. source_url — raw saved URL, last resort.
  //
  // All candidates are validated with `new URL()` to guard against malformed
  // strings that slipped past server validation.
  const buyUrl = (() => {
    const candidates = [
      item.skimlinks_fallback_url,
      item.affiliate_url,
      item.source_url,
    ]
    for (const candidate of candidates) {
      if (!candidate) continue
      try {
        new URL(candidate)   // throws if malformed
        return candidate
      } catch {
        // Try next candidate
      }
    }
    return item.source_url   // absolute last resort — may be malformed
  })()

  // Warn in development when an item has no affiliate coverage so developers
  // can catch gaps early. Never fires in production.
  if (process.env.NODE_ENV === 'development') {
    const hasCoverage =
      shouldSkipSkimlinks(item.source_url) ||   // Amazon → Associates
      !shouldUseFallbackRedirect(item.source_url) ||  // Skimlinks-eligible
      !!item.skimlinks_fallback_url               // fallback redirect set
    if (!hasCoverage) {
      console.warn(
        `[GiftHint] No affiliate coverage for item "${item.title}" ` +
        `(${item.source_url}). ` +
        'Add SKIMLINKS_PUBLISHER_ID to .env.local to enable fallback redirects.',
      )
    }
  }

  // Exclude Amazon links from Skimlinks rewriting — they already carry our
  // Associates tag (applied server-side in lib/affiliate.ts). Skimlinks
  // respects the data-skimlinks-excluded attribute and skips those anchors.
  // Also exclude fallback-redirect URLs (they already route through Skimlinks).
  const excludeFromSkimlinks =
    shouldSkipSkimlinks(item.source_url) || !!item.skimlinks_fallback_url
  const retailerLabel = item.retailer
    ? item.retailer.charAt(0).toUpperCase() + item.retailer.slice(1)
    : 'Store'

  // Human-readable claim attribution shown under the claimed pill
  const claimAttribution = isClaimed
    ? item.claimed_anonymous || !item.claimed_by
      ? 'claimed anonymously'
      : `claimed by ${item.claimed_by}`
    : null

  const showImage = imgState !== 'error'

  // Fire-and-forget click tracking — never awaited, never blocks navigation.
  // keepalive:true in trackBuyClick ensures the request survives tab navigation.
  const handleBuyClick = useCallback(() => {
    trackBuyClick({
      itemId:             item.id,
      wisherUserId,
      retailer:           item.retailer ?? 'unknown',
      affiliateNetwork:   inferAffiliateNetwork(buyUrl),
      gifterPageUsername,
    })
  }, [item.id, item.retailer, wisherUserId, buyUrl, gifterPageUsername])

  return (
    <article
      className={cn(
        'flex flex-col rounded-xl overflow-hidden',
        'transition-[filter,opacity] duration-200',
        isClaimed && 'opacity-50 grayscale',
      )}
      style={{
        background: tokens.colors.surface,
        border:     `1px solid ${tokens.colors.border}`,
      }}
      aria-label={isClaimed ? `${item.title} — already claimed` : item.title}
    >

      {/* ── Product image ────────────────────────────────────────────────── */}
      <div
        className="relative w-full overflow-hidden rounded-t-xl"
        style={{
          aspectRatio: '1 / 1',
          background:  tokens.colors.surface2,
        }}
      >
        {showImage ? (
          <>
            {/* Shimmer shown while the image is loading */}
            {imgState === 'loading' && (
              <div className="absolute inset-0 shimmer" aria-hidden="true" />
            )}
            <Image
              src={item.image_url!}
              alt={item.title}
              fill
              sizes="(max-width: 480px) 50vw, (max-width: 768px) 33vw, 200px"
              className="object-cover"
              onLoad={() => setImgState('loaded')}
              onError={() => setImgState('error')}
              // Remove `unoptimized` after adding remotePatterns to next.config.js
              unoptimized
            />
          </>
        ) : (
          /* Emoji fallback — retailer-specific category icon */
          <div
            className="w-full h-full flex items-center justify-center select-none"
            style={{ fontSize: '40px' }}
            aria-hidden="true"
          >
            {getRetailerEmoji(item.retailer)}
          </div>
        )}
      </div>

      {/* ── Card body ────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 p-3 flex-1">

        {/* Title — 2-line max, tooltip on hover for truncated text */}
        <p
          className="title-clamp leading-snug"
          title={item.title}
          style={{
            fontSize:   '13px',
            fontWeight: 500,
            color:      tokens.colors.text,
            lineHeight: 1.4,
          }}
        >
          {item.title}
        </p>

        {/* Price + retailer badge */}
        {(item.price != null || item.retailer) && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {item.price != null && (
              <span
                style={{
                  fontSize:   '13px',
                  fontWeight: 500,
                  color:      tokens.colors.green,
                  lineHeight: 1,
                }}
              >
                {formatPrice(item.price, item.currency)}
              </span>
            )}
            {item.retailer && (
              <span
                className="rounded-full"
                style={{
                  fontSize:   '10px',
                  fontWeight: 500,
                  padding:    '2px 7px',
                  background: tokens.colors.surface2,
                  color:      tokens.colors.muted,
                  lineHeight: 1.6,
                  whiteSpace: 'nowrap',
                }}
              >
                {item.retailer}
              </span>
            )}
          </div>
        )}

        {/* Hint box — amber, only when hint is set */}
        {item.hint && (
          <div
            className="rounded-lg text-xs leading-relaxed"
            style={{
              background: '#3D2E12',      // amber-dark tint matching dark theme
              color:      tokens.colors.amber,
              padding:    '7px 10px',
              fontSize:   '11.5px',
            }}
          >
            💡 {item.hint}
          </div>
        )}

        {/* DNA tag pills with hover tooltips — up to 3 shown, clipped beyond that */}
        {hasTags && (
          <div
            className="flex gap-1 flex-wrap"
            // Contain the absolutely-positioned tooltips
            style={{ position: 'relative' }}
          >
            {item.dna_tags.slice(0, 3).map((tag) => (
              <DnaTagPill key={tag} tag={tag} />
            ))}
            {item.dna_tags.length > 3 && (
              <span
                style={{
                  fontSize:   '10px',
                  fontWeight: 500,
                  color:      tokens.colors.muted,
                  lineHeight: 1.6,
                  alignSelf:  'center',
                }}
              >
                +{item.dna_tags.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Gifting tips — collapsible, unclaimed items with actionable guidance */}
        {!isClaimed && guidance && (
          <GiftingTipsSection guidance={guidance} />
        )}

        {/* Push action area to bottom of card */}
        <div className="flex-1" style={{ minHeight: '8px' }} />

        {/* ── Action area ──────────────────────────────────────────────── */}
        {isClaimed ? (
          /* Claimed state: muted pill + attribution line */
          <div className="flex flex-col gap-1">
            <div
              className="w-full rounded-lg text-center"
              style={{
                fontSize:   '11.5px',
                fontWeight: 600,
                padding:    '8px 12px',
                background: tokens.colors.surface2,
                border:     `1px solid ${tokens.colors.border}`,
                color:      tokens.colors.muted,
              }}
            >
              ✓ Already claimed
            </div>
            {claimAttribution && (
              <p
                className="text-center"
                style={{
                  fontSize: '10px',
                  color:    tokens.colors.muted,
                  opacity:  0.7,
                }}
              >
                {claimAttribution}
              </p>
            )}

            {/* Alternative gift panel — only when item has DNA tags */}
            {hasTags && (
              <AlternativeGiftPanel
                item={item}
                wisherFirstName={wisherFirstName}
              />
            )}
          </div>

        ) : (
          /* Default state: Buy on [Retailer] button → external link.
           *
           * SKIMLINKS STRATEGY:
           *   - Plain <a href> tags (not onClick handlers) are required so
           *     Skimlinks can detect and rewrite non-Amazon links at click time.
           *   - Amazon links get data-skimlinks-excluded="true" so Skimlinks
           *     leaves them alone — our Associates tag is already applied.
           *   - Non-Amazon links have no exclusion attribute, so Skimlinks
           *     will rewrite them with its own affiliate tracking.
           */
          <a
            href={buyUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleBuyClick}
            {...(excludeFromSkimlinks
              ? { 'data-skimlinks-excluded': 'true' }
              : {}
            )}
            className="flex items-center justify-center gap-1.5 w-full rounded-lg transition-opacity hover:opacity-85 active:scale-[0.98]"
            style={{
              fontSize:        '11.5px',
              fontWeight:      600,
              padding:         '9px 12px',
              background:      tokens.colors.purple,
              color:           '#fff',
              textDecoration:  'none',
              letterSpacing:   '0.1px',
            }}
            aria-label={`Buy ${item.title} on ${retailerLabel}`}
          >
            Buy on {retailerLabel}
            <ExternalLinkIcon />
          </a>
        )}

      </div>
    </article>
  )
}
