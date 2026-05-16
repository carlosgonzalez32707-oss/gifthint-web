/**
 * lib/alternative-guidance.ts — GiftHint
 *
 * Converts a wishlist item's DNA tags into a plain-English alternative-guidance
 * string shown on the gifter page when the exact item is out of stock.
 *
 * Design goals:
 *   - Sound natural, not robotic: "Any over-ear headphones — just not white"
 *     not "Item must satisfy: #NoWhite AND #OverEar"
 *   - Be concise: aim for a single sentence under 120 characters.
 *   - Fall back gracefully: when no meaningful sentence can be built, return null
 *     so the caller can decide to show nothing rather than empty text.
 *
 * Exports:
 *   generateAlternativeGuidance(item) → string | null
 *   buildGuidanceParts(tags)          → GuidanceParts (internal, exported for tests)
 */

import type { WishlistItem } from '@/types/wishlist'

// ── Types ─────────────────────────────────────────────────────────────────────

/** Structured intermediate form before final sentence assembly. */
export interface GuidanceParts {
  /** Positive requirements: things the alternative SHOULD have. */
  positives: string[]
  /** Negative constraints: things the alternative MUST NOT have. */
  negatives: string[]
  /** Fit/size notes: neutral observations (e.g. "size up"). */
  fitNotes:  string[]
}

// ── Tag → plain-English phrase map ────────────────────────────────────────────

/**
 * Each entry maps a DNA tag to a { positive | negative | fitNote } phrase.
 *
 * Naming convention for phrase keys:
 *   positive — adds to "should have…" clause (e.g. "must be wired")
 *   negative — adds to "not…" / "avoid…" clause (e.g. "not white")
 *   fitNote  — adds to a neutral sizing/fit clause
 */

type TagPhrase =
  | { type: 'positive'; phrase: string }
  | { type: 'negative'; phrase: string }
  | { type: 'fitNote';  phrase: string }

