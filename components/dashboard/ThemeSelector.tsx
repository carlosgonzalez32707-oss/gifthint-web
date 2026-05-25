/**
 * components/dashboard/ThemeSelector.tsx — GiftHint
 *
 * Pro-gated premium theme picker for wisher dashboard list settings.
 *
 * ── What it renders ───────────────────────────────────────────────────────────
 *   • A "Default" card (always selectable — no Pro required)
 *   • Five premium theme cards, each with:
 *       - Live mini-preview: correct bg, surface, text, and accent swatch
 *       - Theme name + tagline
 *       - If not Pro:  blurred overlay, "Pro" lock badge, "Upgrade →" CTA
 *       - If Pro:      clickable, saves immediately to DB, shows tick when active
 *   • "Preview as gifter" button — opens /list/[username]/[slug] in a new tab
 *
 * ── Access logic ──────────────────────────────────────────────────────────────
 *   Premium themes require EITHER:
 *     - subscription_status = 'pro' (or cancelled but still in paid period), OR
 *     - premium_themes_enabled = true (referral milestone at 3 referrals)
 *
 *   This component receives `canUseThemes` from the parent so it doesn't
 *   need to re-fetch the user — keeping it as a pure display + mutation component.
 *
 * ── Props ─────────────────────────────────────────────────────────────────────
 *   wishlistId    — UUID of the wishlist to update
 *   currentTheme  — active theme key (from wishlists.theme)
 *   canUseThemes  — true if the user has Pro or 3+ referrals
 *   username      — wisher's public_username (for "Preview" link)
 *   slug          — wishlist slug (for "Preview" link)
 *   onThemeChange — called with the new key after a successful DB write,
 *                   so the parent can update its local state without a reload
 *
 * ── DB write ──────────────────────────────────────────────────────────────────
 *   Updates `wishlists.theme` via the browser Supabase client (user's own row,
 *   RLS permits UPDATE on their own wishlists).
 *
 * CLIENT COMPONENT — auth and data fetching happen in the parent page.
 */

'use client'

import { useState, useCallback } from 'react'
import { tokens as globalTokens }         from '@/tokens'
import { THEMES, PREMIUM_THEME_KEYS, getTheme } from '@/lib/themes'
import { getBrowserClient }              from '@/lib/supabase-browser'
import type { ThemeKey }                 from '@/lib/themes'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ThemeSelectorProps {
  wishlistId:    string
  currentTheme:  string
  canUseThemes:  boolean
  username:      string
  slug:          string
  onThemeChange: (key: ThemeKey) => void
}

// ── Mini-preview ──────────────────────────────────────────────────────────────
// A compact 56-px-tall visual swatch that shows the theme's key colours
// without any text so it reads at a glance.

function MiniPreview({ themeKey }: { themeKey: ThemeKey }) {
  const t = getTheme(themeKey)

  return (
    <div
      aria-hidden="true"
      style={{
        height:       56,
        borderRadius: 8,
        overflow:     'hidden',
        background:   t.colors.bg,
        position:     'relative',
        flexShrink:    0,
        marginBottom:  10,
      }}
    >
      {/* Simulated card surface */}
      <div style={{
        position:     'absolute',
        top: 8, left: 8,
        width: '55%', height: 32,
        borderRadius: 6,
        background:   t.colors.surface,
        border:       `1px solid ${t.colors.border}`,
      }} />

      {/* Accent swatch strip */}
      <div style={{
        position:   'absolute',
        top: 8, right: 8,
        width: 10, height: '65%',
        borderRadius: 4,
        background:   t.colors.accent,
      }} />

      {/* Simulated text lines */}
      <div style={{
        position:   'absolute',
        top: 16, left: 16,
        width: '32%', height: 5,
        borderRadius: 2,
        background:   t.colors.text,
        opacity:      0.7,
      }} />
      <div style={{
        position:   'absolute',
        top: 26, left: 16,
        width: '22%', height: 4,
        borderRadius: 2,
        background:   t.colors.muted,
        opacity:      0.5,
      }} />

      {/* Bottom accent line */}
      <div style={{
        position:   'absolute',
        bottom: 0, left: 0, right: 0,
        height: 3,
        background: `linear-gradient(90deg, ${t.colors.accent}, transparent)`,
        opacity:    0.7,
      }} />
    </div>
  )
}

// ── ThemeCard ─────────────────────────────────────────────────────────────────

