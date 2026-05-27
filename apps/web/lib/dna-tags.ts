/**
 * lib/dna-tags.ts — GiftHint
 *
 * Mistake DNA tag library and utilities.
 *
 * DNA tags are structured preference tags (e.g. #NoSynthetics, #WiredOnly)
 * added by the wisher to guide gifters when the exact item is out of stock.
 * They encode *what to avoid or prefer* rather than describing the item itself.
 *
 * Exports:
 *   DNA_TAG_LIBRARY         — all tags, grouped by product category
 *   ALL_DNA_TAGS            — flat deduplicated list of every tag string
 *   suggestTagsForItem()    — category-aware tag suggestions for a saved item
 *   validateTag()           — single-tag validation (format + length)
 *   validateTags()          — validate an array, return { valid, invalid }
 *   searchTags()            — prefix / substring search for autocomplete
 *   getTagCategory()        — reverse-lookup: which category owns a tag?
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DnaTagCategory {
  /** Human-readable category label shown in the UI. */
  label:        string
  /** Emoji used next to the category label. */
  emoji:        string
  /** The tag strings in this category. Each must start with #. */
  tags:         string[]
  /**
   * Keywords used by suggestTagsForItem to detect this category from an
   * item title or retailer string. All matching is case-insensitive.
   */
  detectionTerms: string[]
}

// ── Tag library ───────────────────────────────────────────────────────────────

/**
 * The full DNA tag library, keyed by category identifier.
 * Order determines the display order in the UI.
 */
export const DNA_TAG_LIBRARY: Readonly<Record<string, DnaTagCategory>> = {

  clothing: {
    label: 'Clothing / Fashion',
    emoji: '👗',
    tags: [
      '#NoSynthetics',
      '#NoPink',
      '#NoLogoVisible',
      '#SizeUp',
      '#SizeDown',
      '#NaturalFabric',
      '#NoPatterns',
      '#DarkColours',
      '#LightColours',
      '#NoBranding',
    ],
    detectionTerms: [
      'shirt', 'tshirt', 't-shirt', 'dress', 'jacket', 'coat', 'hoodie',
      'sweater', 'jeans', 'pants', 'trousers', 'skirt', 'blouse', 'top',
      'vest', 'cardigan', 'jumper', 'pullover', 'shorts', 'leggings',
      'pyjama', 'pajama', 'underwear', 'socks', 'scarf', 'gloves', 'hat',
      'cap', 'beanie', 'clothing', 'apparel', 'fashion', 'outfit', 'wear',
      'fabric', 'cotton', 'linen', 'silk', 'wool', 'denim',
      'nordstrom', 'zara', 'h&m', 'gap', 'uniqlo', 'asos', 'primark',
    ],
  },

  electronics: {
    label: 'Electronics',
    emoji: '🔌',
    tags: [
      '#NoWhite',
      '#NoChrome',
      '#WiredOnly',
      '#WirelessOnly',
      '#NoBluetooth',
      '#NoApple',
      '#AndroidOnly',
      '#iOSOnly',
      '#NoTouchscreen',
      '#LongBatteryLife',
    ],
    detectionTerms: [
      'headphone', 'earphone', 'earbud', 'speaker', 'keyboard', 'mouse',
      'laptop', 'tablet', 'phone', 'charger', 'cable', 'monitor', 'screen',
      'camera', 'tv', 'television', 'gaming', 'controller', 'console',
      'watch', 'smartwatch', 'tracker', 'gadget', 'device', 'electronics',
      'wireless', 'bluetooth', 'usb', 'hdmi', 'audio', 'microphone', 'webcam',
      'apple', 'samsung', 'sony', 'bose', 'jabra', 'logitech', 'anker',
    ],
  },

  books: {
    label: 'Books',
    emoji: '📚',
    tags: [
      '#HardcoverOnly',
      '#PaperbackOK',
      '#NoDigital',
      '#FirstEdition',
      '#IllustratedEdition',
      '#LargePrint',
      '#AudiobookOK',
    ],
    detectionTerms: [
      'book', 'novel', 'memoir', 'biography', 'hardcover', 'paperback',
      'audiobook', 'ebook', 'edition', 'volume', 'series', 'fiction',
      'nonfiction', 'non-fiction', 'thriller', 'romance', 'mystery',
      'cookbook', 'textbook', 'anthology', 'poetry', 'graphic novel',
      'amazon books', 'bookshop', 'waterstones', 'barnes', 'noble',
    ],
  },

  beauty: {
    label: 'Beauty / Skincare',
    emoji: '✨',
    tags: [
      '#NoRetinol',
      '#FragranceFree',
      '#CrueltyFree',
      '#NoParabens',
      '#VeganFormula',
      '#SPFRequired',
      '#NoAlcohol',
      '#HypoallergenicOnly',
      '#NaturalIngredients',
    ],
    detectionTerms: [
      'skincare', 'moisturiser', 'moisturizer', 'serum', 'toner', 'cleanser',
      'sunscreen', 'spf', 'retinol', 'vitamin c', 'hyaluronic', 'makeup',
      'foundation', 'lipstick', 'mascara', 'eyeshadow', 'blush', 'concealer',
      'perfume', 'fragrance', 'cologne', 'lotion', 'cream', 'oil', 'balm',
      'shampoo', 'conditioner', 'mask', 'scrub', 'exfoliant', 'tanning',
      'sephora', 'ulta', 'lookfantastic', 'boots', 'superdrug', 'cerave',
      'the ordinary', 'la roche', 'neutrogena', 'olay', 'clinique',
    ],
  },

  shoes: {
    label: 'Shoes',
    emoji: '👟',
    tags: [
      '#NarrowFit',
      '#WideFit',
      '#NaturalSole',
      '#NoHeels',
      '#HeelsOnly',
      '#HalfSizeUp',
      '#HalfSizeDown',
      '#VeganLeather',
      '#NoLeather',
    ],
    detectionTerms: [
      'shoe', 'boot', 'sneaker', 'trainer', 'sandal', 'heel', 'flat',
      'loafer', 'mule', 'slipper', 'pump', 'oxford', 'derby', 'chelsea',
      'running shoe', 'walking shoe', 'hiking boot', 'ankle boot',
      'nike', 'adidas', 'new balance', 'vans', 'converse', 'reebok',
      'puma', 'skechers', 'birkenstock', 'ugg', 'dr martens', 'clarks',
    ],
  },

  home: {
    label: 'Home / Decor',
    emoji: '🏠',
    tags: [
      '#MinimalistStyle',
      '#NoBold',
      '#NeutralColours',
      '#VintageStyle',
      '#ModernOnly',
      '#NoPlastic',
      '#WoodOnly',
      '#HandmadePreferred',
      '#NoAssemblyRequired',
      '#EcoFriendly',
    ],
    detectionTerms: [
      'candle', 'vase', 'mug', 'cup', 'bowl', 'plate', 'lamp', 'light',
      'cushion', 'pillow', 'throw', 'blanket', 'rug', 'frame', 'print',
      'poster', 'plant', 'pot', 'organiser', 'organizer', 'shelf', 'storage',
      'towel', 'bedding', 'duvet', 'sheet', 'furniture', 'chair', 'table',
      'desk', 'sofa', 'couch', 'decor', 'decoration', 'ornament', 'figurine',
      'kitchen', 'bathroom', 'bedroom', 'living room', 'garden', 'outdoor',
      'ikea', 'west elm', 'made.com', 'anthropologie', 'pottery barn',
      'home depot', 'wayfair', 'dunelm', 'habitat', 'john lewis',
    ],
  },

  generic: {
    label: 'General',
    emoji: '🎁',
    tags: [
      '#GiftReceiptPlease',
      '#NoAssemblyRequired',
      '#EcoFriendly',
      '#MadeLocally',
      '#FairTrade',
      '#NoPlastic',
      '#RecycledMaterials',
      '#CompactSize',
      '#LargerSizePreferred',
    ],
    detectionTerms: [],   // generic — always available as suggestions
  },

} as const

