/**
 * lib/email-templates/price-drop.tsx — GiftHint
 *
 * Price-drop alert email, rendered via @react-email/components.
 *
 * Rendering:
 *   import { render } from '@react-email/components'
 *   import { PriceDropEmail } from '@/lib/email-templates/price-drop'
 *   const html = await render(<PriceDropEmail {...props} />)
 *
 * Design goals:
 *   - Dark theme matching GiftHint canvas (#0C0C0E / #141418)
 *   - Green (#4EC99A) hero price, red strikethrough for old price
 *   - Inline SVG sparkline (no Recharts — email has no DOM)
 *   - Subject line passed separately by the caller
 *   - Unsubscribe link targets price_alerts specifically (?type=price_alerts)
 */

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Column,
  Section,
  Text,
} from '@react-email/components'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PriceHistoryPoint {
  price:       number
  checked_at:  string   // ISO 8601
}

export interface PriceDropEmailProps {
  wisherName:     string
  itemTitle:      string
  /** Affiliate or source URL for the "Buy now" button */
  itemUrl:        string
  itemImageUrl:   string | null
  oldPrice:       number
  newPrice:       number
  /** ISO 4217 currency code — GBP, USD, etc. */
  currency:       string
  /** True when newPrice is also the all-time low stored in wishlist_items */
  isAllTimeLow:   boolean
  /** Up to 30 days of price history for the sparkline. Oldest first. */
  priceHistory:   PriceHistoryPoint[]
  /** Wisher's public list URL — "Share your list" CTA */
  shareUrl:       string
  /** /unsubscribe?token=…&type=price_alerts */
  unsubscribeUrl: string
}

// ── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  bg:         '#0C0C0E',
  card:       '#141418',
  surface2:   '#1C1C22',
  border:     'rgba(240,238,232,0.08)',
  text:       '#F0EEE8',
  muted:      '#7A7870',
  purple:     '#8B83F0',
  purpleDim:  'rgba(139,131,240,0.14)',
  purpleRing: 'rgba(139,131,240,0.28)',
  green:      '#4EC99A',
  greenDim:   'rgba(78,201,154,0.14)',
  greenRing:  'rgba(78,201,154,0.28)',
  red:        '#E25E5E',
} as const

const F = {
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
} as const

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPrice(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-GB', {
      style:    'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    const sym = currency === 'USD' ? '$' : currency === 'GBP' ? '£' : `${currency} `
    return `${sym}${amount.toFixed(2)}`
  }
}

function pct(oldPrice: number, newPrice: number): number {
  if (oldPrice <= 0) return 0
  return Math.round(((oldPrice - newPrice) / oldPrice) * 100)
}

/**
 * Builds an inline SVG sparkline path from an array of price points.
 * Returns null when there are fewer than 2 data points.
 *
 * SVG viewBox: "0 0 120 36"
 * Padding: 3px top/bottom, 2px left/right — so plot area is 116×30.
 */