function ThemeCard({
  themeKey,
  isActive,
  isLocked,
  onSelect,
}: {
  themeKey: ThemeKey
  isActive: boolean
  isLocked: boolean
  onSelect: (key: ThemeKey) => void
}) {
  const t = getTheme(themeKey)
  const c = globalTokens.colors
  const r = globalTokens.radius

  const isDefault = themeKey === 'default'

  return (
    <div
      role="radio"
      aria-checked={isActive}
      aria-disabled={isLocked}
      aria-label={`${t.label} theme${isLocked ? ' (Pro required)' : ''}`}
      onClick={() => !isLocked && onSelect(themeKey)}
      onKeyDown={(e) => {
        if (!isLocked && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onSelect(themeKey)
        }
      }}
      tabIndex={isLocked ? -1 : 0}
      style={{
        position:    'relative',
        borderRadius: r.lg,
        border:       isActive
                        ? `2px solid ${c.purple}`
                        : `1px solid ${c.border}`,
        background:   c.surface,
        padding:      '14px 14px 12px',
        cursor:       isLocked ? 'default' : 'pointer',
        transition:   'border-color 150ms, box-shadow 150ms',
        boxShadow:    isActive ? globalTokens.shadow.glow : 'none',
        outline:      'none',
        overflow:     'hidden',
        userSelect:   'none',
      }}
    >
      {/* Mini preview */}
      <MiniPreview themeKey={themeKey} />

      {/* Label */}
      <p style={{
        fontSize:   13.5,
        fontWeight:  700,
        color:       isActive ? c.purple : c.text,
        margin:      '0 0 3px',
        lineHeight:  1.2,
      }}>
        {t.label}
        {isDefault && (
          <span style={{
            marginLeft:    5,
            fontSize:      10,
            fontWeight:    600,
            color:         c.muted,
            letterSpacing: '0.05em',
          }}>
            FREE
          </span>
        )}
      </p>
      <p style={{
        fontSize:  11,
        color:     c.muted,
        margin:    0,
        lineHeight: 1.4,
      }}>
        {t.tagline}
      </p>

      {/* Active tick */}
      {isActive && (
        <div style={{
          position:     'absolute',
          top: 10, right: 10,
          width:         20,
          height:        20,
          borderRadius:  '50%',
          background:    c.purple,
          display:       'flex',
          alignItems:    'center',
          justifyContent: 'center',
        }}>
          <svg width="11" height="8" viewBox="0 0 11 8" fill="none" aria-hidden="true">
            <path d="M1 3.5l3 3L10 1" stroke="#fff" strokeWidth="1.8"
                  strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      )}

      {/* Locked overlay */}
      {isLocked && (
        <div style={{
          position:       'absolute',
          inset:           0,
          borderRadius:    r.lg,
          backdropFilter: 'blur(3px)',
          background:     'rgba(12,12,14,0.65)',
          display:        'flex',
          flexDirection:  'column',
          alignItems:     'center',
          justifyContent: 'center',
          gap:             6,
        }}>
          {/* Lock icon */}
          <svg width="18" height="20" viewBox="0 0 18 20" fill="none" aria-hidden="true">
            <rect x="1" y="9" width="16" height="11" rx="3"
                  stroke={c.purple} strokeWidth="1.5"/>
            <path d="M5 9V6a4 4 0 0 1 8 0v3" stroke={c.purple} strokeWidth="1.5"
                  strokeLinecap="round"/>
            <circle cx="9" cy="14.5" r="1.5" fill={c.purple}/>
          </svg>

          {/* "Pro" badge */}
          <span style={{
            fontSize:     10,
            fontWeight:    700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color:          c.purple,
            background:     'rgba(139,131,240,0.18)',
            borderRadius:   r.pill,
            padding:        '3px 8px',
          }}>
            Pro
          </span>
        </div>
      )}
    </div>
  )
}

// ── ThemeSelector (main) ──────────────────────────────────────────────────────

