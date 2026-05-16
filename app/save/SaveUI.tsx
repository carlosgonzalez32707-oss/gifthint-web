'use client'

/**
 * app/save/SaveUI.tsx — GiftHint
 *
 * Client Component — the interactive layer of the /save page.
 * Receives pre-populated product data as props from the Server Component
 * (app/save/page.tsx), so it never needs to call useSearchParams().
 *
 * PROPS
 * ─────
 *   url          string   — canonical product URL (required for saving)
 *   title        string   — product title (may be empty if scrape failed)
 *   image        string   — product image URL
 *   price        string   — numeric price as string (e.g. "49.99")
 *   currency     string   — ISO 4217 code (e.g. "USD")
 *   scrapeFailed boolean  — true when server-side OG scrape returned nothing;
 *                           shows a manual entry form before the save form
 *
 * AUTH FLOW
 * ─────────
 *   1. On mount: supabase.auth.getSession() — may already be signed in.
 *   2. If no session: show Google sign-in button.
 *   3. signInWithOAuth() redirects to Google then back here; Supabase JS
 *      fires onAuthStateChange(SIGNED_IN) and we show the form.
 *   4. Once authenticated: fetch wishlists, show the save form.
 *
 * SUPABASE SETUP
 * ──────────────
 *   In the Supabase dashboard → Auth → URL Configuration → Redirect URLs,
 *   add:  https://gifthint.io/save*
 */

import { useState, useEffect, useCallback } from 'react'
import type { Session }                      from '@supabase/supabase-js'
import { getBrowserClient }                  from '@/lib/supabase-browser'
import { searchTags }                        from '@/lib/dna-tags'

// ── Types ──────────────────────────────────────────────────────────────────────

type PageState = 'loading' | 'sign_in' | 'manual_entry' | 'form' | 'saving' | 'success' | 'error'

interface Wishlist {
  id:         string
  title:      string
  occasion:   string
  is_default: boolean
}

// ── Occasion labels (inlined — cannot import from extension/wishlists.js) ──────

const OCCASION_LABELS: Record<string, { label: string; emoji: string }> = {
  birthday:    { label: 'Birthday',    emoji: '🎂' },
  christmas:   { label: 'Christmas',   emoji: '🎄' },
  wedding:     { label: 'Wedding',     emoji: '💍' },
  baby_shower: { label: 'Baby Shower', emoji: '🍼' },
  graduation:  { label: 'Graduation',  emoji: '🎓' },
  housewarming:{ label: 'Housewarming',emoji: '🏠' },
  anniversary: { label: 'Anniversary', emoji: '🥂' },
  other:       { label: 'My List',     emoji: '🎁' },
}

function occasionMeta(key: string): { label: string; emoji: string } {
  return OCCASION_LABELS[key] ?? { label: 'My List', emoji: '🎁' }
}

// ── Shared styles ──────────────────────────────────────────────────────────────

const PURPLE = '#8B83F0'

const css = {
  page: {
    minHeight: '100vh',
    background: '#0C0C0E',
    color: '#F0EEE8',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
    WebkitFontSmoothing: 'antialiased' as const,
    display: 'flex',
    flexDirection: 'column' as const,
  },
  inner: {
    maxWidth: '400px',
    width: '100%',
    margin: '0 auto',
    padding: '24px 20px 32px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
    flex: 1,
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid rgba(240,238,232,0.12)',
    background: '#1C1C22',
    color: '#F0EEE8',
    fontFamily: 'inherit',
    fontSize: '13px',
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  btn: (variant: 'primary' | 'secondary' | 'ghost' = 'primary') => ({
    width: '100%',
    padding: '12px',
    borderRadius: '10px',
    border: variant === 'secondary'
      ? '1px solid rgba(139,131,240,0.4)'
      : variant === 'ghost'
        ? '1px solid rgba(240,238,232,0.12)'
        : 'none',
    background: variant === 'primary'
      ? PURPLE
      : variant === 'secondary'
        ? 'rgba(139,131,240,0.12)'
        : 'transparent',
    color: variant === 'primary' ? '#fff' : variant === 'secondary' ? PURPLE : '#9A9690',
    fontFamily: 'inherit',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'opacity 120ms ease',
  }),
  label: {
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    color: '#7A7870',
    marginBottom: '6px',
    display: 'block',
  },
} as const

// ── Sub-components ─────────────────────────────────────────────────────────────

function GiftHintLogo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
      <span style={{ fontSize: '18px' }}>🎁</span>
      <span style={{ fontWeight: 700, fontSize: '15px' }}>GiftHint</span>
    </div>
  )
}

