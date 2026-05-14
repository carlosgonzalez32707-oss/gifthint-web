/**
 * lib/amazon-categories.ts — GiftHint
 *
 * Amazon Associates fee schedule and category detection.
 *
 * IMPORT RULE: Server-side only. Never import in 'use client' components.
 *
 * Commission rates source: Amazon Associates Program advertising fee schedule
 * https://affiliate-program.amazon.com/help/node/topic/GRXPHT8U84RAYDXZ
 *
 * Last verified: May 2026. Amazon updates rates 1-2× per year — see
 * docs/commission-rates-guide.md for how to update when that happens.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Fee schedule
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Amazon Associates advertising fee rates by product category.
 * Stored as decimals (0.10 = 10%) for direct multiplication with price.
 *
 * Categories follow the official Amazon Associates naming convention.
 * When Amazon renames a category, update both the key here and the
 * corresponding entry in CATEGORY_URL_PATTERNS / CATEGORY_TITLE_KEYWORDS.
 */
export const AMAZON_COMMISSION_RATES: Readonly<Record<string, number>> = {
  // ── Highest earners ────────────────────────────────────────────────────────
  'Luxury Beauty':                    0.10,   // 10 %
  'Amazon Explore':                   0.10,   // 10 %

  // ── Strong mid-tier ───────────────────────────────────────────────────────
  'Headphones':                       0.06,   //  6 %
  'Musical Instruments':              0.06,   //  6 %
  'Business & Industrial Supplies':   0.06,   //  6 %

  // ── Solid performers ──────────────────────────────────────────────────────
  'Books':                            0.045,  //  4.5 %
  'Kitchen':                          0.045,  //  4.5 %
  'Automotive':                       0.045,  //  4.5 %

  // ── Standard tier ─────────────────────────────────────────────────────────
  'Amazon Fashion':                   0.04,   //  4 %
  'Jewelry':                          0.04,   //  4 %
  'All Other Categories':             0.04,   //  4 % (Associates default)

  // ── Lower performers ──────────────────────────────────────────────────────
  'Furniture':                        0.03,   //  3 %
  'Home':                             0.03,   //  3 %
  'Home Improvement':                 0.03,   //  3 %
  'Lawn & Garden':                    0.03,   //  3 %
  'Pet Products':                     0.03,   //  3 %
  'Toys & Games':                     0.03,   //  3 %
  'Sports & Outdoors':                0.03,   //  3 %
  'Baby Products':                    0.03,   //  3 %
  'Camera & Photo':                   0.03,   //  3 %
  'Handmade':                         0.03,   //  3 %

  // ── Low earners ───────────────────────────────────────────────────────────
  'Music':                            0.025,  //  2.5 %
  'DVD & Blu-Ray':                    0.025,  //  2.5 %
  'Software':                         0.025,  //  2.5 %
  'PC':                               0.025,  //  2.5 %

  // ── Lowest / near-zero ────────────────────────────────────────────────────
  'Electronics':                      0.01,   //  1 % (cut from 2.5% in Apr 2020)
  'Health & Personal Care':           0.01,   //  1 % (cut from 4.5% in Apr 2020)
  'Grocery':                          0.01,   //  1 %
  'Cell Phones':                      0.01,   //  1 %

  // ── Zero commission — avoid these in marketing ────────────────────────────
  'Video Games':                      0.00,   //  0 %
  'Gift Cards':                       0.00,   //  0 %
}

// ─────────────────────────────────────────────────────────────────────────────
// URL-based category detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Patterns matched against the Amazon URL path (lowercased) before the /dp/
 * segment. Amazon breadcrumb paths look like:
 *   /Luxury-Beauty/dp/B08XYZ
 *   /Electronics/dp/B0ABCDEF
 *   /Clothing-Shoes-Jewelry/dp/...
 *
 * Entries are checked in order — put narrower patterns before broader ones.
 */
