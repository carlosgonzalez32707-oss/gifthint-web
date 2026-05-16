/**
 * app/dashboard/[slug]/page.tsx — GiftHint
 *
 * List detail view for the wisher dashboard.
 *
 * Features:
 *   - Lists all items belonging to this wishlist (owner-filtered via RLS).
 *   - Drag-to-reorder via @hello-pangea/dnd — persists sort_order.
 *   - Inline edit: hint (personal note), title, DNA preference tags.
 *   - DNA tag editor: autocomplete from DNA_TAG_LIBRARY, suggested tags per item,
 *     popular-tag badge (usage counts from /api/dna-tags/popular).
 *   - Delete individual items.
 *   - Edit wishlist metadata (title, date) via inline header form.
 *   - "Add item" callout pointing to the browser extension.
 *
 * Auth: Client-side — redirects to /dashboard if not logged in.
 * The slug in the URL matches the `wishlists.slug` column.
 */

'use client'

import {
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react'
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd'
import { useRouter, useSearchParams } from 'next/navigation'
import Link                           from 'next/link'
import { tokens }                     from '@/tokens'
import { useAuth }                    from '@/hooks/useAuth'
import { getBrowserClient }           from '@/lib/supabase-browser'
import { getOccasionTheme }           from '@/lib/occasion-themes'
import { DnaTagEditor }               from '@/components/dashboard/DnaTagEditor'
import { ItemEditor }                 from '@/components/dashboard/ItemEditor'
import { BulkTagEditor }              from '@/components/dashboard/BulkTagEditor'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Item {
  id:          string
  title:       string
  hint:        string | null
  price:       number | null
  currency:    string
  image_url:   string | null
  source_url:  string
  is_claimed:  boolean
  sort_order:  number | null
  dna_tags:    string[] | null
  wishlist_id: string | null
}

interface Wishlist {
  id:            string
  title:         string
  slug:          string
  occasion:      string
  occasion_date: string | null
  is_default:    boolean
  is_public:     boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPrice(price: number | null, currency = 'USD'): string {
  if (price === null) return ''
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(price)
}

async function getToken(): Promise<string | undefined> {
  const supabase = getBrowserClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token
}

// ── ItemRow ────────────────────────────────────────────────────────────────────

interface ItemRowProps {
  item:            Item
  index:           number
  accent:          string
  onSave:          (id: string, patch: Partial<Item>) => void
  onDelete:        (id: string) => void
  onItemSaved:     (updated: Partial<Item> & { id: string }) => void
  /** When true the ItemEditor opens automatically on mount (deep-link). */
  autoOpenEditor?: boolean
}

function ItemRow({
  item, index, accent, onSave, onDelete, onItemSaved, autoOpenEditor = false,
}: ItemRowProps) {
  const [editing,  setEditing]  = useState(autoOpenEditor)
  const [deleting, setDeleting] = useState(false)

  // If auto-opening due to deep link, scroll into view after mount
  const rowRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (autoOpenEditor) {
      rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [autoOpenEditor])

  const handleDelete = useCallback(async () => {
    if (!confirm(`Remove "${item.title}" from your list?`)) return
    setDeleting(true)
    onDelete(item.id)
  }, [item.id, item.title, onDelete])

  return (
    <Draggable draggableId={item.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={(el) => {
            // Attach both the drag ref and our own row ref
            provided.innerRef(el)
            ;(rowRef as React.MutableRefObject<HTMLDivElement | null>).current = el
          }}
          {...provided.draggableProps}
          style={{
            ...provided.draggableProps.style,
            background:   snapshot.isDragging ? tokens.colors.surface3 : tokens.colors.surface,
            border:       `1px solid ${
              editing
                ? accent + '44'
                : snapshot.isDragging
                ? accent + '55'
                : tokens.colors.border
            }`,
            borderRadius: tokens.radius.md,
            padding:      '14px 14px 14px 10px',
            transition:   snapshot.isDragging ? 'none' : 'border-color 150ms ease',
            boxShadow:    snapshot.isDragging ? tokens.shadow.pop : 'none',
          }}
        >
          {/* ── Compact row ─────────────────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>

            {/* Drag handle */}
            <div
              {...provided.dragHandleProps}
              aria-label="Drag to reorder"
              style={{
                color:      tokens.colors.muted,
                opacity:    0.4,
                cursor:     'grab',
                paddingTop: '3px',
                flexShrink: 0,
              }}
            >
              <svg width="12" height="18" viewBox="0 0 12 18" fill="none" aria-hidden="true">
                {[0, 6, 12].map((y) => (
                  <g key={y}>
                    <circle cx="3" cy={y + 3}  r="1.5" fill="currentColor" />
                    <circle cx="9" cy={y + 3}  r="1.5" fill="currentColor" />
                  </g>
                ))}
              </svg>
            </div>

            {/* Thumbnail */}
            {item.image_url && (
              <div
                style={{
                  width:        '48px',
                  height:       '48px',
                  borderRadius: tokens.radius.sm,
                  overflow:     'hidden',
                  flexShrink:   0,
                  background:   tokens.colors.surface2,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.image_url}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
            )}

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <a
                href={item.source_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize:       '13px',
                  fontWeight:     600,
                  color:          tokens.colors.text,
                  textDecoration: 'none',
                  display:        'block',
                  overflow:       'hidden',
                  textOverflow:   'ellipsis',
                  whiteSpace:     'nowrap',
                  lineHeight:     1.3,
                }}
              >
                {item.title}
              </a>

              {/* Price */}
              {item.price !== null && (
                <span style={{ fontSize: '12px', color: tokens.colors.green, fontWeight: 600 }}>
                  {formatPrice(item.price, item.currency)}
                </span>
              )}

              {/* Tags */}
              {item.dna_tags && item.dna_tags.length > 0 && (
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                  {item.dna_tags.map((tag) => (
                    <span
                      key={tag}
                      style={{
                        fontSize:     '10px',
                        fontWeight:   600,
                        color:        tokens.colors.muted,
                        background:   tokens.colors.surface2,
                        borderRadius: tokens.radius.pill,
                        padding:      '2px 6px',
                        border:       `1px solid ${tokens.colors.border}`,
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Hint preview (collapsed state) */}
              {!editing && item.hint && (
                <p
                  style={{
                    margin:     '5px 0 0',
                    fontSize:   '12px',
                    color:      tokens.colors.muted,
                    fontStyle:  'italic',
                    lineHeight: 1.4,
                    overflow:   'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  💬 {item.hint}
                </p>
              )}
            </div>

            {/* Right-side action buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>

              {/* Claimed badge */}
              {item.is_claimed && (
                <span
                  style={{
                    fontSize:     '10px',
                    fontWeight:   700,
                    color:        tokens.colors.green,
                    background:   tokens.colors.greenDim,
                    border:       `1px solid ${tokens.colors.greenRing}`,
                    borderRadius: tokens.radius.pill,
                    padding:      '2px 7px',
                    whiteSpace:   'nowrap',
                    marginRight:  '4px',
                  }}
                >
                  ✓ Claimed
                </span>
              )}

              {/* Edit button */}
              <button
                onClick={() => setEditing((o) => !o)}
                aria-label={editing ? 'Close editor' : 'Edit item'}
                aria-expanded={editing}
                style={{
                  background:   editing ? `${accent}22` : 'transparent',
                  border:       `1px solid ${editing ? accent + '55' : tokens.colors.border}`,
                  color:        editing ? accent : tokens.colors.muted,
                  cursor:       'pointer',
                  padding:      '3px 8px',
                  borderRadius: tokens.radius.xs,
                  fontSize:     '11px',
                  fontWeight:   600,
                  lineHeight:   1.6,
                  transition:   'all 120ms ease',
                }}
              >
                {editing ? '✕ Close' : '✏️ Edit'}
              </button>

              {/* Delete */}
              <button
                onClick={handleDelete}
                disabled={deleting}
                aria-label="Remove item"
                style={{
                  background:  'transparent',
                  border:      'none',
                  color:       deleting ? tokens.colors.muted : 'rgba(226,75,74,0.6)',
                  cursor:      deleting ? 'not-allowed' : 'pointer',
                  padding:     '2px 4px',
                  fontSize:    '14px',
                  lineHeight:  1,
                  transition:  'color 120ms ease',
                }}
              >
                {deleting ? '…' : '×'}
              </button>
            </div>

          </div>

          {/* ── Inline ItemEditor — expands below the compact row ────────── */}
          {editing && (
            <ItemEditor
              item={item}
              accent={accent}
              onSaved={(updated) => {
                onItemSaved({ ...updated, id: item.id })
                setEditing(false)
              }}
              onClose={() => setEditing(false)}
              autoFocus={autoOpenEditor}
            />
          )}
        </div>
      )}
    </Draggable>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ListDetailPage({
  params,
}: {
  params: { slug: string }
}) {
  const { slug }       = params
  const router         = useRouter()
  const searchParams   = useSearchParams()
  const { user, loading: authLoading } = useAuth()

  const [wishlist, setWishlist] = useState<Wishlist | null>(null)
  const [items,    setItems]    = useState<Item[]>([])
  const [fetching, setFetching] = useState(true)

  // Deep-link: ?edit=[itemId] auto-opens the ItemEditor for that item
  const deepLinkItemId = searchParams.get('edit')

  // Bulk editor open/close
  const [bulkEditorOpen, setBulkEditorOpen] = useState(false)

  // Edit wishlist header
  const [editingHeader, setEditingHeader]   = useState(false)
  const [titleDraft,    setTitleDraft]      = useState('')
  const [dateDraft,     setDateDraft]       = useState('')
  const [savingHeader,  setSavingHeader]    = useState(false)

  // ── Auth guard ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/dashboard')
    }
  }, [authLoading, user, router])

  // ── Load data ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return

    async function load() {
      setFetching(true)
      const supabase = getBrowserClient()

      // Fetch the wishlist by slug + owner
      const { data: wl, error: wlErr } = await supabase
        .from('wishlists')
        .select('*')
        .eq('user_id', user!.id)
        .eq('slug', slug)
        .single()

      if (wlErr || !wl) {
        router.replace('/dashboard')
        return
      }

      setWishlist(wl)
      setTitleDraft(wl.title)
      setDateDraft(wl.occasion_date ?? '')

      // Fetch items belonging to this wishlist
      const { data: itemRows } = await supabase
        .from('wishlist_items')
        .select('id, title, hint, price, currency, image_url, source_url, is_claimed, sort_order, dna_tags, wishlist_id')
        .eq('user_id', user!.id)
        .eq('wishlist_id', wl.id)
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })

      setItems(itemRows ?? [])
      setFetching(false)
    }

    load()
  }, [user, slug, router])

  // ── Drag-to-reorder ────────────────────────────────────────────────────────

  const handleDragEnd = useCallback(async (result: DropResult) => {
    if (!result.destination) return
    const src  = result.source.index
    const dest = result.destination.index
    if (src === dest) return

    // Optimistic reorder
    const reordered = Array.from(items)
    const [moved]   = reordered.splice(src, 1)
    reordered.splice(dest, 0, moved)
    setItems(reordered)

    // Persist new sort_order values
    const token = await getToken()
    await Promise.all(
      reordered.map((item, i) =>
        fetch(`/api/items/${item.id}`, {
          method:  'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ sort_order: i }),
        })
      )
    )
  }, [items])

  // ── Item actions ───────────────────────────────────────────────────────────

  const handleSaveItem = useCallback(async (id: string, patch: Partial<Item>) => {
    // Optimistic update
    setItems((prev) => prev.map((it) => it.id === id ? { ...it, ...patch } : it))

    const token = await getToken()
    await fetch(`/api/items/${id}`, {
      method:  'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(patch),
    })
  }, [])

  // Called by ItemEditor when the server confirms a save
  const handleItemEditorSaved = useCallback((updated: Partial<Item> & { id: string }) => {
    setItems((prev) => prev.map((it) => it.id === updated.id ? { ...it, ...updated } : it))
  }, [])

  // Called by BulkTagEditor with the tag changes to apply
  const handleBulkApply = useCallback(async (
    selectedIds: string[],
    tagsToAdd:   string[],
    tagsToRemove: string[],
  ) => {
    if (selectedIds.length === 0) return

    // Optimistic: compute new dna_tags per item and apply
    setItems((prev) => prev.map((item) => {
      if (!selectedIds.includes(item.id)) return item
      const current = item.dna_tags ?? []
      const next = [
        ...current.filter((t) => !tagsToRemove.includes(t)),
        ...tagsToAdd.filter((t) => !current.includes(t)),
      ]
      return { ...item, dna_tags: next }
    }))

    // Persist each item in parallel
    const token = await getToken()
    await Promise.all(
      selectedIds.map((id) => {
        const item    = items.find((it) => it.id === id)
        const current = item?.dna_tags ?? []
        const next    = [
          ...current.filter((t) => !tagsToRemove.includes(t)),
          ...tagsToAdd.filter((t) => !current.includes(t)),
        ]
        return fetch(`/api/items/${id}`, {
          method:  'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ dna_tags: next }),
        })
      })
    )
  }, [items])

  const handleDeleteItem = useCallback(async (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id))

    const token = await getToken()
    await fetch(`/api/items/${id}`, {
      method:  'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
  }, [])

  // ── Header save ────────────────────────────────────────────────────────────

  const handleSaveHeader = useCallback(async () => {
    if (!wishlist) return
    setSavingHeader(true)

    const token = await getToken()
    const res = await fetch(`/api/wishlists/${wishlist.id}`, {
      method:  'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        title:        titleDraft.trim() || wishlist.title,
        occasionDate: dateDraft || null,
      }),
    })

    if (res.ok) {
      const { wishlist: updated } = await res.json()
      setWishlist(updated)
    }

    setSavingHeader(false)
    setEditingHeader(false)
  }, [wishlist, titleDraft, dateDraft])

  // ── Loading / auth states ──────────────────────────────────────────────────

  if (authLoading || fetching || !wishlist) {
    return (
      <div
        style={{
          minHeight:      '100vh',
          background:     tokens.colors.bg,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ color: tokens.colors.muted, fontSize: '14px' }}>Loading…</span>
      </div>
    )
  }

  const theme = getOccasionTheme(wishlist.occasion)

  return (
    <div
      style={{
        minHeight:  '100vh',
        background: tokens.colors.bg,
        fontFamily: tokens.font.sans,
        color:      tokens.colors.text,
      }}
    >
      {/* ── Top nav ──────────────────────────────────────────────────────── */}
      <header
        style={{
          borderBottom:   `1px solid ${tokens.colors.border}`,
          padding:        '0 24px',
          height:         '56px',
          display:        'flex',
          alignItems:     'center',
          gap:            '12px',
          position:       'sticky',
          top:            0,
          zIndex:         10,
          background:     tokens.colors.bg,
        }}
      >
        <Link
          href="/dashboard"
          style={{
            color:          tokens.colors.muted,
            textDecoration: 'none',
            fontSize:       '13px',
            display:        'flex',
            alignItems:     'center',
            gap:            '5px',
          }}
        >
          ← Back
        </Link>
        <span style={{ color: tokens.colors.border }}>|</span>
        <span style={{ fontSize: '15px' }}>{theme.emoji}</span>
        <span
          style={{
            fontSize:      '14px',
            fontWeight:    700,
            color:         tokens.colors.text,
            overflow:      'hidden',
            textOverflow:  'ellipsis',
            whiteSpace:    'nowrap',
            letterSpacing: '-0.02em',
          }}
        >
          {wishlist.title}
        </span>
      </header>

      <main style={{ padding: '28px 24px', maxWidth: '680px', margin: '0 auto' }}>

        {/* ── Wishlist header card ─────────────────────────────────────────── */}
        <div
          style={{
            background:   tokens.colors.surface,
            border:       `1px solid ${theme.accentRing}`,
            borderRadius: tokens.radius.lg,
            padding:      '20px',
            marginBottom: '24px',
          }}
        >
          {editingHeader ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input
                type="text"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                maxLength={100}
                style={{
                  padding:      '9px 12px',
                  borderRadius: tokens.radius.sm,
                  border:       `1px solid ${theme.accentRing}`,
                  background:   tokens.colors.surface2,
                  color:        tokens.colors.text,
                  fontSize:     '15px',
                  fontWeight:   700,
                  outline:      'none',
                }}
              />
              <input
                type="date"
                value={dateDraft}
                onChange={(e) => setDateDraft(e.target.value)}
                style={{
                  padding:      '9px 12px',
                  borderRadius: tokens.radius.sm,
                  border:       `1px solid ${tokens.colors.border}`,
                  background:   tokens.colors.surface2,
                  color:        tokens.colors.text,
                  fontSize:     '13px',
                  outline:      'none',
                  colorScheme:  'dark',
                }}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={handleSaveHeader}
                  disabled={savingHeader}
                  style={{
                    padding:      '8px 16px',
                    borderRadius: tokens.radius.sm,
                    border:       'none',
                    background:   theme.accent,
                    color:        '#fff',
                    fontSize:     '13px',
                    fontWeight:   600,
                    cursor:       savingHeader ? 'not-allowed' : 'pointer',
                    opacity:      savingHeader ? 0.7 : 1,
                  }}
                >
                  {savingHeader ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => {
                    setEditingHeader(false)
                    setTitleDraft(wishlist.title)
                    setDateDraft(wishlist.occasion_date ?? '')
                  }}
                  style={{
                    padding:      '8px 14px',
                    borderRadius: tokens.radius.sm,
                    border:       `1px solid ${tokens.colors.border}`,
                    background:   'transparent',
                    color:        tokens.colors.muted,
                    fontSize:     '13px',
                    cursor:       'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '24px' }}>{theme.emoji}</span>
                  <h1
                    style={{
                      margin:        0,
                      fontSize:      '18px',
                      fontWeight:    800,
                      color:         tokens.colors.text,
                      letterSpacing: '-0.03em',
                    }}
                  >
                    {wishlist.title}
                  </h1>
                </div>
                {wishlist.occasion_date && (
                  <p style={{ margin: 0, fontSize: '12px', color: tokens.colors.muted }}>
                    📅 {new Date(wishlist.occasion_date + 'T00:00:00').toLocaleDateString('en-US', {
                      month: 'long', day: 'numeric', year: 'numeric',
                    })}
                  </p>
                )}
                <p style={{ margin: '6px 0 0', fontSize: '12px', color: tokens.colors.muted }}>
                  {items.length} {items.length === 1 ? 'gift' : 'gifts'} ·{' '}
                  {items.filter((i) => i.is_claimed).length} claimed
                </p>
              </div>
              <button
                onClick={() => setEditingHeader(true)}
                style={{
                  padding:      '7px 14px',
                  borderRadius: tokens.radius.sm,
                  border:       `1px solid ${tokens.colors.border}`,
                  background:   'transparent',
                  color:        tokens.colors.muted,
                  fontSize:     '12px',
                  fontWeight:   600,
                  cursor:       'pointer',
                  flexShrink:   0,
                }}
              >
                ✏️ Edit
              </button>
            </div>
          )}
        </div>

        {/* ── Items (drag-to-reorder) ──────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: '12px',
        }}>
          <h2
            style={{
              margin:        0,
              fontSize:      '13px',
              fontWeight:    600,
              color:         tokens.colors.muted,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            Items · drag to reorder
          </h2>

          {items.length > 1 && (
            <button
              onClick={() => setBulkEditorOpen((o) => !o)}
              aria-expanded={bulkEditorOpen}
              style={{
                padding:      '5px 11px',
                borderRadius: tokens.radius.sm,
                border:       `1px solid ${bulkEditorOpen ? theme.accent + '55' : tokens.colors.border}`,
                background:   bulkEditorOpen ? `${theme.accent}18` : 'transparent',
                color:        bulkEditorOpen ? theme.accent : tokens.colors.muted,
                fontSize:     '11.5px',
                fontWeight:   600,
                cursor:       'pointer',
                transition:   'all 120ms ease',
              }}
            >
              🏷️ Bulk edit tags
            </button>
          )}
        </div>

        {/* Bulk editor — shown above the item list when open */}
        {bulkEditorOpen && items.length > 0 && (
          <BulkTagEditor
            items={items}
            accent={theme.accent}
            onApply={handleBulkApply}
            onClose={() => setBulkEditorOpen(false)}
          />
        )}

        {items.length === 0 ? (
          <div
            style={{
              textAlign:    'center',
              padding:      '48px 24px',
              border:       `1px dashed ${tokens.colors.border}`,
              borderRadius: tokens.radius.lg,
            }}
          >
            <p style={{ color: tokens.colors.muted, fontSize: '14px', margin: '0 0 8px' }}>
              No items in this list yet.
            </p>
            <p style={{ color: tokens.colors.muted, fontSize: '12px', margin: 0, opacity: 0.7 }}>
              Use the GiftHint browser extension to add items while you shop.
            </p>
          </div>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="items">
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
                >
                  {items.map((item, index) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      index={index}
                      accent={theme.accent}
                      onSave={handleSaveItem}
                      onDelete={handleDeleteItem}
                      onItemSaved={handleItemEditorSaved}
                      autoOpenEditor={item.id === deepLinkItemId}
                    />
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}

        {/* ── Add item callout ─────────────────────────────────────────────── */}
        <div
          style={{
            marginTop:    '28px',
            padding:      '16px 20px',
            borderRadius: tokens.radius.lg,
            background:   theme.accentDim,
            border:       `1px solid ${theme.accentRing}`,
            display:      'flex',
            alignItems:   'center',
            gap:          '12px',
          }}
        >
          <span style={{ fontSize: '24px', flexShrink: 0 }}>🛒</span>
          <div>
            <p
              style={{
                margin:     0,
                fontSize:   '13px',
                fontWeight: 600,
                color:      theme.accent,
              }}
            >
              Add items while you shop
            </p>
            <p
              style={{
                margin:   '3px 0 0',
                fontSize: '12px',
                color:    tokens.colors.muted,
                lineHeight: 1.5,
              }}
            >
              Install the{' '}
              <a
                href="https://chrome.google.com/webstore"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: theme.accent, textDecoration: 'underline' }}
              >
                GiftHint Chrome extension
              </a>{' '}
              and click the button on any product page to add it here.
            </p>
          </div>
        </div>

      </main>
    </div>
  )
}
