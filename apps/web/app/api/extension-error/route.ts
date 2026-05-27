/**
 * app/api/extension-error/route.ts — GiftHint
 *
 * POST /api/extension-error
 *
 * Receives error reports from the Chrome/Firefox extension's background.js
 * service worker and:
 *   1. Validates the payload (rejects obviously malformed reports)
 *   2. Stores a row in the `extension_errors` Supabase table for trend analysis
 *   3. Forwards the error to Sentry so it appears alongside server errors
 *
 * Auth:
 *   No auth required — extension errors arrive from unauthenticated service
 *   workers. Rate limited to 20 reports / IP / hour to prevent abuse.
 *
 * Sentry forwarding:
 *   Uses captureException() on the server so extension errors share the same
 *   Sentry project as server errors. Tagged with source:'extension' and the
 *   extension version so you can filter and graph extension regressions.
 *
 * Body:
 *   {
 *     message:   string          — error.message (max 500 chars)
 *     stack?:    string | null   — error.stack   (max 2000 chars)
 *     version:   string          — extension semver (e.g. "1.1.0")
 *     retailer?: string | null   — active retailer domain (e.g. "amazon.com")
 *     source?:   string          — 'uncaught_error' | 'unhandled_rejection' | 'content_script'
 *   }
 *
 * Responses:
 *   202  { ok: true }             — report accepted (async processing)
 *   400  { error: 'invalid_body' }
 *   429  { error: 'rate_limited' }
 *   500  { error: 'server_error' }
 *
 * Returns 202 (Accepted) not 200 so callers know the write is async.
 */

import { NextRequest, NextResponse } from 'next/server'
import * as Sentry                   from '@sentry/nextjs'
import { createServerClient }        from '@/lib/supabase-server'
import { rateLimit, getClientIp }    from '@/lib/rate-limit'

// ── Valid source identifiers ──────────────────────────────────────────────────
const VALID_SOURCES = new Set(['uncaught_error', 'unhandled_rejection', 'content_script'])

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Rate limit: 20 extension error reports / IP / hour ─────────────────────
  // Extension bugs can fire repeatedly (e.g. an error in a render loop).
  // The extension itself deduplicates per session, but the server adds a second
  // layer in case a user re-installs or the service worker restarts frequently.
  const ip = getClientIp(req)
  const rl = await rateLimit(`ext-error:${ip}`, 20, 3_600)
  if (!rl.success) {
    return NextResponse.json(
      { error: 'rate_limited' },
      {
        status:  429,
        headers: { 'Retry-After': String(Math.max(1, Math.ceil((rl.reset - Date.now()) / 1000))) },
      },
    )
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  // ── Validate ───────────────────────────────────────────────────────────────
  const message  = typeof body.message  === 'string' ? body.message.trim().slice(0, 500)  : null
  const version  = typeof body.version  === 'string' ? body.version.trim().slice(0, 20)   : null
  const stack    = typeof body.stack    === 'string' ? body.stack.trim().slice(0, 2000)   : null
  const retailer = typeof body.retailer === 'string' ? body.retailer.trim().slice(0, 100) : null
  const rawSource = typeof body.source  === 'string' ? body.source : 'uncaught_error'
  const source   = VALID_SOURCES.has(rawSource) ? rawSource : 'uncaught_error'

  if (!message || !version) {
    return NextResponse.json(
      { error: 'invalid_body', message: 'message and version are required.' },
      { status: 400 },
    )
  }

  // ── Forward to Sentry ──────────────────────────────────────────────────────
  // Reconstruct a proper Error so Sentry gets a stack trace, not just a string.
  // captureException is synchronous (batched internally by the Sentry SDK).
  const sentryError = new Error(message)
  if (stack) sentryError.stack = stack

  Sentry.captureException(sentryError, {
    tags: {
      source:           'extension',
      extensionVersion: version,
      extensionSource:  source,
      ...(retailer ? { retailer } : {}),
    },
    extra: {
      retailer,
      source,
      version,
      reportingIp: ip,
    },
  })

  // ── Persist to Supabase (async — don't block the 202 response) ───────────
  // Fire-and-forget: DB write failures are logged but never exposed to caller.
  ;(async () => {
    try {
      const supabase = createServerClient()
      const { error: insertError } = await supabase
        .from('extension_errors')
        .insert({
          message,
          stack,
          version,
          retailer,
          source,
          ip_address: ip,
        })

      if (insertError) {
        console.error('[extension-error] Supabase insert failed:', insertError.message)
      }
    } catch (err) {
      console.error('[extension-error] unexpected DB error:', err)
    }
  })()

  // Return 202 Accepted immediately — the DB write continues in the background
  return NextResponse.json({ ok: true }, { status: 202 })
}