const CATEGORY_URL_PATTERNS: ReadonlyArray<readonly [pattern: RegExp, category: string]> = [
  [/luxury.?beauty/i,                         'Luxury Beauty'],
  [/musical.?instrument/i,                    'Musical Instruments'],
  [/headphone|earphone|earbud/i,              'Headphones'],
  [/automotive|car.?accessory/i,              'Automotive'],
  [/lawn.?garden|outdoor.?living|patio/i,     'Lawn & Garden'],
  [/home.?improvement|tools.?home/i,          'Home Improvement'],
  [/furniture|office.?product/i,              'Furniture'],
  [/kitchen|dining/i,                         'Kitchen'],
  [/clothing|shoes|jewelry|fashion|apparel/i, 'Amazon Fashion'],
  [/jewelry|watches/i,                        'Jewelry'],
  [/sports.?outdoor|exercise|fitness/i,       'Sports & Outdoors'],
  [/toys.?games|kids.?toy/i,                  'Toys & Games'],
  [/baby/i,                                   'Baby Products'],
  [/pet.?suppli|dog|cat.?suppli/i,            'Pet Products'],
  [/beauty|personal.?care|skin.?care/i,       'Health & Personal Care'],
  [/grocery|gourmet.?food/i,                  'Grocery'],
  [/book|textbook|literature/i,               'Books'],
  [/music|vinyl|cd.?store/i,                  'Music'],
  [/dvd|blu.?ray|video/i,                     'DVD & Blu-Ray'],
  [/camera.?photo|photography/i,              'Camera & Photo'],
  [/software/i,                               'Software'],
  [/video.?game|console|gaming/i,             'Video Games'],
  [/cell.?phone|mobile.?phone|unlock/i,       'Cell Phones'],
  [/electronics|computer|laptop|tablet/i,     'Electronics'],
  [/home.?garden|home.?kitchen/i,             'Home'],
  [/handmade/i,                               'Handmade'],
  [/gift.?card/i,                             'Gift Cards'],
  [/industrial.?scientific|business/i,        'Business & Industrial Supplies'],
]

// ─────────────────────────────────────────────────────────────────────────────
// Title keyword-based category detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Keyword arrays matched against the product title (lowercased, word-boundary).
 * Checked after URL patterns fail. Entries are ordered by commission rate
 * (highest first) so the most valuable match wins in ambiguous cases.
 */
