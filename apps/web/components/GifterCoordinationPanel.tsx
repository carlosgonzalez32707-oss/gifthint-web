/**
 * components/GifterCoordinationPanel.tsx — GiftHint
 *
 * Collapsible gifter coordination panel. Shown above the footer on the
 * public gifter page so multiple gifters can see at a glance what has
 * already been claimed and who is getting what.
 *
 * Data flow:
 *   - On first expand: fetches GET /api/claims/[username]
 *   - While expanded: re-fetches every time `claimedCount` changes
 *     (wired to the Realtime hook in GifterPage so new claims appear live)
 *   - Subsequent opens reuse the cached data until claimedCount changes
 *
 * Design notes:
 *   - Toggle button always visible — tells gifters how many items are claimed
 *   - Panel slides open with a CSS max-height transition (no JS animation lib)
 *   - Thumbnail is 40×40 px, falls back to a 🎁 emoji on load error
 *   - Anonymous claims show "Someone" as the claimant name
 *
 * IMPORT RULE: 'use client' — fetches happen in the browser on expand.
 */

'use client'

import { useState, useEffect, useRef } from 'react'
import { tokens }                      from '@/tokens'
import { timeAgo }                     from '@/lib/time'
import type { ClaimedItemDTO }         from '@/app/api/claims/[username]/route'

// ── Types ──────────────────────────────────────────────────────────────────────

interface GifterCoordinationPanelProps {
  /** Public username slug of the list owner — used to call the claims API */
  username:     string
  /**
   * Total number of claimed items — passed from the parent (which already has
   * the item list) so the toggle button can show an accurate count without a
   * separate fetch. Also used to trigger re-fetching when a new claim arrives.
   */
  claimedCount: number
}

// ── Component ─────────────────────────────────────────────────────────────────

