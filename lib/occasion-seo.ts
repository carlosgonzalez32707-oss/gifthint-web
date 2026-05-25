/**
 * lib/occasion-seo.ts — GiftHint
 *
 * Per-occasion SEO content: metadata, copy, sample items, and FAQs.
 * Pure data — no React, safe to import in Server Components and route handlers.
 *
 * URL slugs use hyphens (baby-shower) while DB keys use underscores (baby_shower)
 * to match the existing occasion_themes.ts catalogue. The `dbKey` field bridges them.
 *
 * Usage:
 *   import { getOccasionSEO, OCCASION_SLUGS } from '@/lib/occasion-seo'
 *   const seo = getOccasionSEO('birthday')   // returns OccasionSEO | null
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type OccasionSlug =
  | 'birthday'
  | 'christmas'
  | 'wedding'
  | 'baby-shower'
  | 'graduation'
  | 'housewarming'
  | 'anniversary'

export interface SampleItem {
  emoji:     string
  title:     string
  retailer:  string
  price:     string
  /** Optional urgency tag shown on the card */
  tag?:      string
}

export interface OccasionFAQ {
  question: string
  answer:   string
}

export interface OccasionSEO {
  /** URL slug used in /gifts/[occasion] — uses hyphens */
  slug:        OccasionSlug
  /** Key used in the DB and occasion_themes.ts — uses underscores */
  dbKey:       string
  /** Human-readable name, e.g. "Baby Shower" */
  displayName: string
  /** Decorative emoji matching occasion_themes.ts */
  emoji:       string
  /** Hex accent colour matching occasion_themes.ts */
  accentColor: string

  // ── SEO fields ─────────────────────────────────────────────────────────────
  metaTitle:       string
  metaDescription: string
  /** Page h1 — contains the primary keyword */
  h1:              string
  /** Sub-headline below the h1 */
  heroSubline:     string
  /** Primary keywords for this occasion (informational, not rendered) */
  keywords:        string[]
  /** Step 2 "Save" copy — customised per occasion */
  saveStepCopy:    string

  // ── Content ────────────────────────────────────────────────────────────────
  sampleItems: SampleItem[]
  faqs:        OccasionFAQ[]
  /** Text for the bottom CTA headline */
  bottomCtaHeadline: string
  /** Text for the bottom CTA sub-copy */
  bottomCtaSub: string
}

// ── Shared FAQ questions (used across all occasions) ──────────────────────────

const SHARED_FAQS: OccasionFAQ[] = [
  {
    question: 'Do my friends need to download anything to see my list?',
    answer:
      'No — your gifter page is just a regular web link. Anyone can open it on any device. Only you need the GiftHint Chrome extension to save items.',
  },
  {
    question: 'What stores work with GiftHint?',
    answer:
      'GiftHint works on Amazon, Etsy, Walmart, Target, ASOS, Sephora, Apple, Wayfair, IKEA, and 500+ more. If a product has a price on the page, GiftHint can save it.',
  },
  {
    question: 'Is GiftHint really free?',
    answer:
      'Yes, 100% free. No credit card, no subscription, no hidden fees. GiftHint earns a small affiliate commission when a friend clicks through and buys — at no extra cost to them.',
  },
]

// ── Catalogue ─────────────────────────────────────────────────────────────────

