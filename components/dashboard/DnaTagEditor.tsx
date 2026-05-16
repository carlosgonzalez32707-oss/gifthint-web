/**
 * components/dashboard/DnaTagEditor.tsx — GiftHint
 *
 * Inline DNA tag editor used in the wisher dashboard item rows.
 *
 * Features:
 *   - Chip-style display of existing tags with × to remove
 *   - Tag autocomplete: typing # (or any text) filters DNA_TAG_LIBRARY via
 *     searchTags() and shows a dropdown of matches
 *   - Suggested tags panel: tags relevant to the item's title/retailer
 *   - Popular tags badge: usage_count fetched from /api/dna-tags/popular,
 *     shown next to frequently-used tags in the suggestions panel
 *   - Validation: only valid tags (validateTag) are accepted
 *
 * Usage:
 *   <DnaTagEditor
 *     tags={['#NoPink', '#SizeUp']}
 *     itemTitle="Silk blouse"
 *     itemRetailer="zara"
 *     accent="#8B83F0"
 *     onChange={(tags) => handleSaveItem(id, { dna_tags: tags })}
 *   />
 */

'use client'

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type KeyboardEvent,
} from 'react'
import { tokens }            from '@/tokens'
import {
  suggestTagsForItem,
  searchTags,
  validateTag,
  ALL_DNA_TAGS,
}                            from '@/lib/dna-tags'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PopularTag {
  tag_text:    string
  usage_count: number
}

interface DnaTagEditorProps {
  tags:         string[]
  itemTitle:    string
  itemRetailer: string
  accent:       string
  onChange:     (tags: string[]) => void
  /** Max tags the user can add. Default 10. */
  maxTags?:     number
}

// ── Hook: fetch popular tags ──────────────────────────────────────────────────

function usePopularTags(): Map<string, number> {
  const [popularMap, setPopularMap] = useState<Map<string, number>>(new Map())

  useEffect(() => {
    fetch('/api/dna-tags/popular?limit=50')
      .then((r) => r.ok ? r.json() : null)
      .then((json: { tags: PopularTag[] } | null) => {
        if (!json?.tags) return
        const map = new Map<string, number>()
        for (const { tag_text, usage_count } of json.tags) {
          map.set(tag_text, usage_count)
        }
        setPopularMap(map)
      })
      .catch(() => { /* non-critical — degrade gracefully */ })
  }, [])

  return popularMap
}

// ── Sub-component: single tag chip ────────────────────────────────────────────

function TagChip({
  tag,
  accent,
  onRemove,
}: {
  tag:      string
  accent:   string
  onRemove: (tag: string) => void
}) {
  return (
    <span
      style={{
        display:        'inline-flex',
        alignItems:     'center',
        gap:            '4px',
        fontSize:       '11px',
        fontWeight:     600,
        padding:        '2px 6px 2px 8px',
        borderRadius:   tokens.radius.pill,
        background:     `${accent}22`,
        border:         `1px solid ${accent}44`,
        color:          accent,
        whiteSpace:     'nowrap',
        lineHeight:     1.6,
      }}
    >
      {tag}
      <button
        onClick={() => onRemove(tag)}
        aria-label={`Remove ${tag}`}
        style={{
          background:  'none',
          border:      'none',
          cursor:      'pointer',
          color:       accent,
          opacity:     0.65,
          padding:     0,
          lineHeight:  1,
          fontSize:    '13px',
          display:     'flex',
          alignItems:  'center',
        }}
      >
        ×
      </button>
    </span>
  )
}

// ── Sub-component: suggestion pill ────────────────────────────────────────────

