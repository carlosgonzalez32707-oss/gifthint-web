/**
 * app/layout.tsx — GiftHint root layout
 *
 * Required by Next.js App Router. Wraps every page in the app.
 * Sets the default dark background and Inter font, and includes
 * global CSS (Tailwind base + resets).
 */

import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: {
    default:  'GiftHint',
    template: '%s — GiftHint',
  },
  description: 'Save products from any store. Share your wishlist. Get exactly what you want.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://gifthint.io'),
  openGraph: {
    siteName: 'GiftHint',
    type:     'website',
  },
  icons: {
    icon: '/favicon.ico',
  },
}

export const viewport: Viewport = {
  width:        'device-width',
  initialScale: 1,
  themeColor:   '#0C0C0E',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body style={{ fontFamily: 'var(--font-inter), system-ui, sans-serif' }}>
        {children}
      </body>
    </html>
  )
}
