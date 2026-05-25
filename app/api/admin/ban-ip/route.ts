/**
 * app/api/admin/ban-ip/route.ts — GiftHint
 *
 * POST /api/admin/ban-ip   — add an IP to the blocklist
 * DELETE /api/admin/ban-ip — remove an IP from the blocklist
 *
 * Both operations write to two stores so they stay in sync:
 *   1. Supabase `blocked_ips` table — permanent audit record
 *   2. Upstash Redis `gifthint:blocked_ips` SET — live blocklist checked
 *      in middleware on every /api/* request (O(1) lookup)
 *
 * Auth:
 *   Requires the `gh_admin` cookie to match ADMIN_SECRET.
 *   This endpoint is also protected by the /api/* global rate limit in
 *   middleware, but the admin cookie is the primary auth gate.
 *
 * POST body:
 *   { ipAddress: string, reason?: string }
 *
 * DELETE body:
 *   { ipAddress: string }
 *
 * Responses:
 *   200  { success: true, action: 'banned' | 'unbanned', ipAddress: string }
 *   400  { error: 'invalid_body', message: string }
 *   401  { error: 'unauthorized' }
 *   409  { error: 'already_banned' }   (POST only)
 *   404  { error: 'not_found' }         (DELETE only)
 *   500  { error: 'server_error', message: string }
 */

import { NextRequest, NextResponse }  from 'next/server'
import { cookies }                    from 'next/headers'
import { createServerClient }         from '@/lib/supabase-server'
import { getRedisClient }             from '@/lib/rate-limit'

// ── Auth guard ─────────────────────────────────────────────────────────────────

function assertAdmin(): boolean {
  const secret = process.env.ADMIN_SECRET
  if (!secret) return false

  const jar    = cookies()
  const cookie = jar.get('gh_admin')
  return cookie?.value === secret
}

// ── Redis key ─────────────────────────────────────────────────────────────────

const BLOCKED_IPS_KEY = 'gifthint:blocked_ips'

// ── POST: ban an IP ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!assertAdmin()) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'invalid_body', message: 'Request body must be valid JSON.' },
      { status: 400 },
    )
  }

  const ipAddress = typeof body.ipAddress === 'string' ? body.ipAddress.trim() : null
  const reason    = typeof body.reason    === 'string' ? body.reason.trim() : null

  if (!ipAddress) {
    return NextResponse.json(
      { error: 'invalid_body', message: 'ipAddress is required.' },
      { status: 400 },
    )
  }

  // Basic IP validation — IPv4 or IPv6
  const ipv4Re = /^(\d{1,3}\.){3}\d{1,3}$/
  const ipv6Re = /^[0-9a-fA-F:]+$/
  if (!ipv4Re.test(ipAddress) && !ipv6Re.test(ipAddress)) {
    return NextResponse.json(
      { error: 'invalid_body', message: 'ipAddress must be a valid IPv4 or IPv6 address.' },
      { status: 400 },
    )
  }

  const supabase    = createServerClient()
  const adminEmail  = process.env.ADMIN_EMAIL ?? 'admin'

  // ── Write to Supabase ──────────────────────────────────────────────────────

  const { error: insertError } = await supabase
    .from('blocked_ips')
    .insert({
      ip_address:  ipAddress,
      reason:      reason ?? 'Manually banned via admin panel',
      created_by:  adminEmail,
      active:      true,
    })

  if (insertError) {
    // Unique constraint violation — already banned
    if (insertError.code === '23505') {
      return NextResponse.json({ error: 'already_banned' }, { status: 409 })
    }
    console.error('[ban-ip] Supabase insert error:', insertError.message)
    return NextResponse.json(
      { error: 'server_error', message: insertError.message },
      { status: 500 },
    )
  }

  // ── Write to Redis (live blocklist) ────────────────────────────────────────

  const redis = getRedisClient()
  if (redis) {
    try {
      await redis.sadd(BLOCKED_IPS_KEY, ipAddress)
    } catch (err) {
      // Non-fatal: the Supabase record is the source of truth.
      // The Redis set will be re-synced on next middleware cold start.
      console.error('[ban-ip] Redis SADD failed (non-fatal):', err)
    }
  }

  console.log(`[ban-ip] Banned IP ${ipAddress} — reason: ${reason ?? 'none'}`)

  return NextResponse.json(
    { success: true, action: 'banned', ipAddress },
    { status: 200 },
  )
}

// ── DELETE: unban an IP ────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  if (!assertAdmin()) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'invalid_body', message: 'Request body must be valid JSON.' },
      { status: 400 },
    )
  }

  const ipAddress = typeof body.ipAddress === 'string' ? body.ipAddress.trim() : null
  if (!ipAddress) {
    return NextResponse.json(
      { error: 'invalid_body', message: 'ipAddress is required.' },
      { status: 400 },
    )
  }

  const supabase   = createServerClient()
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin'

  // ── Update Supabase (set active=false, record unban) ──────────────────────

  const { data, error: updateError } = await supabase
    .from('blocked_ips')
    .update({
      active:      false,
      unbanned_at: new Date().toISOString(),
      unbanned_by: adminEmail,
    })
    .eq('ip_address', ipAddress)
    .eq('active', true)
    .select('id')
    .maybeSingle()

  if (updateError) {
    console.error('[ban-ip] Supabase update error:', updateError.message)
    return NextResponse.json(
      { error: 'server_error', message: updateError.message },
      { status: 500 },
    )
  }

  if (!data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  // ── Remove from Redis ──────────────────────────────────────────────────────

  const redis = getRedisClient()
  if (redis) {
    try {
      await redis.srem(BLOCKED_IPS_KEY, ipAddress)
    } catch (err) {
      console.error('[ban-ip] Redis SREM failed (non-fatal):', err)
    }
  }

  console.log(`[ban-ip] Unbanned IP ${ipAddress}`)

  return NextResponse.json(
    { success: true, action: 'unbanned', ipAddress },
    { status: 200 },
  )
}
