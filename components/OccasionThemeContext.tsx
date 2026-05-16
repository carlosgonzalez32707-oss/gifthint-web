/**
 * components/OccasionThemeContext.tsx — GiftHint
 *
 * React context that distributes the active OccasionTheme to every component
 * on the gifter page without prop-drilling.
 *
 * Provider pattern:
 *   GifterPage (Client Component) wraps its tree with <OccasionThemeProvider>.
 *   Any descendant calls useOccasionTheme() to get the resolved theme.
 *
 * Server Components cannot consume this context — use getOccasionTheme()
 * from lib/occasion-themes.ts directly for server-side lookups.
 */

'use client'

import { createContext, useContext } from 'react'
import type { OccasionTheme }        from '@/lib/occasion-themes'
import { DEFAULT_OCCASION_THEME }    from '@/lib/occasion-themes'

// ── Context ───────────────────────────────────────────────────────────────────

export const OccasionThemeContext =
  createContext<OccasionTheme>(DEFAULT_OCCASION_THEME)

// ── Provider ──────────────────────────────────────────────────────────────────

interface OccasionThemeProviderProps {
  theme:    OccasionTheme
  children: React.ReactNode
}

export function OccasionThemeProvider({
  theme,
  children,
}: OccasionThemeProviderProps) {
  return (
    <OccasionThemeContext.Provider value={theme}>
      {children}
    </OccasionThemeContext.Provider>
  )
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Returns the active OccasionTheme from the nearest OccasionThemeProvider.
 * Falls back to DEFAULT_OCCASION_THEME when used outside any provider.
 */
export function useOccasionTheme(): OccasionTheme {
  return useContext(OccasionThemeContext)
}