const TAG_PHRASES: Readonly<Record<string, TagPhrase>> = {

  // ── Clothing / Fashion ─────────────────────────────────────────────────────
  '#NoSynthetics':      { type: 'negative', phrase: 'no synthetic fabrics'    },
  '#NoPink':            { type: 'negative', phrase: 'not pink'                },
  '#NoLogoVisible':     { type: 'negative', phrase: 'no visible logo'         },
  '#SizeUp':            { type: 'fitNote',  phrase: 'order one size up'       },
  '#SizeDown':          { type: 'fitNote',  phrase: 'order one size down'     },
  '#HalfSizeUp':        { type: 'fitNote',  phrase: 'go half a size up'       },
  '#HalfSizeDown':      { type: 'fitNote',  phrase: 'go half a size down'     },
  '#NaturalFabric':     { type: 'positive', phrase: 'natural fabric'          },
  '#NoPatterns':        { type: 'negative', phrase: 'no patterns'             },
  '#DarkColours':       { type: 'positive', phrase: 'dark colours'            },
  '#LightColours':      { type: 'positive', phrase: 'light colours'           },
  '#NoBranding':        { type: 'negative', phrase: 'no visible branding'     },

  // ── Electronics ───────────────────────────────────────────────────────────
  '#NoWhite':           { type: 'negative', phrase: 'not white'               },
  '#NoChrome':          { type: 'negative', phrase: 'not chrome / silver'     },
  '#WiredOnly':         { type: 'positive', phrase: 'must be wired'           },
  '#WirelessOnly':      { type: 'positive', phrase: 'must be wireless'        },
  '#NoBluetooth':       { type: 'negative', phrase: 'no Bluetooth'            },
  '#NoApple':           { type: 'negative', phrase: 'not an Apple product'    },
  '#AndroidOnly':       { type: 'positive', phrase: 'Android compatible'      },
  '#iOSOnly':           { type: 'positive', phrase: 'iOS compatible'          },
  '#NoTouchscreen':     { type: 'negative', phrase: 'no touchscreen'          },
  '#LongBatteryLife':   { type: 'positive', phrase: 'long battery life'       },

  // ── Books ──────────────────────────────────────────────────────────────────
  '#HardcoverOnly':     { type: 'positive', phrase: 'hardcover only'          },
  '#PaperbackOK':       { type: 'positive', phrase: 'paperback is fine'       },
  '#NoDigital':         { type: 'negative', phrase: 'no digital / e-book'     },
  '#FirstEdition':      { type: 'positive', phrase: 'first edition preferred' },
  '#IllustratedEdition':{ type: 'positive', phrase: 'illustrated edition'     },
  '#LargePrint':        { type: 'positive', phrase: 'large print edition'     },
  '#AudiobookOK':       { type: 'positive', phrase: 'audiobook is fine'       },

  // ── Beauty / Skincare ──────────────────────────────────────────────────────
  '#NoRetinol':         { type: 'negative', phrase: 'no retinol'              },
  '#FragranceFree':     { type: 'positive', phrase: 'fragrance-free'          },
  '#CrueltyFree':       { type: 'positive', phrase: 'cruelty-free'            },
  '#NoParabens':        { type: 'negative', phrase: 'no parabens'             },
  '#VeganFormula':      { type: 'positive', phrase: 'vegan formula'           },
  '#SPFRequired':       { type: 'positive', phrase: 'must include SPF'        },
  '#NoAlcohol':         { type: 'negative', phrase: 'no alcohol'              },
  '#HypoallergenicOnly':{ type: 'positive', phrase: 'hypoallergenic'          },
  '#NaturalIngredients':{ type: 'positive', phrase: 'natural ingredients'     },

  // ── Shoes ──────────────────────────────────────────────────────────────────
  '#NarrowFit':         { type: 'fitNote',  phrase: 'narrow fit'              },
  '#WideFit':           { type: 'fitNote',  phrase: 'wide fit'                },
  '#NaturalSole':       { type: 'positive', phrase: 'natural sole'            },
  '#NoHeels':           { type: 'negative', phrase: 'no heels'                },
  '#HeelsOnly':         { type: 'positive', phrase: 'heels only'              },
  '#VeganLeather':      { type: 'positive', phrase: 'vegan leather'           },
  '#NoLeather':         { type: 'negative', phrase: 'no leather'              },

  // ── Home / Decor ──────────────────────────────────────────────────────────
  '#MinimalistStyle':   { type: 'positive', phrase: 'minimalist style'        },
  '#NoBold':            { type: 'negative', phrase: 'nothing bold or loud'    },
  '#NeutralColours':    { type: 'positive', phrase: 'neutral colours'         },
  '#VintageStyle':      { type: 'positive', phrase: 'vintage / retro style'   },
  '#ModernOnly':        { type: 'positive', phrase: 'modern style only'       },
  '#NoPlastic':         { type: 'negative', phrase: 'no plastic'              },
  '#WoodOnly':          { type: 'positive', phrase: 'wood preferred'          },
  '#HandmadePreferred': { type: 'positive', phrase: 'handmade preferred'      },

  // ── Generic ────────────────────────────────────────────────────────────────
  '#GiftReceiptPlease': { type: 'positive', phrase: 'gift receipt appreciated' },
  '#NoAssemblyRequired':{ type: 'negative', phrase: 'no assembly required'    },
  '#EcoFriendly':       { type: 'positive', phrase: 'eco-friendly'            },
  '#MadeLocally':       { type: 'positive', phrase: 'locally made preferred'  },
  '#FairTrade':         { type: 'positive', phrase: 'fair trade'              },
  '#RecycledMaterials': { type: 'positive', phrase: 'recycled materials'      },
  '#CompactSize':       { type: 'fitNote',  phrase: 'compact size preferred'  },
  '#LargerSizePreferred':{ type: 'fitNote', phrase: 'larger size preferred'   },
}

// ── Core logic ────────────────────────────────────────────────────────────────

