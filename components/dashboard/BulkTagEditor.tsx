/**
 * components/dashboard/BulkTagEditor.tsx — GiftHint
 *
 * Bulk DNA tag editor for the wisher dashboard.
 *
 * Workflow:
 *   1. Wisher checks any number of items (or "Select all").
 *   2. Picks mode: "Add tags" or "Remove tags".
 *   3. Types / selects tags using a lightweight tag picker.
 *   4. Clicks "Apply to N items" — parent receives the target IDs and
 *      the add/remove lists and handles the PATCH calls.
 *
 * Common use-cases:
 *   - "#GiftReceiptPlease" on everything at once.
 *   - "#EcoFriendly" on a curated subset.
 *   - Removing a mistakenly added tag from multiple items.
 *
 * Props:
 *   items    — full item list (id, title, dna_tags shown in the selection list)
 *   accent   — occasion theme colour for highlights / buttons
 *   onApply  — called with (selectedIds, tagsToAdd, tagsToRemove)
 *   onClose  — called when the panel should be dismissed
 */

'use client'

import {
  useState,
  useCallback,
  useMemo,
  useRef,
  type KeyboardEvent,
} from 'react'
import { tokens }       from '@/tokens'
import {
  searchTags,
  validateTag,
  DNA_TAG_LIBRARY,
  suggestTagsForItem,
} from '@/lib/dna-tags'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BulkItem {
  id:       string
  title:    string
  dna_tags: string[] | null
}

interface BulkTagEditorProps {
  items:    BulkItem[]
  accent:   string
  onApply:  (selectedIds: string[], tagsToAdd: string[], tagsToRemove: string[]) => void
  onClose:  () => void
}

type BulkMode = 'add' | 'remove'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns a flat deduplicated list of all tags already on the selected items. */
function collectExistingTags(items: BulkItem[], selectedIds: Set<string>): string[] {
  const seen = new Set<string>()
  const out:  string[] = []
  for (const item of items) {
    if (!selectedIds.has(item.id)) continue
    for (const tag of item.dna_tags ?? []) {
      if (!seen.has(tag)) { seen.add(tag); out.push(tag) }
    }
  }
  return out
}

// ── Small shared UI ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      margin: '0 0 8px',
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

function TagPill({
  tag,
  selected,
  onToggle,
  accent,
}: {
  tag:      string
  selected: boolean
  onToggle: (tag: string) => void
  accent:   string
}) {
  return (
    <button
      onClick={() => onToggle(tag)}
      style={{
        display:      'inline-flex',
        alignItems:   'center',
        gap:          '4px',
        fontSize:     '11px',
        fontWeight:   600,
        padding:      '3px 9px',
        borderRadius: tokens.radius.pill,
        border:       `1px solid ${selected ? accent : tokens.colors.border}`,
        background:   selected ? `${accent}22` : tokens.colors.surface2,
        color:        selected ? accent : tokens.colors.text,
        cursor:       'pointer',
        transition:   'all 120ms ease',
        whiteSpace:   'nowrap',
        lineHeight:   1.6,
      }}
    >
      {selected && (
        <span style={{ fontSize: '10px', opacity: 0.8 }}>✓</span>
      )}
      {tag}
    </button>
  )
}

// ── Tag search input ──────────────────────────────────────────────────────────

