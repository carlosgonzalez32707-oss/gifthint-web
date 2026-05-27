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

export interface SendReferralEmailParams {
  /** Referrer's email address */
  to:           string
  /** Referrer's display name or "there" as fallback */
  referrerName: string
}

export interface SendPaymentFailedEmailParams {
  /** User's email address */
  to:          string
  /** User's display name or 'there' as fallback */
  displayName: string
  /** URL where the user can update their payment method */
  billingUrl:  string
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

// ── sendPoolFundedEmail ───────────────────────────────────────────────────────
/**
 * Notifies the group-gift organiser that their pool is fully funded.
 *
 * Includes:
 *   - Total collected vs target
 *   - Contributor list (anonymous entries shown as "Anonymous")
 *   - Instructions to purchase the item and submit a receipt
 *
 * Called from app/api/group-gift/webhook/route.ts after the DB trigger
 * confirms the pool status has flipped to 'funded'.
 */

export interface PoolContributorSummary {
  name:      string | null
  amount:    number
  anonymous: boolean
}

export interface SendPoolFundedEmailParams {
  organiserEmail:  string
  organiserName:   string
  itemTitle:       string
  itemImageUrl:    string | null
  itemUrl:         string | null
  targetAmount:    number
  collectedAmount: number
  currency?:       string
  contributors:    PoolContributorSummary[]
}

function formatPoolMoney(amount: number, currency = 'gbp'): string {
  try {
    return new Intl.NumberFormat('en-GB', {
      style:                 'currency',
      currency,
      minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `£${amount.toFixed(2)}`
  }
}

function buildPoolFundedHtml(params: SendPoolFundedEmailParams): string {
  const {
    organiserName,
    itemTitle,
    itemImageUrl,
    itemUrl,
    targetAmount,
    collectedAmount,
    currency = 'gbp',
    contributors,
  } = params

  const totalFormatted  = formatPoolMoney(collectedAmount, currency)
  const targetFormatted = formatPoolMoney(targetAmount,    currency)

  const contributorRows = contributors
    .map((c) => {
      const displayName = c.anonymous || !c.name ? 'Anonymous' : c.name
      return `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #242430;color:#F0EEE8;font-size:13px;">
            ${displayName}
          </td>
          <td style="padding:8px 0;border-bottom:1px solid #242430;color:#4EC99A;font-size:13px;
                     text-align:right;font-weight:600;">
            ${formatPoolMoney(c.amount, currency)}
          </td>
        </tr>`
    })
    .join('')

  const imageBlock = itemImageUrl
    ? `<img src="${itemImageUrl}" alt="${itemTitle}"
         style="width:80px;height:80px;object-fit:cover;border-radius:8px;
                border:1px solid #242430;display:block;margin:0 auto 12px;" />`
    : ''

  const buyLink = itemUrl
    ? `<a href="${itemUrl}"
         style="display:inline-block;background:#8B83F0;color:#fff;text-decoration:none;
                padding:12px 24px;border-radius:8px;font-size:13px;font-weight:700;
                letter-spacing:0.2px;margin-top:16px;">
         Buy the gift →
       </a>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0C0C0E;font-family:system-ui,-apple-system,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
    style="background:#0C0C0E;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;">

          <!-- Logo -->
          <tr>
            <td style="padding-bottom:24px;text-align:center;">
              <span style="font-size:22px;font-weight:800;color:#F0EEE8;letter-spacing:-0.5px;">
                Gift<span style="color:#8B83F0;">Hint</span>
              </span>
            </td>
          </tr>

          <!-- Hero card -->
          <tr>
            <td style="background:#141418;border:1px solid rgba(240,238,232,0.07);
                       border-radius:16px;padding:28px;text-align:center;">

              <p style="font-size:32px;margin:0 0 8px;">🎉</p>
              <h1 style="font-size:20px;font-weight:700;color:#F0EEE8;margin:0 0 6px;">
                The pool is fully funded!
              </h1>
              <p style="font-size:13.5px;color:#7A7870;margin:0 0 20px;line-height:1.6;">
                Hi ${organiserName}, your group gift pool has reached its target.
                It's time to buy the gift!
              </p>

              ${imageBlock}

              <p style="font-size:14px;font-weight:600;color:#F0EEE8;margin:0 0 4px;">
                ${itemTitle}
              </p>
              <p style="font-size:13px;color:#4EC99A;font-weight:700;margin:0 0 20px;">
                ${totalFormatted} collected of ${targetFormatted} target
              </p>

              ${buyLink}
            </td>
          </tr>

          <!-- Contributors -->
          ${contributorRows.length > 0 ? `
          <tr>
            <td style="padding-top:20px;">
              <p style="font-size:11px;font-weight:700;color:#7A7870;letter-spacing:0.08em;
                         text-transform:uppercase;margin:0 0 10px;">
                Contributors
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="background:#141418;border:1px solid rgba(240,238,232,0.07);
                       border-radius:12px;padding:0 16px;overflow:hidden;">
                ${contributorRows}
              </table>
            </td>
          </tr>` : ''}

          <!-- Next steps -->
          <tr>
            <td style="padding-top:24px;">
              <div style="background:#141418;border:1px solid rgba(139,131,240,0.28);
                          border-radius:12px;padding:18px 20px;">
                <p style="font-size:12px;font-weight:700;color:#8B83F0;
                           letter-spacing:0.08em;text-transform:uppercase;margin:0 0 10px;">
                  Next steps
                </p>
                <ol style="margin:0;padding-left:18px;color:#F0EEE8;font-size:13px;line-height:1.8;">
                  <li>Purchase the gift using the link above</li>
                  <li>Keep your receipt — contributors may ask for confirmation</li>
                  <li>Reply to this email with any questions</li>
                </ol>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:28px;text-align:center;">
              <p style="font-size:11px;color:#7A7870;line-height:1.6;margin:0;">
                Sent by GiftHint · <a href="https://gifthint.io" style="color:#7A7870;">gifthint.io</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export async function sendPoolFundedEmail(params: SendPoolFundedEmailParams): Promise<void> {
  const resend = await getResend()

  const { error } = await resend.emails.send({
    from:    'GiftHint <hello@gifthint.io>',
    to:      [params.organiserEmail],
    subject: `🎉 "${params.itemTitle}" is fully funded — time to buy!`,
    html:    buildPoolFundedHtml(params),
  })

  if (error) {
    throw new Error(`[GiftHint/email] sendPoolFundedEmail Resend error: ${JSON.stringify(error)}`)
  }
}

// ── sendContributorThankYouEmail ──────────────────────────────────────────────
/**
 * Sends a personalised thank-you email to a group-gift contributor once the
 * wisher marks the item as purchased.
 *
 * Includes:
 *   - Their contribution amount
 *   - Item title + thumbnail
 *   - Optional receipt URL from the wisher
 *   - Viral CTA: "Create your own GiftHint list"
 */

export interface ContributorThankYouItem {
  title:     string
  imageUrl:  string | null
  price:     number | null
  sourceUrl: string
}

export interface SendContributorThankYouEmailParams {
  contributorEmail:   string
  contributorName:    string
  contributionAmount: number
  currency?:          string
  wisherName:         string
  receiptUrl:         string | null
  item:               ContributorThankYouItem
}

function buildContributorThankYouHtml(params: SendContributorThankYouEmailParams): string {
  const {
    contributorName,
    contributionAmount,
    currency = 'gbp',
    wisherName,
    receiptUrl,
    item,
  } = params

  const amountFormatted = formatPoolMoney(contributionAmount, currency)

  const imageBlock = item.imageUrl
    ? `<img src="${item.imageUrl}" alt="${escapeHtml(item.title)}"
         style="width:72px;height:72px;object-fit:cover;border-radius:8px;
                border:1px solid #242430;display:block;margin:0 auto 14px;" />`
    : ''

  const receiptBlock = receiptUrl
    ? `
      <tr>
        <td style="padding-top:18px;">
          <div style="background:#141418;border:1px solid rgba(240,238,232,0.07);
                      border-radius:12px;padding:14px 18px;">
            <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#7A7870;
                       letter-spacing:0.08em;text-transform:uppercase;">
              Purchase receipt
            </p>
            <a href="${receiptUrl}"
               style="color:#8B83F0;font-size:13px;word-break:break-all;text-decoration:none;">
              ${escapeHtml(receiptUrl)}
            </a>
          </div>
        </td>
      </tr>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0C0C0E;font-family:system-ui,-apple-system,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
    style="background:#0C0C0E;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;">

          <!-- Logo -->
          <tr>
            <td style="padding-bottom:24px;text-align:center;">
              <span style="font-size:22px;font-weight:800;color:#F0EEE8;letter-spacing:-0.5px;">
                Gift<span style="color:#8B83F0;">Hint</span>
              </span>
            </td>
          </tr>

          <!-- Hero card -->
          <tr>
            <td style="background:#141418;border:1px solid rgba(240,238,232,0.07);
                       border-radius:16px;padding:28px;text-align:center;">

              <p style="font-size:36px;margin:0 0 10px;">🎁</p>
              <h1 style="font-size:20px;font-weight:700;color:#F0EEE8;margin:0 0 8px;">
                The gift has been purchased!
              </h1>
              <p style="font-size:13.5px;color:#7A7870;margin:0 0 22px;line-height:1.6;">
                Hi ${escapeHtml(contributorName)}, your contribution to <strong style="color:#F0EEE8;">${escapeHtml(wisherName)}</strong>'s
                group gift came through. The item has been bought — thank you for chipping in!
              </p>

              ${imageBlock}

              <p style="font-size:15px;font-weight:700;color:#F0EEE8;margin:0 0 4px;">
                ${escapeHtml(item.title)}
              </p>
              <p style="font-size:13px;color:#4EC99A;font-weight:600;margin:0 0 16px;">
                Your contribution: ${amountFormatted}
              </p>

              <a href="${item.sourceUrl}" target="_blank" rel="noopener noreferrer"
                 style="display:inline-block;background:rgba(139,131,240,0.13);
                        border:1px solid rgba(139,131,240,0.28);color:#8B83F0;
                        text-decoration:none;padding:10px 20px;border-radius:8px;
                        font-size:13px;font-weight:700;">
                View item ↗
              </a>
            </td>
          </tr>

          ${receiptBlock}

          <!-- Viral CTA -->
          <tr>
            <td style="padding-top:20px;">
              <div style="background:#141418;border:1px solid rgba(240,238,232,0.07);
                          border-radius:16px;padding:24px;text-align:center;">
                <p style="font-size:24px;margin:0 0 8px;">✨</p>
                <p style="font-size:15px;font-weight:700;color:#F0EEE8;margin:0 0 6px;">
                  Create your own wishlist
                </p>
                <p style="font-size:13px;color:#7A7870;margin:0 0 18px;line-height:1.6;">
                  Save things you love from anywhere on the web and let friends
                  chip in with group gifts — or buy directly.
                </p>
                <a href="https://gifthint.io"
                   target="_blank"
                   rel="noopener noreferrer"
                   style="display:inline-block;background:#8B83F0;color:#fff;
                          text-decoration:none;padding:12px 28px;border-radius:10px;
                          font-size:14px;font-weight:700;letter-spacing:-0.01em;">
                  Create your GiftHint list →
                </a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:28px;text-align:center;">
              <p style="font-size:11px;color:#7A7870;line-height:1.6;margin:0;">
                Sent by GiftHint · <a href="https://gifthint.io" style="color:#7A7870;">gifthint.io</a>
                <br />You received this because you contributed to a group gift.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export async function sendContributorThankYouEmail(
  params: SendContributorThankYouEmailParams,
): Promise<void> {
  const resend = await getResend()

  const { error } = await resend.emails.send({
    from:    'GiftHint <hello@gifthint.io>',
    to:      [params.contributorEmail],
    subject: `🎁 The gift has arrived — thanks for chipping in!`,
    html:    buildContributorThankYouHtml(params),
  })

  if (error) {
    throw new Error(
      `[GiftHint/email] sendContributorThankYouEmail Resend error: ${JSON.stringify(error)}`,
    )
  }
}

// ── sendPriceDropAlert ────────────────────────────────────────────────────────
/**
 * Sent to the wisher when a saved item's price drops below their alert threshold.
 *
 * @param to             - Wisher's email address
 * @param wisherName     - Display name for the greeting
 * @param itemTitle      - Product title
 * @param itemUrl        - Source URL (links "Buy now" button)
 * @param itemImageUrl   - Product thumbnail (optional)
 * @param oldPrice       - Previous known price (major currency units)
 * @param newPrice       - New lower price
 * @param lowestPrice    - All-time low for this item
 * @param currency       - ISO 4217 code, defaults to 'GBP'
 */
export interface SendPriceDropAlertParams {
  to:           string
  wisherName:   string
  itemTitle:    string
  itemUrl:      string
  itemImageUrl: string | null
  oldPrice:     number
  newPrice:     number
  lowestPrice:  number
  currency?:    string
}

function buildPriceDropAlertHtml(p: SendPriceDropAlertParams): string {
  const currency   = p.currency ?? 'GBP'
  const symbol     = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '£'
  const fmt        = (n: number) => `${symbol}${n.toFixed(2)}`
  const dropAmount = (p.oldPrice - p.newPrice).toFixed(2)
  const dropPct    = Math.round(((p.oldPrice - p.newPrice) / p.oldPrice) * 100)
  const isAllTimeLow = p.newPrice <= p.lowestPrice

  const imgBlock = p.itemImageUrl
    ? `<img src="${p.itemImageUrl}" alt="${p.itemTitle}" width="120" height="120"
            style="border-radius:12px;object-fit:cover;display:block;margin:0 auto 20px;" />`
    : ''

  const allTimeLowBadge = isAllTimeLow
    ? `<div style="margin:12px auto 0;display:inline-block;background:#10b981;color:#fff;
                  font-size:11px;font-weight:700;padding:4px 10px;border-radius:999px;
                  letter-spacing:0.04em;">🏆 ALL-TIME LOW</div>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0c0c0e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0c0c0e;padding:40px 16px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#13131a;border-radius:16px;border:1px solid rgba(255,255,255,0.08);overflow:hidden;max-width:100%;">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:28px 32px;text-align:center;">
          <p style="margin:0;font-size:28px;">📉</p>
          <h1 style="margin:8px 0 0;color:#fff;font-size:22px;font-weight:800;letter-spacing:-0.03em;">
            Price drop on your wishlist!
          </h1>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px;">

          <p style="margin:0 0 24px;color:#a0a0b0;font-size:14px;line-height:1.6;">
            Hi ${p.wisherName.split(' ')[0]}, an item on your GiftHint wishlist just got cheaper.
          </p>

          <!-- Item card -->
          <div style="background:#1a1a24;border-radius:12px;border:1px solid rgba(255,255,255,0.06);padding:24px;text-align:center;margin-bottom:24px;">
            ${imgBlock}
            <p style="margin:0 0 16px;color:#e2e2f0;font-size:15px;font-weight:600;line-height:1.4;">
              ${p.itemTitle}
            </p>

            <!-- Price comparison -->
            <div style="display:flex;justify-content:center;align-items:center;gap:16px;flex-wrap:wrap;">
              <span style="color:#6b7280;font-size:16px;text-decoration:line-through;">${fmt(p.oldPrice)}</span>
              <span style="font-size:28px;">→</span>
              <span style="color:#10b981;font-size:28px;font-weight:800;">${fmt(p.newPrice)}</span>
            </div>

            <p style="margin:8px 0 0;color:#10b981;font-size:13px;font-weight:600;">
              You save ${symbol}${dropAmount} (${dropPct}% off)
            </p>
            ${allTimeLowBadge}
          </div>

          <!-- CTA -->
          <div style="text-align:center;margin-bottom:24px;">
            <a href="${p.itemUrl}"
               style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;
                      font-size:14px;font-weight:700;padding:14px 32px;border-radius:999px;
                      letter-spacing:-0.01em;">
              View item →
            </a>
          </div>

          <p style="margin:0;color:#6b7280;font-size:12px;text-align:center;line-height:1.6;">
            Your all-time low for this item: <strong style="color:#a0a0b0;">${fmt(p.lowestPrice)}</strong><br>
            To manage price alerts, visit your
            <a href="https://gifthint.io/dashboard" style="color:#7c3aed;text-decoration:none;">GiftHint dashboard</a>.
          </p>

        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 32px 24px;text-align:center;">
          <p style="margin:0;color:#4b4b60;font-size:11px;">
            © GiftHint · You're receiving this because price alerts are enabled on your wishlist.<br>
            <a href="https://gifthint.io/dashboard" style="color:#4b4b60;">Manage alerts</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export async function sendPriceDropAlert(
  params: SendPriceDropAlertParams,
): Promise<void> {
  const resend = await getResend()

  const dropPct = Math.round(((params.oldPrice - params.newPrice) / params.oldPrice) * 100)
  const currency = params.currency ?? 'GBP'
  const symbol   = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '£'

  const { error } = await resend.emails.send({
    from:    'GiftHint <alerts@gifthint.io>',
    to:      [params.to],
    subject: `📉 Price drop: ${params.itemTitle} is now ${symbol}${params.newPrice.toFixed(2)} (${dropPct}% off)`,
    html:    buildPriceDropAlertHtml(params),
  })

  if (error) {
    throw new Error(
      `[GiftHint/email] sendPriceDropAlert Resend error: ${JSON.stringify(error)}`,
    )
  }
}

// ── sendReferralEmail ─────────────────────────────────────────────────────────

function buildReferralEmailHtml(params: SendReferralEmailParams): string {
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://gifthint.io'

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0C0C0E;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0C0C0E">
    <tr>
      <td align="center" style="padding:40px 16px">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0"
               style="max-width:600px;width:100%;background:#18181B;border-radius:16px;overflow:hidden">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#4C3BCF 0%,#8B83F0 100%);padding:32px 40px;text-align:center">
              <p style="margin:0;font-size:28px">🎁</p>
              <h1 style="margin:12px 0 0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px">
                Someone signed up with your link!
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 40px">
              <p style="margin:0 0 16px;color:#A1A1AA;font-size:16px;line-height:1.6">
                Hey ${params.referrerName},
              </p>
              <p style="margin:0 0 24px;color:#E4E4E7;font-size:16px;line-height:1.6">
                Someone just joined GiftHint using your referral link. Your referral count
                has been updated — keep sharing and watch it grow!
              </p>

              <!-- CTA -->
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:10px;background:#8B83F0">
                    <a href="${siteUrl}/account/referrals"
                       style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:0.1px">
                      View your referrals →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px 32px;border-top:1px solid #27272A">
              <p style="margin:0;color:#52525B;font-size:13px;line-height:1.5">
                You're receiving this because someone used your GiftHint referral link.
                <a href="${siteUrl}" style="color:#8B83F0;text-decoration:none">gifthint.io</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ── sendPaymentFailedEmail ────────────────────────────────────────────────────

function buildPaymentFailedHtml({
  displayName,
  billingUrl,
}: Omit<SendPaymentFailedEmailParams, 'to'>): string {
  const name = displayName || 'there'
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0C0C0E;font-family:system-ui,-apple-system,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
    style="background:#0C0C0E;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;">

          <!-- Logo -->
          <tr>
            <td style="padding-bottom:24px;text-align:center;">
              <span style="font-size:22px;font-weight:800;color:#F0EEE8;letter-spacing:-0.5px;">
                Gift<span style="color:#8B83F0;">Hint</span>
              </span>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#141418;border:1px solid rgba(240,238,232,0.07);
                       border-radius:16px;padding:32px 28px;text-align:center;">

              <p style="font-size:28px;margin:0 0 12px;">⚠️</p>
              <h1 style="font-size:18px;font-weight:700;color:#F0EEE8;margin:0 0 10px;">
                Your Pro payment didn't go through
              </h1>
              <p style="font-size:13.5px;color:#7A7870;margin:0 0 24px;line-height:1.6;max-width:380px;margin-left:auto;margin-right:auto;">
                Hi ${name}, we couldn't charge your payment method for your GiftHint Pro subscription.
                Update your billing details to keep your Pro features active.
              </p>

              <a href="${billingUrl}"
                 style="display:inline-block;background:#8B83F0;color:#fff;text-decoration:none;
                        padding:13px 28px;border-radius:10px;font-size:13.5px;font-weight:700;
                        letter-spacing:0.2px;">
                Update payment method →
              </a>
            </td>
          </tr>

          <!-- What happens next -->
          <tr>
            <td style="padding-top:20px;">
              <div style="background:#141418;border:1px solid rgba(240,238,232,0.07);
                          border-radius:12px;padding:18px 20px;">
                <p style="font-size:11px;font-weight:700;color:#7A7870;letter-spacing:0.08em;
                           text-transform:uppercase;margin:0 0 10px;">
                  What happens next
                </p>
                <p style="font-size:13px;color:#7A7870;margin:0;line-height:1.7;">
                  Stripe will retry the charge automatically over the next few days.
                  If the payment still fails, your subscription will be cancelled and
                  you'll revert to the free plan at the end of your billing period.
                  Update your card now to avoid any interruption.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:24px;text-align:center;">
              <p style="font-size:11px;color:#7A7870;margin:0;line-height:1.7;">
                Questions? Reply to this email or visit
                <a href="https://gifthint.io/help" style="color:#8B83F0;text-decoration:none;">gifthint.io/help</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/**
 * Sends a payment-failed notification to a Pro subscriber.
 * Triggered by the `invoice.payment_failed` Stripe webhook event.
 */
export async function sendPaymentFailedEmail(
  params: SendPaymentFailedEmailParams,
): Promise<void> {
  const resend = await getResend()

  const { error } = await resend.emails.send({
    from:    'GiftHint <noreply@gifthint.io>',
    to:      [params.to],
    subject: 'Action required: your GiftHint Pro payment failed',
    html:    buildPaymentFailedHtml(params),
  })

  if (error) {
    throw new Error(
      `[GiftHint/email] sendPaymentFailedEmail Resend error: ${JSON.stringify(error)}`,
    )
  }
}

// ── sendReferralEmail ─────────────────────────────────────────────────────────

/**
 * Sends a notification email to a referrer when someone signs up via their link.
 */
export async function sendReferralEmail(
  params: SendReferralEmailParams,
): Promise<void> {
  const resend = await getResend()

  const { error } = await resend.emails.send({
    from:    'GiftHint <noreply@gifthint.io>',
    to:      [params.to],
    subject: '🎉 Someone signed up with your GiftHint referral link!',
    html:    buildReferralEmailHtml(params),
  })

  if (error) {
    throw new Error(
      `[GiftHint/email] sendReferralEmail Resend error: ${JSON.stringify(error)}`,
    )
  }
}
