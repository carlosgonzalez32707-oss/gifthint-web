/**
 * app/api/username/available/route.ts — GiftHint username availability check
 *
 * GET /api/username/available?username=<value>&userId=<currentUserId>
 *
 * Returns { available: boolean, reason?: string }
 *
 * Rules:
 *   - 3–24 characters
 *   - Alphanumeric + hyphens only (no spaces, no special chars)
 *   - Cannot start or end with a hyphen
 *   - Must not be already taken by another user
 *   - Current user's own username is always "available" (no false conflict)
 *   - Reserved words blocked (www, api, admin, etc.)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }        from '@/lib/supabase-server'

// ── Reserved slugs ────────────────────────────────────────────────────────────

const RESERVED = new Set([
  'www', 'api', 'admin', 'support', 'help', 'blog', 'gifts',
  'list', 'lists', 'dashboard', 'account', 'settings', 'login',
  'logout', 'signup', 'register', 'gifthint', 'privacy', 'terms',
])

// ── Validation ────────────────────────────────────────────────────────────────

function validateUsername(raw: string): { ok: true } | { ok: false; reason: string } {
  if (raw.length < 3)  return { ok: false, reason: 'Must be at least 3 characters.' }
  if (raw.length > 24) return { ok: false, reason: 'Must be 24 characters or fewer.' }

  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/i.test(raw) && raw.length > 1) {
    return { ok: false, reason: 'Only letters, numbers, and hyphens allowed. Cannot start or end with a hyphen.' }
  }

  if (/--/.test(raw)) {
    return { ok: false, reason: 'Consecutive hyphens are not allowed.' }
  }

  if (RESERVED.has(raw.toLowerCase())) {
    return { ok: false, reason: 'This username is reserved.' }
  }

  return { ok: true }
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const username = searchParams.get('username')?.trim().toLowerCase() ?? ''
  const userId   = searchParams.get('userId')?.trim() ?? ''

  if (!username) {
    return NextResponse.json({ available: false, reason: 'Username is required.' })
  }

  const validation = validateUsername(username)
  if (!validation.ok) {
    return NextResponse.json({ available: false, reason: validation.reason })
  }

  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('public_username', username)
    .maybeSingle()

  if (error) {
    console.error('[GiftHint/username] availability check error:', error.message)
    return NextResponse.json({ available: false, reason: 'Could not check availability.' }, { status: 500 })
  }

  // No row found → available
  if (!data) {
    return NextResponse.json({ available: true })
  }

  // Row found but it's the requesting user's own username → still available
  if (data.id === userId) {
    return NextResponse.json({ available: true })
  }

  return NextResponse.json({ available: false, reason: 'This username is already taken.' })
}
