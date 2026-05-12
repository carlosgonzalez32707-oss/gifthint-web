/**
 * app/api/analytics/cta/route.ts — GiftHint
 *
 * POST /api/analytics/cta
 *
 * Receives bar-click events from ViralCTABar and inserts a row into
 * the `cta_events` Supabase table. Non-blocking from the caller's perspective
 * (the client fires with keepalive:true and doesn't await the response).
 *
 * Body:
 *   { event_type: string, gifter_page_username: string }
 *
 * Always returns 204 — the client never reads the response body.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }        from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const eventType = typeof body.event_type           === 'string'
      ? body.event_type.slice(0, 64)
      : 'unknown'
    const username  = typeof body.gifter_page_username === 'string'
      ? body.gifter_page_username.slice(0, 64)
      : null

    const supabase = createServerClient()

    // Fire-and-forget insert — we don't check the error; analytics must never
    // break the user journey.
    await supabase.from('cta_events').insert({
      event_type:           eventType,
      gifter_page_username: username,
      user_agent:           req.headers.get('user-agent')?.slice(0, 512) ?? null,
      referrer:             req.headers.get('referer')?.slice(0, 512)    ?? null,
    })
  } catch {
    // Swallow all errors — 204 regardless
  }

  return new NextResponse(null, { status: 204 })
}
