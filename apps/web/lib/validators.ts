/**
 * lib/validators.ts — GiftHint
 *
 * Shared, typed request-body validators for all POST/PATCH API routes.
 *
 * DESIGN
 * ──────
 * Validation is implemented as a lightweight schema system with the same
 * call-site interface as Zod — making a future migration to Zod a drop-in
 * replacement. Each validator returns either a typed success value or a
 * structured { _errors: string[] } that maps directly to our 400 response.
 *
 * When you're ready to add Zod:
 *   npm install zod
 * Then replace the manual schemas below with z.object({...}) equivalents
 * and change ParseResult<T> to z.SafeParseReturnType<T, T>.
 *
 * USAGE
 * ─────
 * import { parseBody, claimBodySchema, createWishlistSchema } from '@/lib/validators'
 * import { badRequest } from '@/lib/api-response'
 *
 * const parsed = parseBody(claimBodySchema, await req.json())
 * if (!parsed.success) return badRequest(parsed.error, 'validation_error')
 * const { itemId, claimedBy, anonymous } = parsed.data
 *
 * ROUTE COVERAGE
 * ──────────────
 * Schema                      Route
 * ──────────────────────────  ─────────────────────────────────────────
 * claimBodySchema             POST /api/claim
 * createWishlistSchema        POST /api/wishlists
 * updateItemSchema            PATCH /api/items/[id]
 * contributeSchema            POST /api/group-gift/contribute
 * createPoolSchema            POST /api/group-gift/create-pool
 * trackClickSchema            POST /api/track-click
 * trackViewSchema             POST /api/track-view
 * reminderSignupSchema        POST /api/reminder-signup
 * authExchangeSchema          POST /api/auth/exchange
 * usernameUpdateSchema        POST /api/username/update
 */

// ── Core types ─────────────────────────────────────────────────────────────────

export type ParseResult<T> =
  | { success: true;  data: T }
  | { success: false; error: string }

/** A single field validator — returns null on pass, error string on fail. */
type FieldValidator<T> = (value: unknown) => T | null

// ── Primitive validators ───────────────────────────────────────────────────────

/** Accept any non-empty string, optionally capped at maxLength. */
function str(maxLength?: number): FieldValidator<string> {
  return (v) => {
    if (typeof v !== 'string') return null
    const trimmed = v.trim()
    if (!trimmed) return null
    if (maxLength && trimmed.length > maxLength) return null
    return trimmed
  }
}

/** Accept any string, including empty / null (nullable field). */
function strOrNull(maxLength?: number): FieldValidator<string | null> {
  return (v) => {
    if (v === null || v === undefined) return null
    if (typeof v !== 'string') return null
    const trimmed = v.trim()
    if (maxLength && trimmed.length > maxLength) return null
    return trimmed || null
  }
}

/** Accept a positive finite number ≥ min. */
function positiveNumber(min = 0): FieldValidator<number> {
  return (v) => {
    const n = Number(v)
    if (isNaN(n) || !isFinite(n) || n < min) return null
    return n
  }
}

/** Accept an email-shaped string (contains @). */
const email: FieldValidator<string> = (v) => {
  if (typeof v !== 'string') return null
  const s = v.trim().toLowerCase()
  if (!s.includes('@') || s.length > 254) return null
  return s
}

/** Accept a boolean. */
const boolean: FieldValidator<boolean> = (v) => {
  if (typeof v !== 'boolean') return null
  return v
}

/** Accept an ISO 8601 date string YYYY-MM-DD. */
const isoDate: FieldValidator<string> = (v) => {
  if (typeof v !== 'string') return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return null
  return v.trim()
}

/** Accept a valid URL string. */
const urlString: FieldValidator<string> = (v) => {
  if (typeof v !== 'string') return null
  try {
    new URL(v.trim())
    return v.trim()
  } catch {
    return null
  }
}

/** Accept a string that is one of the allowed values. */
function oneOf<T extends string>(values: readonly T[]): FieldValidator<T> {
  const set = new Set<string>(values)
  return (v) => {
    if (typeof v !== 'string') return null
    return set.has(v) ? (v as T) : null
  }
}

/** Accept an array of strings matching the given regex. */
function stringArray(
  itemRegex?: RegExp,
  maxItems?: number,
): FieldValidator<string[]> {
  return (v) => {
    if (!Array.isArray(v)) return null
    if (maxItems && v.length > maxItems) return null
    for (const item of v) {
      if (typeof item !== 'string') return null
      if (itemRegex && !itemRegex.test(item)) return null
    }
    return v as string[]
  }
}

// ── Schema definition helpers ──────────────────────────────────────────────────

type SchemaShape<T> = {
  [K in keyof T]: {
    required:  boolean
    validate:  FieldValidator<T[K]>
    message:   string
  }
}

/**
 * Runs a field-level schema against a raw body object.
 * Returns { success: true, data } or { success: false, error } with the first
 * failing field's message.
 */