export function ThemeSelector({
  wishlistId,
  currentTheme,
  canUseThemes,
  username,
  slug,
  onThemeChange,
}: ThemeSelectorProps) {
  const c = globalTokens.colors
  const r = globalTokens.radius

  // Optimistic local state — updates immediately on click, rolls back on error
  const [activeKey, setActiveKey]   = useState<ThemeKey>(
    currentTheme as ThemeKey || 'default',
  )
  const [saving,    setSaving]      = useState(false)
  const [saveError, setSaveError]   = useState<string | null>(null)

  const handleSelect = useCallback(async (key: ThemeKey) => {
    if (key === activeKey) return
    setSaveError(null)
    setSaving(true)

    // Optimistic update — feel instant to the user
    const prev = activeKey
    setActiveKey(key)

    const supabase = getBrowserClient()
    const { error } = await supabase
      .from('wishlists')
      .update({ theme: key })
      .eq('id', wishlistId)

    setSaving(false)

    if (error) {
      // Roll back and show error
      setActiveKey(prev)
      setSaveError("Couldn't save theme. Please try again.")
      return
    }

    onThemeChange(key)
  }, [activeKey, wishlistId, onThemeChange])

  const previewUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/list/${username}/${slug}`

  // All premium theme keys — show locked if user can't use them
  const allKeys: ThemeKey[] = ['default', ...PREMIUM_THEME_KEYS]

  return (
    <section aria-label="Wishlist theme" style={{ width: '100%' }}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        marginBottom:    16,
        flexWrap:       'wrap',
        gap:             8,
      }}>
        <div>
          <p style={{
            fontSize: 13, fontWeight: 700, letterSpacing: '0.06em',
            textTransform: 'uppercase', color: c.muted, margin: 0,
          }}>
            Page theme
          </p>
          {!canUseThemes && (
            <p style={{ fontSize: 11.5, color: c.muted, margin: '3px 0 0' }}>
              Premium themes are available on{' '}
              <a
                href="/dashboard/upgrade"
                style={{ color: c.purple, textDecoration: 'none', fontWeight: 600 }}
              >
                Pro
              </a>
              {' '}or after 3 referrals.
            </p>
          )}
        </div>

        {/* Preview as gifter */}
        <a
          href={previewUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display:        'flex',
            alignItems:     'center',
            gap:             5,
            fontSize:        12,
            fontWeight:      600,
            color:           c.purple,
            textDecoration:  'none',
            background:      'rgba(139,131,240,0.10)',
            borderRadius:    r.pill,
            padding:        '5px 12px',
            border:         `1px solid rgba(139,131,240,0.2)`,
            whiteSpace:     'nowrap',
          }}
        >
          Preview as gifter
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
            <path d="M2.5 2.5h6v6M2.5 8.5l6-6" stroke={c.purple} strokeWidth="1.5"
                  strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>
      </div>

      {/* ── Theme grid ────────────────────────────────────────────────────── */}
      <div
        role="radiogroup"
        aria-label="Choose a page theme"
        style={{
          display:             'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))',
          gap:                  12,
        }}
      >
        {allKeys.map((key) => {
          const isPremium = key !== 'default'
          const isLocked  = isPremium && !canUseThemes
          return (
            <ThemeCard
              key={key}
              themeKey={key}
              isActive={activeKey === key}
              isLocked={isLocked}
              onSelect={handleSelect}
            />
          )
        })}
      </div>

      {/* ── Status line ───────────────────────────────────────────────────── */}
      <div style={{ minHeight: 18, marginTop: 10 }}>
        {saving && (
          <p style={{ fontSize: 11.5, color: c.muted, margin: 0 }}>
            Saving theme…
          </p>
        )}
        {saveError && (
          <p style={{ fontSize: 11.5, color: globalTokens.colors.red, margin: 0 }}>
            {saveError}
          </p>
        )}
        {!saving && !saveError && activeKey !== 'default' && (
          <p style={{ fontSize: 11.5, color: c.muted, margin: 0 }}>
            Theme applied — visible to anyone viewing your list.
          </p>
        )}
      </div>

      {/* ── Upgrade CTA (shown only when locked) ──────────────────────────── */}
      {!canUseThemes && (
        <div style={{
          marginTop:    16,
          background:   'rgba(139,131,240,0.06)',
          border:       `1px solid rgba(139,131,240,0.18)`,
          borderRadius:  r.lg,
          padding:      '14px 16px',
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'space-between',
          gap:           12,
          flexWrap:     'wrap',
        }}>
          <div>
            <p style={{
              fontSize: 13, fontWeight: 600, color: c.text,
              margin: '0 0 3px',
            }}>
              Unlock premium themes
            </p>
            <p style={{ fontSize: 12, color: c.muted, margin: 0 }}>
              Upgrade to Pro or refer 3 friends to unlock all 5 themes.
            </p>
          </div>
          <a
            href="/dashboard/upgrade"
            style={{
              display:       'inline-block',
              background:    c.purple,
              color:        '#fff',
              textDecoration: 'none',
              fontSize:       12,
              fontWeight:     700,
              borderRadius:   r.pill,
              padding:       '7px 16px',
              whiteSpace:    'nowrap',
              flexShrink:     0,
            }}
          >
            Upgrade →
          </a>
        </div>
      )}
    </section>
  )
}
