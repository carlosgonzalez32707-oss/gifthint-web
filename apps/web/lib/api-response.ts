/**
 * lib/api-response.ts — GiftHint
 *
 * Standardised Next.js API response helpers.
 *
 * All GiftHint API routes return a consistent envelope:
 *
 *   Success:    { data: T,    error: null }
 *   Error:      { data: null, error: { message, code } }
 *   Paginated:  { data: T[],  error: null, meta: { total, page, limit, pages } }
 *
 * HTTP status codes used across the API:
 *   200  OK                — read, update, delete success
 *   201  Created           — resource created
 *   400  Bad Request       — validation error (malformed body, invalid field)
 *   401  Unauthorized      — missing or invalid authentication token
 *   403  Forbidden         — authenticated but not authorised for this resource
 *   404  Not Found         — resource does not exist
 *   409  Conflict          — state conflict (already claimed, duplicate, etc.)
 *   422  Unprocessable     — semantically invalid (amount exceeds remaining, etc.)
 *   429  Too Many Requests — rate limit exceeded
 *   500  Internal Error    — unexpected server-side failure
 *
 * IMPORT NOTE
 * ───────────
 * Import from Server Components and API routes only. Not for use client-side —
 * `NextResponse` is a server-only Next.js export.
 *
 * USAGE
 * ─────
 * import { ok, created, badRequest, notFound, serverError, paginated } from '@/lib/api-response'
 *
 * // Success
 * return ok({ wishlist })
 *
 * // Created
 * return created({ wishlist })
 *
 * // Error
 * return badRequest('title must be 1–100 characters.', 'invalid_field')
 *
 * // Paginated
 * return paginated(items, total, page, limit)
 */

import { NextResponse } from 'next/server'

// ── Response envelope types ────────────────────────────────────────────────────

export interface ApiSuccess<T = unknown> {
  data:  T
  error: null
}

export interface ApiError {
  data:  null
  error: { message: string; code: string }
}

export interface PaginationMeta {
  total: number
  page:  number
  limit: number
  pages: number
}

export interface ApiPaginated<T = unknown> {
  data:  T[]
  error: null
  meta:  PaginationMeta
}

/** Union of all response envelope shapes for typing fetch() consumers. */
export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError | ApiPaginated<T>

// ── Success helpers ────────────────────────────────────────────────────────────

/**
 * 200 OK — standard success.
 *
 * @example
 * return ok({ item })
 * // → { data: { item }, error: null }  HTTP 200
 */
export function ok<T>(data: T): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ data, error: null }, { status: 200 })
}

/**
 * 201 Created — resource successfully created.
 *
 * @example
 * return created({ wishlist })
 * // → { data: { wishlist }, error: null }  HTTP 201
 */
export function created<T>(data: T): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ data, error: null }, { status: 201 })
}

/**
 * 200 OK — paginated list response.
 *
 * @param data    Array of items for the current page.
 * @param total   Total number of items across all pages.
 * @param page    Current page number (1-based).
 * @param limit   Maximum items per page.
 *
 * @example
 * return paginated(items, 243, 1, 20)
 * // → { data: [...], error: null, meta: { total: 243, page: 1, limit: 20, pages: 13 } }  HTTP 200
 */
export function paginated<T>(
  data:  T[],
  total: number,
  page:  number,
  limit: number,
): NextResponse<ApiPaginated<T>> {
  const meta: PaginationMeta = {
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  }
  return NextResponse.json({ data, error: null, meta }, { status: 200 })
}

// ── Error helpers ──────────────────────────────────────────────────────────────

/**
 * Internal helper — not exported. All error constructors call this.
 */
function apiError(
  message: string,
  code:    string,
  status:  number,
  headers?: HeadersInit,
): NextResponse<ApiError> {
  return NextResponse.json(
    { data: null, error: { message, code } },
    { status, headers },
  )
}

/**
 * 400 Bad Request — validation error.
 * Use when a required field is missing, the wrong type, or fails format validation.
 *
 * @param message  Human-readable explanation (shown in dev; optionally shown in UI).
 * @param code     Machine-readable snake_case code for programmatic handling.
 *                 Defaults to 'validation_error'.
 *
 * @example
 * return badRequest('title must be 1–100 characters.', 'invalid_field')
 */