const CATEGORY_TITLE_KEYWORDS: ReadonlyArray<readonly [keywords: readonly string[], category: string]> = [
  // 10 % — Luxury Beauty
  [
    ['luxury', 'la mer', 'la prairie', 'sisley', 'tatcha', 'sk-ii', 'sk ii',
     'charlotte tilbury', 'sulwhasoo', 'dior beauty', 'chanel beauty',
     'ysl beauty', 'guerlain', 'lancome', 'givenchy beauty'],
    'Luxury Beauty',
  ],

  // 6 % — Headphones
  [
    ['headphone', 'earphone', 'earbud', 'airpod', 'over-ear', 'on-ear',
     'noise cancelling', 'noise-cancelling', 'anc headphone', 'bose qc',
     'sony wh', 'sony wf', 'jabra'],
    'Headphones',
  ],

  // 6 % — Musical Instruments
  [
    ['guitar', 'piano', 'keyboard instrument', 'drum', 'violin', 'ukulele',
     'bass guitar', 'acoustic guitar', 'electric guitar', 'synthesizer',
     'midi controller', 'microphone', 'audio interface', 'capo', 'guitar pick'],
    'Musical Instruments',
  ],

  // 6 % — Business & Industrial
  [
    ['industrial', 'commercial grade', 'business supply', 'label maker',
     'laminator', 'binding machine', 'office shredder'],
    'Business & Industrial Supplies',
  ],

  // 4.5 % — Books
  [
    ['book', 'hardcover', 'paperback', 'novel', 'memoir', 'biography',
     'cookbook', 'textbook', 'workbook', 'journal', 'planner', 'diary'],
    'Books',
  ],

  // 4.5 % — Kitchen
  [
    ['cookware', 'bakeware', 'skillet', 'frying pan', 'saucepan', 'dutch oven',
     'stand mixer', 'blender', 'food processor', 'air fryer', 'instant pot',
     'pressure cooker', 'coffee maker', 'espresso machine', 'toaster',
     'knife set', 'cutting board', 'spatula', 'colander', 'wok',
     'kitchen appliance', 'sous vide', 'mandoline'],
    'Kitchen',
  ],

  // 4.5 % — Automotive
  [
    ['car accessory', 'car cover', 'car seat', 'floor mat', 'dash cam',
     'jump starter', 'tire inflator', 'auto part', 'motor oil', 'car charger',
     'car mount', 'gps mount', 'trunk organizer', 'windshield'],
    'Automotive',
  ],

  // 4 % — Fashion
  [
    ['dress', 'blouse', 'jeans', 't-shirt', 'tshirt', 'sweater', 'hoodie',
     'jacket', 'coat', 'blazer', 'shorts', 'leggings', 'skirt', 'pant',
     'swimsuit', 'bikini', 'underwear', 'bra', 'sock', 'tights',
     'sneaker', 'boot', 'sandal', 'loafer', 'heel', 'oxford shoe',
     'handbag', 'purse', 'tote bag', 'backpack fashion', 'wallet',
     'belt', 'scarf', 'hat', 'cap', 'beanie', 'glove', 'sunglasses',
     'watch fashion', 'luggage', 'suitcase', 'travel bag'],
    'Amazon Fashion',
  ],

  // 4 % — Jewelry
  [
    ['necklace', 'bracelet', 'earring', 'ring', 'pendant', 'anklet',
     'brooch', 'cufflink', 'jewelry', 'jewellery', 'diamond', 'gemstone',
     'gold chain', 'silver chain', 'pearl', 'birthstone'],
    'Jewelry',
  ],

  // 3 % — Furniture
  [
    ['sofa', 'couch', 'sectional', 'loveseat', 'ottoman', 'recliner',
     'bed frame', 'headboard', 'dresser', 'nightstand', 'wardrobe',
     'bookcase', 'bookshelf', 'desk', 'chair', 'dining table', 'coffee table',
     'side table', 'console table', 'tv stand', 'entertainment center',
     'shelving unit', 'cabinet', 'armchair'],
    'Furniture',
  ],

  // 3 % — Home
  [
    ['bedding', 'comforter', 'duvet', 'sheet set', 'pillow', 'blanket',
     'throw blanket', 'curtain', 'blind', 'rug', 'area rug', 'bath towel',
     'shower curtain', 'laundry basket', 'storage bin', 'organizer',
     'picture frame', 'wall art', 'candle', 'diffuser', 'lamp', 'light fixture',
     'mirror', 'clock', 'vase', 'planter', 'trash can', 'hamper'],
    'Home',
  ],

  // 3 % — Home Improvement
  [
    ['power tool', 'drill', 'saw', 'sander', 'paint brush', 'roller',
     'caulk', 'caulking', 'plumbing', 'faucet', 'showerhead', 'toilet',
     'light switch', 'outlet', 'extension cord', 'smoke detector',
     'ladder', 'level', 'tape measure', 'wrench', 'screwdriver set',
     'hammer', 'nail', 'screw', 'anchor', 'insulation', 'weather strip'],
    'Home Improvement',
  ],

  // 3 % — Lawn & Garden
  [
    ['lawn mower', 'garden hose', 'sprinkler', 'rake', 'shovel', 'trowel',
     'pruner', 'hedge trimmer', 'leaf blower', 'weed killer', 'fertilizer',
     'potting soil', 'raised bed', 'planter box', 'bird feeder', 'bird bath'],
    'Lawn & Garden',
  ],

  // 3 % — Pet Products
  [
    ['dog', 'cat', 'pet', 'puppy', 'kitten', 'aquarium', 'fish tank',
     'bird cage', 'hamster', 'reptile', 'leash', 'collar', 'harness',
     'dog bed', 'cat tree', 'litter box', 'pet food', 'dog treat'],
    'Pet Products',
  ],

  // 3 % — Sports & Outdoors
  [
    ['yoga mat', 'dumbbell', 'kettlebell', 'resistance band', 'foam roller',
     'treadmill', 'exercise bike', 'rowing machine', 'pull up bar',
     'camping', 'tent', 'sleeping bag', 'hiking', 'backpack outdoor',
     'water bottle', 'hydration pack', 'bicycle', 'bike helmet',
     'fishing', 'hunting', 'climbing', 'ski', 'snowboard',
     'golf', 'tennis racket', 'basketball', 'football', 'soccer ball',
     'swimming goggle', 'wetsuit'],
    'Sports & Outdoors',
  ],

  // 3 % — Toys & Games
  [
    ['lego', 'toy', 'doll', 'action figure', 'puzzle', 'board game',
     'card game', 'playset', 'stuffed animal', 'plush', 'remote control car',
     'rc car', 'train set', 'building block', 'arts and crafts', 'playdough',
     'slime', 'fidget'],
    'Toys & Games',
  ],

  // 3 % — Baby Products
  [
    ['baby', 'infant', 'toddler', 'diaper', 'stroller', 'car seat',
     'baby monitor', 'baby carrier', 'crib', 'bassinet', 'high chair',
     'nursing', 'breast pump', 'baby bottle', 'pacifier', 'teether'],
    'Baby Products',
  ],

  // 3 % — Camera & Photo
  [
    ['dslr', 'mirrorless camera', 'camera lens', 'tripod', 'camera bag',
     'memory card', 'sd card', 'gopro', 'action camera', 'drone',
     'camera flash', 'neutral density filter', 'nd filter', 'camera strap'],
    'Camera & Photo',
  ],

  // 3 % — Handmade
  [
    ['handmade', 'hand-crafted', 'artisan', 'hand-poured', 'hand-knitted',
     'hand-stitched', 'hand-painted'],
    'Handmade',
  ],

  // 2.5 % — Music
  [
    ['vinyl record', 'record album', 'cd album', 'music cd', 'turntable',
     'record player', 'phono'],
    'Music',
  ],

  // 2.5 % — DVD & Blu-Ray
  [
    ['blu-ray', 'bluray', 'dvd', '4k uhd', 'movie disc', 'film collection'],
    'DVD & Blu-Ray',
  ],

  // 2.5 % — Software
  [
    ['software', 'antivirus', 'vpn subscription', 'microsoft office',
     'adobe creative', 'norton', 'mcafee', 'quickbooks'],
    'Software',
  ],

  // 2.5 % — PC
  [
    ['laptop', 'desktop computer', 'pc tower', 'gaming pc', 'workstation',
     'chromebook', 'all-in-one computer', 'monitor', 'keyboard', 'mouse',
     'mousepad', 'webcam', 'usb hub', 'hard drive', 'ssd', 'ram', 'gpu',
     'cpu', 'processor', 'motherboard', 'computer case'],
    'PC',
  ],

  // 1 % — Health & Personal Care (check AFTER luxury beauty keywords)
  [
    ['serum', 'moisturizer', 'sunscreen', 'face wash', 'shampoo', 'conditioner',
     'body lotion', 'deodorant', 'toothbrush', 'toothpaste', 'razor',
     'nail polish', 'mascara', 'foundation', 'concealer', 'lipstick',
     'perfume', 'cologne', 'supplement', 'vitamin', 'protein powder',
     'blood pressure', 'thermometer', 'first aid', 'bandage', 'heating pad'],
    'Health & Personal Care',
  ],

  // 1 % — Grocery
  [
    ['coffee bean', 'tea bag', 'protein bar', 'snack', 'chocolate',
     'olive oil', 'hot sauce', 'pasta', 'cereal', 'granola', 'nut butter',
     'candy', 'gummy', 'popcorn'],
    'Grocery',
  ],

  // 1 % — Electronics (broad fallback; intentionally after all narrower categories)
  [
    ['smart home', 'smart speaker', 'alexa', 'echo dot', 'fire tv',
     'streaming stick', 'tablet', 'ipad', 'e-reader', 'kindle',
     'portable charger', 'power bank', 'wireless charger', 'cable',
     'adapter', 'speaker', 'soundbar', 'projector', 'printer', 'scanner',
     'router', 'mesh wifi', 'smart bulb', 'smart plug', 'security camera',
     'video doorbell', 'robot vacuum', 'air purifier', 'humidifier',
     'electric fan', 'space heater'],
    'Electronics',
  ],

  // 0 % — Video Games (zero commission — keep last so everything else matches first)
  [
    ['video game', 'ps5', 'ps4', 'playstation', 'xbox', 'nintendo switch',
     'game controller', 'gaming headset', 'gaming chair', 'gaming desk',
     'steam deck'],
    'Video Games',
  ],

  // 0 % — Gift Cards (always zero)
  [
    ['gift card', 'amazon gift card', 'e-gift card'],
    'Gift Cards',
  ],
]

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Infers the Amazon product category from the item's title and URL.
 *
 * Detection priority:
 *  1. URL path segment before /dp/ (e.g. "/Headphones/dp/...")
 *  2. Title keyword matching (checked in commission-rate order, highest first)
 *  3. Falls back to 'All Other Categories' (4%)
 *
 * The function is intentionally lenient — a false-positive in a high-commission
 * category is worse for trust than under-counting, so ambiguous items fall
 * back to the 4% "All Other" rate rather than being promoted.
 *
 * @param title  Product title string (from the wishlist item).
 * @param url    Original Amazon product URL (source_url from the DB).
 */