export function parseBody<T extends Record<string, unknown>>(
  schema: SchemaShape<T>,
  body:   unknown,
): ParseResult<T> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { success: false, error: 'Request body must be a JSON object.' }
  }

  const raw = body as Record<string, unknown>
  const out: Record<string, unknown> = {}

  for (const [field, rule] of Object.entries(schema) as [string, SchemaShape<T>[string]][]) {
    const rawValue = raw[field]

    if (rawValue === undefined || rawValue === null) {
      if (rule.required) {
        return { success: false, error: rule.message }
      }
      // Optional field absent — skip without writing to out
      continue
    }

    const parsed = rule.validate(rawValue)
    if (parsed === null) {
      return { success: false, error: rule.message }
    }

    out[field] = parsed
  }

  return { success: true, data: out as T }
}

// ── Domain constants ───────────────────────────────────────────────────────────

/** Valid DNA tag format: #[A-Za-z0-9]{1,19} */
const DNA_TAG_RE = /^#[A-Za-z0-9]{1,19}$/

// ── Request schemas ────────────────────────────────────────────────────────────

// ── POST /api/claim ────────────────────────────────────────────────────────────

export interface ClaimBody {
  itemId:    string
  claimedBy: string | null
  anonymous: boolean
}

export const claimBodySchema: SchemaShape<ClaimBody> = {
  itemId: {
    required: true,
    validate: str(36),
    message:  'itemId is required and must be a valid UUID.',
  },
  claimedBy: {
    required: false,
    validate: strOrNull(80),
    message:  'claimedBy must be a string of 80 characters or fewer.',
  },
  anonymous: {
    required: false,
    validate: boolean,
    message:  'anonymous must be a boolean.',
  },
}

// ── POST /api/wishlists ────────────────────────────────────────────────────────

import {
  OCCASION_TYPES,
  type OccasionKey,
} from '@/lib/wishlists'

const VALID_OCCASION_KEYS = OCCASION_TYPES.map((o) => o.key) as OccasionKey[]

export interface CreateWishlistBody {
  userId:        string
  title:         string
  occasion:      OccasionKey
  occasionDate?: string
  makeDefault?:  boolean
}

export const createWishlistSchema: SchemaShape<CreateWishlistBody> = {
  userId: {
    required: true,
    validate: str(36),
    message:  'userId is required.',
  },
  title: {
    required: true,
    validate: (v) => {
      if (typeof v !== 'string') return null
      const s = v.trim()
      return s.length >= 1 && s.length <= 100 ? s : null
    },
    message: 'title must be 1–100 characters.',
  },
  occasion: {
    required: true,
    validate: oneOf(VALID_OCCASION_KEYS),
    message:  `occasion must be one of: ${VALID_OCCASION_KEYS.join(', ')}.`,
  },
  occasionDate: {
    required: false,
    validate: isoDate,
    message:  'occasionDate must be "YYYY-MM-DD".',
  },
  makeDefault: {
    required: false,
    validate: boolean,
    message:  'makeDefault must be a boolean.',
  },
}

// ── PATCH /api/items/[id] ──────────────────────────────────────────────────────

export interface UpdateItemBody {
  title?:       string
  hint?:        string | null
  price?:       number | null
  image_url?:   string | null
  sort_order?:  number
  dna_tags?:    string[]
  wishlist_id?: string | null
}

/** UpdateItem uses field-presence semantics — use parseUpdateItemBody directly. */
export function parseUpdateItemBody(
  raw: unknown,
): ParseResult<UpdateItemBody> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { success: false, error: 'Request body must be a JSON object.' }
  }

  const body = raw as Record<string, unknown>
  const out: UpdateItemBody = {}

  if (body.title !== undefined) {
    const v = typeof body.title === 'string' ? body.title.trim() : ''
    if (!v || v.length > 200) {
      return { success: false, error: 'title must be 1–200 characters.' }
    }
    out.title = v
  }

  if ('hint' in body) {
    if (body.hint === null) {
      out.hint = null
    } else {
      const s = typeof body.hint === 'string' ? body.hint.trim() : null
      if (s !== null && s.length > 500) {
        return { success: false, error: 'hint must be 500 characters or fewer.' }
      }
      out.hint = s || null
    }
  }

  if ('price' in body) {
    if (body.price === null) {
      out.price = null
    } else {
      const n = Number(body.price)
      if (isNaN(n) || n < 0) {
        return { success: false, error: 'price must be a non-negative number.' }
      }
      out.price = n
    }
  }

  if ('image_url' in body) {
    if (body.image_url === null || body.image_url === '') {
      out.image_url = null
    } else {
      const parsed = urlString(body.image_url)
      if (!parsed) {
        return { success: false, error: 'image_url must be a valid URL.' }
      }
      out.image_url = parsed
    }
  }

  if (body.sort_order !== undefined) {
    out.sort_order = Number(body.sort_order)
  }

  if (body.dna_tags !== undefined) {
    const tags = stringArray(DNA_TAG_RE, 10)(body.dna_tags)
    if (!tags) {
      return { success: false, error: 'dna_tags must be an array of ≤10 strings matching #[A-Za-z0-9]{1,19}.' }
    }
    out.dna_tags = tags
  }

  if ('wishlist_id' in body) {
    out.wishlist_id = typeof body.wishlist_id === 'string' ? body.wishlist_id : null
  }

  if (Object.keys(out).length === 0) {
    return { success: false, error: 'No valid fields provided for update.' }
  }

  return { success: true, data: out }
}

