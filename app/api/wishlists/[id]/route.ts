/**
 * app/api/wishlists/[id]/route.ts — GiftHint
 *
 * PATCH /api/wishlists/:id  — Update a wishlist's mutable fields.
 * DELETE /api/wishlists/:id — Soft-delete: sets is_public = false.
 *
 * Auth: Bearer token (Supabase user JWT) in the Authorization header.
 * Ownership is verified — users can only modify their own wishlists.
 *
 * PATCH body (all fields optional):
 *   {
 *     title?:         string        — 1–100 chars
 *     occasion?:      OccasionKey
 *     occasionDate?:  string | null — "YYYY-MM-DD" or null
 *   }
 *
 * PATCH response 200: { wishlist: DbWishlist }
 * DELETE response 200: { ok: true }
 *
 * Errors:
 *   400  { error: "invalid_body",    message: string }
 *   401  { error: "unauthorized" }
 *   403  { error: "forbidden" }
 *   404  { error: "not_found" }
 *   500  { error: "server_error",    message: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }        from '@/lib/supabase-server'
import { OCCASION_TYPES }            from '@/lib/wishlists'

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_OCCASIONS = new Set<string>(OCCASION_TYPES.map((o) => o.key))

async function verifyOwner(
  request: NextRequest,
  wishlistId: string,
): Promise<{ userId: string } | NextResponse> {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()

  // Verify JWT
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Check the wishlist exists and belongs to this user
  const { data: wishlist, error: fetchError } = await supabase
    .from('wishlists')
    .select('id, user_id')
    .eq('id', wishlistId)
    .single()

  if (fetchError || !wishlist) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  if (wishlist.user_id !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  return { userId: user.id }
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(
  request:                  NextRequest,
  { params }: { params: { id: string } },
) {
  const wishlistId = params.id
  const ownerCheck = await verifyOwner(request, wishlistId)
  if (ownerCheck instanceof NextResponse) return ownerCheck

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'invalid_body', message: 'Request body must be valid JSON.' },
      { status: 400 },
    )
  }

  // Build validated update payload
  const update: Record<string, unknown> = {}

  if (body.title !== undefined) {
    const title = String(body.title).trim()
    if (!title || title.length > 100) {
      return NextResponse.json(
        { error: 'invalid_body', message: 'title must be 1–100 characters.' },
        { status: 400 },
      )
    }
    update.title = title
  }

  if (body.occasion !== undefined) {
    if (!VALID_OCCASIONS.has(String(body.occasion))) {
      return NextResponse.json(
        { error: 'invalid_body', message: 'Invalid occasion value.' },
        { status: 400 },
      )
    }
    update.occasion = body.occasion
  }

  if ('occasionDate' in body) {
    // Allow explicit null to clear the date
    update.occasion_date = body.occasionDate ?? null
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: 'invalid_body', message: 'No valid fields provided for update.' },
      { status: 400 },
    )
  }

  const supabase = createServerClient()
  const { data: wishlist, error } = await supabase
    .from('wishlists')
    .update(update)
    .eq('id', wishlistId)
    .select()
    .single()

  if (error) {
    console.error('[PATCH /api/wishlists/:id]', error)
    return NextResponse.json(
      { error: 'server_error', message: error.message },
      { status: 500 },
    )
  }

  return NextResponse.json({ wishlist }, { status: 200 })
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(
  request:                  NextRequest,
  { params }: { params: { id: string } },
) {
  const wishlistId = params.id
  const ownerCheck = await verifyOwner(request, wishlistId)
  if (ownerCheck instanceof NextResponse) return ownerCheck

  // Soft-delete: hide the list without destroying the items
  const supabase = createServerClient()
  const { error } = await supabase
    .from('wishlists')
    .update({ is_public: false })
    .eq('id', wishlistId)

  if (error) {
    console.error('[DELETE /api/wishlists/:id]', error)
    return NextResponse.json(
      { error: 'server_error', message: error.message },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}
