/**
 * app/api/dna-tags/popular/route.ts — GiftHint
 *
 * GET /api/dna-tags/popular
 *
 * Returns the most-used DNA tags across all wishlists, for the "popular tags"
 * badge in the dashboard item editor and the extension hint sheet.
 *
 * Query params:
 *   limit  — number of tags to return (default 20, max 50)
 *
 * Response 200:
 *   { tags: Array<{ tag_text: string; usage_count: number; last_used: string }> }
 *
 * Public — no auth required. Usage counts contain no PII.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }        from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const rawLimit = req.nextUrl.searchParams.get('limit')
  const limit    = Math.min(Math.max(1, parseInt(rawLimit ?? '20', 10) || 20), 50)

  const supabase = createServerClient()

  const { data, error } = await supabase
    .rpc('get_popular_tags', { p_limit: limit })

  if (error) {
    console.error('[dna-tags/popular] rpc error:', error.message)
    return NextResponse.json(
      { error: 'server_error', message: error.message },
      { status: 500 },
    )
  }

  return NextResponse.json(
    { tags: data ?? [] },
    {
      status: 200,
      headers: {
        // Cache for 5 minutes — counts don't need to be real-time
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
      },
    },
  )
}