export function detectAmazonCategory(title: string, url: string): string {
  // ── 1. URL path detection ─────────────────────────────────────────────────
  try {
    const { pathname } = new URL(url)
    // The path often looks like /CategoryName/dp/ASIN or /s?k=query
    // Strip trailing /dp/... and check the leading segment(s)
    const beforeDp = pathname.split('/dp/')[0]

    for (const [pattern, category] of CATEGORY_URL_PATTERNS) {
      if (pattern.test(beforeDp)) {
        return category
      }
    }
  } catch {
    // Malformed URL — fall through to title detection
  }

  // ── 2. Title keyword detection ────────────────────────────────────────────
  const lowerTitle = title.toLowerCase()

  for (const [keywords, category] of CATEGORY_TITLE_KEYWORDS) {
    for (const kw of keywords) {
      // Word-boundary-aware: check that the keyword appears as a distinct phrase
      // (not as a substring of an unrelated word). Simple check: surrounded by
      // non-alphanumeric characters or at string start/end.
      if (lowerTitle.includes(kw)) {
        return category
      }
    }
  }

  // ── 3. Default ────────────────────────────────────────────────────────────
  return 'All Other Categories'
}

/**
 * Returns the expected Amazon Associates commission rate for a category.
 *
 * @param category  Category string returned by detectAmazonCategory().
 * @returns         Decimal rate (e.g. 0.10 for 10%). Returns 0.04 (the "All
 *                  Other Categories" default) for unrecognised category strings.
 */
export function getCommissionRate(category: string): number {
  return AMAZON_COMMISSION_RATES[category] ?? AMAZON_COMMISSION_RATES['All Other Categories']!
}

/**
 * Calculates the estimated commission for a single item.
 *
 * @param price     Item price in the listing currency. Pass null when unknown.
 * @param category  Category returned by detectAmazonCategory().
 * @returns         Estimated commission amount, or null when price is unknown.
 */
export function estimateCommission(price: number | null, category: string): number | null {
  if (price === null) return null
  const rate = getCommissionRate(category)
  // Round to 4 decimal places to avoid floating-point noise in the DB
  return Math.round(price * rate * 10_000) / 10_000
}
