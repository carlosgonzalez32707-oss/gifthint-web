/**
 * lib/email.ts — GiftHint
 *
 * Email sending utility powered by Resend (resend.com).
 * Free tier: 3,000 emails/month, 100/day.
 *
 * Usage:
 *   import { sendReminderEmail } from '@/lib/email'
 *   await sendReminderEmail({
 *     to:           'gifter@example.com',
 *     wisherName:   'Emma',
 *     occasionDate: '2025-12-25',
 *     listUrl:      'https://gifthint.io/list/emma',
 *     topItems:     [{ title, imageUrl, price, currency, sourceUrl }],
 *   })
 *
 * Env vars required:
 *   RESEND_API_KEY   — from resend.com → API Keys
 *
 * HTML template design:
 *   - Dark background matching GiftHint's #0C0C0E canvas
 *   - Purple accent (#8B83F0) for CTAs
 *   - Green (#4EC99A) for prices
 *   - Max-width 600px — email client safe
 *   - Inline styles only — external stylesheets are stripped by most clients
 *   - Images are optional; falls back gracefully if imageUrl is null
 *   - Tested against: Gmail (web), Apple Mail, Outlook 2019
 *
 * SERVER-SIDE ONLY — never import this in a client component.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ReminderEmailItem {
  title:     string
  imageUrl:  string | null
  price:     number | null
  currency:  string
  sourceUrl: string
}

export interface SendReminderEmailParams {
  to:           string
  wisherName:   string
  occasionDate: string | null   // ISO "YYYY-MM-DD", null if no date was provided
  listUrl:      string
  topItems:     ReminderEmailItem[]   // 0–3 unclaimed items
}

// ── Resend client (lazy init) ─────────────────────────────────────────────────

// We import Resend dynamically at the call site rather than top-level so that
// the module can be tree-shaken from client bundles and to avoid crashing
// at module-load time if RESEND_API_KEY is missing in dev.

async function getResend() {
  // ── Test mode — set RESEND_TEST_MODE=true to skip real API calls ───────────
  // Useful for Jest tests and local development without a Resend account.
  // The returned object satisfies the interface used by sendReminderEmail.
  if (process.env.RESEND_TEST_MODE === 'true') {
    return {
      emails: {
        send: async (_params: unknown) => ({
          data:  { id: 'test-mode-noop' },
          error: null,
        }),
      },
    }
  }

  const { Resend } = await import('resend')
  const key = process.env.RESEND_API_KEY
  if (!key) {
    throw new Error(
      '[GiftHint/email] RESEND_API_KEY env var is not set. ' +
      'Add it to .env.local (see .env.local.example).',
    )
  }
  return new Resend(key)
}

// ── Date formatting ───────────────────────────────────────────────────────────

function formatOccasionDate(isoDate: string): string {
  // Parse "2025-12-25" without timezone ambiguity by specifying UTC
  const [year, month, day] = isoDate.split('-').map(Number)
  const d = new Date(Date.UTC(year, month - 1, day))
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year:    'numeric',
    month:   'long',
    day:     'numeric',
    timeZone: 'UTC',
  })
}

function formatPrice(price: number, currency: string): string {
  const symbol = currency === 'USD' ? '$' : currency + ' '
  return `${symbol}${price.toFixed(2)}`
}

// ── HTML template ─────────────────────────────────────────────────────────────

function buildReminderHtml({
  wisherName,
  occasionDate,
  listUrl,
  topItems,
}: Omit<SendReminderEmailParams, 'to'>): string {
  const formattedDate = occasionDate ? formatOccasionDate(occasionDate) : null

  // ── Item cards HTML ────────────────────────────────────────────────────────
  const itemsHtml =
    topItems.length === 0
      ? ''
      : `
    <!-- Items heading -->
    <tr>
      <td style="padding: 0 40px 8px;">
        <p style="
          margin: 0;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #7A7870;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        ">
          TOP PICKS STILL AVAILABLE
        </p>
      </td>
    </tr>

    <!-- Item cards -->
    ${topItems.map((item) => buildItemCardHtml(item)).join('\n')}

    <!-- Spacer -->
    <tr><td style="height: 8px;"></td></tr>
  `

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="dark" />
  <title>Gift reminder from GiftHint</title>
  <!--[if mso]>
  <noscript>
    <xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
  </noscript>
  <![endif]-->
</head>
<body style="
  margin: 0;
  padding: 0;
  background-color: #0C0C0E;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  -webkit-text-size-adjust: 100%;
  -ms-text-size-adjust: 100%;
">

  <!-- Outer wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
    style="background-color: #0C0C0E; min-height: 100vh;">
    <tr>
      <td align="center" style="padding: 40px 16px;">

        <!-- Card -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
          style="
            max-width: 560px;
            background-color: #141418;
            border-radius: 20px;
            border: 1px solid rgba(240,238,232,0.07);
            overflow: hidden;
          ">

          <!-- ── Header ──────────────────────────────────────────────────────── -->
          <tr>
            <td style="
              padding: 32px 40px 28px;
              border-bottom: 1px solid rgba(240,238,232,0.07);
            ">
              <!-- Logo wordmark -->
              <p style="
                margin: 0 0 24px;
                font-size: 18px;
                font-weight: 800;
                color: #8B83F0;
                letter-spacing: -0.02em;
              ">GiftHint ✨</p>

              <!-- Headline -->
              <h1 style="
                margin: 0 0 10px;
                font-size: 26px;
                font-weight: 800;
                color: #F0EEE8;
                line-height: 1.2;
                letter-spacing: -0.03em;
              ">
                ${formattedDate
                  ? `${wisherName}'s occasion is in 7 days 🎉`
                  : `Don't forget ${wisherName}'s wishlist 🎁`}
              </h1>

              <!-- Sub-copy -->
              <p style="
                margin: 0;
                font-size: 15px;
                color: #7A7870;
                line-height: 1.5;
              ">
                ${formattedDate
                  ? `You signed up for a reminder about <strong style="color: #F0EEE8;">${wisherName}</strong>'s upcoming occasion on <strong style="color: #F0EEE8;">${formattedDate}</strong>. Time to pick something great.`
                  : `You asked us to keep you in the loop about <strong style="color: #F0EEE8;">${wisherName}</strong>'s wishlist. Here's what's still unclaimed.`}
              </p>
            </td>
          </tr>

          <!-- ── Body ───────────────────────────────────────────────────────── -->
          <tr>
            <td style="padding: 28px 0 0;">

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">

                ${itemsHtml}

                <!-- CTA button row -->
                <tr>
                  <td align="center" style="padding: 24px 40px 32px;">
                    <a
                      href="${listUrl}"
                      target="_blank"
                      rel="noopener noreferrer"
                      style="
                        display: inline-block;
                        padding: 14px 32px;
                        border-radius: 12px;
                        background-color: #8B83F0;
                        color: #ffffff;
                        font-size: 15px;
                        font-weight: 700;
                        text-decoration: none;
                        letter-spacing: -0.01em;
                      "
                    >
                      View ${wisherName}'s wishlist →
                    </a>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- ── Footer ─────────────────────────────────────────────────────── -->
          <tr>
            <td style="
              padding: 20px 40px;
              border-top: 1px solid rgba(240,238,232,0.07);
            ">
              <p style="
                margin: 0;
                font-size: 12px;
                color: #7A7870;
                line-height: 1.6;
                text-align: center;
              ">
                You're receiving this because you signed up for a gift reminder on
                <a href="${listUrl}" style="color: #8B83F0; text-decoration: none;">GiftHint</a>.
                <br />
                No more reminders will be sent for this occasion.
              </p>
            </td>
          </tr>

        </table>
        <!-- /Card -->

      </td>
    </tr>
  </table>

</body>
</html>
  `.trim()
}

function buildItemCardHtml(item: ReminderEmailItem): string {
  const priceHtml =
    item.price != null
      ? `<span style="font-size: 14px; font-weight: 700; color: #4EC99A;">${formatPrice(item.price, item.currency)}</span>`
      : ''

  const imageHtml = item.imageUrl
    ? `
      <td width="56" style="padding: 0 12px 0 0; vertical-align: top;">
        <img
          src="${item.imageUrl}"
          alt=""
          width="56"
          height="56"
          style="
            display: block;
            width: 56px;
            height: 56px;
            border-radius: 8px;
            object-fit: cover;
            background-color: #1C1C22;
          "
        />
      </td>`
    : `
      <td width="56" style="padding: 0 12px 0 0; vertical-align: top;">
        <div style="
          width: 56px;
          height: 56px;
          border-radius: 8px;
          background-color: #1C1C22;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          line-height: 56px;
          text-align: center;
        ">🎁</div>
      </td>`

  return `
    <tr>
      <td style="padding: 0 40px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
          style="
            background-color: #1C1C22;
            border-radius: 12px;
            border: 1px solid rgba(240,238,232,0.07);
            overflow: hidden;
          ">
          <tr>
            <td style="padding: 14px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  ${imageHtml}
                  <td style="vertical-align: top;">
                    <p style="
                      margin: 0 0 4px;
                      font-size: 13px;
                      font-weight: 600;
                      color: #F0EEE8;
                      line-height: 1.35;
                      display: -webkit-box;
                      -webkit-line-clamp: 2;
                      -webkit-box-orient: vertical;
                      overflow: hidden;
                    ">${escapeHtml(item.title)}</p>
                    ${priceHtml}
                  </td>
                  <td width="80" align="right" style="vertical-align: middle; padding-left: 12px;">
                    <a
                      href="${item.sourceUrl}"
                      target="_blank"
                      rel="noopener noreferrer"
                      style="
                        display: inline-block;
                        padding: 7px 14px;
                        border-radius: 8px;
                        background-color: rgba(139,131,240,0.13);
                        border: 1px solid rgba(139,131,240,0.28);
                        color: #8B83F0;
                        font-size: 12px;
                        font-weight: 700;
                        text-decoration: none;
                        white-space: nowrap;
                      "
                    >Buy →</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `
}

// ── XSS guard for user-supplied title strings ─────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ── Subject line ──────────────────────────────────────────────────────────────

function buildSubject(wisherName: string, occasionDate: string | null): string {
  if (occasionDate) {
    return `⏰ 7 days until ${wisherName}'s occasion — gift ideas inside`
  }
  return `🎁 Gift ideas for ${wisherName} — from their GiftHint wishlist`
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Sends a reminder email to a gifter via Resend.
 *
 * @throws Error if RESEND_API_KEY is missing or if Resend returns a non-2xx response.
 */
export async function sendReminderEmail(params: SendReminderEmailParams): Promise<void> {
  const { to, wisherName, occasionDate, listUrl, topItems } = params

  const resend = await getResend()

  const { error } = await resend.emails.send({
    from:    'GiftHint Reminders <reminders@gifthint.io>',
    to:      [to],
    subject: buildSubject(wisherName, occasionDate),
    html:    buildReminderHtml({ wisherName, occasionDate, listUrl, topItems }),
  })

  if (error) {
    throw new Error(`[GiftHint/email] Resend error: ${JSON.stringify(error)}`)
  }
}