export function badRequest(
  message: string,
  code = 'validation_error',
): NextResponse<ApiError> {
  return apiError(message, code, 400)
}

/**
 * 401 Unauthorized — missing or invalid authentication.
 * Use when the request has no token, or the token is expired / invalid.
 *
 * @example
 * return unauthorized()
 * return unauthorized('Token expired', 'token_expired')
 */
export function unauthorized(
  message = 'Authentication required.',
  code    = 'unauthorized',
): NextResponse<ApiError> {
  return apiError(message, code, 401)
}

/**
 * 403 Forbidden — authenticated but not allowed.
 * Use when the user is logged in but doesn't own the requested resource.
 *
 * @example
 * return forbidden()
 */
export function forbidden(
  message = 'You do not have permission to perform this action.',
  code    = 'forbidden',
): NextResponse<ApiError> {
  return apiError(message, code, 403)
}

/**
 * 404 Not Found — resource does not exist.
 *
 * @example
 * return notFound('Wishlist not found.', 'wishlist_not_found')
 */
export function notFound(
  message = 'The requested resource was not found.',
  code    = 'not_found',
): NextResponse<ApiError> {
  return apiError(message, code, 404)
}

/**
 * 409 Conflict — state conflict with existing data.
 * Use for double-claims, duplicate records, and incompatible state transitions.
 *
 * @example
 * return conflict('This item has already been claimed.', 'already_claimed')
 */
export function conflict(
  message: string,
  code    = 'conflict',
): NextResponse<ApiError> {
  return apiError(message, code, 409)
}

/**
 * 422 Unprocessable Entity — semantically invalid request.
 * Use when the request is syntactically valid but logically cannot be processed
 * (e.g. contribution amount exceeds remaining pool balance).
 *
 * @example
 * return unprocessable('Amount exceeds remaining pool balance.', 'amount_exceeds_remaining')
 */
export function unprocessable(
  message: string,
  code    = 'unprocessable',
): NextResponse<ApiError> {
  return apiError(message, code, 422)
}

/**
 * 429 Too Many Requests — rate limit exceeded.
 * Includes `Retry-After` header so clients know when to retry.
 *
 * @param reset  Unix timestamp in milliseconds when the window resets.
 *               Passed from `rateLimit()` result.
 *
 * @example
 * const rl = await rateLimit(key, 50, 3600)
 * if (!rl.success) return tooManyRequests(rl.reset)
 */
export function tooManyRequests(reset: number): NextResponse<ApiError> {
  const retryAfterSecs = Math.max(1, Math.ceil((reset - Date.now()) / 1000))
  return NextResponse.json(
    { data: null, error: { message: 'Too many requests. Please try again later.', code: 'rate_limited' } },
    {
      status:  429,
      headers: {
        'Retry-After':           String(retryAfterSecs),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset':     String(Math.ceil(reset / 1000)),
      },
    },
  )
}

/**
 * 500 Internal Server Error — unexpected failure.
 * Logs to console in all environments. Message is always generic to the client;
 * the `detail` argument is only logged server-side.
 *
 * @param detail  Internal error detail for server logs only — NOT sent to client.
 *
 * @example
 * } catch (err) {
 *   return serverError(err)
 * }
 */
export function serverError(detail?: unknown): NextResponse<ApiError> {
  if (detail !== undefined) {
    console.error('[api] Internal server error:', detail)
  }
  return apiError('An unexpected error occurred. Please try again later.', 'server_error', 500)
}

// ── Type guards ────────────────────────────────────────────────────────────────

/**
 * Type guard — narrows an ApiResponse to ApiSuccess.
 *
 * @example
 * const res: ApiResponse<Item> = await fetchJson('/api/items/123')
 * if (isApiSuccess(res)) console.log(res.data)
 */
export function isApiSuccess<T>(res: ApiResponse<T>): res is ApiSuccess<T> {
  return res.error === null && !Array.isArray((res as ApiPaginated<T>).meta)
}

/**
 * Type guard — narrows an ApiResponse to ApiError.
 */
export function isApiError<T>(res: ApiResponse<T>): res is ApiError {
  return res.error !== null
}

/**
 * Type guard — narrows an ApiResponse to ApiPaginated.
 */
export function isApiPaginated<T>(res: ApiResponse<T>): res is ApiPaginated<T> {
  return res.error === null && 'meta' in res && res.meta !== undefined
}
