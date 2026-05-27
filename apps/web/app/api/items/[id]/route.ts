/**
 * app/api/items/[id]/route.ts — GiftHint
 *
 * PATCH  /api/items/:id — Update a wishlist item's editable fields.
 * DELETE /api/items/:id — Hard-delete the item.
 *
 * Auth: Bearer token (Supabase user JWT) in the Authorization header.
 * Ownership is verified — users can only modify their own items.
 *
 * PATCH body (all fields optional):
 *   {
 *     title?:       string        — 1–200 chars
 *     hint?:        string | null — personal note to gifters (max 500 chars)
 *     price?:       number | null — must be ≥ 0
 *     image_url?:   string | null — must be a valid URL or null
 *     sort_order?:  number        — integer position within the list
 *     dna_tags?:    string[]      — each must match /^#[A-Za-z0-9]{1,19}$/
 *     wishlist_id?: string | null — move item to another list
 *   }
 *
 * PATCH response 200: { item }
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

// ── Tag validation ────────────────────────────────────────────────────────────

const DNA_TAG_RE = /^#[A-Za-z0-9]{1,19}$/

function isValidTag(tag: unknown): tag is string {
  return typeof tag === 'string' && DNA_TAG_RE.test(tag)
}

// ── Ownership check ────────────────────────────────────────────────────────────

async function verifyItemOwner(
  request:  NextRequest,
  itemId:   string,
): Promise<{ userId: string } | NextResponse> {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { data: item, error: fetchError } = await supabase
    .from('wishlist_items')
    .select('id, user_id')
    .eq('id', itemId)
    .single()

  if (fetchError || !item) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  if (item.user_id !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  return { userId: user.id }
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(
  request:                  NextRequest,
  { params }: { params: { id: string } },
) {
  const itemId = params.id
  const ownerCheck = await verifyItemOwner(request, itemId)
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

  const update: Record<string, unknown> = {}

  if (body.title !== undefined) {
    const title = String(body.title).trim()
    if (!title || title.length > 200) {
      return NextResponse.json(
        { error: 'invalid_body', message: 'title must be 1–200 characters.' },
        { status: 400 },
      )
    }
    update.title = title
  }

  if ('hint' in body) {
    if (body.hint !== null) {
      const hint = String(body.hint).trim()
      if (hint.length > 500) {
        return NextResponse.json(
          { error: 'invalid_body', message: 'hint must be 500 characters or fewer.' },
          { status: 400 },
        )
      }
      update.hint = hint || null
    } else {
      update.hint = null
    }
  }

  if ('price' in body) {
    if (body.price === null) {
      update.price = null
    } else {
      const n = Number(body.price)
      if (isNaN(n) || n < 0) {
        return NextResponse.json(
          { error: 'invalid_body', message: 'price must be a non-negative number.' },
          { status: 400 },
        )
      }
      update.price = n
    }
  }

  if ('image_url' in body) {
    if (body.image_url === null || body.image_url === '') {
      update.image_url = null
    } else {
      const raw = String(body.image_url).trim()
      try {
        new URL(raw)   // throws on malformed URL
      } catch {
        return NextResponse.json(
          { error: 'invalid_body', message: 'image_url must be a valid URL.' },
          { status: 400 },
        )
      }
      update.image_url = raw
    }
  }

  if (body.sort_order !== undefined) {
    update.sort_order = Number(body.sort_order)
  }

  if (body.dna_tags !== undefined) {
    if (!Array.isArray(body.dna_tags)) {
      return NextResponse.json(
        { error: 'invalid_body', message: 'dna_tags must be an array of strings.' },
        { status: 400 },
      )
    }
    const invalid = (body.dna_tags as unknown[]).filter((t) => !isValidTag(t))
    if (invalid.length > 0) {
      return NextResponse.json(
        {
          error: 'invalid_body',
          message: `Invalid tag(s): ${invalid.slice(0, 3).join(', ')}. Tags must match #[A-Za-z0-9]{1,19}.`,
        },
        { status: 400 },
      )
    }
    if (body.dna_tags.length > 10) {
      return NextResponse.json(
        { error: 'invalid_body', message: 'Maximum 10 DNA tags per item.' },
        { status: 400 },
      )
    }
    update.dna_tags = body.dna_tags
  }

  if ('wishlist_id' in body) {
    update.wishlist_id = body.wishlist_id ?? null
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: 'invalid_body', message: 'No valid fields provided for update.' },
      { status: 400 },
    )
  }

  const supabase = createServerClient()
  const { data: item, error } = await supabase
    .from('wishlist_items')
    .update(update)
    .eq('id', itemId)
    .select()
    .single()

  if (error) {
    console.error('[PATCH /api/items/:id]', error)
    return NextResponse.json(
      { error: 'server_error', message: error.message },
      { status: 500 },
    )
  }

  return NextResponse.json({ item }, { status: 200 })
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(
  request:                  NextRequest,
  { params }: { params: { id: string } },
) {
  const itemId = params.id
  const ownerCheck = await verifyItemOwner(request, itemId)
  if (ownerCheck instanceof NextResponse) return ownerCheck

  const supabase = createServerClient()
  const { error } = await supabase
    .from('wishlist_items')
    .delete()
    .eq('id', itemId)

  if (error) {
    console.error('[DELETE /api/items/:id]', error)
    return NextResponse.json(
      { error: 'server_error', message: error.message },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}