function TagSearchInput({
  selectedTags,
  accent,
  onAdd,
  onRemove,
  placeholder,
}: {
  selectedTags: string[]
  accent:       string
  onAdd:        (tag: string) => void
  onRemove:     (tag: string) => void
  placeholder:  string
}) {
  const [input,      setInput]      = useState('')
  const [dropdown,   setDropdown]   = useState<string[]>([])
  const [activeIdx,  setActiveIdx]  = useState(-1)
  const [error,      setError]      = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropRef  = useRef<HTMLDivElement>(null)

  function handleInput(value: string) {
    setInput(value)
    setError(null)
    const q = value.trim()
    if (!q) { setDropdown([]); setActiveIdx(-1); return }
    const results = searchTags(q, 8).filter((t) => !selectedTags.includes(t))
    setDropdown(results)
    setActiveIdx(-1)
  }

  function addTag(raw: string) {
    setError(null)
    const tag = raw.trim().startsWith('#') ? raw.trim() : `#${raw.trim()}`
    if (!validateTag(tag)) {
      setError('Tags must start with # and use only letters/numbers (max 20 chars).')
      return
    }
    if (selectedTags.includes(tag)) {
      setError(`${tag} is already in the list.`)
      return
    }
    onAdd(tag)
    setInput('')
    setDropdown([])
    inputRef.current?.focus()
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (dropdown.length === 0) {
      if (e.key === 'Enter' && input.trim()) { e.preventDefault(); addTag(input) }
      if (e.key === 'Backspace' && !input && selectedTags.length > 0) {
        onRemove(selectedTags[selectedTags.length - 1])
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, dropdown.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIdx >= 0 && dropdown[activeIdx]) addTag(dropdown[activeIdx])
      else if (input.trim()) addTag(input)
    } else if (e.key === 'Escape') {
      setDropdown([])
      setActiveIdx(-1)
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* Chip strip + input */}
      <div
        style={{
          display:    'flex',
          flexWrap:   'wrap',
          alignItems: 'center',
          gap:        '5px',
          padding:    '7px 10px',
          borderRadius: tokens.radius.sm,
          border:     `1px solid ${error ? tokens.colors.red : tokens.colors.border}`,
          background: tokens.colors.surface,
          minHeight:  '40px',
          cursor:     'text',
        }}
        onClick={() => inputRef.current?.focus()}
      >
        {selectedTags.map((tag) => (
          <span
            key={tag}
            style={{
              display:      'inline-flex',
              alignItems:   'center',
              gap:          '3px',
              fontSize:     '11px',
              fontWeight:   600,
              padding:      '2px 6px 2px 8px',
              borderRadius: tokens.radius.pill,
              background:   `${accent}22`,
              border:       `1px solid ${accent}44`,
              color:        accent,
              whiteSpace:   'nowrap',
              lineHeight:   1.6,
            }}
          >
            {tag}
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(tag) }}
              aria-label={`Remove ${tag}`}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: accent, opacity: 0.65, padding: 0, lineHeight: 1, fontSize: '13px',
              }}
            >
              ×
            </button>
          </span>
        ))}

        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => handleInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={selectedTags.length === 0 ? placeholder : '#…'}
          style={{
            flex: '1 1 80px', minWidth: '60px',
            background: 'transparent', border: 'none', outline: 'none',
            color: tokens.colors.text, fontSize: '12px', padding: '2px 0',
            fontFamily: tokens.font.sans,
          }}
          aria-label="Search or type a DNA tag"
          aria-autocomplete="list"
          aria-expanded={dropdown.length > 0}
        />
      </div>

      {/* Error */}
      {error && (
        <p style={{ margin: '3px 0 0', fontSize: '11px', color: tokens.colors.red }}>
          {error}
        </p>
      )}

      {/* Dropdown */}
      {dropdown.length > 0 && (
        <div
          ref={dropRef}
          role="listbox"
          style={{
            position:     'absolute',
            top:          'calc(100% + 4px)',
            left:         0,
            right:        0,
            zIndex:       60,
            borderRadius: tokens.radius.sm,
            border:       `1px solid ${tokens.colors.border}`,
            background:   tokens.colors.surface,
            boxShadow:    tokens.shadow.pop,
            overflow:     'hidden',
          }}
        >
          {dropdown.map((tag, i) => (
            <button
              key={tag}
              role="option"
              aria-selected={i === activeIdx}
              onMouseDown={(e) => { e.preventDefault(); addTag(tag) }}
              style={{
                display:     'flex',
                width:       '100%',
                padding:     '8px 12px',
                background:  i === activeIdx ? tokens.colors.surface2 : 'transparent',
                border:      'none',
                cursor:      'pointer',
                textAlign:   'left',
                fontSize:    '12px',
                fontWeight:  600,
                color:       tokens.colors.text,
              }}
            >
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function BulkTagEditor({ items, accent, onApply, onClose }: BulkTagEditorProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [mode,        setMode]        = useState<BulkMode>('add')
  const [tagsToAdd,   setTagsToAdd]   = useState<string[]>([])
  const [tagsToRemove, setTagsToRemove] = useState<string[]>([])
  const [applying,    setApplying]    = useState(false)

  const allSelected  = selectedIds.size === items.length
  const noneSelected = selectedIds.size === 0

  // Tags already on the selected items — useful suggestions for removal mode
  const existingTags = useMemo(
    () => collectExistingTags(items, selectedIds),
    [items, selectedIds],
  )

  // Popular cross-category suggestions for add mode
  const addSuggestions = useMemo(() => {
    if (selectedIds.size === 0) return []
    // Collect suggestions from all selected items' titles
    const seen = new Set<string>()
    const out:  string[] = []
    for (const item of items) {
      if (!selectedIds.has(item.id)) continue
      for (const tag of suggestTagsForItem(item.title, '')) {
        if (!seen.has(tag) && !tagsToAdd.includes(tag)) {
          seen.add(tag); out.push(tag)
        }
      }
    }
    return out.slice(0, 8)
  }, [items, selectedIds, tagsToAdd])

  // ── Selection handlers ────────────────────────────────────────────────────

  const toggleItem = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) =>
      prev.size === items.length ? new Set() : new Set(items.map((i) => i.id))
    )
  }, [items])

  // ── Apply ─────────────────────────────────────────────────────────────────

  const handleApply = useCallback(async () => {
    const ids  = Array.from(selectedIds)
    const add  = mode === 'add'    ? tagsToAdd    : []
    const rm   = mode === 'remove' ? tagsToRemove : []
    if (ids.length === 0 || (add.length === 0 && rm.length === 0)) return

    setApplying(true)
    onApply(ids, add, rm)
    setApplying(false)
    onClose()
  }, [selectedIds, mode, tagsToAdd, tagsToRemove, onApply, onClose])

  const canApply = selectedIds.size > 0 && (
    (mode === 'add'    && tagsToAdd.length > 0) ||
    (mode === 'remove' && tagsToRemove.length > 0)
  )

  // ── Category quick-select (for add mode) ─────────────────────────────────

  const categoryTags = useMemo(() => {
    const cats = Object.values(DNA_TAG_LIBRARY)
    const seen = new Set<string>([...tagsToAdd])
    return cats.flatMap((cat) => cat.tags).filter((t) => !seen.has(t)).slice(0, 16)
  }, [tagsToAdd])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      role="dialog"
      aria-label="Bulk tag editor"
      style={{
        borderRadius: tokens.radius.lg,
        border:       `1px solid ${accent}44`,
        background:   tokens.colors.surface,
        padding:      '20px',
        marginBottom: '16px',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '18px',
      }}>
        <p style={{
          margin: 0, fontSize: '13px', fontWeight: 800,
          color: tokens.colors.text, letterSpacing: '-0.02em',
        }}>
          🏷️ Bulk tag editor
        </p>
        <button
          onClick={onClose}
          aria-label="Close bulk editor"
          style={{
            background: 'transparent', border: 'none',
            fontSize: '13px', color: tokens.colors.muted, cursor: 'pointer', padding: '3px',
          }}
        >
          ✕
        </button>
      </div>

      {/* ── Step 1: Select items ─────────────────────────────────────────── */}
      <section aria-labelledby="bulk-step1">
        <SectionLabel>
          <span id="bulk-step1">1 — Select items</span>
        </SectionLabel>

        {/* Select-all row */}
        <label
          style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '8px 10px',
            borderRadius: tokens.radius.sm,
            background: tokens.colors.surface2,
            cursor: 'pointer',
            marginBottom: '6px',
            border: `1px solid ${tokens.colors.border}`,
          }}
        >
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = !noneSelected && !allSelected
            }}
            onChange={toggleAll}
            style={{ accentColor: accent, width: '14px', height: '14px' }}
          />
          <span style={{ fontSize: '12px', fontWeight: 600, color: tokens.colors.text }}>
            {allSelected ? 'Deselect all' : 'Select all'}
          </span>
          <span style={{ fontSize: '11px', color: tokens.colors.muted, marginLeft: 'auto' }}>
            {selectedIds.size}/{items.length} selected
          </span>
        </label>

        {/* Item list */}
        <div style={{
          maxHeight: '220px', overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: '4px',
        }}>
          {items.map((item) => {
            const checked = selectedIds.has(item.id)
            return (
              <label
                key={item.id}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '10px',
                  padding: '8px 10px',
                  borderRadius: tokens.radius.sm,
                  background: checked ? `${accent}0D` : 'transparent',
                  border: `1px solid ${checked ? `${accent}33` : tokens.colors.border}`,
                  cursor: 'pointer',
                  transition: 'background 120ms ease, border-color 120ms ease',
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleItem(item.id)}
                  style={{
                    accentColor: accent, width: '14px', height: '14px',
                    flexShrink: 0, marginTop: '1px',
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    margin: 0, fontSize: '12px', fontWeight: 500,
                    color: tokens.colors.text,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {item.title}
                  </p>
                  {item.dna_tags && item.dna_tags.length > 0 && (
                    <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', marginTop: '4px' }}>
                      {item.dna_tags.slice(0, 4).map((tag) => (
                        <span
                          key={tag}
                          style={{
                            fontSize: '9.5px', fontWeight: 600,
                            padding: '1px 5px',
                            borderRadius: tokens.radius.pill,
                            background: tokens.colors.surface3,
                            border: `1px solid ${tokens.colors.border}`,
                            color: tokens.colors.muted,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                      {item.dna_tags.length > 4 && (
                        <span style={{ fontSize: '9.5px', color: tokens.colors.muted }}>
                          +{item.dna_tags.length - 4}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </label>
            )
          })}
        </div>
      </section>

      {/* Divider */}
      <div style={{ borderTop: `1px solid ${tokens.colors.border}`, margin: '18px 0' }} />

      {/* ── Step 2: Choose mode ──────────────────────────────────────────── */}
      <section aria-labelledby="bulk-step2">
        <SectionLabel>
          <span id="bulk-step2">2 — Action</span>
        </SectionLabel>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          {(['add', 'remove'] as BulkMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              style={{
                flex:         1,
                padding:      '7px 12px',
                borderRadius: tokens.radius.sm,
                border:       `1px solid ${mode === m ? accent : tokens.colors.border}`,
                background:   mode === m ? `${accent}1A` : 'transparent',
                color:        mode === m ? accent : tokens.colors.muted,
                fontSize:     '12px',
                fontWeight:   mode === m ? 700 : 500,
                cursor:       'pointer',
                transition:   'all 120ms ease',
              }}
            >
              {m === 'add' ? '＋ Add tags' : '− Remove tags'}
            </button>
          ))}
        </div>

        {/* Tag input — changes based on mode */}
        {mode === 'add' ? (
          <>
            <TagSearchInput
              selectedTags={tagsToAdd}
              accent={accent}
              onAdd={(t) => setTagsToAdd((prev) => [...prev, t])}
              onRemove={(t) => setTagsToAdd((prev) => prev.filter((x) => x !== t))}
              placeholder="Type # to search tags…"
            />

            {/* Quick-add suggestions */}
            {categoryTags.length > 0 && (
              <div style={{ marginTop: '10px' }}>
                <p style={{ margin: '0 0 6px', fontSize: '10.5px', color: tokens.colors.muted }}>
                  {addSuggestions.length > 0 ? 'Suggested for selected items:' : 'Common tags:'}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                  {(addSuggestions.length > 0 ? addSuggestions : categoryTags).map((tag) => (
                    <TagPill
                      key={tag}
                      tag={tag}
                      selected={tagsToAdd.includes(tag)}
                      onToggle={(t) =>
                        setTagsToAdd((prev) =>
                          prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
                        )
                      }
                      accent={accent}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <TagSearchInput
              selectedTags={tagsToRemove}
              accent={accent}
              onAdd={(t) => setTagsToRemove((prev) => [...prev, t])}
              onRemove={(t) => setTagsToRemove((prev) => prev.filter((x) => x !== t))}
              placeholder="Type # to find tags to remove…"
            />

            {/* Tags that exist on selected items */}
            {existingTags.length > 0 && (
              <div style={{ marginTop: '10px' }}>
                <p style={{ margin: '0 0 6px', fontSize: '10.5px', color: tokens.colors.muted }}>
                  Tags on selected items:
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                  {existingTags.map((tag) => (
                    <TagPill
                      key={tag}
                      tag={tag}
                      selected={tagsToRemove.includes(tag)}
                      onToggle={(t) =>
                        setTagsToRemove((prev) =>
                          prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
                        )
                      }
                      accent={accent}
                    />
                  ))}
                </div>
              </div>
            )}

            {selectedIds.size > 0 && existingTags.length === 0 && (
              <p style={{ margin: '10px 0 0', fontSize: '11.5px', color: tokens.colors.muted }}>
                None of the selected items have DNA tags yet.
              </p>
            )}
          </>
        )}
      </section>

      {/* Divider */}
      <div style={{ borderTop: `1px solid ${tokens.colors.border}`, margin: '18px 0' }} />

      {/* ── Preview + apply ──────────────────────────────────────────────── */}
      {canApply && (
        <div
          style={{
            padding:      '10px 12px',
            borderRadius: tokens.radius.sm,
            background:   `${accent}0D`,
            border:       `1px solid ${accent}22`,
            marginBottom: '14px',
            fontSize:     '11.5px',
            color:        tokens.colors.text,
            lineHeight:   1.5,
          }}
        >
          {mode === 'add' ? (
            <>
              Adding{' '}
              <strong style={{ color: accent }}>
                {tagsToAdd.join(', ')}
              </strong>{' '}
              to{' '}
              <strong>{selectedIds.size} item{selectedIds.size !== 1 ? 's' : ''}</strong>.
            </>
          ) : (
            <>
              Removing{' '}
              <strong style={{ color: accent }}>
                {tagsToRemove.join(', ')}
              </strong>{' '}
              from{' '}
              <strong>{selectedIds.size} item{selectedIds.size !== 1 ? 's' : ''}</strong>.
            </>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={handleApply}
          disabled={!canApply || applying}
          style={{
            flex:         '1 1 auto',
            padding:      '9px 16px',
            borderRadius: tokens.radius.sm,
            border:       'none',
            background:   canApply ? accent : `${accent}44`,
            color:        canApply ? '#fff' : `${accent}88`,
            fontSize:     '12.5px',
            fontWeight:   700,
            cursor:       canApply ? 'pointer' : 'not-allowed',
            transition:   'background 150ms ease',
          }}
        >
          {applying
            ? 'Applying…'
            : canApply
            ? `Apply to ${selectedIds.size} item${selectedIds.size !== 1 ? 's' : ''}`
            : 'Select items and tags first'}
        </button>

        <button
          onClick={onClose}
          style={{
            padding:      '9px 14px',
            borderRadius: tokens.radius.sm,
            border:       `1px solid ${tokens.colors.border}`,
            background:   'transparent',
            color:        tokens.colors.muted,
            fontSize:     '12px',
            cursor:       'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