const CATALOGUE: OccasionSEO[] = [
  // ── Birthday ───────────────────────────────────────────────────────────────
  {
    slug:        'birthday',
    dbKey:       'birthday',
    displayName: 'Birthday',
    emoji:       '🎂',
    accentColor: '#E872A0',

    metaTitle:       'Birthday Wish List — Save Gifts from Any Store | GiftHint',
    metaDescription: 'Create a birthday wishlist your friends can actually buy from. Save from Amazon, Etsy, and 1,000s of stores. No duplicate gifts.',
    h1:              'The Birthday Wish List That Actually Works',
    heroSubline:     'Stop getting gifts you don\'t want. Save anything from any store, share one link, and let friends claim exactly what you need.',
    keywords: [
      'birthday wish list',
      'birthday wishlist',
      'birthday gift list',
      'birthday registry',
      'what to put on a birthday list',
      'birthday gift ideas for women',
      'birthday gift ideas for men',
    ],
    saveStepCopy: 'Browse Amazon, Etsy, ASOS, Sephora — anywhere you shop. Tap the pink ♥ heart on any product page to add it to your birthday list instantly.',

    sampleItems: [
      { emoji: '💫', title: 'Dyson Airwrap Complete Styler', retailer: 'Dyson', price: '$599',  tag: 'Most wished for' },
      { emoji: '📖', title: 'Kindle Paperwhite (16 GB)',     retailer: 'Amazon',  price: '$139' },
      { emoji: '🕯️', title: 'Jo Malone London Gift Set',     retailer: 'Nordstrom', price: '$89' },
    ],

    faqs: [
      ...SHARED_FAQS,
      {
        question: 'Can I share my birthday list in a WhatsApp group?',
        answer:
          'Absolutely. Your GiftHint page is a simple link (gifthint.io/list/yourname). Paste it anywhere — WhatsApp, iMessage, Instagram DM. When someone buys a gift, it\'s automatically marked as claimed so nobody buys the same thing twice.',
      },
    ],
    bottomCtaHeadline: 'Start your birthday list in 60 seconds.',
    bottomCtaSub:      'Free forever. Works on 500+ stores. No account needed for your friends.',
  },

  // ── Christmas ──────────────────────────────────────────────────────────────
  {
    slug:        'christmas',
    dbKey:       'christmas',
    displayName: 'Christmas',
    emoji:       '🎄',
    accentColor: '#4EC99A',

    metaTitle:       'Christmas Wish List — End Duplicate Gifts Forever | GiftHint',
    metaDescription: 'Build a Christmas wishlist the whole family can use. Share one link — everyone sees what\'s still available. Free, works with 500+ stores.',
    h1:              'The Christmas Wish List That Ends Duplicate Gifts',
    heroSubline:     'One link. Your whole list. When someone buys a gift, it disappears for everyone else. Finally — no more getting two of the same thing.',
    keywords: [
      'christmas wish list',
      'christmas wishlist',
      'christmas gift list',
      'xmas wishlist',
      'christmas gift ideas',
      'christmas registry',
      'secret santa wish list',
    ],
    saveStepCopy: 'Browse Amazon, Apple, Lego, John Lewis — anywhere you shop. Tap the ♥ heart and items land on your Christmas list automatically.',

    sampleItems: [
      { emoji: '🎧', title: 'AirPods Pro (2nd generation)',    retailer: 'Apple',    price: '$249', tag: 'Most popular' },
      { emoji: '🍳', title: 'Le Creuset Cast Iron Casserole',  retailer: 'Williams Sonoma', price: '$360' },
      { emoji: '🧩', title: 'Lego Botanicals Orchid Set',      retailer: 'Lego',     price: '$49' },
    ],

    faqs: [
      ...SHARED_FAQS,
      {
        question: 'Can I use GiftHint for Secret Santa?',
        answer:
          'Yes — it\'s perfect for Secret Santa. Share your list in the group, and participants can each claim a different item without seeing who picked what. You only see that the item is claimed, not who bought it.',
      },
    ],
    bottomCtaHeadline: 'Start your Christmas list in 60 seconds.',
    bottomCtaSub:      'Free forever. Works on Amazon, Apple, John Lewis, and 500+ more.',
  },

  // ── Wedding ────────────────────────────────────────────────────────────────
  {
    slug:        'wedding',
    dbKey:       'wedding',
    displayName: 'Wedding',
    emoji:       '💍',
    accentColor: '#E8A84A',

    metaTitle:       'Wedding Gift List — Modern Registry from Any Store | GiftHint',
    metaDescription: 'Create a wedding gift list that works across any retailer. No retailer lock-in. No duplicate gifts. Free for life.',
    h1:              'The Wedding Gift List Your Guests Will Actually Use',
    heroSubline:     'Forget retailer-locked registries. Save from John Lewis, Anthropologie, Etsy, and everywhere else — all in one beautiful list.',
    keywords: [
      'wedding gift list',
      'wedding wishlist',
      'wedding registry',
      'wedding gift registry',
      'alternative wedding registry',
      'universal wedding registry',
      'best wedding registry',
    ],
    saveStepCopy: 'Browse KitchenAid, Selfridges, Anthropologie, Etsy — no limits on which stores you can add. Tap ♥ to save each item.',

    sampleItems: [
      { emoji: '🍽️', title: 'KitchenAid Artisan Stand Mixer',  retailer: 'KitchenAid', price: '$449', tag: 'Fan favourite' },
      { emoji: '☕', title: 'Nespresso Vertuo Next Bundle',      retailer: 'Nespresso',  price: '$199' },
      { emoji: '🔪', title: 'Wüsthof Classic 7-Piece Knife Set', retailer: 'Williams Sonoma', price: '$399' },
    ],

    faqs: [
      ...SHARED_FAQS,
      {
        question: 'How is GiftHint different from a department store registry?',
        answer:
          'Traditional registries lock you into a single retailer. GiftHint works on any store — mix IKEA, Etsy handmade items, and Anthropologie in one list. Guests get one link, not three different store logins.',
      },
    ],
    bottomCtaHeadline: 'Build your wedding list in 60 seconds.',
    bottomCtaSub:      'Free forever. Any store. No retailer lock-in.',
  },

  // ── Baby Shower ────────────────────────────────────────────────────────────
  {
    slug:        'baby-shower',
    dbKey:       'baby_shower',
    displayName: 'Baby Shower',
    emoji:       '👶',
    accentColor: '#38BDF8',

    metaTitle:       'Baby Shower Wish List — Registry from Any Store | GiftHint',
    metaDescription: 'Build a baby shower registry from Amazon, Mothercare, Etsy, and more. Share one link. No duplicate gifts. Completely free.',
    h1:              'The Baby Shower Wish List That Makes Gift-Giving Easy',
    heroSubline:     'Save prams, monitors, and nursery essentials from any store in one list. Share one link — no spreadsheets, no duplicate gifts.',
    keywords: [
      'baby shower wish list',
      'baby shower wishlist',
      'baby shower registry',
      'baby registry',
      'best baby registry',
      'universal baby registry',
      'baby shower gift list',
    ],
    saveStepCopy: 'Browse Amazon, Mothercare, Mamas & Papas, IKEA and more. Tap ♥ on any product — pushchairs, monitors, clothing, all in one list.',

    sampleItems: [
      { emoji: '🛻', title: 'UPPAbaby VISTA V2 Stroller',     retailer: 'Buy Buy Baby', price: '$969', tag: 'Top registry pick' },
      { emoji: '📷', title: 'Nanit Pro Smart Baby Monitor',    retailer: 'Amazon',       price: '$299' },
      { emoji: '🎮', title: 'Skip Hop Explore & More Activity Gym', retailer: 'Target',  price: '$79' },
    ],

    faqs: [
      ...SHARED_FAQS,
      {
        question: 'Can I share my baby registry before the shower date?',
        answer:
          'Yes — you can share your list as soon as you create it. Many parents share it when announcing the shower date so guests have time to plan. Items are marked claimed as they\'re bought, so there\'s never a duplicate.',
      },
    ],
    bottomCtaHeadline: 'Start your baby registry in 60 seconds.',
    bottomCtaSub:      'Free forever. Works on Amazon, Mothercare, Target, and 500+ more.',
  },

  // ── Graduation ─────────────────────────────────────────────────────────────
  {
    slug:        'graduation',
    dbKey:       'graduation',
    displayName: 'Graduation',
    emoji:       '🎓',
    accentColor: '#8B83F0',

    metaTitle:       'Graduation Gift List — Wishlist from Any Store | GiftHint',
    metaDescription: 'Create a graduation wishlist from Amazon, Apple, and any store. Share one link for zero duplicate gifts. Free forever.',
    h1:              'The Graduation Wish List for Gifts Worth Celebrating',
    heroSubline:     'You worked for years to get here. Now tell everyone exactly what you want — from your first MacBook to the luggage for your next adventure.',
    keywords: [
      'graduation gift list',
      'graduation wishlist',
      'graduation gift ideas',
      'graduation registry',
      'what to ask for as a graduation gift',
      'college graduation gifts',
      'university graduation gift ideas',
    ],
    saveStepCopy: 'Browse Apple, Amazon, Away, Lululemon — anywhere that sells what you actually want. Tap ♥ on each item to build your list.',

    sampleItems: [
      { emoji: '💻', title: 'MacBook Air 15-inch (M3)',   retailer: 'Apple',  price: '$1,299', tag: 'Most popular' },
      { emoji: '🧳', title: 'Away Carry-On Aluminium',    retailer: 'Away',   price: '$595' },
      { emoji: '📷', title: 'Sony ZV-E10 Mirrorless Camera', retailer: 'Sony', price: '$698' },
    ],

    faqs: [
      ...SHARED_FAQS,
      {
        question: 'Is it awkward to share a graduation wishlist?',
        answer:
          'Not at all — friends and family are actively looking for ideas. A wishlist makes it easy for them and means you get something you\'ll actually use. Think of it as doing them a favour.',
      },
    ],
    bottomCtaHeadline: 'Start your graduation list in 60 seconds.',
    bottomCtaSub:      'Free forever. Works on Apple, Amazon, and 500+ more stores.',
  },

  // ── Housewarming ───────────────────────────────────────────────────────────
  {
    slug:        'housewarming',
    dbKey:       'housewarming',
    displayName: 'Housewarming',
    emoji:       '🏠',
    accentColor: '#F5A94E',

    metaTitle:       'Housewarming Gift List — Wishlist from Any Store | GiftHint',
    metaDescription: 'Build a housewarming wish list from IKEA, Amazon, Wayfair, and more. Share one link so guests bring exactly what your new home needs.',
    h1:              'The Housewarming Wish List Your New Home Actually Needs',
    heroSubline:     'Skip the scented candles you already have. Save the items your new home actually needs — from IKEA, Amazon, Wayfair, and everywhere else.',
    keywords: [
      'housewarming gift list',
      'housewarming wishlist',
      'housewarming gift ideas',
      'housewarming registry',
      'what to put on a housewarming wish list',
      'new home gift list',
      'moving in gift ideas',
    ],
    saveStepCopy: 'Browse IKEA, Wayfair, Amazon, Made.com — save the kitchen gadgets, linens, and décor your new home actually needs.',

    sampleItems: [
      { emoji: '🫕', title: 'Instant Pot Duo 7-in-1 (8 qt)', retailer: 'Amazon',  price: '$99', tag: 'Top housewarming pick' },
      { emoji: '🌿', title: 'Dyson V15 Detect Cordless Vacuum', retailer: 'Dyson', price: '$749' },
      { emoji: '🍞', title: 'Smeg 2-Slice Toaster',             retailer: 'Smeg',  price: '$179' },
    ],

    faqs: [
      ...SHARED_FAQS,
      {
        question: 'When should I share a housewarming wish list?',
        answer:
          'Share it as soon as you know the housewarming date — even 2–3 weeks before gives guests enough time to order online and have gifts delivered. You can keep adding items right up until the party.',
      },
    ],
    bottomCtaHeadline: 'Start your housewarming list in 60 seconds.',
    bottomCtaSub:      'Free forever. Works on IKEA, Amazon, Wayfair, and 500+ stores.',
  },

  // ── Anniversary ────────────────────────────────────────────────────────────
  {
    slug:        'anniversary',
    dbKey:       'anniversary',
    displayName: 'Anniversary',
    emoji:       '🥂',
    accentColor: '#E872A0',

    metaTitle:       'Anniversary Gift List — Wishlist for Two | GiftHint',
    metaDescription: 'Create an anniversary wish list together. Save experiences, jewellery, and more from any store. Share one link with friends and family.',
    h1:              'The Anniversary Wish List Worth Celebrating',
    heroSubline:     'Build your anniversary list together — experiences, jewellery, or that luxury item you\'ve both been holding off on. One link for everyone.',
    keywords: [
      'anniversary gift list',
      'anniversary wishlist',
      'anniversary gift ideas',
      'anniversary registry',
      'anniversary gifts for couples',
      'what to ask for an anniversary gift',
    ],
    saveStepCopy: 'Browse Net-a-Porter, Not On The High Street, Experiences Direct — save the things you\'d love to do or own together.',

    sampleItems: [
      { emoji: '💎', title: 'Pandora Moments Charm Bracelet', retailer: 'Pandora',          price: '$295', tag: 'Perennial favourite' },
      { emoji: '🕯️', title: 'Diptyque Baies Candle (190g)',  retailer: 'Diptyque',          price: '$90' },
      { emoji: '🍾', title: 'Champagne Tasting Experience',   retailer: 'Virgin Experience', price: '$145' },
    ],

    faqs: [
      ...SHARED_FAQS,
      {
        question: 'Can we both add items to the same anniversary list?',
        answer:
          'Yes — create one list and install the extension on both devices. You\'ll both save to the same GiftHint account, building a combined list. Share the link with family so they know exactly what to get you both.',
      },
    ],
    bottomCtaHeadline: 'Start your anniversary list in 60 seconds.',
    bottomCtaSub:      'Free forever. Works on any store — from luxury retailers to Etsy artisans.',
  },
]

