/**
 * app/api/scrape-og/route.ts — GiftHint
 *
 * Standalone OG-scraping API endpoint.
 * Useful for the iOS Shortcuts "Get Contents of URL" action and for any
 * future integrations that need server-side product data extraction.
 *
 * GET  /api/scrape-og?url=<encoded-url>
 * POST /api/scrape-og   body: { "url": "..." }
 *
 * Response (success)
 * ──────────────────
 *   { success: true, data: { title, image, price, currency, url } }
 *
 * Response (error)
 * ────────────────
 *   { success: false, error: "<message>" }
 *   HTTP 400  — missing or invalid url parameter
 *   HTTP 502  — upstream fetch failed (timeout, 4xx, 5xx)
 *
 * Note: This endpoint is intentionally NOT at app/save/route.ts.
 * Next.js App Router forbids page.tsx and route.ts in the same directory
 * segment — placing the API here avoids that conflict.
 */

import { NextRequest, NextResponse } from 'next/server'
import { scrapeOG }                  from '@/lib/scrape-og'

// Force Node.js runtime — the scraper uses fetch streaming and AbortController
export const runtime = 'nodejs'

// ── Shared handler ─────────────────────────────────────────────────────────────

function badRequest(message: string) {
  return NextResponse.json({ success: false, error: message }, { status: 400 })
}

async function handle(rawUrl: string | null) {
  if (!rawUrl) {
    return badRequest('url parameter is required')
  }

  // Validate URL
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return badRequest('Invalid URL')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return badRequest('Only http and https URLs are supported')
  }

  // Scrape
  try {
    const data = await scrapeOG(rawUrl)
    return NextResponse.json({ success: true, data })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Scrape failed'
    return NextResponse.json({ success: false, error: message }, { status: 502 })
  }
}

// ── Route handlers ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  return handle(url)
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return badRequest('Invalid JSON body')
  }

  const url = (
    typeof body === 'object' &&
    body !== null &&
    'url' in body &&
    typeof (body as Record<string, unknown>)['url'] === 'string'
  )
    ? String((body as Record<string, unknown>)['url'])
    : null

  return handle(url)
}
