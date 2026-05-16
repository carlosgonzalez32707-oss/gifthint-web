/**
 * lib/email-templates/weekly-digest.tsx — GiftHint
 *
 * Weekly digest email for wishers, rendered via @react-email/components.
 *
 * Rendering:
 *   import { render } from '@react-email/components'
 *   import { WeeklyDigestEmail } from '@/lib/email-templates/weekly-digest'
 *   const html = await render(<WeeklyDigestEmail {...props} />)
 *
 * Design goals:
 *   - Dark theme matching GiftHint canvas (#0C0C0E background, #141418 card)
 *   - Purple (#8B83F0) CTAs, green (#4EC99A) for positive numbers
 *   - Inline styles only — external CSS is stripped by most email clients
 *   - Max-width 560px — safe across Gmail, Apple Mail, Outlook
 *   - Images degrade gracefully; all key info readable text-only
 *   - Outlook 2019 VML fallbacks not needed at this funnel stage
 *
 * FTC disclosure:
 *   GiftHint uses affiliate links — the footer must carry a disclosure.
 *   Current text is aligned with FTC Endorsement Guides (16 C.F.R. § 255).
 *   Review with legal before changing.
 */

import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from '@react-email/components'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DigestListSummary {
  listName:   string
  slug:       string
  views:      number
}

export interface DigestTopItem {
  title:     string
  imageUrl:  string | null
  clicks:    number
  sourceUrl: string
}

export interface DigestClaimedItem {
  title:    string
  imageUrl: string | null
}

export interface WeeklyDigestEmailProps {
  wisherName:      string
  dashboardUrl:    string       // https://gifthint.io/dashboard
  unsubscribeUrl:  string       // https://gifthint.io/unsubscribe?token=...
  totalViews:      number
  listSummaries:   DigestListSummary[]
  topClickedItem:  DigestTopItem   | null
  claimedItems:    DigestClaimedItem[]
  weekOf:          string       // e.g. "May 12–18, 2025"
}

// ── Design tokens (inlined — no CSS vars in email) ────────────────────────────

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
  amber:      '#E2A24A',
} as const

const F = {
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
} as const

// ── Helpers ───────────────────────────────────────────────────────────────────

function pluralise(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural
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
        margin:        '0 0 6px',
      }}
    >
      {children}
    </Text>
  )
}