/**
 * Converts an array of DNA tag strings into structured guidance parts.
 * Tags not found in TAG_PHRASES are silently skipped.
 */
export function buildGuidanceParts(tags: string[]): GuidanceParts {
  const parts: GuidanceParts = { positives: [], negatives: [], fitNotes: [] }

  for (const tag of tags) {
    const phrase = TAG_PHRASES[tag]
    if (!phrase) continue

    switch (phrase.type) {
      case 'positive': parts.positives.push(phrase.phrase); break
      case 'negative': parts.negatives.push(phrase.phrase); break
      case 'fitNote':  parts.fitNotes.push(phrase.phrase);  break
    }
  }

  return parts
}

/**
 * Joins an array of phrases into natural English.
 * ['a', 'b', 'c'] → 'a, b and c'
 * ['a', 'b']      → 'a and b'
 * ['a']           → 'a'
 * []              → ''
 */
function joinPhrases(phrases: string[]): string {
  if (phrases.length === 0) return ''
  if (phrases.length === 1) return phrases[0]
  const last = phrases[phrases.length - 1]
  const rest = phrases.slice(0, -1).join(', ')
  return `${rest} and ${last}`
}

/**
 * Assembles a plain-English guidance sentence from structured parts.
 *
 * Sentence templates (in order of preference):
 *   1. Positives + negatives:  "Must be {positive} — just not {negative}"
 *   2. Positives only:         "Something {positive}"
 *   3. Negatives only:         "Anything similar — just not {negative}"
 *   4. Fit notes only:         "{fitNote}" (e.g. "Order one size up")
 *   5. Nothing meaningful:     null
 *
 * Fit notes are appended as a parenthetical when combined with other content:
 *   "Must be wired and cruelty-free — just not white (order one size up)"
 */
function assembleSentence(parts: GuidanceParts): string | null {
  const { positives, negatives, fitNotes } = parts

  const posPart  = joinPhrases(positives)
  const negPart  = joinPhrases(negatives)
  const fitPart  = joinPhrases(fitNotes)

  let core: string | null = null

  if (posPart && negPart) {
    // Capitalise first letter of positives
    const posCapitalised = posPart.charAt(0).toUpperCase() + posPart.slice(1)
    core = `${posCapitalised} — just not ${negPart}`
  } else if (posPart) {
    // "Something wired" reads better than "Something Must be wired"
    core = `Something ${posPart}`
  } else if (negPart) {
    core = `Anything similar — just not ${negPart}`
  } else if (fitPart) {
    // Fit notes only: capitalise and return directly
    return fitPart.charAt(0).toUpperCase() + fitPart.slice(1)
  }

  if (!core) return null

  if (fitPart) {
    return `${core} (${fitPart})`
  }

  return core
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generates a plain-English alternative guidance string for a wishlist item.
 *
 * Returns null when:
 *   - The item has no DNA tags
 *   - None of the item's tags are recognised in TAG_PHRASES
 *   - The resulting sentence would be empty
 *
 * Examples:
 *   tags: ['#NoWhite', '#WiredOnly']
 *   → "Must be wired — just not white"
 *
 *   tags: ['#NaturalFabric', '#NoSynthetics', '#NoPink']
 *   → "Natural fabric — just not synthetic fabrics and not pink"
 *
 *   tags: ['#EcoFriendly', '#CrueltyFree', '#FragranceFree', '#SizeUp']
 *   → "Eco-friendly, cruelty-free and fragrance-free (order one size up)"
 *
 *   tags: ['#HardcoverOnly']
 *   → "Something hardcover only"
 *
 *   tags: ['#GiftReceiptPlease']
 *   → "Something gift receipt appreciated"
 *
 *   tags: []
 *   → null
 */
export function generateAlternativeGuidance(item: WishlistItem): string | null {
  const tags = item.dna_tags
  if (!tags || tags.length === 0) return null

  const parts    = buildGuidanceParts(tags)
  const sentence = assembleSentence(parts)

  // Guard: trim and return null if somehow empty
  return sentence?.trim() || null
}