function ProductPreview({
  title, price, currency, image, url,
}: {
  title: string; price: string; currency: string; image: string; url: string
}) {
  return (
    <div style={{
      display: 'flex', gap: '12px', alignItems: 'center',
      padding: '12px', borderRadius: '10px',
      background: '#1C1C22', border: '1px solid rgba(240,238,232,0.08)',
    }}>
      {image && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={image}
          alt=""
          width={52}
          height={52}
          style={{ borderRadius: '6px', objectFit: 'cover', flexShrink: 0, background: '#2C2C32' }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: '13px', fontWeight: 600, margin: '0 0 4px',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: '#F0EEE8',
        }}>
          {title || (() => {
            try { return new URL(url || 'https://gifthint.io').hostname }
            catch { return url }
          })()}
        </p>
        {price && (
          <p style={{ fontSize: '13px', color: '#4EC99A', fontWeight: 700, margin: 0 }}>
            {currency && currency !== 'USD' ? currency + ' ' : ''}
            {currency === 'USD' || !currency ? '$' : ''}{price}
          </p>
        )}
        <p style={{
          fontSize: '11px', color: '#7A7870', margin: '2px 0 0',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {url ? (() => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url } })() : ''}
        </p>
      </div>
    </div>
  )
}

function TagChip({ tag, onRemove }: { tag: string; onRemove: () => void }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '3px 8px 3px 10px', borderRadius: '999px', fontSize: '12px',
      fontWeight: 600, background: 'rgba(139,131,240,0.16)',
      border: '1px solid rgba(139,131,240,0.3)', color: '#A09AF2',
    }}>
      {tag}
      <button
        onClick={onRemove}
        style={{
          background: 'none', border: 'none', padding: '0 0 0 2px',
          cursor: 'pointer', color: '#7A7870', fontSize: '13px',
          lineHeight: 1, fontFamily: 'inherit',
        }}
        aria-label={`Remove ${tag}`}
      >
        ×
      </button>
    </span>
  )
}

// ── Manual entry form (shown when server-side scrape failed) ───────────────────