export function GifterCoordinationPanel({
  username,
  claimedCount,
}: GifterCoordinationPanelProps) {
  const [isOpen,   setIsOpen]   = useState(false)
  const [items,    setItems]    = useState<ClaimedItemDTO[]>([])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  // Track last fetched count so we know when to re-fetch after a new claim
  const lastFetchedCountRef = useRef<number | null>(null)

  // ── Fetch ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    // Only fetch when the panel is open AND the count has changed since last fetch
    if (!isOpen) return
    if (lastFetchedCountRef.current === claimedCount) return

    let cancelled = false
    setLoading(true)
    setError(null)

    fetch(`/api/claims/${username}`, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<{ items: ClaimedItemDTO[] }>
      })
      .then(({ items: fetched }) => {
        if (cancelled) return
        setItems(fetched)
        lastFetchedCountRef.current = claimedCount
      })
      .catch(() => {
        if (cancelled) return
        setError('Could not load claimed items. Try again.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [isOpen, claimedCount, username])

  // ── Toggle label ───────────────────────────────────────────────────────────

  const toggleLabel =
    claimedCount === 0
      ? '👥 See what\'s been claimed'
      : `👥 See what's been claimed (${claimedCount} item${claimedCount === 1 ? '' : 's'})`

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <section
      aria-label="Gifter coordination panel"
      style={{
        margin:       '0 16px 32px',
        borderRadius: tokens.radius.lg,
        border:       `1px solid ${tokens.colors.border}`,
        background:   tokens.colors.surface,
        overflow:     'hidden',
      }}
    >
      {/* ── Toggle button ─────────────────────────────────────────────── */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-controls="coordination-panel-body"
        style={{
          width:          '100%',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        '14px 16px',
          background:     'transparent',
          border:         'none',
          cursor:         'pointer',
          textAlign:      'left',
          gap:            '8px',
        }}
      >
        <span
          style={{
            fontSize:   '13px',
            fontWeight: 600,
            color:      tokens.colors.text,
            fontFamily: tokens.font.sans,
          }}
        >
          {toggleLabel}
        </span>

        {/* Chevron rotates 180° when open */}
        <span
          aria-hidden="true"
          style={{
            display:    'inline-block',
            fontSize:   '10px',
            color:      tokens.colors.muted,
            transform:  isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 200ms ease',
            flexShrink: 0,
          }}
        >
          ▼
        </span>
      </button>

      {/* ── Expandable body ───────────────────────────────────────────── */}
      {/*
        CSS max-height transition: start at 0 (collapsed) → 800px (open).
        800 px is more than enough for ~10 items; content clips naturally.
        Using max-height avoids needing to know the real height upfront.
      */}
      <div
        id="coordination-panel-body"
        role="region"
        aria-label="Claimed items list"
        style={{
          maxHeight:    isOpen ? '800px' : '0px',
          overflow:     'hidden',
          transition:   'max-height 280ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <div
          style={{
            borderTop: `1px solid ${tokens.colors.border}`,
            padding:   '12px 0 4px',
          }}
        >
          {/* Loading state */}
          {loading && (
            <div
              style={{
                padding:    '20px 16px',
                textAlign:  'center',
                fontSize:   '13px',
                color:      tokens.colors.muted,
              }}
            >
              Loading…
            </div>
          )}

          {/* Error state */}
          {!loading && error && (
            <div
              style={{
                padding:    '20px 16px',
                textAlign:  'center',
                fontSize:   '13px',
                color:      tokens.colors.amber,
              }}
            >
              {error}
            </div>
          )}

          {/* Empty state — nothing claimed yet */}
          {!loading && !error && items.length === 0 && (
            <div
              style={{
                padding:    '24px 16px',
                textAlign:  'center',
              }}
            >
              <p
                style={{
                  fontSize:   '13px',
                  fontWeight: 500,
                  color:      tokens.colors.muted,
                  margin:     0,
                }}
              >
                Nothing claimed yet — be the first!
              </p>
            </div>
          )}

          {/* Claimed items list */}
          {!loading && !error && items.length > 0 && (
            <ul
              style={{
                listStyle: 'none',
                margin:    0,
                padding:   '0 0 8px',
              }}
            >
              {items.map((item, idx) => (
                <ClaimedItemRow
                  key={item.itemId}
                  item={item}
                  isLast={idx === items.length - 1}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}

// ── ClaimedItemRow ────────────────────────────────────────────────────────────

interface ClaimedItemRowProps {
  item:   ClaimedItemDTO
  isLast: boolean
}

function ClaimedItemRow({ item, isLast }: ClaimedItemRowProps) {
  const [imgError, setImgError] = useState(false)

  const relativeTime = timeAgo(new Date(item.claimedAt))

  return (
    <li
      style={{
        display:       'flex',
        alignItems:    'center',
        gap:           '12px',
        padding:       '10px 16px',
        borderBottom:  isLast ? 'none' : `1px solid ${tokens.colors.border}`,
      }}
    >
      {/* ── Thumbnail ─────────────────────────────────────────────────── */}
      <div
        style={{
          width:        '40px',
          height:       '40px',
          borderRadius: tokens.radius.sm,
          overflow:     'hidden',
          flexShrink:   0,
          background:   tokens.colors.surface2,
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'center',
          fontSize:     '18px',
        }}
        aria-hidden="true"
      >
        {item.imageUrl && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt=""
            width={40}
            height={40}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={() => setImgError(true)}
          />
        ) : (
          '🎁'
        )}
      </div>

      {/* ── Text ──────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Title — single line with ellipsis */}
        <p
          style={{
            margin:       0,
            fontSize:     '13px',
            fontWeight:   500,
            color:        tokens.colors.text,
            overflow:     'hidden',
            textOverflow: 'ellipsis',
            whiteSpace:   'nowrap',
          }}
        >
          {item.title}
        </p>

        {/* Attribution + time */}
        <p
          style={{
            margin:     '2px 0 0',
            fontSize:   '11px',
            color:      tokens.colors.muted,
          }}
        >
          <span
            style={{
              color:      item.claimedBy === 'Someone'
                ? tokens.colors.muted
                : tokens.colors.green,
              fontWeight: 600,
            }}
          >
            {item.claimedBy === 'Someone'
              ? 'Claimed anonymously'
              : `Claimed by ${item.claimedBy}`}
          </span>
          {' · '}
          <span>{relativeTime}</span>
        </p>
      </div>

      {/* ── Claimed badge ──────────────────────────────────────────────── */}
      <span
        aria-hidden="true"
        style={{
          flexShrink:   0,
          fontSize:     '11px',
          fontWeight:   700,
          padding:      '3px 8px',
          borderRadius: tokens.radius.pill,
          background:   tokens.colors.greenDim,
          border:       `1px solid ${tokens.colors.greenRing}`,
          color:        tokens.colors.green,
          whiteSpace:   'nowrap',
        }}
      >
        ✓ Taken
      </span>
    </li>
  )
}