function buildSparklinePath(history: PriceHistoryPoint[]): string | null {
  if (history.length < 2) return null

  const prices = history.map((h) => h.price)
  const min    = Math.min(...prices)
  const max    = Math.max(...prices)
  const range  = max - min || 1   // avoid division by zero when all prices equal

  const W = 116   // plot width (viewBox 120 – 4px padding)
  const H = 30    // plot height (viewBox 36 – 6px padding)
  const X0 = 2    // left padding
  const Y0 = 3    // top padding

  const points = prices.map((p, i) => {
    const x = X0 + (i / (prices.length - 1)) * W
    const y = Y0 + H - ((p - min) / range) * H
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  return `M ${points.join(' L ')}`
}

/**
 * Finds the colour for the sparkline end dot based on the last price relative
 * to the first. Green = trending down (good for wisher), amber = trending up.
 */
function sparklineColour(history: PriceHistoryPoint[]): string {
  if (history.length < 2) return C.green
  return history[history.length - 1].price <= history[0].price ? C.green : '#E2A24A'
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Eyebrow({ children }: { children: string }) {
  return (
    <Text
      style={{
        fontFamily:    F.sans,
        fontSize:      '10px',
        fontWeight:    700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color:         C.muted,
        margin:        '0 0 10px',
      }}
    >
      {children}
    </Text>
  )
}

// ── Sparkline ─────────────────────────────────────────────────────────────────
//
// React Email renders HTML — it supports <img> and basic HTML but not SVG in
// all clients. We use a data-URI PNG approach: embed SVG as a data URI in an
// <img> tag. This works in Gmail, Apple Mail, and Outlook (via WebKit).
//
// However, data URIs are blocked in some Outlook Windows builds. We show a
// text fallback in those cases via a conditional comment.

function SparklineSection({
  history,
  currency,
}: {
  history:  PriceHistoryPoint[]
  currency: string
}) {
  const path   = buildSparklinePath(history)
  const colour = sparklineColour(history)

  if (!path) return null

  const prices = history.map((h) => h.price)
  const min    = Math.min(...prices)
  const max    = Math.max(...prices)

  // Last data point x position (same formula as buildSparklinePath)
  const lastX  = (2 + 116).toFixed(1)
  const lastY  = (3 + 30 - ((prices[prices.length - 1] - min) / (max - min || 1)) * 30).toFixed(1)

  const svgContent =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 36" width="120" height="36">` +
    `<path d="${path}" fill="none" stroke="${colour}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle cx="${lastX}" cy="${lastY}" r="2.5" fill="${colour}"/>` +
    `</svg>`

  const encoded = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgContent)}`

  return (
    <Section style={{ marginBottom: '4px' }}>
      <Row>
        <Column>
          <Text
            style={{
              fontFamily: F.sans,
              fontSize:   '10px',
              color:      C.muted,
              margin:     '0 0 6px',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            {history.length}-day price trend
          </Text>
          {/* SVG sparkline via data URI — gracefully missing in plain-text mode */}
          <Img
            src={encoded}
            alt={`Price trend: ${formatPrice(prices[0], currency)} → ${formatPrice(prices[prices.length - 1], currency)}`}
            width={120}
            height={36}
            style={{ display: 'block' }}
          />
          <Row style={{ marginTop: '4px' }}>
            <Column>
              <Text style={{ fontFamily: F.sans, fontSize: '10px', color: C.muted, margin: 0 }}>
                {formatPrice(min, currency)} low
              </Text>
            </Column>
            <Column style={{ textAlign: 'right' as const }}>
              <Text style={{ fontFamily: F.sans, fontSize: '10px', color: C.muted, margin: 0 }}>
                {formatPrice(max, currency)} high
              </Text>
            </Column>
          </Row>
        </Column>
      </Row>
    </Section>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function PriceDropEmail({
  wisherName,
  itemTitle,
  itemUrl,
  itemImageUrl,
  oldPrice,
  newPrice,
  currency,
  isAllTimeLow,
  priceHistory,
  shareUrl,
  unsubscribeUrl,
}: PriceDropEmailProps) {
  const savings    = oldPrice - newPrice
  const savingsPct = pct(oldPrice, newPrice)
  const fNew       = formatPrice(newPrice, currency)
  const fOld       = formatPrice(oldPrice, currency)
  const fSavings   = formatPrice(savings, currency)

  const previewText =
    `📉 ${itemTitle} dropped to ${fNew} — you save ${fSavings} (${savingsPct}% off)`

  return (
    <Html lang="en" dir="ltr">
      <Head>
        <meta name="color-scheme"           content="dark" />
        <meta name="supported-color-schemes" content="dark" />
      </Head>

      <Preview>{previewText}</Preview>

      <Body
        style={{
          backgroundColor:      C.bg,
          margin:               '0',
          padding:              '0',
          fontFamily:           F.sans,
          WebkitTextSizeAdjust: '100%',
        }}
      >
        <Container style={{ maxWidth: '560px', margin: '0 auto', padding: '40px 16px' }}>

          {/* ── Card ──────────────────────────────────────────────────────────── */}
          <Section
            style={{
              backgroundColor: C.card,
              borderRadius:    '20px',
              border:          `1px solid ${C.border}`,
              overflow:        'hidden',
            }}
          >

            {/* ── Header ──────────────────────────────────────────────────────── */}
            <Section style={{ padding: '28px 36px 20px' }}>
              <Text
                style={{
                  fontFamily:    F.sans,
                  fontSize:      '18px',
                  fontWeight:    800,
                  color:         C.purple,
                  letterSpacing: '-0.02em',
                  margin:        '0 0 16px',
                }}
              >
                GiftHint ✨
              </Text>

              <Heading
                as="h1"
                style={{
                  fontFamily:    F.sans,
                  fontSize:      '22px',
                  fontWeight:    800,
                  color:         C.text,
                  letterSpacing: '-0.03em',
                  lineHeight:    1.2,
                  margin:        '0 0 6px',
                }}
              >
                📉 Price drop on your wishlist
              </Heading>

              <Text
                style={{
                  fontFamily: F.sans,
                  fontSize:   '14px',
                  color:      C.muted,
                  margin:     0,
                  lineHeight: 1.5,
                }}
              >
                Hi {wisherName} — something on your list just got cheaper.
              </Text>
            </Section>

            <Hr style={{ borderColor: C.border, margin: '0' }} />

            {/* ── Item card ─────────────────────────────────────────────────── */}
            <Section style={{ padding: '24px 36px' }}>
              <Section
                style={{
                  backgroundColor: C.surface2,
                  borderRadius:    '14px',
                  border:          `1px solid ${C.border}`,
                  overflow:        'hidden',
                }}
              >
                {/* Product image — optional */}
                {itemImageUrl && (
                  <Section>
                    <Img
                      src={itemImageUrl}
                      alt={itemTitle}
                      width={488}
                      style={{
                        display:    'block',
                        width:      '100%',
                        maxHeight:  '220px',
                        objectFit:  'cover',
                        objectPosition: 'center',
                        backgroundColor: C.bg,
                      }}
                    />
                  </Section>
                )}

                <Section style={{ padding: '20px 22px' }}>

                  {/* Item title */}
                  <Text
                    style={{
                      fontFamily: F.sans,
                      fontSize:   '15px',
                      fontWeight: 700,
                      color:      C.text,
                      margin:     '0 0 16px',
                      lineHeight: 1.35,
                    }}
                  >
                    {itemTitle}
                  </Text>

                  {/* Price display */}
                  <Row style={{ marginBottom: '14px' }}>
                    <Column style={{ verticalAlign: 'middle' }}>
                      {/* New price — big green */}
                      <Text
                        style={{
                          fontFamily:         F.sans,
                          fontSize:           '32px',
                          fontWeight:         800,
                          color:              C.green,
                          margin:             '0 12px 0 0',
                          letterSpacing:      '-0.04em',
                          fontVariantNumeric: 'tabular-nums',
                          lineHeight:         1,
                          display:            'inline',
                        }}
                      >
                        {fNew}
                      </Text>
                      {/* Old price — red strikethrough */}
                      <Text
                        style={{
                          fontFamily:         F.sans,
                          fontSize:           '18px',
                          fontWeight:         500,
                          color:              C.red,
                          textDecoration:     'line-through',
                          margin:             0,
                          fontVariantNumeric: 'tabular-nums',
                          lineHeight:         1,
                          display:            'inline',
                          opacity:            0.7,
                        }}
                      >
                        {fOld}
                      </Text>
                    </Column>
                  </Row>

                  {/* Savings badge */}
                  <Section style={{ marginBottom: isAllTimeLow ? '8px' : '18px' }}>
                    <Text
                      style={{
                        display:         'inline-block',
                        fontFamily:      F.sans,
                        fontSize:        '12px',
                        fontWeight:      700,
                        color:           C.green,
                        backgroundColor: C.greenDim,
                        border:          `1px solid ${C.greenRing}`,
                        borderRadius:    '100px',
                        padding:         '4px 12px',
                        margin:          0,
                        letterSpacing:   '0.01em',
                      }}
                    >
                      You save {fSavings} ({savingsPct}% off)
                    </Text>
                  </Section>

                  {/* All-time low badge */}
                  {isAllTimeLow && (
                    <Section style={{ marginBottom: '18px' }}>
                      <Text
                        style={{
                          display:         'inline-block',
                          fontFamily:      F.sans,
                          fontSize:        '11px',
                          fontWeight:      700,
                          color:           '#E2A24A',
                          backgroundColor: 'rgba(226,162,74,0.14)',
                          border:          '1px solid rgba(226,162,74,0.28)',
                          borderRadius:    '100px',
                          padding:         '4px 12px',
                          margin:          0,
                          letterSpacing:   '0.01em',
                        }}
                      >
                        🏆 All-time low price
                      </Text>
                    </Section>
                  )}

                  {/* Sparkline */}
                  <SparklineSection history={priceHistory} currency={currency} />

                  {/* Buy now CTA */}
                  <Button
                    href={itemUrl}
                    style={{
                      display:         'inline-block',
                      padding:         '13px 28px',
                      borderRadius:    '12px',
                      backgroundColor: C.green,
                      color:           '#0C0C0E',
                      fontSize:        '14px',
                      fontWeight:      800,
                      textDecoration:  'none',
                      letterSpacing:   '-0.01em',
                      fontFamily:      F.sans,
                      marginTop:       '4px',
                    }}
                  >
                    Buy now →
                  </Button>

                </Section>
              </Section>
            </Section>

            <Hr style={{ borderColor: C.border, margin: '0' }} />

            {/* ── Viral loop — Share your list ─────────────────────────────── */}
            <Section style={{ padding: '24px 36px' }}>
              <Eyebrow>Let people know what you want</Eyebrow>
              <Row
                style={{
                  padding:         '16px 18px',
                  backgroundColor: C.surface2,
                  borderRadius:    '12px',
                  border:          `1px solid ${C.border}`,
                }}
              >
                <Column style={{ verticalAlign: 'middle' }}>
                  <Text
                    style={{
                      fontFamily: F.sans,
                      fontSize:   '13px',
                      fontWeight: 600,
                      color:      C.text,
                      margin:     '0 0 4px',
                      lineHeight: 1.35,
                    }}
                  >
                    Share your wishlist — gifts just got easier 🎁
                  </Text>
                  <Text
                    style={{
                      fontFamily: F.sans,
                      fontSize:   '12px',
                      color:      C.muted,
                      margin:     '0 0 12px',
                      lineHeight: 1.5,
                    }}
                  >
                    Send your list to friends and family so they always know what to get you.
                  </Text>
                  <Link
                    href={shareUrl}
                    style={{
                      display:         'inline-block',
                      padding:         '7px 16px',
                      borderRadius:    '8px',
                      backgroundColor: C.purpleDim,
                      border:          `1px solid ${C.purpleRing}`,
                      color:           C.purple,
                      fontSize:        '12px',
                      fontWeight:      700,
                      textDecoration:  'none',
                    }}
                  >
                    Share your list →
                  </Link>
                </Column>
              </Row>
            </Section>

            {/* ── Footer ──────────────────────────────────────────────────────── */}
            <Hr style={{ borderColor: C.border, margin: '0' }} />
            <Section style={{ padding: '20px 36px' }}>
              <Text
                style={{
                  fontFamily: F.sans,
                  fontSize:   '11px',
                  color:      C.muted,
                  textAlign:  'center' as const,
                  lineHeight: 1.6,
                  margin:     '0 0 8px',
                }}
              >
                <strong style={{ color: C.muted }}>Affiliate disclosure:</strong> GiftHint may earn
                a commission on purchases made through product links, at no extra cost to you.
              </Text>
              <Text
                style={{
                  fontFamily: F.sans,
                  fontSize:   '11px',
                  color:      C.muted,
                  textAlign:  'center' as const,
                  lineHeight: 1.6,
                  margin:     0,
                }}
              >
                You're receiving price drop alerts because you have an account on{' '}
                <Link href="https://gifthint.io" style={{ color: C.purple, textDecoration: 'none' }}>
                  GiftHint
                </Link>
                .{' '}
                <Link href={unsubscribeUrl} style={{ color: C.muted, textDecoration: 'underline' }}>
                  Unsubscribe from price alerts
                </Link>
              </Text>
            </Section>

          </Section>
          {/* /Card */}

        </Container>
      </Body>
    </Html>
  )
}

PriceDropEmail.PreviewProps = {
  wisherName:   'Emma',
  itemTitle:    'Moleskine Classic Notebook, Hard Cover, Large (5 x 8.25) Ruled/Lined, Black',
  itemUrl:      'https://www.amazon.co.uk/dp/B00F9LM0AS',
  itemImageUrl: 'https://m.media-amazon.com/images/I/71Dt18HQXAL._AC_SL1500_.jpg',
  oldPrice:     18.99,
  newPrice:     12.49,
  currency:     'GBP',
  isAllTimeLow: true,
  priceHistory: [
    { price: 18.99, checked_at: '2026-05-10T06:00:00Z' },
    { price: 18.99, checked_at: '2026-05-11T06:00:00Z' },
    { price: 17.50, checked_at: '2026-05-12T06:00:00Z' },
    { price: 17.50, checked_at: '2026-05-13T06:00:00Z' },
    { price: 15.99, checked_at: '2026-05-14T06:00:00Z' },
    { price: 14.99, checked_at: '2026-05-15T06:00:00Z' },
    { price: 12.49, checked_at: '2026-05-16T06:00:00Z' },
  ],
  shareUrl:      'https://gifthint.io/list/emma',
  unsubscribeUrl: 'https://gifthint.io/unsubscribe?token=preview-token&type=price_alerts',
} satisfies PriceDropEmailProps