function ManualEntryForm({
  initialUrl,
  onConfirm,
}: {
  initialUrl:  string
  onConfirm:   (data: { title: string; price: string; image: string }) => void
}) {
  const [title, setTitle] = useState('')
  const [price, setPrice] = useState('')
  const [image, setImage] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit() {
    if (!title.trim()) {
      setError('Please enter a product name.')
      return
    }
    onConfirm({ title: title.trim(), price: price.trim(), image: image.trim() })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{
        padding: '12px 14px', borderRadius: '10px',
        background: 'rgba(160,154,242,0.08)',
        border: '1px solid rgba(160,154,242,0.2)',
      }}>
        <p style={{ fontSize: '13px', color: '#A09AF2', margin: 0, lineHeight: 1.5 }}>
          We couldn't automatically read this page's product details.
          Fill them in below to save the item.
        </p>
      </div>

      {/* Product name */}
      <div>
        <label style={css.label} htmlFor="manual-title">
          Product name <span style={{ color: '#E87070' }}>*</span>
        </label>
        <input
          id="manual-title"
          type="text"
          value={title}
          onChange={e => { setTitle(e.target.value); setError(null) }}
          placeholder="e.g. Sony WH-1000XM5 Headphones"
          maxLength={300}
          style={css.input}
          autoFocus
        />
      </div>

      {/* Price */}
      <div>
        <label style={css.label} htmlFor="manual-price">
          Price{' '}
          <span style={{ textTransform: 'none', color: '#4A4840', fontWeight: 400 }}>
            (optional)
          </span>
        </label>
        <input
          id="manual-price"
          type="text"
          value={price}
          onChange={e => setPrice(e.target.value)}
          placeholder="e.g. 279.99"
          maxLength={20}
          style={css.input}
          inputMode="decimal"
        />
      </div>

      {/* Image URL */}
      <div>
        <label style={css.label} htmlFor="manual-image">
          Image URL{' '}
          <span style={{ textTransform: 'none', color: '#4A4840', fontWeight: 400 }}>
            (optional)
          </span>
        </label>
        <input
          id="manual-image"
          type="url"
          value={image}
          onChange={e => setImage(e.target.value)}
          placeholder="https://…"
          maxLength={500}
          style={css.input}
        />
      </div>

      {/* Source URL (read-only) */}
      <p style={{ fontSize: '11px', color: '#4A4840', margin: 0, lineHeight: 1.5 }}>
        Saving from:{' '}
        <span style={{ color: '#7A7870' }}>
          {(() => { try { return new URL(initialUrl).hostname.replace(/^www\./, '') } catch { return initialUrl } })()}
        </span>
      </p>

      {error && (
        <p style={{
          fontSize: '13px', color: '#E87070', padding: '10px 12px',
          background: 'rgba(232,112,112,0.08)', borderRadius: '8px',
          border: '1px solid rgba(232,112,112,0.2)', margin: 0,
        }}>
          {error}
        </p>
      )}

      <button onClick={handleSubmit} style={css.btn('primary')}>
        Continue →
      </button>
    </div>
  )
}

// ── Save form ──────────────────────────────────────────────────────────────────

