/**
 * components/dashboard/ItemEditor.tsx — GiftHint
 *
 * Inline item editor that expands in-place inside the dashboard item list.
 * Triggered by clicking the "Edit" button on any item row.
 *
 * Editable fields:
 *   Hint         — free-text note for gifters, 120 char limit with live counter
 *   DNA tags     — preference tags with autocomplete via DnaTagEditor
 *   Price        — number override in case the scraped price is wrong
 *   Image URL    — custom image URL in case the scraped image is wrong
 *
 * Save behaviour:
 *   1. Validates inputs client-side (URL format, price range).
 *   2. Builds a minimal patch from only the fields that changed.
 *   3. Calls PATCH /api/items/:id with the user's Bearer token.
 *   4. On success: calls onSaved(updatedItem) so the parent can update its list.
 *   5. On API error: shows an inline error banner; stays open so the user can fix.
 *
 * Deep-link support:
 *   The parent page can read `?edit=[itemId]` from the URL and pass autoFocus=true
 *   so this editor opens and scrolls into view automatically.
 *
 * Props:
 *   item      — snapshot of the item at the time the editor was opened
 *   accent    — occasion theme accent colour for focused borders / buttons
 *   onSaved   — called with the server-confirmed item on successful save
 *   onClose   — called when the editor should collapse (Cancel or successful save)
 */

'use client'

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type FormEvent,
} from 'react'
import { tokens }        from '@/tokens'
import { getBrowserClient } from '@/lib/supabase-browser'
import { DnaTagEditor }  from '@/components/dashboard/DnaTagEditor'

// ── Types ─────────────────────────────────────────────────────────────────────

/** Minimal shape the editor needs from the item record. */
export interface EditableItem {
  id:         string
  title:      string
  hint:       string | null
  price:      number | null
  currency:   string
  image_url:  string | null
  source_url: string
  dna_tags:   string[] | null
  retailer?:  string | null
}

interface ItemEditorProps {
  item:       EditableItem
  accent:     string
  onSaved:    (updated: EditableItem) => void
  onClose:    () => void
  /** When true the hint textarea receives focus on mount (e.g. ?edit= deep link). */
  autoFocus?: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getToken(): Promise<string | undefined> {
  const supabase = getBrowserClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token
}

function isValidUrl(s: string): boolean {
  try { new URL(s); return true } catch { return false }
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.75"
            strokeLinecap="round"/>
    </svg>
  )
}

