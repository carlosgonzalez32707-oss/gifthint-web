/**
 * hooks/useGroupGiftPool.ts — GiftHint
 *
 * Fetches the gift_pool and its gift_contributions for one item,
 * then subscribes to Supabase Realtime so the progress bar updates
 * live as other gifters chip in.
 *
 * Only reads pool + contributions — writes go through the API routes.
 *
 * Usage:
 *   const { pool, contributions, percentFunded, isFullyFunded } =
 *     useGroupGiftPool(item.id)
 */

'use client'

import { useEffect, useState, useCallback } from 'react'
import { getBrowserClient }                 from '@/lib/supabase-browser'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GiftPool {
  id:                  string
  item_id:             string
  target_amount:       number
  collected_amount:    number
  status:              'open' | 'funded' | 'purchased' | 'cancelled'
  organiser_name:      string
  organiser_email:     string
  payout_instructions: string | null
  created_at:          string
  funded_at:           string | null
}

export interface GiftContribution {
  id:                       string
  pool_id:                  string
  contributor_name:         string | null
  contributor_email:        string | null
  amount:                   number
  stripe_payment_status:    'pending' | 'succeeded' | 'failed'
  contributed_at:           string
  anonymous:                boolean
}

export interface UseGroupGiftPoolResult {
  /** null while loading, undefined if no pool exists for this item */
  pool:             GiftPool | null | undefined
  contributions:    GiftContribution[]
  /** Total from succeeded contributions — may lead pool.collected_amount briefly */
  totalCollected:   number
  /** 0–100, clamped */
  percentFunded:    number
  isFullyFunded:    boolean
  isLoading:        boolean
  error:            string | null
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useGroupGiftPool(itemId: string): UseGroupGiftPoolResult {
  const [pool,          setPool]          = useState<GiftPool | null | undefined>(null)
  const [contributions, setContributions] = useState<GiftContribution[]>([])
  const [isLoading,     setIsLoading]     = useState(true)
  const [error,         setError]         = useState<string | null>(null)

  // ── Initial fetch ──────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    const supabase = getBrowserClient()

    // 1. Fetch the pool for this item (public read — RLS allows it)
    const { data: poolData, error: poolErr } = await supabase
      .from('gift_pools')
      .select('*')
      .eq('item_id', itemId)
      .maybeSingle()

    if (poolErr) {
      setError(poolErr.message)
      setIsLoading(false)
      return
    }

    if (!poolData) {
      // No pool exists for this item
      setPool(undefined)
      setIsLoading(false)
      return
    }

    setPool(poolData as GiftPool)

    // 2. Fetch succeeded contributions for this pool
    const { data: contribData, error: contribErr } = await supabase
      .from('gift_contributions')
      .select('id, pool_id, contributor_name, amount, stripe_payment_status, contributed_at, anonymous')
      .eq('pool_id', poolData.id)
      .eq('stripe_payment_status', 'succeeded')
      .order('contributed_at', { ascending: true })

    if (contribErr) {
      // Non-fatal — pool still renders without contribution list
      console.error('[useGroupGiftPool] contributions fetch error:', contribErr.message)
    } else {
      setContributions((contribData ?? []) as GiftContribution[])
    }

    setIsLoading(false)
  }, [itemId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── Realtime subscription ──────────────────────────────────────────────────
  // Listen for INSERT/UPDATE on gift_contributions for the current pool.
  // When a contribution succeeds, re-fetch to get the updated collected_amount
  // from the pool row (updated by the DB trigger) and fresh contribution list.

  useEffect(() => {
    if (!pool?.id) return

    const supabase = getBrowserClient()

    const channel = supabase
      .channel(`gift_pool_${pool.id}`)
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'gift_contributions',
          filter: `pool_id=eq.${pool.id}`,
        },
        () => {
          // Re-fetch both pool and contributions on any change
          fetchData()
        },
      )
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'gift_pools',
          filter: `id=eq.${pool.id}`,
        },
        (payload) => {
          // Patch pool state directly from the realtime payload
          // to avoid a round-trip for the pool row
          setPool((prev) =>
            prev ? { ...prev, ...(payload.new as Partial<GiftPool>) } : prev,
          )
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [pool?.id, fetchData])

  // ── Derived values ─────────────────────────────────────────────────────────

  // Use pool.collected_amount as the authoritative total (set by the DB trigger).
  // Fall back to summing contributions locally while the trigger is processing.
  const totalCollected = pool
    ? Math.max(
        pool.collected_amount,
        contributions.reduce((sum, c) => sum + Number(c.amount), 0),
      )
    : 0

  const targetAmount = pool ? Number(pool.target_amount) : 0

  const percentFunded = targetAmount > 0
    ? Math.min(100, Math.round((totalCollected / targetAmount) * 100))
    : 0

  const isFullyFunded =
    pool?.status === 'funded' ||
    pool?.status === 'purchased' ||
    percentFunded >= 100

  return {
    pool,
    contributions,
    totalCollected,
    percentFunded,
    isFullyFunded,
    isLoading,
    error,
  }
}