// ── POST /api/group-gift/contribute ───────────────────────────────────────────

export interface ContributeBody {
  poolId:           string
  contributorName:  string
  contributorEmail: string
  amount:           number
  anonymous:        boolean
}

export const contributeSchema: SchemaShape<ContributeBody> = {
  poolId: {
    required: true,
    validate: str(36),
    message:  'poolId is required.',
  },
  contributorName: {
    required: true,
    validate: str(100),
    message:  'contributorName is required and must be 100 characters or fewer.',
  },
  contributorEmail: {
    required: true,
    validate: email,
    message:  'contributorEmail must be a valid email address.',
  },
  amount: {
    required: true,
    validate: positiveNumber(0.30),
    message:  'amount must be a number ≥ 0.30.',
  },
  anonymous: {
    required: false,
    validate: boolean,
    message:  'anonymous must be a boolean.',
  },
}

// ── POST /api/track-click ──────────────────────────────────────────────────────

const VALID_AFFILIATE_NETWORKS = ['amazon_associates', 'skimlinks', 'unknown'] as const
export type AffiliateNetwork = typeof VALID_AFFILIATE_NETWORKS[number]

export interface TrackClickBody {
  itemId:             string
  wisherUserId:       string
  retailer:           string
  affiliateNetwork:   AffiliateNetwork
  gifterPageUsername: string
}

export const trackClickSchema: SchemaShape<TrackClickBody> = {
  itemId: {
    required: true,
    validate: str(36),
    message:  'itemId is required.',
  },
  wisherUserId: {
    required: true,
    validate: str(36),
    message:  'wisherUserId is required.',
  },
  retailer: {
    required: true,
    validate: str(128),
    message:  'retailer is required.',
  },
  affiliateNetwork: {
    required: true,
    validate: (v) => {
      const s = typeof v === 'string' ? v : 'unknown'
      return VALID_AFFILIATE_NETWORKS.includes(s as AffiliateNetwork)
        ? (s as AffiliateNetwork)
        : 'unknown'
    },
    message: 'affiliateNetwork must be one of: amazon_associates, skimlinks, unknown.',
  },
  gifterPageUsername: {
    required: true,
    validate: str(64),
    message:  'gifterPageUsername is required.',
  },
}

// ── POST /api/reminder-signup ──────────────────────────────────────────────────

export interface ReminderSignupBody {
  email:        string
  wishlistId:   string
  gifterName?:  string
}

export const reminderSignupSchema: SchemaShape<ReminderSignupBody> = {
  email: {
    required: true,
    validate: email,
    message:  'email must be a valid email address.',
  },
  wishlistId: {
    required: true,
    validate: str(36),
    message:  'wishlistId is required.',
  },
  gifterName: {
    required: false,
    validate: str(100),
    message:  'gifterName must be 100 characters or fewer.',
  },
}

// ── POST /api/auth/exchange ────────────────────────────────────────────────────

export interface AuthExchangeBody {
  code:         string
  redirect_uri: string
}

export const authExchangeSchema: SchemaShape<AuthExchangeBody> = {
  code: {
    required: true,
    validate: str(1024),
    message:  'code is required.',
  },
  redirect_uri: {
    required: true,
    validate: (v) => {
      if (typeof v !== 'string') return null
      try {
        const u = new URL(v)
        return u.protocol === 'https:' && u.hostname.endsWith('.chromiumapp.org')
          ? v.trim()
          : null
      } catch {
        return null
      }
    },
    message: 'redirect_uri must be a valid https://*.chromiumapp.org URL.',
  },
}

// ── POST /api/username/update ──────────────────────────────────────────────────

export interface UsernameUpdateBody {
  userId:   string
  username: string
}

export const usernameUpdateSchema: SchemaShape<UsernameUpdateBody> = {
  userId: {
    required: true,
    validate: str(36),
    message:  'userId is required.',
  },
  username: {
    required: true,
    validate: (v) => {
      if (typeof v !== 'string') return null
      const s = v.trim().toLowerCase()
      // 3–30 chars, alphanumeric + underscore/hyphen, no leading/trailing symbols
      if (!/^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$/.test(s) && !/^[a-z0-9]{3,30}$/.test(s)) return null
      return s
    },
    message: 'username must be 3–30 characters: letters, numbers, underscores, and hyphens only.',
  },
}
