/**
 * app/api/save-url/route.ts — GiftHint
 *
 * POST /api/save-url
 *
 * Allows authenticated users to add a wishlist item by pasting a product URL,
 * without needing the Chrome extension. Scrapes Open Graph metadata server-side
 * and inserts a new row into wishlist_items.
 *
 * Body:   { url: string, wishlist_id: string }
 * Auth:   Bearer token (Supabase user JWT) in Authorization header.
 *
 * Response 200: { success: true, item: { id, title, image_url, price, retailer } }
 * Errors:
 *   400  { success: false, error: string }
 *   401  { success: false, error: "unauthorized" }
 *   403  { success: false, error: "forbidden" }
 *   500  { success: false, error: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }        from '@/lib/supabase-server'
import { scrapeOG }                  from '@/lib/scrape-og'

export async function POST(request: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const { url, wishlist_id } = body as { url?: string; wishlist_id?: string }

  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    return NextResponse.json({ success: false, error: 'A valid product URL is required' }, { status: 400 })
  }
  if (!wishlist_id || typeof wishlist_id !== 'string') {
    return NextResponse.json({ success: false, error: 'wishlist_id is required' }, { status: 400 })
  }

  // ── Verify wishlist ownership ────────────────────────────────────────────────
  const { data: wishlist, error: wlErr } = await supabase
    .from('wishlists')
    .select('id')
    .eq('id', wishlist_id)
    .eq('user_id', user.id)
    .single()

  if (wlErr || !wishlist) {
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 })
  }

  // ── Scrape OG metadata ──────────────────────────────────────────────────────
  let ogData: Awaited<ReturnType<typeof scrapeOG>>
  try {
    ogData = await scrapeOG(url)
  } catch {
    // Scrape failed — use hostname as fallback title, continue without image/price
    const hostname = (() => {
      try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
    })()
    ogData = { title: hostname, image: '', price: '', currency: '', url }
  }

  const retailer = (() => {
    try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
  })()

  const price  = ogData.price ? parseFloat(ogData.price) : null
  const priceVal = price !== null && !isNaN(price) ? price : null
  const imageUrl = ogData.image?.startsWith('https://') ? ogData.image : null
  const title = ogData.title || retailer || 'Untitled item'

  // ── Insert item ──────────────────────────────────────────────────────────────
  const { data: item, error: insertErr } = await supabase
    .from('wishlist_items')
    .insert({
      user_id:     user.id,
      wishlist_id,
      source_url:  url,
      title,
      image_url:   imageUrl,
      price:       priceVal,
      currency:    ogData.currency || 'USD',
      retailer,
      sort_order:  null,
    })
    .select('id, title, image_url, price, retailer, source_url, currency, hint, is_claimed, sort_order, dna_tags, wishlist_id')
    .single()

  if (insertErr || !item) {
    return NextResponse.json(
      { success: false, error: insertErr?.message ?? 'Failed to save item' },
      { status: 500 },
    )
  }

  return NextResponse.json({ success: true, item })
}