function StatPill({
  emoji,
  value,
  label,
  colour = C.purple,
}: {
  emoji:   string
  value:   string | number
  label:   string
  colour?: string
}) {
  return (
    <Column
      style={{
        padding:      '12px 16px',
        background:   C.surface2,
        borderRadius: '12px',
        border:       `1px solid ${C.border}`,
        textAlign:    'center',
        minWidth:     '120px',
      }}
    >
      <Text style={{ fontFamily: F.sans, fontSize: '20px', margin: '0 0 2px', lineHeight: 1 }}>
        {emoji}
      </Text>
      <Text
        style={{
          fontFamily:         F.sans,
          fontSize:           '24px',
          fontWeight:         700,
          color:              colour,
          margin:             '0 0 2px',
          letterSpacing:      '-0.03em',
          fontVariantNumeric: 'tabular-nums',
          lineHeight:         1.1,
        }}
      >
        {value}
      </Text>
      <Text style={{ fontFamily: F.sans, fontSize: '10px', color: C.muted, margin: 0, lineHeight: 1.3 }}>
        {label}
      </Text>
    </Column>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function WeeklyDigestEmail({
  wisherName,
  dashboardUrl,
  unsubscribeUrl,
  totalViews,
  listSummaries,
  topClickedItem,
  claimedItems,
  weekOf,
}: WeeklyDigestEmailProps) {
  const previewText =
    totalViews === 1
      ? `1 person visited your wishlist this week 👀`
      : `${totalViews} people visited your ${listSummaries.length === 1 ? listSummaries[0].listName : 'wishlists'} this week 👀`

  return (
    <Html lang="en" dir="ltr">
      <Head>
        {/* Dark mode meta for Apple Mail */}
        <meta name="color-scheme" content="dark" />
        <meta name="supported-color-schemes" content="dark" />
        <style>{`
          @media (prefers-color-scheme: dark) {
            .force-dark { background-color: #0C0C0E !important; }
          }
        `}</style>
      </Head>

      <Preview>{previewText}</Preview>

      <Body
        style={{
          backgroundColor: C.bg,
          margin:          '0',
          padding:         '0',
          fontFamily:      F.sans,
          WebkitTextSizeAdjust: '100%',
        }}
      >
        <Container
          style={{
            maxWidth:  '560px',
            margin:    '0 auto',
            padding:   '40px 16px',
          }}
        >
          {/* ── Card wrapper ──────────────────────────────────────────────── */}
          <Section
            style={{
              backgroundColor: C.card,
              borderRadius:    '20px',
              border:          `1px solid ${C.border}`,
              overflow:        'hidden',
            }}
          >

            {/* ── Header ──────────────────────────────────────────────────── */}
            <Section style={{ padding: '32px 36px 24px' }}>
              {/* Wordmark */}
              <Text
                style={{
                  fontFamily:    F.sans,
                  fontSize:      '18px',
                  fontWeight:    800,
                  color:         C.purple,
                  letterSpacing: '-0.02em',
                  margin:        '0 0 20px',
                }}
              >
                GiftHint ✨
              </Text>

              <Heading
                as="h1"
                style={{
                  fontFamily:    F.sans,
                  fontSize:      '26px',
                  fontWeight:    800,
                  color:         C.text,
                  letterSpacing: '-0.03em',
                  lineHeight:    1.2,
                  margin:        '0 0 10px',
                }}
              >
                Your GiftHint week in review 🎁
              </Heading>

              <Text
                style={{
                  fontFamily: F.sans,
                  fontSize:   '14px',
                  color:      C.muted,
                  margin:     '0',
                  lineHeight: 1.5,
                }}
              >
                Week of {weekOf} · {wisherName}
              </Text>
            </Section>

            <Hr style={{ borderColor: C.border, margin: '0' }} />

            {/* ── Stats row ───────────────────────────────────────────────── */}
            <Section style={{ padding: '28px 36px' }}>
              <Eyebrow>This week's highlights</Eyebrow>
              <Row style={{ gap: '10px' }}>
                <StatPill
                  emoji="👀"
                  value={totalViews.toLocaleString('en-US')}
                  label={pluralise(totalViews, 'person viewed', 'people viewed')}
                  colour={C.purple}
                />
                <Column style={{ width: '10px' }} />
                <StatPill
                  emoji="🛒"
                  value={topClickedItem?.clicks ?? 0}
                  label="buy clicks on top item"
                  colour={C.amber}
                />
                <Column style={{ width: '10px' }} />
                <StatPill
                  emoji="🎉"
                  value={claimedItems.length}
                  label={pluralise(claimedItems.length, 'item claimed', 'items claimed')}
                  colour={C.green}
                />
              </Row>
            </Section>

            {/* ── Per-list views ───────────────────────────────────────────── */}
            {listSummaries.length > 0 && (
              <>
                <Hr style={{ borderColor: C.border, margin: '0' }} />
                <Section style={{ padding: '24px 36px' }}>
                  <Eyebrow>List performance</Eyebrow>
                  {listSummaries.map((list) => (
                    <Row
                      key={list.slug}
                      style={{
                        marginBottom:    '10px',
                        padding:         '12px 14px',
                        backgroundColor: C.surface2,
                        borderRadius:    '10px',
                        border:          `1px solid ${C.border}`,
                      }}
                    >
                      <Column>
                        <Text
                          style={{
                            fontFamily: F.sans,
                            fontSize:   '13px',
                            fontWeight: 600,
                            color:      C.text,
                            margin:     '0 0 2px',
                          }}
                        >
                          {list.listName}
                        </Text>
                        <Text style={{ fontFamily: F.sans, fontSize: '12px', color: C.muted, margin: 0 }}>
                          👀{' '}
                          <strong style={{ color: C.purple }}>
                            {list.views.toLocaleString('en-US')}
                          </strong>{' '}
                          {pluralise(list.views, 'view', 'views')} this week
                        </Text>
                      </Column>
                    </Row>
                  ))}
                </Section>
              </>
            )}

            {/* ── Top clicked item ─────────────────────────────────────────── */}
            {topClickedItem && (
              <>
                <Hr style={{ borderColor: C.border, margin: '0' }} />
                <Section style={{ padding: '24px 36px' }}>
                  <Eyebrow>🔥 Most wanted this week</Eyebrow>
                  <Row
                    style={{
                      padding:         '14px',
                      backgroundColor: C.surface2,
                      borderRadius:    '12px',
                      border:          `1px solid ${C.border}`,
                    }}
                  >
                    {topClickedItem.imageUrl && (
                      <Column style={{ width: '64px', paddingRight: '12px', verticalAlign: 'top' }}>
                        <Img
                          src={topClickedItem.imageUrl}
                          alt=""
                          width={64}
                          height={64}
                          style={{
                            borderRadius:    '8px',
                            objectFit:       'cover',
                            display:         'block',
                            backgroundColor: C.bg,
                          }}
                        />
                      </Column>
                    )}
                    <Column style={{ verticalAlign: 'top' }}>
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
                        {topClickedItem.title}
                      </Text>
                      <Text style={{ fontFamily: F.sans, fontSize: '12px', color: C.muted, margin: '0 0 10px' }}>
                        <strong style={{ color: C.amber }}>
                          {topClickedItem.clicks.toLocaleString('en-US')}
                        </strong>{' '}
                        {pluralise(topClickedItem.clicks, 'person clicked', 'people clicked')} to buy
                      </Text>
                      <Link
                        href={topClickedItem.sourceUrl}
                        style={{
                          display:         'inline-block',
                          padding:         '6px 14px',
                          borderRadius:    '8px',
                          backgroundColor: C.purpleDim,
                          border:          `1px solid ${C.purpleRing}`,
                          color:           C.purple,
                          fontSize:        '12px',
                          fontWeight:      700,
                          textDecoration:  'none',
                        }}
                      >
                        View item →
                      </Link>
                    </Column>
                  </Row>
                </Section>
              </>
            )}

            {/* ── Claimed items ────────────────────────────────────────────── */}
            {claimedItems.length > 0 && (
              <>
                <Hr style={{ borderColor: C.border, margin: '0' }} />
                <Section style={{ padding: '24px 36px' }}>
                  <Eyebrow>🎉 Recently claimed</Eyebrow>
                  <Text
                    style={{
                      fontFamily: F.sans,
                      fontSize:   '14px',
                      color:      C.text,
                      margin:     '0 0 14px',
                      lineHeight: 1.5,
                    }}
                  >
                    <strong style={{ color: C.green }}>
                      {claimedItems.length} {pluralise(claimedItems.length, 'item has', 'items have')} been claimed
                    </strong>{' '}
                    — your gifters are on it! These are marked so no one doubles up.
                  </Text>

                  {/* Thumbnail strip — up to 5 */}
                  <Row>
                    {claimedItems.slice(0, 5).map((item, i) => (
                      <Column key={i} style={{ paddingRight: i < 4 ? '8px' : '0', width: '20%' }}>
                        {item.imageUrl ? (
                          <Img
                            src={item.imageUrl}
                            alt={item.title}
                            width={80}
                            height={80}
                            style={{
                              borderRadius:    '8px',
                              objectFit:       'cover',
                              display:         'block',
                              width:           '100%',
                              maxWidth:        '80px',
                              backgroundColor: C.surface2,
                              border:          `1px solid ${C.border}`,
                            }}
                          />
                        ) : (
                          <Section
                            style={{
                              width:           '100%',
                              maxWidth:        '80px',
                              height:          '80px',
                              backgroundColor: C.surface2,
                              borderRadius:    '8px',
                              border:          `1px solid ${C.border}`,
                              textAlign:       'center',
                              lineHeight:      '80px',
                              fontSize:        '28px',
                            }}
                          >
                            🎁
                          </Section>
                        )}
                        <Text
                          style={{
                            fontFamily:  F.sans,
                            fontSize:    '10px',
                            color:       C.muted,
                            margin:      '4px 0 0',
                            lineHeight:  1.3,
                            overflow:    'hidden',
                            display:     '-webkit-box',
                          }}
                        >
                          {item.title.length > 28 ? `${item.title.slice(0, 28)}…` : item.title}
                        </Text>
                      </Column>
                    ))}
                  </Row>

                  {claimedItems.length > 5 && (
                    <Text style={{ fontFamily: F.sans, fontSize: '12px', color: C.muted, margin: '10px 0 0' }}>
                      + {claimedItems.length - 5} more claimed item{claimedItems.length - 5 > 1 ? 's' : ''}
                    </Text>
                  )}
                </Section>
              </>
            )}

            {/* ── CTA ─────────────────────────────────────────────────────── */}
            <Hr style={{ borderColor: C.border, margin: '0' }} />
            <Section style={{ padding: '28px 36px', textAlign: 'center' as const }}>
              <Text
                style={{
                  fontFamily: F.sans,
                  fontSize:   '14px',
                  color:      C.muted,
                  margin:     '0 0 16px',
                  lineHeight: 1.5,
                }}
              >
                Add new items, update prices, or remove things you already received.
              </Text>
              <Button
                href={dashboardUrl}
                style={{
                  display:         'inline-block',
                  padding:         '14px 32px',
                  borderRadius:    '12px',
                  backgroundColor: C.purple,
                  color:           '#ffffff',
                  fontSize:        '15px',
                  fontWeight:      700,
                  textDecoration:  'none',
                  letterSpacing:   '-0.01em',
                  fontFamily:      F.sans,
                }}
              >
                Update your list →
              </Button>
            </Section>

            {/* ── Footer ──────────────────────────────────────────────────── */}
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
                <strong style={{ color: C.muted }}>Affiliate disclosure:</strong> GiftHint earns a
                commission on purchases made through links on your wishlist, at no extra cost to your
                gifters. This helps keep GiftHint free.
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
                You're receiving this weekly digest because you have an account on{' '}
                <Link href="https://gifthint.io" style={{ color: C.purple, textDecoration: 'none' }}>
                  GiftHint
                </Link>
                .{' '}
                <Link href={unsubscribeUrl} style={{ color: C.muted, textDecoration: 'underline' }}>
                  Unsubscribe from digest emails
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

WeeklyDigestEmail.PreviewProps = {
  wisherName:     'Emma',
  dashboardUrl:   'https://gifthint.io/dashboard',
  unsubscribeUrl: 'https://gifthint.io/unsubscribe?token=preview-token',
  totalViews:     42,
  weekOf:         'May 12–18, 2025',
  listSummaries: [
    { listName: 'Birthday Wishlist',   slug: 'birthday-2025', views: 28 },
    { listName: 'Christmas 2025',       slug: 'christmas-2025', views: 14 },
  ],
  topClickedItem: {
    title:     'Moleskine Classic Notebook, Hard Cover, Large (5 x 8.25) Ruled/Lined',
    imageUrl:  'https://m.media-amazon.com/images/I/71Dt18HQXAL._AC_SL1500_.jpg',
    clicks:    11,
    sourceUrl: 'https://www.amazon.com/dp/B00F9LM0AS',
  },
  claimedItems: [
    { title: 'Kindle Paperwhite (16 GB)', imageUrl: null },
    { title: 'Le Creuset Cast Iron Skillet', imageUrl: null },
    { title: 'Dyson Airwrap',               imageUrl: null },
  ],
} satisfies WeeklyDigestEmailProps
