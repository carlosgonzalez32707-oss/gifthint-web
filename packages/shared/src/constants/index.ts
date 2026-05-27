/**
 * packages/shared/src/constants/index.ts — @gifthint/shared
 *
 * Pure-data constants shared between web, mobile, and any future surfaces.
 * No server-only imports — safe to bundle anywhere.
 */

import type { OccasionType } from '../types/index.js'

// ── Occasion catalogue ────────────────────────────────────────────────────────

/**
 * Ordered list of all supported occasions.
 * The order controls dropdown and picker display order on all platforms.
 */
export const OCCASION_TYPES: OccasionType[] = [
  {
    key:          'birthday',
    label:        'Birthday',
    emoji:        '🎂',
    dateGuidance: 'Enter the birthday date so we can send reminders.',
  },
  {
    key:          'christmas',
    label:        'Christmas',
    emoji:        '🎄',
    dateGuidance: 'Usually December 25 — enter the year too.',
  },
  {
    key:          'wedding',
    label:        'Wedding',
    emoji:        '💍',
    dateGuidance: 'Enter the wedding date for your guests.',
  },
  {
    key:          'baby_shower',
    label:        'Baby Shower',
    emoji:        '🍼',
    dateGuidance: 'Enter the shower date or expected due date.',
  },
  {
    key:          'graduation',
    label:        'Graduation',
    emoji:        '🎓',
    dateGuidance: 'Enter the graduation ceremony date.',
  },
  {
    key:          'housewarming',
    label:        'Housewarming',
    emoji:        '🏠',
    dateGuidance: 'Enter the party date if you have one planned.',
  },
  {
    key:          'anniversary',
    label:        'Anniversary',
    emoji:        '🥂',
    dateGuidance: 'Enter the anniversary date for reminder emails.',
  },
  {
    key:          'other',
    label:        'Other',
    emoji:        '🎁',
    dateGuidance: 'Enter a date if you want reminder emails sent.',
  },
]

// ── DNA tag library ───────────────────────────────────────────────────────────

export interface DnaTagCategory {
  label:          string
  emoji:          string
  tags:           string[]
  detectionTerms: string[]
}

/**
 * Full DNA tag library, keyed by category identifier.
 * Preference tags that guide gifters when the exact item is out of stock.
 */
export const DNA_TAG_LIBRARY: Readonly<Record<string, DnaTagCategory>> = {
  clothing: {
    label: 'Clothing / Fashion',
    emoji: '👗',
    tags: [
      '#NoSynthetics', '#NoPink', '#NoLogoVisible', '#SizeUp', '#SizeDown',
      '#NaturalFabric', '#NoPatterns', '#DarkColours', '#LightColours', '#NoBranding',
    ],
    detectionTerms: [
      'shirt', 'tshirt', 't-shirt', 'dress', 'jacket', 'coat', 'hoodie',
      'jeans', 'pants', 'trousers', 'skirt', 'blouse', 'sweater', 'cardigan',
      'clothing', 'fashion', 'apparel', 'wear', 'outfit',
    ],
  },
  footwear: {
    label: 'Footwear',
    emoji: '👟',
    tags: [
      '#WideWidth', '#NarrowWidth', '#NoHighHeels', '#FlatOnly',
      '#NoSynthetics', '#WaterResistant', '#NoAnkleBoots',
    ],
    detectionTerms: [
      'shoes', 'sneakers', 'boots', 'sandals', 'heels', 'flats',
      'loafers', 'trainers', 'footwear', 'slippers',
    ],
  },
  tech: {
    label: 'Tech / Electronics',
    emoji: '💻',
    tags: [
      '#WiredOnly', '#NoSubscription', '#AndroidNotIOS', '#IOSNotAndroid',
      '#NoSmartFeatures', '#PrivacyFirst',
    ],
    detectionTerms: [
      'phone', 'laptop', 'tablet', 'headphones', 'earbuds', 'speaker',
      'keyboard', 'mouse', 'monitor', 'camera', 'tech', 'electronic',
      'gadget', 'device', 'smart', 'wireless',
    ],
  },
  beauty: {
    label: 'Beauty / Skincare',
    emoji: '💄',
    tags: [
      '#FragranceFree', '#VeganOnly', '#CrueltyFree', '#NoParabens',
      '#NoPerfume', '#SensitiveSkin', '#NoRetinol',
    ],
    detectionTerms: [
      'skincare', 'moisturizer', 'serum', 'foundation', 'lipstick',
      'mascara', 'eyeshadow', 'perfume', 'fragrance', 'beauty', 'makeup',
      'cosmetic', 'cleanser', 'toner', 'sunscreen',
    ],
  },
  home: {
    label: 'Home & Living',
    emoji: '🏠',
    tags: [
      '#NeutralColours', '#NoPlastic', '#MinimalistStyle',
      '#FlatPackOK', '#Handmade', '#Sustainable',
    ],
    detectionTerms: [
      'candle', 'cushion', 'throw', 'blanket', 'vase', 'lamp', 'rug',
      'frame', 'decor', 'furniture', 'kitchen', 'bedding', 'towel',
      'storage', 'organiser', 'home',
    ],
  },
  books: {
    label: 'Books',
    emoji: '📚',
    tags: [
      '#HardcoverOnly', '#PaperbackOK', '#NonfictionOnly',
      '#FictionOnly', '#NoSeries', '#SeriesOK',
    ],
    detectionTerms: [
      'book', 'novel', 'hardcover', 'paperback', 'memoir',
      'biography', 'fiction', 'nonfiction', 'reading',
    ],
  },
  generic: {
    label: 'General Preferences',
    emoji: '🎁',
    tags: [
      '#GiftReceiptPlease', '#GiftWrapPlease', '#NoEdibleGifts',
      '#EcoFriendly', '#MadeInUSA', '#MadeInUK', '#PreferLocal',
    ],
    detectionTerms: [],
  },
}

