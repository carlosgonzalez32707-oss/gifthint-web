/**
 * app/api/username/update/route.ts — GiftHint username update
 *
 * PATCH /api/username/update
 *
 * Body: { userId: string, username: string }
 * Auth: Authorization: Bearer <supabase-access-token>
 *
 * Guards:
 *   1. Auth token must match userId (no cross-user writes)
 *   2. User must have custom_username_enabled = true
 *   3. Username must pass validation + uniqueness check
 *
 * On success, updates users.public_username. Existing wishlist URLs remain
 * valid because /list/[username]/[slug] is resolved by public_username at
 * query time — no slug rewriting needed.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }        from '@/lib/supabase-server'

const RESERVED = new Set([
  'www', 'api', 'admin', 'support', 'help', 'blog', 'gifts',
  'list', 'lists', 'dashboard', 'account', 'settings', 'login',
  'logout', 'signup', 'register', 'gifthint', 'privacy', 'terms',
])

function validateUsername(raw: string): string | null {
  if (raw.length < 3)  return 'Must be at least 3 characters.'
  if (raw.length > 24) return 'Must be 24 characters or fewer.'
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/i.test(raw) && raw.length > 1) {
    return 'Only letters, numbers, and hyphens allowed. Cannot start or end with a hyphen.'
  }
  if (/--/.test(raw)) return 'Consecutive hyphens are not allowed.'
  if (RESERVED.has(raw.toLowerCase())) return 'This username is reserved.'
  return null
}

export async function PATCH(req: NextRequest) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()
  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token)

  if (authError || !authUser) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // ── Body ───────────────────────────────────────────────────────────────────
  let body: { userId?: string; username?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const { userId, username: rawUsername } = body

  if (!userId || typeof userId !== 'string') {
    return NextResponse.json({ error: 'userId is required.' }, { status: 400 })
  }
  if (!rawUsername || typeof rawUsername !== 'string') {
    return NextResponse.json({ error: 'username is required.' }, { status: 400 })
  }

  // Caller must match auth token
  if (authUser.id !== userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const username = rawUsername.trim().toLowerCase()

  // ── Validate ───────────────────────────────────────────────────────────────
  const validationError = validateUsername(username)
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  // ── Feature gate ───────────────────────────────────────────────────────────
  const { data: dbUser, error: userError } = await supabase
    .from('users')
    .select('custom_username_enabled, public_username')
    .eq('id', userId)
    .single()

  if (userError || !dbUser) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 })
  }

  if (!dbUser.custom_username_enabled) {
    return NextResponse.json(
      { error: 'Custom username is not unlocked. Refer 1 friend to unlock this feature.' },
      { status: 403 },
    )
  }

  // No-op if unchanged
  if (dbUser.public_username === username) {
    return NextResponse.json({ ok: true, username })
  }

  // ── Uniqueness check ───────────────────────────────────────────────────────
  const { data: conflict } = await supabase
    .from('users')
    .select('id')
    .eq('public_username', username)
    .maybeSingle()

  if (conflict && conflict.id !== userId) {
    return NextResponse.json({ error: 'This username is already taken.' }, { status: 409 })
  }

  // ── Write ──────────────────────────────────────────────────────────────────
  const { error: updateError } = await supabase
    .from('users')
    .update({ public_username: username })
    .eq('id', userId)

  if (updateError) {
    console.error('[GiftHint/username] update error:', updateError.message)
    return NextResponse.json({ error: 'Could not update username.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, username })
}
