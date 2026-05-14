/**
 * hooks/useRealtimeClaims.ts — GiftHint
 *
 * Subscribes to live claimed-state updates for a wisher's items.
 *
 * Two signal paths (belt-and-suspenders):
 *   1. Broadcast  — the claim API fires a Supabase channel message immediately
 *                   after a successful DB write. Arrives in < 200 ms.
 *   2. Postgres Changes — the Supabase Realtime CDC pipeline picks up the DB
 *                   UPDATE. Arrives in 200 ms–2 s depending on replication lag.
 *
 * Fallback:
 *   If the Realtime subscription fails (old browser, WebSocket blocked, Supabase
 *   Realtime add-on disabled), the hook falls back to polling
 *   GET /api/items/[username] every 30 seconds.
 *
 * IMPORT RULE: 'use client' — never import from Server Components.
 */

'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient, type SupabaseClient }         from '@supabase/supabase-js'

// ── Module-level singleton ────────────────────────────────────────────────────
// Shared across hook instances so we don't open duplicate WS connections when
// the component tree re-renders. Safe because the anon key and URL are build-
// time constants.

let _browserClient: SupabaseClient | null = null

function getBrowserClient(): SupabaseClient | null {
  // Guard: this module can be imported in SSR context; only instantiate in browser
  if (typeof window === 'undefined') return null

  if (!_browserClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!url || !key) {
      console.warn('[useRealtimeClaims] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY — Realtime disabled')
      return null
    }

    _browserClient = createClient(url, key, {
      realtime: {
        // Supabase Realtime reconnects automatically with exponential back-off.
        // These params control the back-off ceiling and heartbeat interval.
        params: {
          eventsPerSecond: 10,
        },
      },
    })
  }

  return _browserClient
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Polling interval used as fallback when Realtime is unavailable. */
const POLL_INTERVAL_MS = 30_000

/** Duration before newlyClaimedId auto-clears (matches the flash pill's auto-dismiss). */
const FLASH_DURATION_MS = 3_000

// ── Types ──────────────────────────────────────────────────────────────────────

export interface UseRealtimeClaimsResult {
  /**
   * All item IDs that are currently known to be claimed.
   * Starts from server-rendered state and grows as real-time events arrive.
   * Safe to read on every render — identity is stable unless a new claim lands.
   */
  claimedItemIds: ReadonlySet<string>