// ── Public API ────────────────────────────────────────────────────────────────

/** All valid URL slugs — use in generateStaticParams. */
export const OCCASION_SLUGS: OccasionSlug[] = CATALOGUE.map((o) => o.slug)

/** Map for O(1) lookups by slug. */
const BY_SLUG = new Map<OccasionSlug, OccasionSEO>(
  CATALOGUE.map((o) => [o.slug, o]),
)

/** Map for lookup by DB key (e.g. 'baby_shower'). */
const BY_DB_KEY = new Map<string, OccasionSEO>(
  CATALOGUE.map((o) => [o.dbKey, o]),
)

/**
 * Returns the SEO config for a URL slug, or null if not found.
 * @example getOccasionSEO('baby-shower')  // returns OccasionSEO
 */
export function getOccasionSEO(slug: string): OccasionSEO | null {
  return BY_SLUG.get(slug as OccasionSlug) ?? null
}

/**
 * Returns the SEO config for a DB key (underscore form), or null.
 * @example getOccasionSEOByDbKey('baby_shower')  // returns OccasionSEO
 */
export function getOccasionSEOByDbKey(dbKey: string): OccasionSEO | null {
  return BY_DB_KEY.get(dbKey) ?? null
}

/** The full catalogue — used by the hub page to render the occasion grid. */
export { CATALOGUE as OCCASION_CATALOGUE }