function ImagePreview({ url, alt }: { url: string; alt: string }) {
  const [err, setErr] = useState(false)
  useEffect(() => setErr(false), [url])

  if (!url || err) {
    return (
      <div
        aria-hidden="true"
        style={{
          width: '52px', height: '52px', flexShrink: 0,
          borderRadius: tokens.radius.sm,
          background: tokens.colors.surface2,
          border: `1px solid ${tokens.colors.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '20px', userSelect: 'none',
        }}
      >
        🖼️
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      onError={() => setErr(true)}
      style={{
        width: '52px', height: '52px', flexShrink: 0,
        borderRadius: tokens.radius.sm,
        objectFit: 'cover',
        border: `1px solid ${tokens.colors.border}`,
      }}
    />
  )
}

// ── Field sub-components ──────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      margin: '0 0 5px',
      fontSize: '10.5px',
      fontWeight: 700,
      color: tokens.colors.muted,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
    }}>
      {children}
    </p>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function ItemEditor({
  item,
  accent,
  onSaved,
  onClose,
  autoFocus = false,
}: ItemEditorProps) {
  // Draft state — pre-filled from current item values
  const [hintDraft,     setHintDraft]     = useState(item.hint ?? '')
  const [tagsDraft,     setTagsDraft]     = useState<string[]>(item.dna_tags ?? [])
  const [priceDraft,    setPriceDraft]    = useState(
    item.price != null ? String(item.price) : '',
  )
  const [imageUrlDraft, setImageUrlDraft] = useState(item.image_url ?? '')

  // UI state
  const [saving,     setSaving]     = useState(false)
  const [saveError,  setSaveError]  = useState<string | null>(null)

  const hintRef = useRef<HTMLTextAreaElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)

  // Auto-focus on mount (deep-link case) and scroll into view
  useEffect(() => {
    if (autoFocus) {
      hintRef.current?.focus()
    }
    editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [autoFocus])

  // ── Validation ─────────────────────────────────────────────────────────────

  function validate(): string | null {
    if (hintDraft.length > 120) {
      return 'Hint must be 120 characters or fewer.'
    }
    if (priceDraft !== '') {
      const n = parseFloat(priceDraft)
      if (isNaN(n) || n < 0) return 'Price must be a positive number.'
      if (n > 1_000_000)     return 'Price seems too high — please double-check.'
    }
    if (imageUrlDraft.trim() && !isValidUrl(imageUrlDraft.trim())) {
      return 'Image URL must be a valid URL (e.g. https://…).'
    }
    return null
  }

  // ── Build patch — only changed fields ─────────────────────────────────────

  function buildPatch(): Record<string, unknown> | null {
    const patch: Record<string, unknown> = {}

    const trimmedHint = hintDraft.trim() || null
    if (trimmedHint !== item.hint) patch.hint = trimmedHint

    const tagsChanged =
      JSON.stringify(tagsDraft) !== JSON.stringify(item.dna_tags ?? [])
    if (tagsChanged) patch.dna_tags = tagsDraft

    const parsedPrice = priceDraft.trim() === ''
      ? null
      : parseFloat(priceDraft)
    if (parsedPrice !== item.price) patch.price = parsedPrice

    const trimmedImage = imageUrlDraft.trim() || null
    if (trimmedImage !== item.image_url) patch.image_url = trimmedImage

    return Object.keys(patch).length > 0 ? patch : null
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async (e?: FormEvent) => {
    e?.preventDefault()
    setSaveError(null)

    const validationError = validate()
    if (validationError) { setSaveError(validationError); return }

    const patch = buildPatch()
    if (!patch) { onClose(); return }   // nothing changed

    setSaving(true)

    try {
      const token = await getToken()

      const res = await fetch(`/api/items/${item.id}`, {
        method:  'PATCH',
        headers: {
          'Content-Type':  'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(patch),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setSaveError(
          (json as { message?: string }).message ??
          `Save failed (HTTP ${res.status}). Please try again.`
        )
        setSaving(false)
        return
      }

      const { item: updated } = await res.json() as { item: EditableItem }
      onSaved(updated)
      onClose()
    } catch {
      setSaveError('Network error. Check your connection and try again.')
      setSaving(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hintDraft, tagsDraft, priceDraft, imageUrlDraft, item, onSaved, onClose])

  const handleCancel = useCallback(() => {
    // Reset drafts to item values in case the caller reuses the component
    setHintDraft(item.hint ?? '')
    setTagsDraft(item.dna_tags ?? [])
    setPriceDraft(item.price != null ? String(item.price) : '')
    setImageUrlDraft(item.image_url ?? '')
    setSaveError(null)
    onClose()
  }, [item, onClose])

  const hintRemaining = 120 - hintDraft.length
  const hintNearLimit = hintRemaining <= 20
  const hintOverLimit = hintRemaining < 0

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      ref={editorRef}
      role="region"
      aria-label={`Editing ${item.title}`}
      style={{
        marginTop:    '12px',
        padding:      '16px',
        borderRadius: tokens.radius.md,
        border:       `1px solid ${accent}40`,
        background:   tokens.colors.surface2,
      }}
    >

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '16px',
      }}>
        <p style={{
          margin: 0, fontSize: '12px', fontWeight: 700,
          color: accent, letterSpacing: '-0.01em',
        }}>
          ✏️ Edit item
        </p>
        <button
          onClick={handleCancel}
          aria-label="Close editor"
          style={{
            background: 'transparent', border: 'none',
            color: tokens.colors.muted, cursor: 'pointer',
            padding: '3px', borderRadius: tokens.radius.xs,
            display: 'flex', alignItems: 'center',
            transition: 'color 120ms ease',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = tokens.colors.text
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = tokens.colors.muted
          }}
        >
          <CloseIcon />
        </button>
      </div>

      <form onSubmit={handleSave} noValidate>

        {/* ── Hint textarea ───────────────────────────────────────────────── */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{
            display: 'flex', alignItems: 'baseline',
            justifyContent: 'space-between', marginBottom: '5px',
          }}>
            <FieldLabel>💬 Hint for gifters</FieldLabel>
            <span
              style={{
                fontSize: '10px',
                color: hintOverLimit
                  ? tokens.colors.red
                  : hintNearLimit
                  ? tokens.colors.amber
                  : tokens.colors.muted,
                opacity: hintNearLimit ? 1 : 0.6,
                fontWeight: hintNearLimit ? 600 : 400,
                transition: 'color 150ms ease',
              }}
              aria-live="polite"
              aria-atomic="true"
            >
              {hintRemaining < 0
                ? `${Math.abs(hintRemaining)} over limit`
                : `${hintRemaining} left`}
            </span>
          </div>

          <textarea
            ref={hintRef}
            value={hintDraft}
            onChange={(e) => {
              setHintDraft(e.target.value)
              setSaveError(null)
            }}
            maxLength={150}   // soft enforcement; hard validation at 120 on save
            rows={2}
            placeholder="Size, colour preference, or any note for your gifters…"
            style={{
              width:        '100%',
              boxSizing:    'border-box',
              padding:      '8px 10px',
              borderRadius: tokens.radius.sm,
              border:       `1px solid ${hintOverLimit ? tokens.colors.red : `${accent}44`}`,
              background:   tokens.colors.surface,
              color:        tokens.colors.text,
              fontSize:     '12px',
              lineHeight:   1.5,
              resize:       'vertical',
              outline:      'none',
              fontFamily:   tokens.font.sans,
              transition:   'border-color 150ms ease',
            }}
          />
        </div>

        {/* ── DNA tag editor ──────────────────────────────────────────────── */}
        <div style={{ marginBottom: '16px' }}>
          <DnaTagEditor
            tags={tagsDraft}
            itemTitle={item.title}
            itemRetailer={item.retailer ?? ''}
            accent={accent}
            onChange={setTagsDraft}
            maxTags={10}
          />
        </div>

        {/* ── Price override ──────────────────────────────────────────────── */}
        <div style={{ marginBottom: '16px' }}>
          <FieldLabel>💰 Price override</FieldLabel>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ position: 'relative', width: '130px' }}>
              <span style={{
                position: 'absolute', left: '10px', top: '50%',
                transform: 'translateY(-50%)',
                fontSize: '12px', color: tokens.colors.muted, pointerEvents: 'none',
              }}>
                {item.currency === 'USD' ? '$' : item.currency}
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={priceDraft}
                onChange={(e) => { setPriceDraft(e.target.value); setSaveError(null) }}
                placeholder="0.00"
                style={{
                  width:        '100%',
                  boxSizing:    'border-box',
                  padding:      '7px 10px 7px 26px',
                  borderRadius: tokens.radius.sm,
                  border:       `1px solid ${accent}44`,
                  background:   tokens.colors.surface,
                  color:        tokens.colors.text,
                  fontSize:     '12px',
                  outline:      'none',
                  fontFamily:   tokens.font.sans,
                }}
              />
            </div>
            {item.price != null && (
              <span style={{ fontSize: '11px', color: tokens.colors.muted }}>
                Currently {new Intl.NumberFormat('en-US', {
                  style: 'currency', currency: item.currency,
                }).format(item.price)}
              </span>
            )}
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '10.5px', color: tokens.colors.muted, opacity: 0.6 }}>
            Leave blank to keep the scraped price. Clear to remove the price.
          </p>
        </div>

        {/* ── Image URL override ──────────────────────────────────────────── */}
        <div style={{ marginBottom: '20px' }}>
          <FieldLabel>🖼️ Image URL override</FieldLabel>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ImagePreview
              url={imageUrlDraft.trim()}
              alt={item.title}
            />
            <input
              type="url"
              value={imageUrlDraft}
              onChange={(e) => { setImageUrlDraft(e.target.value); setSaveError(null) }}
              placeholder="https://example.com/image.jpg"
              style={{
                flex:         1,
                padding:      '7px 10px',
                borderRadius: tokens.radius.sm,
                border:       `1px solid ${accent}44`,
                background:   tokens.colors.surface,
                color:        tokens.colors.text,
                fontSize:     '12px',
                outline:      'none',
                fontFamily:   tokens.font.sans,
              }}
            />
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '10.5px', color: tokens.colors.muted, opacity: 0.6 }}>
            Paste a direct image URL to replace the scraped thumbnail.
          </p>
        </div>

        {/* ── Error banner ────────────────────────────────────────────────── */}
        {saveError && (
          <div
            role="alert"
            style={{
              marginBottom: '14px',
              padding:      '9px 12px',
              borderRadius: tokens.radius.sm,
              background:   'rgba(226, 75, 74, 0.10)',
              border:       `1px solid rgba(226, 75, 74, 0.28)`,
              fontSize:     '11.5px',
              color:        tokens.colors.red,
              lineHeight:   1.45,
            }}
          >
            ⚠ {saveError}
          </div>
        )}

        {/* ── Action row ──────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="submit"
            disabled={saving || hintOverLimit}
            style={{
              flex:         '1 1 auto',
              padding:      '8px 16px',
              borderRadius: tokens.radius.sm,
              border:       'none',
              background:   saving || hintOverLimit ? `${accent}66` : accent,
              color:        '#fff',
              fontSize:     '12.5px',
              fontWeight:   700,
              cursor:       saving || hintOverLimit ? 'not-allowed' : 'pointer',
              letterSpacing: '-0.01em',
              transition:   'background 150ms ease',
              display:      'flex',
              alignItems:   'center',
              justifyContent: 'center',
              gap:          '6px',
            }}
          >
            {saving ? (
              <>
                <span style={{ opacity: 0.7 }}>Saving</span>
                <span style={{ opacity: 0.5, animation: 'pulse 1.2s infinite' }}>…</span>
              </>
            ) : (
              'Save changes'
            )}
          </button>

          <button
            type="button"
            onClick={handleCancel}
            disabled={saving}
            style={{
              padding:      '8px 14px',
              borderRadius: tokens.radius.sm,
              border:       `1px solid ${tokens.colors.border}`,
              background:   'transparent',
              color:        tokens.colors.muted,
              fontSize:     '12px',
              fontWeight:   500,
              cursor:       saving ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
        </div>

      </form>
    </div>
  )
}
