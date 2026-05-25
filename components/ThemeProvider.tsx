/**
 * components/ThemeProvider.tsx — GiftHint
 *
 * Applies a premium theme to the gifter page by:
 *   1. Injecting CSS custom properties (--theme-bg, --theme-accent, …) as
 *      inline styles on a semantically transparent wrapper element.  Any child
 *      that reads `var(--theme-*)` will automatically adopt the active theme.
 *
 *   2. Exposing the typed ThemeTokens object via React context so inline-styled
 *      components can call `useTheme().colors.accent` when CSS vars aren't
 *      practical (e.g., canvas drawing, Chart.js datasets, programmatic logic).
 *
 * The wrapper `<div>` is display:contents so it introduces no extra box in the
 * layout — it is visually transparent but still propagates CSS custom properties
 * through the cascade.
 *
 * Usage (in GifterPage):
 *   <ThemeProvider themeKey={wishlist?.theme}>
 *     <div style={{ background: 'var(--theme-bg)', color: 'var(--theme-text)' }}>
 *       …gifter page content…
 *     </div>
 *   </ThemeProvider>
 *
 * Usage (in child component):
 *   const { colors } = useTheme()
 *   <button style={{ background: colors.accent }}>Buy</button>
 *
 * 'use client' — context requires client-side React.  The provider is a
 * thin wrapper; it adds no loading state or network calls.
 */

'use client'

import { createContext, useContext, useMemo } from 'react'
import { getTheme, toCSSVars }                from '@/lib/themes'
import type { ThemeTokens, ThemeKey }         from '@/lib/themes'

// ── Context ───────────────────────────────────────────────────────────────────

interface ThemeContextValue {
  /** The resolved theme key (defaults to 'default' when none is set). */
  key:    ThemeKey
  /** Full typed token set for the active theme. */
  tokens: ThemeTokens
}

const ThemeContext = createContext<ThemeContextValue>({
  key:    'default',
  tokens: getTheme('default'),
})

// ── Provider ──────────────────────────────────────────────────────────────────

interface ThemeProviderProps {
  /**
   * Theme key from `wishlists.theme`.  Falls back to 'default' when
   * absent, null, or an unrecognised string.
   */
  themeKey:  string | null | undefined
  children:  React.ReactNode
}

export function ThemeProvider({ themeKey, children }: ThemeProviderProps) {
  const tokens   = useMemo(() => getTheme(themeKey), [themeKey])
  const cssVars  = useMemo(() => toCSSVars(tokens),   [tokens])
  const ctxValue = useMemo<ThemeContextValue>(
    () => ({ key: tokens.key, tokens }),
    [tokens],
  )

  return (
    <ThemeContext.Provider value={ctxValue}>
      {/*
        display:contents makes this div invisible to the layout engine —
        it contributes no box, margin, or padding.  CSS custom properties
        still cascade from it to all descendants exactly as if they were
        set on the nearest block ancestor.

        We use 'display:contents' so GifterPage's own root div remains
        the flex/grid/block container — no layout shift, no extra nesting.
      */}
      <div
        data-theme={tokens.key}
        style={cssVars as React.CSSProperties}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  )
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Returns the active ThemeContextValue.
 *
 * Safe to call outside a ThemeProvider — falls back to the 'default' theme.
 *
 * @example
 *   const { tokens } = useTheme()
 *   <span style={{ color: tokens.colors.accent }}>Pro</span>
 */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}