// ── Derived collections ───────────────────────────────────────────────────────

/**
 * Flat, deduplicated list of every tag string in the library.
 * Tags that appear in multiple categories are deduplicated by insertion order.
 */
export const ALL_DNA_TAGS: readonly string[] = (() => {
  const seen = new Set<string>()
  const out:  string[] = []
  for (const category of Object.values(DNA_TAG_LIBRARY)) {
    for (const tag of category.tags) {
      if (!seen.has(tag)) {
        seen.add(tag)
        out.push(tag)
      }
    }
  }
  return out
})()

// ── Tag validation ────────────────────────────────────────────────────────────

/**
 * Validation rules:
 *   - Must start with `#`
 *   - After `#`, only letters and digits (no spaces, underscores, or punctuation)
 *   - Total length (including `#`) between 2 and 20 characters
 *
 * Valid:   #NoSynthetics  #WiredOnly  #EcoFriendly
 * Invalid: NoSynthetics   #No Syn     #TooLongTagNameThatExceedsLimit
 */
export function validateTag(tag: string): boolean {
  if (typeof tag !== 'string') return false
  return /^#[A-Za-z0-9]{1,19}$/.test(tag)
}

/**
 * Validates an array of tags.
 * Returns { valid: string[], invalid: string[] }.
 */
export function validateTags(tags: string[]): { valid: string[]; invalid: string[] } {
  const valid:   string[] = []
  const invalid: string[] = []
  for (const tag of tags) {
    if (validateTag(tag)) valid.push(tag)
    else                   invalid.push(tag)
  }
  return { valid, invalid }
}

