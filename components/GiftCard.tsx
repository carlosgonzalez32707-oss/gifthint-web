/**
 * components/GiftCard.tsx — GiftHint
 *
 * Individual gift card rendered inside GiftGrid.
 * Handles three visual states:
 *   default  — product image, price, hint, tags, "Buy on [Retailer]" CTA
 *   claimed  — greyscale + opacity-50, buy button → "✓ Already claimed" pill
 *   no-image — retailer-category emoji centred on surface2 background
 *
 * NOTE: next/image requires remotePatterns in next.config.js for external
 * image domains. Add the CDN hostnames for each retailer you support, e.g.:
 *   images: { remotePatterns: [{ protocol: 'https', hostname: '**.amazon.com' }, ...] }
 */

'use client'

import { useState }              from 'react'
import Image                     from 'next/image'
import { tokens }                from '@/tokens'
import { shouldSkipSkimlinks }   from '@/lib/affiliate'
import type { WishlistItem }     from '@/types/wishlist'

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
  item: WishlistItem
}

export function GiftCard({ item }: GiftCardProps) {
  // Track image load failures so we can swap in the emoji fallback
  const [imgError, setImgError] = useState(false)

  const isClaimed  = item.is_claimed
  const buyUrl     = item.affiliate_url ?? item.source_url
  // Exclude Amazon links from Skimlinks rewriting — they already carry our
  // Associates tag (applied server-side in lib/affiliate.ts). Skimlinks
  // respects the data-skimlinks-excluded attribute and skips those anchors.
  const excludeFromSkimlinks = shouldSkipSkimlinks(buyUrl)
  const retailerLabel = item.retailer
    ? item.retailer.charAt(0).toUpperCase() + item.retailer.slice(1)
    : 'Store'

  // Human-readable claim attribution shown under the claimed pill
  const claimAttribution = isClaimed
    ? item.claimed_anonymous || !item.claimed_by
      ? 'claimed anonymously'
      : `claimed by ${item.claimed_by}`
    : null

  const showImage = !!item.image_url && !imgError

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
          <Image
            src={item.image_url!}
            alt={item.title}
            fill
            sizes="(max-width: 480px) 50vw, (max-width: 768px) 33vw, 200px"
            className="object-cover"
            onError={() => setImgError(true)}
            // Remove `unoptimized` after adding remotePatterns to next.config.js
            unoptimized
          />
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

        {/* Title — 2-line max, 13 px, weight 500 */}
        <p
          className="line-clamp-2 leading-snug"
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

        {/* DNA tag pills — only when tags exist */}
        {item.dna_tags.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {item.dna_tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-full"
                style={{
                  fontSize:   '10px',
                  fontWeight: 600,
                  padding:    '2px 7px',
                  background: tokens.colors.purpleDim,
                  border:     `1px solid ${tokens.colors.purpleRing}`,
                  color:      tokens.colors.purple,
                  lineHeight: 1.6,
                  whiteSpace: 'nowrap',
                }}
              >
                {tag}
              </span>
            ))}
          </div>
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
           */}
          <a
            href={buyUrl}
            target="_blank"
            rel="noopener noreferrer"
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