  /**
   * The ID of the most-recently claimed item — non-null for 3 seconds after
   * a live update arrives so the UI can show a flash notification.
   * null during SSR and after the flash window elapses.
   */
  newlyClaimedId: string | null
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Tracks live claimed state for all items belonging to `wisherUserId`.
 *
 * @param wisherUserId     Supabase UUID of the list owner (used as RLS filter).
 * @param publicUsername   URL slug of the list owner (used for polling fallback).
 * @param initialClaimed   Set of item IDs already claimed at server render time.
 *                         Pass `new Set(items.filter(i => i.is_claimed).map(i => i.id))`.
 *                         Must be stable across renders (e.g. created with useMemo).
 */
export function useRealtimeClaims(
  wisherUserId:   string,
  publicUsername: string,
  initialClaimed: ReadonlySet<string>,
): UseRealtimeClaimsResult {
  // ── State ──────────────────────────────────────────────────────────────────
  const [claimedItemIds, setClaimedItemIds] = useState<ReadonlySet<string>>(initialClaimed)
  const [newlyClaimedId, setNewlyClaimedId] = useState<string | null>(null)

  // ── Refs ───────────────────────────────────────────────────────────────────
  // Refs avoid stale-closure issues inside async callbacks and setInterval.
  const pollTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isPollingRef  = useRef(false)

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Adds itemId to the claimed set and triggers the 3-second flash.
   * Idempotent — safe to call multiple times for the same ID (duplicate events
   * arrive when both broadcast and Postgres Changes fire for the same claim).
   */
  const markClaimed = useCallback((itemId: string) => {
    setClaimedItemIds((prev) => {
      // Skip state update if this ID was already known — keeps Set identity stable
      if (prev.has(itemId)) return prev
      const next = new Set(prev)
      next.add(itemId)
      return next as ReadonlySet<string>
    })

    // Flash: clear existing timer before starting a new one (handles rapid claims)
    setNewlyClaimedId(itemId)
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    flashTimerRef.current = setTimeout(() => setNewlyClaimedId(null), FLASH_DURATION_MS)
  }, [])

  /**
   * Polls GET /api/items/[username] for the latest claimed state.
   * Activated when Realtime subscription fails; runs every POLL_INTERVAL_MS.
   */
  const startPolling = useCallback(() => {
    if (isPollingRef.current) return  // only one polling loop at a time
    isPollingRef.current = true

    console.info('[useRealtimeClaims] Realtime unavailable — falling back to 30 s polling')

    async function poll() {
      try {
        const res = await fetch(`/api/items/${publicUsername}`, { cache: 'no-store' })
        if (!res.ok) return

        const { items } = (await res.json()) as {
          items: Array<{ id: string; is_claimed: boolean }>
        }

        for (const item of items) {
          if (item.is_claimed) markClaimed(item.id)
        }
      } catch {
        // Network error — silently skip; try again next interval
      }
    }

    // Run once immediately, then on the interval
    void poll()
    pollTimerRef.current = setInterval(poll, POLL_INTERVAL_MS)
  }, [publicUsername, markClaimed])

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
    isPollingRef.current = false
  }, [])

  // ── Realtime subscription ─────────────────────────────────────────────────

  useEffect(() => {
    const supabase = getBrowserClient()

    if (!supabase) {
      // SSR or missing env vars — fall back to polling immediately
      startPolling()
      return () => stopPolling()
    }

    // Channel name is scoped to the wisher so each page uses its own channel.
    // The claim API broadcasts to the same name (see app/api/claim/route.ts).
    const CHANNEL_NAME = `gifthint:claims:${wisherUserId}`

    let channel: ReturnType<typeof supabase.channel> | null = null
    let subscribeAttempted = false

    try {
      channel = supabase
        .channel(CHANNEL_NAME, {
          config: {
            // Broadcast: receive messages sent by the server-side claim API
            broadcast: { self: false },
          },
        })

        // ── Signal path 1: Server broadcast (fast, ~<200 ms) ──────────────
        // The claim API sends this immediately after the DB write succeeds.
        .on('broadcast', { event: 'item_claimed' }, (msg) => {
          const payload = msg.payload as { itemId?: string } | null
          if (payload?.itemId) {
            markClaimed(payload.itemId)
          }
        })

        // ── Signal path 2: Postgres CDC changes (authoritative, ~200 ms–2 s)
        // Catches any UPDATE that sets is_claimed = true, including claims
        // that bypass the API (e.g. direct DB edits, future admin tools).
        .on(
          'postgres_changes',
          {
            event:  'UPDATE',
            schema: 'public',
            table:  'wishlist_items',
            // Row-level filter: only receive updates for this wisher's items.
            // Requires the wishlist_items table to be in supabase_realtime
            // publication (run: ALTER PUBLICATION supabase_realtime ADD TABLE wishlist_items)
            filter: `user_id=eq.${wisherUserId}`,
          },
          (payload) => {
            const row = payload.new as { id?: string; is_claimed?: boolean }
            if (row?.id && row.is_claimed === true) {
              markClaimed(row.id)
            }
          },
        )

        // ── Subscription lifecycle ─────────────────────────────────────────
        .subscribe((status, err) => {
          switch (status) {
            case 'SUBSCRIBED':
              // Successfully connected — make sure polling is off
              stopPolling()
              break

            case 'CHANNEL_ERROR':
              // Server rejected the subscription (likely a config issue).
              // Fall back to polling; Supabase will still attempt to reconnect.
              console.warn('[useRealtimeClaims] Channel error:', err)
              startPolling()
              break

            case 'TIMED_OUT':
              // Network issue — fall back. Supabase reconnects automatically;
              // once it recovers and we get SUBSCRIBED again, we stop polling.
              console.warn('[useRealtimeClaims] Subscription timed out — polling fallback active')
              startPolling()
              break

            case 'CLOSED':
              // Channel was explicitly removed (cleanup) — no action needed.
              break
          }
        })

      subscribeAttempted = true
    } catch (err) {
      // createClient or .channel() itself threw (very unusual but possible in
      // environments that block WebSocket construction).
      console.warn('[useRealtimeClaims] Failed to set up Realtime subscription:', err)
      startPolling()
    }

    // ── Cleanup ────────────────────────────────────────────────────────────
    // Runs on unmount and before the effect re-runs (wisherUserId change).
    return () => {
      if (channel && subscribeAttempted) {
        supabase.removeChannel(channel)
      }
      stopPolling()
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wisherUserId])  // Re-subscribe only when the wisher changes (e.g. client-side nav)

  return { claimedItemIds, newlyClaimedId }
}