// ── Category detection ────────────────────────────────────────────────────────

/**
 * Detects product categories from an item title and retailer string.
 * Returns an ordered list of category keys, most confident first.
 * Always includes 'generic' as the last entry so generic tags are always shown.
 */
export function detectCategories(title: string, retailer: string): string[] {
  const haystack = `${title} ${retailer}`.toLowerCase()
  const matches:  Array<{ key: string; score: number }> = []

  for (const [key, category] of Object.entries(DNA_TAG_LIBRARY)) {
    if (key === 'generic') continue

    let score = 0
    for (const term of category.detectionTerms) {
      if (haystack.includes(term)) {
        // Longer, more specific terms score higher
        score += term.length
      }
    }

    if (score > 0) {
      matches.push({ key, score })
    }
  }

  matches.sort((a, b) => b.score - a.score)
  const keys = matches.map((m) => m.key)

  // Generic tags are always relevant — append at the end
  if (!keys.includes('generic')) keys.push('generic')

  return keys
}

/**
 * Returns suggested DNA tags for an item based on its title and retailer.
 *
 * Strategy:
 *   1. Detect product categories from title + retailer substrings.
 *   2. Return tags from the top two matching categories, plus generic tags.
 *   3. Deduplicate across categories.
 *   4. Cap at 12 suggestions so the UI doesn't overflow.
 *
 * Returns an empty array when called with empty strings.
 */
export function suggestTagsForItem(title: string, retailer: string): string[] {
  if (!title && !retailer) return []

  const categories = detectCategories(title, retailer)
  const seen        = new Set<string>()
  const suggestions: string[] = []

  // Take from the top two specific categories + generic (max 3 total sources)
  const sources = categories.slice(0, 2)
  if (!sources.includes('generic')) sources.push('generic')

  for (const key of sources) {
    const category = DNA_TAG_LIBRARY[key]
    if (!category) continue
    for (const tag of category.tags) {
      if (!seen.has(tag) && suggestions.length < 12) {
        seen.add(tag)
        suggestions.push(tag)
      }
    }
  }

  return suggestions
}

// ── Autocomplete search ───────────────────────────────────────────────────────

/**
 * Returns tags matching the given query for autocomplete.
 *
 * The query is matched case-insensitively against the tag text (without `#`).
 * Prefix matches are ranked higher than substring matches.
 *
 * Example:
 *   searchTags('no')  → ['#NoBluetooth', '#NoChrome', '#NoHeels', …]
 *   searchTags('eco') → ['#EcoFriendly']
 *
 * @param query     Raw user input (with or without leading `#`)
 * @param maxResults Maximum number of results to return (default 8)
 */
