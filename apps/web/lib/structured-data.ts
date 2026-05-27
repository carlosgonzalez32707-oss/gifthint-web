/**
 * lib/structured-data.ts — GiftHint
 *
 * JSON-LD structured data generators for schema.org markup.
 * All functions return plain objects — serialise with JSON.stringify()
 * and inject via <script type="application/ld+json" dangerouslySetInnerHTML>.
 *
 * Usage (Server Component):
 *   import { generateWishlistSchema } from '@/lib/structured-data'
 *   const schema = generateWishlistSchema(user, wishlist, items)
 *   <script
 *     type="application/ld+json"
 *     dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
 *   />
 *
 * Exports:
 *   generateWishlistSchema(user, wishlist, items)  → ItemList
 *   generateBreadcrumbSchema(user, wishlist, label) → BreadcrumbList
 *   generateOrganizationSchema()                   → Organization
 *   SchemaUser, SchemaWishlist, SchemaItem          (input types)
 */

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://gifthint.io'

// ── Input types ───────────────────────────────────────────────────────────────

/** Minimal user fields needed for schema generation */
export interface SchemaUser {
  public_username: string
  display_name:    string | null
}

/** Minimal wishlist fields needed for schema generation */
export interface SchemaWishlist {
  slug:     string
  title:    string
  occasion: string
}

/** Minimal item fields needed for schema generation */
export interface SchemaItem {
  title:        string
  price:        number | string | null
  currency?:    string | null
  source_url?:  string | null
  affiliate_url?: string | null
  is_claimed:   boolean
}

// ── Private helpers ───────────────────────────────────────────────────────────

function firstName(displayName: string | null, username: string): string {
  return displayName?.split(' ')[0] ?? username
}

function formatPrice(price: number | string | null): string | null {
  if (price === null || price === undefined) return null
  const num = typeof price === 'string' ? parseFloat(price) : price
  if (isNaN(num)) return null
  return num.toFixed(2)
}

// ── Generators ────────────────────────────────────────────────────────────────

/**
 * ItemList schema for a wishlist page.
 * Only the top 5 unclaimed items are included as ListItem entries with
 * Product + Offer sub-schemas so Google can extract price signals.
 */
export function generateWishlistSchema(
  user:     SchemaUser,
  wishlist: SchemaWishlist,
  items:    SchemaItem[],
): object {
  const name    = firstName(user.display_name, user.public_username)
  const listUrl = `${SITE_URL}/list/${user.public_username}/${wishlist.slug}`

  const unclaimed = items.filter((i) => !i.is_claimed).slice(0, 5)

  return {
    '@context':    'https://schema.org',
    '@type':       'ItemList',
    name:          `${name}'s ${wishlist.title}`,
    description:   `${name}'s wish list on GiftHint — save from any store, share one link.`,
    url:           listUrl,
    numberOfItems: unclaimed.length,
    itemListElement: unclaimed.map((item, index) => {
      const url            = item.affiliate_url ?? item.source_url ?? null
      const formattedPrice = formatPrice(item.price)

      return {
        '@type':   'ListItem',
        position:  index + 1,
        item: {
          '@type': 'Product',
          name:    item.title,
          ...(url && { url }),
          ...(formattedPrice && {
            offers: {
              '@type':        'Offer',
              price:          formattedPrice,
              priceCurrency:  item.currency ?? 'USD',
              availability:   'https://schema.org/InStock',
            },
          }),
        },
      }
    }),
  }
}

/**
 * BreadcrumbList schema for gifter pages.
 * Three levels: Home → Gift Lists → [Name]'s [Occasion] List
 */
export function generateBreadcrumbSchema(
  user:          SchemaUser,
  wishlist:      SchemaWishlist,
  occasionLabel: string,
): object {
  const name    = firstName(user.display_name, user.public_username)
  const listUrl = `${SITE_URL}/list/${user.public_username}/${wishlist.slug}`

  return {
    '@context': 'https://schema.org',
    '@type':    'BreadcrumbList',
    itemListElement: [
      {
        '@type':  'ListItem',
        position: 1,
        name:     'Home',
        item:     SITE_URL,
      },
      {
        '@type':  'ListItem',
        position: 2,
        name:     'Gift Lists',
        item:     `${SITE_URL}/gifts`,
      },
      {
        '@type':  'ListItem',
        position: 3,
        name:     `${name}'s ${occasionLabel} List`,
        item:     listUrl,
      },
    ],
  }
}

/**
 * Organization schema for the GiftHint brand.
 * Embed once in the root layout <head> so every page inherits it.
 */
export function generateOrganizationSchema(): object {
  return {
    '@context':   'https://schema.org',
    '@type':      'Organization',
    name:         'GiftHint',
    url:          SITE_URL,
    logo:         `${SITE_URL}/logo.png`,
    description:  'Save products from any store, share one wishlist link, and never receive a duplicate gift again.',
    foundingDate: '2024',
    sameAs: [
      'https://twitter.com/gifthint',
      'https://instagram.com/gifthint',
    ],
    contactPoint: {
      '@type':     'ContactPoint',
      contactType: 'Customer Support',
      email:       'hello@gifthint.io',
    },
  }
}