function SaveForm({
  session,
  productUrl,
  productTitle,
  productPrice,
  productCurrency,
  productImage,
  onSuccess,
}: {
  session:         Session
  productUrl:      string
  productTitle:    string
  productPrice:    string
  productCurrency: string
  productImage:    string
  onSuccess:       (wishlistId: string) => void
}) {
  const supabase = getBrowserClient()

  const [wishlists,      setWishlists]      = useState<Wishlist[]>([])
  const [selectedListId, setSelectedListId] = useState<string>('')
  const [hint,           setHint]           = useState('')
  const [tagInput,       setTagInput]       = useState('')
  const [tags,           setTags]           = useState<string[]>([])
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([])
  const [saving,         setSaving]         = useState(false)
  const [error,          setError]          = useState<string | null>(null)

  // Fetch wishlists on mount
  useEffect(() => {
    supabase
      .from('wishlists')
      .select('id,title,occasion,is_default')
      .eq('user_id', session.user.id)
      .eq('is_public', true)
      .order('is_default', { ascending: false })
      .order('created_at',  { ascending: false })
      .then(({ data }) => {
        const lists = (data ?? []) as Wishlist[]
        setWishlists(lists)
        const def = lists.find(l => l.is_default) ?? lists[0]
        if (def) setSelectedListId(def.id)
      })
  }, [session.user.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Tag autocomplete
  useEffect(() => {
    if (!tagInput.trim()) {
      setTagSuggestions(searchTags(productTitle).slice(0, 5))
      return
    }
    const q = tagInput.startsWith('#') ? tagInput : '#' + tagInput
    setTagSuggestions(searchTags(q).filter(t => !tags.includes(t)).slice(0, 5))
  }, [tagInput, productTitle, tags])

  function addTag(tag: string) {
    if (!tags.includes(tag) && tags.length < 6) {
      setTags(prev => [...prev, tag])
    }
    setTagInput('')
  }

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
      e.preventDefault()
      const raw = tagInput.trim().replace(/,$/, '')
      const tag = raw.startsWith('#') ? raw : '#' + raw
      if (/^#[A-Za-z0-9]{1,19}$/.test(tag)) addTag(tag)
    }
    if (e.key === 'Backspace' && !tagInput && tags.length) {
      setTags(prev => prev.slice(0, -1))
    }
  }

  const handleSave = useCallback(async () => {
    if (!selectedListId) { setError('Please choose a list.'); return }
    setSaving(true)
    setError(null)

    const { error: insertError } = await supabase
      .from('wishlist_items')
      .insert({
        wishlist_id:  selectedListId,
        user_id:      session.user.id,
        title:        productTitle || 'Untitled item',
        source_url:   productUrl,
        original_url: productUrl,
        // affiliate_url intentionally omitted — applied by lib/affiliate.ts at render time
        image_url:    productImage  || null,
        price:        productPrice  ? parseFloat(productPrice)  : null,
        currency:     productCurrency || 'USD',
        retailer:     productUrl ? (() => { try { return new URL(productUrl).hostname.replace(/^www\./, '') } catch { return null } })() : null,
        hint:         hint.trim()   || null,
        dna_tags:     tags,
        is_claimed:   false,
        claimed_anonymous: false,
        sort_order:   0,
      })
      .select('id')
      .single()

    if (insertError) {
      setError('Could not save the item. Please try again.')
      setSaving(false)
      return
    }

    onSuccess(selectedListId)
  }, [selectedListId, session.user.id, productTitle, productUrl, productImage, productPrice, productCurrency, hint, tags, supabase, onSuccess])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

      {/* Which list? */}
      <div>
        <label style={css.label} htmlFor="list-select">Save to which list?</label>
        <select
          id="list-select"
          value={selectedListId}
          onChange={e => setSelectedListId(e.target.value)}
          style={{ ...css.input, appearance: 'none' as const }}
        >
          {wishlists.length === 0 && (
            <option value="">Loading your lists…</option>
          )}
          {wishlists.map(w => {
            const { emoji } = occasionMeta(w.occasion)
            return (
              <option key={w.id} value={w.id}>
                {emoji} {w.title}{w.is_default ? ' (default)' : ''}
              </option>
            )
          })}
        </select>
      </div>

      {/* Hint */}
      <div>
        <label style={css.label} htmlFor="hint-input">
          Hint for your gifter{' '}
          <span style={{ textTransform: 'none', color: '#4A4840', fontWeight: 400 }}>(optional)</span>
        </label>
        <input
          id="hint-input"
          type="text"
          value={hint}
          onChange={e => setHint(e.target.value)}
          placeholder="e.g. size M, blue colourway, the linen version"
          maxLength={200}
          style={css.input}
        />
      </div>

      {/* DNA tags */}
      <div>
        <label style={css.label} htmlFor="tag-input">
          DNA tags{' '}
          <span style={{ textTransform: 'none', color: '#4A4840', fontWeight: 400 }}>(optional)</span>
        </label>

        {tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
            {tags.map(t => (
              <TagChip key={t} tag={t} onRemove={() => setTags(prev => prev.filter(x => x !== t))} />
            ))}
          </div>
        )}

        <input
          id="tag-input"
          type="text"
          value={tagInput}
          onChange={e => setTagInput(e.target.value)}
          onKeyDown={handleTagKeyDown}
          placeholder={tags.length < 6 ? '#NoSynthetics, #WiredOnly…' : 'Max 6 tags'}
          disabled={tags.length >= 6}
          style={css.input}
        />

        {tagSuggestions.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '8px' }}>
            <span style={{ fontSize: '11px', color: '#4A4840', alignSelf: 'center', marginRight: '2px' }}>
              Suggested:
            </span>
            {tagSuggestions.filter(t => !tags.includes(t)).map(t => (
              <button
                key={t}
                onClick={() => addTag(t)}
                style={{
                  padding: '2px 8px', borderRadius: '999px', fontSize: '11px',
                  fontWeight: 600, border: '1px solid rgba(240,238,232,0.12)',
                  background: 'transparent', color: '#7A7870', cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p style={{
          fontSize: '13px', color: '#E87070', padding: '10px 12px',
          background: 'rgba(232,112,112,0.08)', borderRadius: '8px',
          border: '1px solid rgba(232,112,112,0.2)', margin: 0,
        }}>
          {error}
        </p>
      )}

      <button
        onClick={handleSave}
        disabled={saving || !selectedListId}
        style={{
          ...css.btn('primary'),
          opacity: (saving || !selectedListId) ? 0.5 : 1,
          marginTop: '4px',
        }}
      >
        {saving ? 'Saving…' : '🎁 Save to GiftHint'}
      </button>
    </div>
  )
}

// ── Success state ──────────────────────────────────────────────────────────────

function SuccessView({
  wishlistId,
  wishlists,
}: {
  wishlistId: string
  wishlists:  Wishlist[]
}) {
  const supabase             = getBrowserClient()
  const [username, setUsername] = useState<string | null>(null)
  const [slug,     setSlug]     = useState<string | null>(null)
  const [copied,   setCopied]   = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return
      const [userRes, listRes] = await Promise.all([
        supabase.from('users').select('public_username').eq('id', session.user.id).single(),
        supabase.from('wishlists').select('slug').eq('id', wishlistId).single(),
      ])
      setUsername(userRes.data?.public_username ?? null)
      setSlug(listRes.data?.slug ?? null)
    })
  }, [wishlistId]) // eslint-disable-line react-hooks/exhaustive-deps

  const shareUrl = username && slug
    ? `https://gifthint.io/list/${username}/${slug}`
    : null

  function copyLink() {
    if (!shareUrl) return
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const savedList = wishlists.find(w => w.id === wishlistId)
  const { emoji } = savedList ? occasionMeta(savedList.occasion) : { emoji: '🎁' }

  return (
    <div style={{ textAlign: 'center', padding: '16px 0' }}>
      <div style={{
        width: '60px', height: '60px', borderRadius: '50%',
        background: 'rgba(78,201,154,0.15)',
        border: '1px solid rgba(78,201,154,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '28px', margin: '0 auto 16px', color: '#4EC99A',
      }}>
        ✓
      </div>
      <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 6px' }}>Saved!</h2>
      <p style={{ fontSize: '13px', color: '#7A7870', margin: '0 0 24px' }}>
        Added to{' '}{emoji}{' '}
        <strong style={{ color: '#C8C4BC' }}>{savedList?.title ?? 'your list'}</strong>
      </p>

      {shareUrl && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button onClick={copyLink} style={css.btn('secondary')}>
            {copied ? '✓ Link copied!' : '🔗 Copy share link'}
          </button>
          <a
            href={shareUrl}
            target="_blank"
            rel="noreferrer"
            style={{ ...css.btn('ghost'), display: 'block', textDecoration: 'none', textAlign: 'center' }}
          >
            Open my list ↗
          </a>
        </div>
      )}

      <button
        onClick={() => window.close()}
        style={{
          background: 'none', border: 'none', color: '#4A4840',
          fontFamily: 'inherit', fontSize: '12px', cursor: 'pointer',
          marginTop: '16px',
        }}
      >
        Close window
      </button>
    </div>
  )
}