// ── Skimlinks eligible retailers ──────────────────────────────────────────────

/**
 * Retailer domains covered by Skimlinks affiliate commissions.
 * Bare lowercase domains (no www.) — match with hostname.replace(/^www\./, '').toLowerCase()
 */
export const SKIMLINKS_ELIGIBLE_RETAILERS: readonly string[] = [
  // Fashion & Apparel
  'asos.com', 'zara.com', 'hm.com', 'uniqlo.com', 'nordstrom.com',
  'macys.com', 'bloomingdales.com', 'saksfifthavenue.com',
  'anthropologie.com', 'freepeople.com', 'urbanoutfitters.com',
  'net-a-porter.com', 'farfetch.com', 'revolve.com', 'shopbop.com',
  'lululemon.com', 'gap.com', 'banana-republic.com', 'jcrew.com',
  'abercrombie.com', 'forever21.com', 'express.com', 'ae.com',

  // Beauty
  'sephora.com', 'ulta.com', 'cultbeauty.co.uk', 'feelunique.com',
  'spacenk.com', 'lookfantastic.com',

  // Home & Living
  'wayfair.com', 'cb2.com', 'crateandbarrel.com', 'potterybarn.com',
  'westelm.com', 'ikea.com', 'anthropologie.com', 'zgallerie.com',
  'worldmarket.com', 'homedepot.com',

  // Books & Media
  'bookshop.org', 'barnesandnoble.com', 'waterstones.com', 'chapters.indigo.ca',

  // Electronics
  'bestbuy.com', 'bhphotovideo.com', 'adorama.com', 'newegg.com',

  // Sports & Outdoors
  'rei.com', 'dickssportinggoods.com', 'backcountry.com', 'patagonia.com',
  'thenorthface.com', 'columbia.com',

  // Pet
  'chewy.com', 'petco.com', 'petsmart.com',

  // General
  'etsy.com', 'ebay.com', 'overstock.com', 'zappos.com',
]

// ── Reward tiers ──────────────────────────────────────────────────────────────

export type PremiumTier = 'free' | 'plus' | 'pro'

export interface RewardTier {
  minReferrals: number
  label:        string
  description:  string
  badge:        string
}

/**
 * Referral milestone → feature unlock ladder.
 * Ordered by minReferrals ascending.
 */
export const REWARD_TIERS: RewardTier[] = [
  {
    minReferrals: 1,
    label:       'Custom username',
    description: 'Use gifthint.io/list/yourname instead of a random ID',
    badge:       '✏️',
  },
  {
    minReferrals: 3,
    label:       'Premium themes',
    description: 'Unlock midnight, cloud, forest, rose, and slate themes',
    badge:       '🎨',
  },
  {
    minReferrals: 5,
    label:       'Priority support',
    description: 'Get a priority support badge and faster response times',
    badge:       '⚡',
  },
  {
    minReferrals: 10,
    label:       'Pro',
    description: 'Pro badge + verified checkmark on your gifter page',
    badge:       '✅',
  },
]
