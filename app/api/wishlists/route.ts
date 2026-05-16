/**
 * app/api/wishlists/route.ts — GiftHint
 *
 * POST /api/wishlists
 *
 * Creates a new wishlist for the authenticated user.
 * Called by the wisher dashboard and (future) onboarding wizard.
 *
 * Request body:
 *   {
 *     userId:        string        — wisher's Supabase user ID (validated server-side)
 *     title:         string        — 1–100 chars
 *     occasion:      OccasionKey   — one of the OCCASION_TYPES keys
 *     occasionDate?: string|null   — "YYYY-MM-DD" or omitted
 *     makeDefault?:  boolean       — promote this list to the user's default
 *   }
 *
 * Response 201:
 *   { wishlist: DbWishlist }
 *
 * Errors:
 *   400  { error: "invalid_body",   message: string }
 *   401  { error: "unauthorized" }
 *   500  { error: "server_error",   message: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }        from '@/lib/supabase-server'
import {
  createWishlist,
  OCCASION_TYPES,
  type OccasionKey,
  type CreateWishlistParams,
} from '@/lib/wishlists'

// ── Valid occasion keys for quick lookup ──────────────────────────────────────

const VALID_OCCASIONS = new Set<string>(OCCASION_TYPES.map((o) => o.key))

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'invalid_body', message: 'Request body must be valid JSON.' },
      { status: 400 },
    )
  }

  const { userId, title, occasion, occasionDate, makeDefault } = body

  // ── Validate ───────────────────────────────────────────────────────────────

  if (typeof userId !== 'string' || !userId.trim()) {
    return NextResponse.json(
      { error: 'invalid_body', message: 'userId is required.' },
      { status: 400 },
    )
  }

  if (typeof title !== 'string' || title.trim().length < 1 || title.trim().length > 100) {
    return NextResponse.json(
      { error: 'invalid_body', message: 'title must be 1–100 characters.' },
      { status: 400 },
    )
  }

  if (typeof occasion !== 'string' || !VALID_OCCASIONS.has(occasion)) {
    return NextResponse.json(
      {
        error:   'invalid_body',
        message: `occasion must be one of: ${Array.from(VALID_OCCASIONS).join(', ')}.`,
      },
      { status: 400 },
    )
  }

  // occasionDate: optional ISO date string
  if (occasionDate !== undefined && occasionDate !== null) {
    if (typeof occasionDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(occasionDate)) {
      return NextResponse.json(
        { error: 'invalid_body', message: 'occasionDate must be "YYYY-MM-DD" or null.' },
        { status: 400 },
      )
    }
  }

  // ── Verify userId exists (lightweight auth guard) ──────────────────────────
  // In production, replace this with proper session verification (cookies / JWT).
  // This route is not yet guarded by a real auth session — see the note in the
  // wisher dashboard implementation for the full auth story.

  const supabase = createServerClient()
  const { data: userRow, error: userError } = await supabase
    .from('users')
    .select('id')
    .eq('id', userId.trim())
    .maybeSingle()

  if (userError) {
    console.error('[wishlists] user lookup error:', userError.message)
    return NextResponse.json(
      { error: 'server_error', message: userError.message },
      { status: 500 },
    )
  }

  if (!userRow) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  const params: CreateWishlistParams = {
    userId:       userId.trim(),
    title:        title.trim(),
    occasion:     occasion as OccasionKey,
    occasionDate: (occasionDate as string | null | undefined) ?? null,
    makeDefault:  makeDefault === true,
  }

  const wishlist = await createWishlist(params)

  if (!wishlist) {
    return NextResponse.json(
      { error: 'server_error', message: 'Failed to create wishlist.' },
      { status: 500 },
    )
  }

  return NextResponse.json({ wishlist }, { status: 201 })
}
