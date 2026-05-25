/**
 * lib/partners.ts — GiftHint
 *
 * Server-side data access and types for the partner program.
 *
 * A "partner" is an organisation (wedding planner, sports club, NCT group,
 * etc.) that has a co-branded landing page at /partners/[slug]. When a
 * visitor arrives via that page and clicks the CTA, a `gifthint_ref` cookie
 * is set to the partner's referral_code. All signups attributed via that
 * cookie increment the partner's referral_count in the users table and log a
 * referral_event — exactly the same pipeline as user-to-user referrals.
 *
 * Database relationship:
 *   partners.user_id  → users.id
 *     Each partner has a corresponding system user account. The system user
 *     owns the referral_code so the existing attribution pipeline needs no
 *     changes: /api/auth/signup reads the cookie, looks up the user by
 *     referral_code, and sets referred_by as normal.
 *
 * SERVER-SIDE ONLY — never import in a client component.
 */

import { createServerClient } from '@/lib/supabase-server'

// ── Types ─────────────────────────────────────────────────────────────────────

export type PartnerCategory =
  | 'wedding'
  | 'baby_shower'
  | 'corporate'
  | 'sports_club'
  | 'education'
  | 'other'

export interface PartnerRow {
  id:             string
  user_id:        string
  slug:           string
  name:           string
  category:       PartnerCategory
  tagline:        string | null
  referral_code:  string
  logo_url:       string | null
  /** Hex colour for the CTA button, e.g. '#C084FC'. Falls back to GiftHint purple. */
  accent_colour:  string | null
  contact_email:  string | null
  contact_name:   string | null
  active:         boolean
  created_at:     string
}

// ── Per-category copy ─────────────────────────────────────────────────────────

export interface PartnerCopy {
  headline:   string
  subline:    string
  /** Exactly 3 steps for the "How it works" section. */
  steps:      [string, string, string]
  /** Short label for the partnership badge, e.g. "for wedding planners". */
  badgeLabel: string
}

export const CATEGORY_COPY: Record<PartnerCategory, PartnerCopy> = {
  wedding: {
    headline:   'Your wedding wishlist, from every store.',
    subline:    'Save from John Lewis, Selfridges, Etsy, Amazon — all in one list. Guests see what\'s left, claim what they\'re buying, and nobody doubles up.',
    steps: [
      'Save from any store with one click — John Lewis, Etsy, Amazon, anywhere',
      'Share gifthint.io/list/your-name with guests — no login required to view',
      'Guests claim items as they buy. Everyone else sees them greyed out.',
    ],
    badgeLabel: 'for weddings',
  },
  baby_shower: {
    headline:   'Everything your baby needs, from every store.',
    subline:    'Build your list from Mamas & Papas, NEXT, Amazon, Etsy and more. Share one link. Friends claim what they\'re buying so nothing arrives twice.',
    steps: [
      'Save from Mamas & Papas, Amazon, Etsy — any store, one click',
      'Share one link with everyone attending',
      'Items get claimed in real time — zero duplicate muslins',
    ],
    badgeLabel: 'for baby showers',
  },
  corporate: {
    headline:   'Gift coordination without the email chain.',
    subline:    'Your colleague shares one link. The team claims items quietly. No "what does she want?" messages, no awkward duplicate leaving presents.',
    steps: [
      'Recipient saves what they actually want, from any store',
      'Coordinator shares the link with the team',
      'Everyone claims quietly — the coordinator stays sane',
    ],
    badgeLabel: 'for teams',
  },
  sports_club: {
    headline:   'End-of-season coach gift, sorted.',
    subline:    'Parents chip in on a group gift or claim individual items — one link, any store, fully coordinated. No WhatsApp chaos.',
    steps: [
      'Create a wishlist for the coach (or let them build their own)',
      'Share the link in the parent group',
      'Parents claim items or chip into the group gift pool',
    ],
    badgeLabel: 'for sports clubs',
  },
  education: {
    headline:   'Graduation wishlist that actually works.',
    subline:    'Your family shops at M&S. Your friends shop at ASOS. Your wishlist works everywhere. Share one link — no login required for anyone buying.',
    steps: [
      'Save from any store in about 30 seconds',
      'Share gifthint.io/list/your-name with friends and family',
      'Gifts get claimed as they\'re bought — no awkward duplicates',
    ],
    badgeLabel: 'for graduates',
  },
  other: {
    headline:   'Your gift list, from anywhere on the web.',
    subline:    'Save from any store. Share one link. Items get claimed in real time — nobody doubles up.',
    steps: [
      'Save items from any store with one click',
      'Share gifthint.io/list/your-name with everyone',
      'Items are claimed as people buy — no duplicates',
    ],
    badgeLabel: 'partner programme',
  },
}

// ── Data access ───────────────────────────────────────────────────────────────

/**
 * Fetches a single active partner by URL slug.
 * Returns null if the partner does not exist or is inactive.
 */
export async function fetchPartnerBySlug(slug: string): Promise<PartnerRow | null> {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('partners')
    .select([
      'id', 'user_id', 'slug', 'name', 'category', 'tagline',
      'referral_code', 'logo_url', 'accent_colour',
      'contact_email', 'contact_name', 'active', 'created_at',
    ].join(', '))
    .eq('slug', slug)
    .eq('active', true)
    .maybeSingle()

  if (error) {
    console.error('[partners] fetchPartnerBySlug error:', error.message)
    return null
  }

  return data as PartnerRow | null
}

/**
 * Fetches slugs for all active partners.
 * Used by generateStaticParams in the partner landing page.
 */
export async function fetchActivePartnerSlugs(): Promise<string[]> {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('partners')
    .select('slug')
    .eq('active', true)

  if (error) {
    console.error('[partners] fetchActivePartnerSlugs error:', error.message)
    return []
  }

  return (data ?? []).map((row) => row.slug as string)
}