function SuggestionPill({
  tag,
  usageCount,
  disabled,
  accent,
  onAdd,
}: {
  tag:        string
  usageCount: number
  disabled:   boolean
  accent:     string
  onAdd:      (tag: string) => void
}) {
  return (
    <button
      onClick={() => !disabled && onAdd(tag)}
      disabled={disabled}
      title={usageCount > 0 ? `Used by ${usageCount} wishers` : undefined}
      style={{
        display:        'inline-flex',
        alignItems:     'center',
        gap:            '4px',
        fontSize:       '10.5px',
        fontWeight:     600,
        padding:        '2px 7px',
        borderRadius:   tokens.radius.pill,
        background:     disabled ? tokens.colors.surface3 : tokens.colors.surface2,
        border:         `1px solid ${tokens.colors.border}`,
        color:          disabled ? tokens.colors.muted : tokens.colors.text,
        cursor:         disabled ? 'default' : 'pointer',
        opacity:        disabled ? 0.5 : 1,
        transition:     'background 120ms ease',
        whiteSpace:     'nowrap',
        lineHeight:     1.6,
      }}
    >
      {tag}
      {usageCount > 4 && (
        <span
          style={{
            fontSize:     '9px',
            background:   `${accent}33`,
            color:        accent,
            borderRadius: tokens.radius.pill,
            padding:      '1px 4px',
            fontWeight:   700,
          }}
        >
          {usageCount > 99 ? '99+' : usageCount}
        </span>
      )}
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function DnaTagEditor({
  tags,
  itemTitle,
  itemRetailer,
  accent,
  onChange,
  maxTags = 10,
}: DnaTagEditorProps) {
  const [input,      setInput]      = useState('')
  const [dropdown,   setDropdown]   = useState<string[]>([])
  const [activeIdx,  setActiveIdx]  = useState(-1)
  const [error,      setError]      = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropRef  = useRef<HTMLDivElement>(null)
  const popularMap = usePopularTags()

  // Suggestions: tags relevant to this item (excluding already-added ones)
  const suggestions = suggestTagsForItem(itemTitle, itemRetailer)
    .filter((t) => !tags.includes(t))

  // ── Autocomplete ──────────────────────────────────────────────────────────

  useEffect(() => {
    const q = input.trim()
    if (!q) {
      setDropdown([])
      setActiveIdx(-1)
      return
    }
    const results = searchTags(q, 8).filter((t) => !tags.includes(t))
    setDropdown(results)
    setActiveIdx(-1)
  }, [input, tags])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropRef.current && !dropRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setDropdown([])
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // ── Tag management ────────────────────────────────────────────────────────

  const addTag = useCallback((raw: string) => {
    setError(null)
    const tag = raw.trim().startsWith('#') ? raw.trim() : `#${raw.trim()}`
    if (!validateTag(tag)) {
      setError('Tags must start with # and contain only letters/numbers (max 20 chars).')
      return
    }
    if (tags.includes(tag)) {
      setError(`${tag} is already added.`)
      return
    }
    if (tags.length >= maxTags) {
      setError(`Maximum ${maxTags} tags per item.`)
      return
    }
    onChange([...tags, tag])
    setInput('')
    setDropdown([])
    inputRef.current?.focus()
  }, [tags, maxTags, onChange])

  const removeTag = useCallback((tag: string) => {
    onChange(tags.filter((t) => t !== tag))
  }, [tags, onChange])

  // ── Keyboard navigation ───────────────────────────────────────────────────

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (dropdown.length === 0) {
      if (e.key === 'Enter' && input.trim()) {
        e.preventDefault()
        addTag(input)
      }
      if (e.key === 'Backspace' && !input && tags.length > 0) {
        removeTag(tags[tags.length - 1])
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
      if (activeIdx >= 0 && dropdown[activeIdx]) {
        addTag(dropdown[activeIdx])
      } else if (input.trim()) {
        addTag(input)
      }
    } else if (e.key === 'Escape') {
      setDropdown([])
      setActiveIdx(-1)
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1])
    }
  }, [dropdown, activeIdx, input, tags, addTag, removeTag])

  const atLimit = tags.length >= maxTags

  return (
    <div style={{ marginTop: '10px' }}>

      {/* ── Section label ──────────────────────────────────────────────────── */}
      <p
        style={{
          margin:     '0 0 6px',
          fontSize:   '11px',
          fontWeight: 600,
          color:      tokens.colors.muted,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        🧬 Preference tags
      </p>

      {/* ── Chip strip + input ─────────────────────────────────────────────── */}
      <div
        style={{
          display:      'flex',
          flexWrap:     'wrap',
          alignItems:   'center',
          gap:          '5px',
          padding:      '7px 10px',
          borderRadius: tokens.radius.sm,
          border:       `1px solid ${error ? '#E24B4A' : tokens.colors.border}`,
          background:   tokens.colors.surface2,
          cursor:       'text',
          minHeight:    '38px',
        }}
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag) => (
          <TagChip key={tag} tag={tag} accent={accent} onRemove={removeTag} />
        ))}

        {!atLimit && (
          <input
            ref={inputRef}
            type="text"
            value={input}
            placeholder={tags.length === 0 ? 'Type # to add a tag…' : '#…'}
            onChange={(e) => {
              setInput(e.target.value)
              setError(null)
            }}
            onKeyDown={handleKeyDown}
            style={{
              flex:       '1 1 80px',
              minWidth:   '60px',
              background: 'transparent',
              border:     'none',
              outline:    'none',
              color:      tokens.colors.text,
              fontSize:   '12px',
              padding:    '2px 0',
              fontFamily: tokens.font.sans,
            }}
            aria-label="Add a DNA tag"
            aria-autocomplete="list"
            aria-expanded={dropdown.length > 0}
            aria-activedescendant={activeIdx >= 0 ? `dna-opt-${activeIdx}` : undefined}
          />
        )}
      </div>

      {/* ── Validation error ───────────────────────────────────────────────── */}
      {error && (
        <p
          style={{
            margin:   '4px 0 0',
            fontSize: '11px',
            color:    '#E24B4A',
          }}
        >
          {error}
        </p>
      )}

      {/* ── Autocomplete dropdown ──────────────────────────────────────────── */}
      {dropdown.length > 0 && (
        <div
          ref={dropRef}
          role="listbox"
          aria-label="Tag suggestions"
          style={{
            marginTop:    '4px',
            borderRadius: tokens.radius.sm,
            border:       `1px solid ${tokens.colors.border}`,
            background:   tokens.colors.surface,
            boxShadow:    tokens.shadow.pop,
            overflow:     'hidden',
            zIndex:       50,
          }}
        >
          {dropdown.map((tag, i) => (
            <button
              key={tag}
              id={`dna-opt-${i}`}
              role="option"
              aria-selected={i === activeIdx}
              onMouseDown={(e) => { e.preventDefault(); addTag(tag) }}
              style={{
                display:     'flex',
                alignItems:  'center',
                justifyContent: 'space-between',
                width:       '100%',
                padding:     '8px 12px',
                background:  i === activeIdx ? tokens.colors.surface2 : 'transparent',
                border:      'none',
                cursor:      'pointer',
                textAlign:   'left',
                fontSize:    '12px',
                color:       tokens.colors.text,
                transition:  'background 80ms ease',
              }}
            >
              <span style={{ fontWeight: 600 }}>{tag}</span>
              {(popularMap.get(tag) ?? 0) > 0 && (
                <span
                  style={{
                    fontSize:     '10px',
                    color:        tokens.colors.muted,
                    background:   tokens.colors.surface3,
                    borderRadius: tokens.radius.pill,
                    padding:      '1px 6px',
                  }}
                >
                  {popularMap.get(tag)} uses
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── Suggested tags panel ───────────────────────────────────────────── */}
      {suggestions.length > 0 && (
        <div style={{ marginTop: '8px' }}>
          <p
            style={{
              margin:   '0 0 5px',
              fontSize: '10.5px',
              color:    tokens.colors.muted,
            }}
          >
            Suggested for this item:
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {suggestions.map((tag) => (
              <SuggestionPill
                key={tag}
                tag={tag}
                usageCount={popularMap.get(tag) ?? 0}
                disabled={tags.includes(tag) || atLimit}
                accent={accent}
                onAdd={addTag}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Capacity hint ──────────────────────────────────────────────────── */}
      {tags.length > 0 && (
        <p
          style={{
            margin:   '5px 0 0',
            fontSize: '10px',
            color:    tokens.colors.muted,
            opacity:  0.6,
          }}
        >
          {tags.length}/{maxTags} tags
        </p>
      )}
    </div>
  )
}
