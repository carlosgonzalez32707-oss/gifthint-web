# Stripe Setup Guide — GiftHint Group Gifting

Step-by-step instructions for wiring up Stripe test and live modes for the
group gifting feature. Follow this guide when setting up a new environment
(local, staging, or production).

---

## 1. Create a Stripe account

1. Go to [https://dashboard.stripe.com/register](https://dashboard.stripe.com/register)
2. Enter your email, full name, country, and password — click **Create account**
3. Verify your email address via the confirmation link Stripe sends
4. On the "Activate your account" screen you can skip business verification for now —
   test mode works without it

> **Test mode vs Live mode**
> Stripe starts every account in **test mode**. All test payments use fake card numbers
> and never move real money. Switch to live mode only when you're ready to charge
> real customers. Look for the "Test mode" toggle in the top-right of the dashboard.

---

## 2. Get your API keys

### Test keys (for local dev + staging)

1. In the Stripe Dashboard, make sure **Test mode** is active (toggle in the header)
2. Go to **Developers → API keys**
3. Copy two values:

| Key | Starts with | Where it goes |
|-----|-------------|---------------|
| Publishable key | `pk_test_` | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` |
| Secret key | `sk_test_` | `STRIPE_SECRET_KEY` |

### Live keys (for production only)

1. Toggle off Test mode — you may need to complete account verification first
2. Go to **Developers → API keys** (same path, now in live mode)
3. Click **Reveal live key** and copy both keys

> **Security:** Never commit API keys to git. Add them only to `.env.local` locally
> or to your deployment platform's environment variable store (Vercel, Render, etc.).

### Add to `.env.local`

```bash
# Stripe — test mode
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_stripe_test_publishable_key
STRIPE_SECRET_KEY=your_stripe_test_secret_key

# Webhook secret — filled in by the next step
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_signing_secret
```

---

## 3. Set up the Stripe webhook endpoint in the dashboard

The GiftHint webhook handler lives at `/api/group-gift/webhook`.
Stripe must call this endpoint whenever a payment completes.

### For production / staging (a real HTTPS URL)

1. In the Stripe Dashboard → **Developers → Webhooks**
2. Click **+ Add endpoint**
3. Fill in the form:
   - **Endpoint URL**: `https://yourdomain.com/api/group-gift/webhook`
   - **Listen to**: `Events on your account`
4. Under **Select events**, search for and add:
   - `payment_intent.succeeded`
5. Click **Add endpoint**
6. On the endpoint detail page, click **Reveal** under **Signing secret**
7. Copy the `whsec_...` value into your env var `STRIPE_WEBHOOK_SECRET`

> Stripe signs every request with this secret so the handler can verify the payload
> hasn't been tampered with. Without it, anyone can POST fake events to your endpoint.

### Verifying the endpoint is working

- In the Stripe Dashboard → Webhooks → your endpoint → **Send test event**
- Select `payment_intent.succeeded` and click **Send test webhook**
- The endpoint should respond with `200 { received: true }`
- If you get a `400 invalid_signature`, double-check `STRIPE_WEBHOOK_SECRET` matches the
  endpoint's signing secret exactly (no trailing spaces)

---

## 4. Local webhook testing with the Stripe CLI

For local development, Stripe can't reach `localhost` directly. Use the Stripe CLI to
forward events to your local server.

### Install the Stripe CLI

```bash
# macOS (Homebrew)
brew install stripe/stripe-cli/stripe

# Windows (Scoop)
scoop bucket add stripe https://github.com/stripe/scoop-stripe-cli.git
scoop install stripe

# Linux — download binary from https://github.com/stripe/stripe-cli/releases
```

### Log in to Stripe CLI

```bash
stripe login
```

A browser tab opens to authorize the CLI with your Stripe account.
Select the same account you're using for the project.

### Start forwarding

```bash
stripe listen --forward-to localhost:3000/api/group-gift/webhook
```

The CLI prints something like:

```
> Ready! Your webhook signing secret is whsec_<your_secret_here> (^C to quit)
```

**Copy this signing secret** and paste it into `.env.local`:

```bash
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_signing_secret
```

Restart the dev server (`npm run dev`) after updating `.env.local`.

### Test a webhook manually

While `stripe listen` is running:

```bash
# Trigger a test payment_intent.succeeded event
stripe trigger payment_intent.succeeded
```

You should see:
- CLI: `[200 POST] /api/group-gift/webhook`
- Dev server logs: `[stripe-webhook] received: payment_intent.succeeded`

### Troubleshooting

| Symptom | Fix |
|---------|-----|
| `400 invalid_signature` on every event | `STRIPE_WEBHOOK_SECRET` doesn't match the CLI's output — re-copy it and restart the server |
| No events received | Check `stripe listen` is still running; the CLI session expires after a few hours |
| `500 server_error` | Check the dev server console for the stack trace; common cause is missing `SUPABASE_SERVICE_ROLE_KEY` |
| Webhook works but pool doesn't update | The contribution row may not exist — check that the contribute endpoint ran first and created a pending row |

---

## 5. Test card numbers reference

Use these card numbers in the Stripe Elements payment form when running QA tests.
All test cards accept any future expiry date, any 3-digit CVC, and any 5-digit ZIP.

### Successful payments

| Card number | Description |
|-------------|-------------|
| `4242 4242 4242 4242` | Visa — succeeds immediately |
| `5555 5555 5555 4444` | Mastercard — succeeds immediately |
| `3782 822463 10005`   | American Express — succeeds immediately |
| `6011 1111 1111 1117` | Discover — succeeds immediately |
| `4000 0025 0000 1001` | Visa — succeeds, triggers 3D Secure challenge |

### 3D Secure (authentication required)

| Card number | Behaviour |
|-------------|-----------|
| `4000 0025 0000 3155` | 3D Secure required — complete the challenge to succeed |
| `4000 0027 6000 3184` | 3D Secure required — completing challenge still fails (issuer declines) |

In the 3D Secure modal that appears:
- Click **Complete authentication** → payment succeeds
- Click **Fail authentication** → payment declined

### Declined payments

| Card number | Decline reason | Expected error message |
|-------------|----------------|------------------------|
| `4000 0000 0000 0002` | Generic decline | Your card has been declined |
| `4000 0000 0000 9995` | Insufficient funds | Your card has insufficient funds |
| `4000 0000 0000 0069` | Expired card | Your card has expired |
| `4000 0000 0000 0127` | Incorrect CVC | Your card's security code is incorrect |
| `4000 0000 0000 0119` | Processing error | An error occurred while processing your card |
| `4100 0000 0000 0019` | Fraudulent (blocked) | Your card has been declined |

### International / currency cards

| Card number | Country |
|-------------|---------|
| `4000 0082 6000 0000` | UK Visa — useful when testing GBP billing |
| `4000 0027 6000 0016` | Canada Visa |
| `4000 0003 6000 0006` | Australia Visa |

### Refund behaviour in test mode

Refunds issued via the dashboard or API immediately show as **Refunded** in test mode.
On live accounts, refunds take 5–10 business days to reach the customer's bank.

---

## 6. Environment variables summary

```bash
# ── Stripe ──────────────────────────────────────────────────────────────────
# Test mode keys (starts with sk_test_ / pk_test_)
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Webhook signing secret — from Stripe Dashboard or Stripe CLI output
STRIPE_WEBHOOK_SECRET=whsec_...

# ── Admin refund secret ──────────────────────────────────────────────────────
# Optional: allows admin-level pool cancellation without wisher auth.
# Generate a random secret: openssl rand -hex 32
ADMIN_REFUND_SECRET=your-random-secret-here

# ── Supabase ─────────────────────────────────────────────────────────────────
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# ── Resend (email) ────────────────────────────────────────────────────────────
RESEND_API_KEY=re_...
# Set to 'true' in test environments to skip real email sends
# RESEND_TEST_MODE=true
```

---

## 7. Going live checklist

Before switching from test keys to live keys:

- [ ] Business account verified in Stripe (legal name, bank account, website)
- [ ] Live webhook endpoint registered (separate from test endpoint)
- [ ] `STRIPE_WEBHOOK_SECRET` updated to the live endpoint's signing secret
- [ ] `STRIPE_SECRET_KEY` updated to `sk_live_...`
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` updated to `pk_live_...`
- [ ] End-to-end test with a real £0.30 charge (minimum) to confirm live flow
- [ ] Refund confirmed working on the live charge
- [ ] Stripe Radar rules reviewed (default rules block many international cards — adjust if needed)
- [ ] Payout schedule confirmed in Stripe Dashboard → Balance → Payouts

---

## 8. Useful Stripe CLI commands

```bash
# Forward events to local server
stripe listen --forward-to localhost:3000/api/group-gift/webhook

# Forward only specific event types
stripe listen \
  --events payment_intent.succeeded,payment_intent.payment_failed \
  --forward-to localhost:3000/api/group-gift/webhook

# Trigger a specific event (uses a real test PaymentIntent)
stripe trigger payment_intent.succeeded

# List recent events in your account
stripe events list --limit 10

# Retrieve a specific event by ID
stripe events retrieve evt_xxxxxxxxxxxxxxxxxxxxxx

# List all PaymentIntents (test mode)
stripe payment_intents list --limit 20

# Create a test PaymentIntent manually (useful for debugging)
stripe payment_intents create \
  --amount 5000 \
  --currency gbp \
  --automatic-payment-methods[enabled]=true

# Issue a refund from the CLI
stripe refunds create --payment-intent pi_xxxxxxxxxxxx

# Check webhook delivery logs for your endpoint
stripe events list --webhook-endpoint we_xxxxxxxxxxxx
```

---

## 9. Stripe Dashboard quick links

| Page | URL |
|------|-----|
| API Keys | https://dashboard.stripe.com/test/apikeys |
| Webhooks | https://dashboard.stripe.com/test/webhooks |
| Payments (test) | https://dashboard.stripe.com/test/payments |
| Refunds (test) | https://dashboard.stripe.com/test/refunds |
| Logs (test) | https://dashboard.stripe.com/test/logs |
| Radar rules | https://dashboard.stripe.com/test/radar/rules |

Remove `/test` from URLs to access the equivalent live-mode pages.