// ── Sign-in view ───────────────────────────────────────────────────────────────

function SignInView() {
  const supabase        = getBrowserClient()
  const [busy, setBusy] = useState(false)

  async function signIn() {
    setBusy(true)
    // redirectTo preserves /save?... query params through the OAuth round-trip.
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href },
    })
    // Browser will redirect — no need to setBusy(false)
  }

  return (
    <div style={{ textAlign: 'center', padding: '8px 0' }}>
      <p style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 8px' }}>
        Sign in to save this item
      </p>
      <p style={{ fontSize: '13px', color: '#7A7870', margin: '0 0 24px', lineHeight: 1.6 }}>
        Your wishlist stays in sync across all your devices.
      </p>
      <button
        onClick={signIn}
        disabled={busy}
        style={{ ...css.btn('primary'), opacity: busy ? 0.6 : 1 }}
      >
        {busy ? 'Signing in…' : 'Sign in with Google'}
      </button>
    </div>
  )
}

// ── Root client component ──────────────────────────────────────────────────────

export interface SaveUIProps {
  url:          string
  title:        string
  image:        string
  price:        string
  currency:     string
  scrapeFailed: boolean
}

export function SaveUI({
  url,
  title:    initialTitle,
  image:    initialImage,
  price:    initialPrice,
  currency: initialCurrency,
  scrapeFailed,
}: SaveUIProps) {
  const supabase = getBrowserClient()

  const [pageState,    setPageState]    = useState<PageState>('loading')
  const [session,      setSession]      = useState<Session | null>(null)
  const [wishlists,    setWishlists]    = useState<Wishlist[]>([])
  const [savedListId,  setSavedListId]  = useState<string>('')

  // Resolved product data — may be updated via manual entry form
  const [productTitle,    setProductTitle]    = useState(initialTitle)
  const [productImage,    setProductImage]    = useState(initialImage)
  const [productPrice,    setProductPrice]    = useState(initialPrice)
  const [productCurrency, setProductCurrency] = useState(initialCurrency)

  // Auth state machine
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      if (s) {
        setPageState(scrapeFailed ? 'manual_entry' : 'form')
      } else {
        setPageState('sign_in')
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (s) {
        setPageState(scrapeFailed && !productTitle ? 'manual_entry' : 'form')
      }
    })

    return () => subscription.unsubscribe()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep wishlists in sync for SuccessView
  useEffect(() => {
    if (!session) return
    supabase
      .from('wishlists')
      .select('id,title,occasion,is_default')
      .eq('user_id', session.user.id)
      .eq('is_public', true)
      .then(({ data }) => setWishlists((data ?? []) as Wishlist[]))
  }, [session]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleManualEntry(data: { title: string; price: string; image: string }) {
    setProductTitle(data.title)
    setProductPrice(data.price)
    setProductImage(data.image)
    setPageState('form')
  }

  function handleSuccess(wishlistId: string) {
    setSavedListId(wishlistId)
    setPageState('success')
  }

  return (
    <div style={css.page}>
      <div style={css.inner}>

        <GiftHintLogo />

        {/* Product preview — shown whenever we have a URL */}
        {url && pageState !== 'manual_entry' && (
          <ProductPreview
            title={productTitle}
            price={productPrice}
            currency={productCurrency}
            image={productImage}
            url={url}
          />
        )}

        {/* Divider */}
        {url && pageState !== 'manual_entry' && (
          <div style={{ height: '1px', background: 'rgba(240,238,232,0.07)', margin: '2px 0' }} />
        )}

        {/* State: loading */}
        {pageState === 'loading' && (
          <p style={{ fontSize: '13px', color: '#7A7870', textAlign: 'center', padding: '16px 0' }}>
            Checking sign-in status…
          </p>
        )}

        {/* State: sign in */}
        {pageState === 'sign_in' && <SignInView />}

        {/* State: manual entry (scrape failed) */}
        {pageState === 'manual_entry' && (
          <ManualEntryForm
            initialUrl={url}
            onConfirm={handleManualEntry}
          />
        )}

        {/* State: save form */}
        {pageState === 'form' && session && (
          <SaveForm
            session={session}
            productUrl={url}
            productTitle={productTitle}
            productPrice={productPrice}
            productCurrency={productCurrency}
            productImage={productImage}
            onSuccess={handleSuccess}
          />
        )}

        {/* State: success */}
        {pageState === 'success' && (
          <SuccessView wishlistId={savedListId} wishlists={wishlists} />
        )}

      </div>
    </div>
  )
}