export function searchTags(query: string, maxResults = 8): string[] {
  const q = query.replace(/^#/, '').toLowerCase().trim()
  if (!q) return ALL_DNA_TAGS.slice(0, maxResults) as string[]

  const prefixMatches:    string[] = []
  const substringMatches: string[] = []

  for (const tag of ALL_DNA_TAGS) {
    const body = tag.slice(1).toLowerCase()   // tag without leading '#'
    if (body.startsWith(q))       prefixMatches.push(tag)
    else if (body.includes(q))    substringMatches.push(tag)
  }

  return [...prefixMatches, ...substringMatches].slice(0, maxResults)
}

// ── Reverse lookup ────────────────────────────────────────────────────────────

/**
 * Returns the category key that owns the given tag, or null if not found.
 * Useful for rendering the category label next to a tag in the UI.
 *
 * Example:
 *   getTagCategory('#NoSynthetics') → 'clothing'
 *   getTagCategory('#Unknown')      → null
 */
export function getTagCategory(tag: string): string | null {
  for (const [key, category] of Object.entries(DNA_TAG_LIBRARY)) {
    if ((category.tags as readonly string[]).includes(tag)) return key
  }
  return null
}

// ── Tag tooltips ──────────────────────────────────────────────────────────────

/**
 * Gifter-facing tooltip for each DNA tag.
 *
 * These are shown as hover tooltips on tag pills on the gifter page, giving
 * non-wisher visitors plain-English context for what each tag means.
 *
 * Tone: helpful and specific, written from the wisher's point of view.
 * Max ~80 characters so the tooltip stays compact on mobile.
 */
export const DNA_TAG_TOOLTIPS: Readonly<Record<string, string>> = {

  // ── Clothing / Fashion ─────────────────────────────────────────────────────
  '#NoSynthetics':       'Please avoid synthetic fabrics like polyester or nylon',
  '#NoPink':             'Please avoid pink colourways',
  '#NoLogoVisible':      'No large logos or brand marks on the outside',
  '#SizeUp':             'This person usually sizes up — order one size larger than normal',
  '#SizeDown':           'This person usually sizes down — order one size smaller than normal',
  '#NaturalFabric':      'Look for cotton, linen, wool, or silk — not synthetic blends',
  '#NoPatterns':         'Solid colours only — no prints, stripes, or patterns',
  '#DarkColours':        'Dark tones preferred — navy, charcoal, black, forest green',
  '#LightColours':       'Light tones preferred — white, cream, ivory, or soft pastels',
  '#NoBranding':         'No visible brand logos or labels on the outside',

  // ── Electronics ───────────────────────────────────────────────────────────
  '#NoWhite':            'Please avoid white colourways — any other colour is fine',
  '#NoChrome':           'Please avoid chrome or silver finishes',
  '#WiredOnly':          'Must be wired — no wireless or Bluetooth version',
  '#WirelessOnly':       'Must be wireless — no wired version needed',
  '#NoBluetooth':        'Bluetooth is not wanted — look for a wired or USB connection',
  '#NoApple':            'Not an Apple product please — any other brand is welcome',
  '#AndroidOnly':        'Must be compatible with Android phones',
  '#iOSOnly':            'Must be compatible with iPhone / iOS',
  '#NoTouchscreen':      'No touchscreen — physical buttons or dials preferred',
  '#LongBatteryLife':    'Battery life is a priority — look for 20 + hour claims',

  // ── Books ──────────────────────────────────────────────────────────────────
  '#HardcoverOnly':      'Hardcover edition only — not paperback or digital',
  '#PaperbackOK':        'Paperback edition is perfectly fine',
  '#NoDigital':          'Physical copy only — no e-books or digital download codes',
  '#FirstEdition':       'First edition or first printing preferred if available',
  '#IllustratedEdition': 'The illustrated edition specifically — check the cover',
  '#LargePrint':         'Large print edition — important for comfortable reading',
  '#AudiobookOK':        'An audiobook version is also very welcome',

  // ── Beauty / Skincare ──────────────────────────────────────────────────────
  '#NoRetinol':          'No retinol or retinoid ingredients — sensitive skin',
  '#FragranceFree':      'Must be fragrance-free — no added scents or perfumes',
  '#CrueltyFree':        'Must be cruelty-free and not tested on animals',
  '#NoParabens':         'No parabens in the formula — check the ingredients list',
  '#VeganFormula':       'Vegan formula — no animal-derived ingredients',
  '#SPFRequired':        'Must include SPF sun protection',
  '#NoAlcohol':          'No alcohol in the formula — it can be drying',
  '#HypoallergenicOnly': 'Hypoallergenic formula — for sensitive or reactive skin',
  '#NaturalIngredients': 'Natural or clean ingredients preferred',

  // ── Shoes ──────────────────────────────────────────────────────────────────
  '#NarrowFit':          'Narrow / slim fit — this person has a narrower foot than average',
  '#WideFit':            'Wide fit — extra width is needed for comfort',
  '#NaturalSole':        'Natural sole material preferred — leather or natural rubber',
  '#NoHeels':            'Flat shoes only — no heels at all please',
  '#HeelsOnly':          'Heeled shoes only — flats or trainers are not wanted',
  '#HalfSizeUp':         'Go half a size up — this person sizes up in shoes',
  '#HalfSizeDown':       'Go half a size down — this person sizes down in shoes',
  '#VeganLeather':       'Vegan leather or synthetic material — no real animal leather',
  '#NoLeather':          'No leather at all — including trim, lining, or insole',

  // ── Home / Decor ──────────────────────────────────────────────────────────
  '#MinimalistStyle':    'Minimalist aesthetic — clean lines, neutral palette, no fuss',
  '#NoBold':             'Nothing bold, loud, or maximalist in colour or pattern',
  '#NeutralColours':     'Neutral colour palette — whites, greys, beige, black, natural',
  '#VintageStyle':       'Vintage or retro aesthetic preferred',
  '#ModernOnly':         'Contemporary or modern design — not retro or vintage',
  '#NoPlastic':          'No plastic — wood, metal, ceramic, or fabric preferred',
  '#WoodOnly':           'Wood material strongly preferred',
  '#HandmadePreferred':  'Handmade or artisan-crafted preferred over mass-produced',

  // ── Generic ────────────────────────────────────────────────────────────────
  '#GiftReceiptPlease':   'Please include a gift receipt so they can exchange if needed',
  '#NoAssemblyRequired':  'Ready to use straight away — no self-assembly needed',
  '#EcoFriendly':         'Eco-friendly product and / or packaging preferred',
  '#MadeLocally':         'Locally made or sourced preferred',
  '#FairTrade':           'Fair trade certified preferred',
  '#RecycledMaterials':   'Made from recycled or upcycled materials',
  '#CompactSize':         'Compact size preferred — space in the home is limited',
  '#LargerSizePreferred': 'Larger size preferred — they have the room for it',
}
