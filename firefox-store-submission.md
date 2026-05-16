# Firefox Add-ons (AMO) Submission Guide

Step-by-step process for submitting the GiftHint Firefox extension to
addons.mozilla.org (AMO). Budget **1–3 weeks** for manual review on first
submission; re-submissions after minor updates are typically faster (days).

---

## Prerequisites

- Firefox extension zip built:  `npm run build:firefox`
  Output: `dist/gifthint-firefox-<version>.zip`
- Source code zip ready for AMO review (see §5)
- A Mozilla account (free) — create at accounts.firefox.com
- Google OAuth client configured for Firefox (see §6)

---

## 1. AMO Account Setup

1. Go to **https://accounts.firefox.com** → Create Account (or sign in).
2. Navigate to **https://addons.mozilla.org/developers/** → click **Submit a New Add-on**.
3. When asked "How do you distribute your add-on?" choose:
   - **On this site (addons.mozilla.org)** — for public listing with manual review.
   - *"Self-distribute"* — if you only want an AMO-signed XPI without a public
     listing (not recommended for GiftHint, which benefits from store discovery).
4. Accept the Firefox Add-on Distribution Agreement.

---

## 2. Extension Upload

1. On the submission page, choose **Firefox** as the target application.
2. Upload `dist/gifthint-firefox-<version>.zip`.
3. AMO will run automated validation. Common warnings to expect:
   - **"eval() or implied eval()"** — if any dependency uses it; add a note in
     the review comments explaining the context.
   - **"Unsafe innerHTML"** — flag any intentional uses in the review notes.
4. If validation passes (green), click **Continue**.

---

## 3. Required Metadata

Fill in the following fields on the listing page:

| Field | Value |
|-------|-------|
| **Name** | GiftHint — Save Gifts While You Shop |
| **Summary** (≤250 chars) | Save products to your GiftHint wishlist from any website. One click on any product page — title, price, and image are captured automatically. |
| **Description** | See the full copy below |
| **Category** | Shopping |
| **Tags** | wishlist, gifts, shopping, bookmarks, save |
| **Homepage URL** | https://gifthint.io |
| **Support URL** | https://gifthint.io/support |
| **Support Email** | hello@gifthint.io |
| **License** | Proprietary (All Rights Reserved) |

### Full Description (paste into AMO description field)

```
GiftHint lets you build shareable wishlists from any online store — Amazon, 
Etsy, ASOS, Apple, or anywhere else. Share your list with friends and family 
so they always know exactly what you want.

HOW IT WORKS
• Browse any product page and click the GiftHint floating button
• Title, price, and image are captured automatically
• Choose which wishlist to save to, add an optional hint ("size M, please!")
• Your friends get a clean shareable page at gifthint.io/list/you/birthday

FEATURES
✓ Works on any website — no per-site configuration needed
✓ Multiple wishlists (Birthday, Christmas, Wedding, and more)
✓ Occasion countdowns so gifters know when your event is
✓ DNA preference tags — tell gifters your style in one word (#NoSynthetics)
✓ Collaborative: multiple people can claim items without duplicates
✓ Privacy-first: your list is only shared when you choose to share it

PERMISSIONS EXPLAINED
• storage — saves your sign-in session locally (never leaves your device)
• identity — enables Google sign-in
• tabs — opens your wishlist after saving
• scripting — injects the save button onto product pages
• <all_urls> — required to show the save button on any shopping site

Sign in with Google to get started. Free to use.
```

### Screenshots (minimum 1, recommended 3)

| # | Description | Dimensions |
|---|-------------|------------|
| 1 | Floating 🎁 button on an Amazon product page | 1280×800 |
| 2 | Save popup — product preview, list selector, hint field | 800×600 |
| 3 | Gifter page — the shareable wishlist | 1280×800 |

> **Tip:** Firefox AMO screenshots must be at least 600×400 px. PNG preferred.

---

## 4. Privacy Policy

AMO requires a link to a privacy policy for extensions that collect user data.
GiftHint collects:
- Google account email and name (for sign-in)
- Product URLs and titles (saved by the user to their own wishlist)

Add a privacy policy URL in the submission form:
```
https://gifthint.io/privacy
```

If the privacy policy page doesn't exist yet, create a minimal one at
`app/privacy/page.tsx` before submission.

---

## 5. Source Code Submission (Mandatory for AMO)

Firefox requires the **unminified source code** for extensions that contain
minified or bundled JavaScript. The Firefox build (`npm run build:firefox`)
uses esbuild to bundle content scripts — AMO reviewers need the original
source to verify there is no malicious code.

### How to submit source code

1. Create a zip of the raw extension source (not the built dist):
   ```bash
   cd /path/to/gifthint-web
   zip -r dist/gifthint-firefox-source-<version>.zip extension/ \
     browser-build.sh package.json \
     -x "extension/node_modules/*"
   ```
2. On the AMO submission page, in the **"Source Code"** section, upload
   `dist/gifthint-firefox-source-<version>.zip`.
3. In the **"Notes to Reviewer"** field, include build instructions:

```
Build environment: Node.js 20+, npm 10+

To reproduce the built extension from source:
  1. npm install
  2. npm run build:firefox
  Output: dist/gifthint-firefox-<version>.zip

The content scripts are bundled with esbuild to resolve ES module imports,
since Firefox MV2 does not support type="module" in content scripts.

auth.firefox.js replaces auth.js at bundle time via esbuild's --alias flag.
No third-party tracking scripts are included.
```

---

## 6. Google OAuth Setup for Firefox

Before submission, the Google OAuth client must allow the Firefox extension's
redirect URI. This URI is deterministic but unique to your extension ID.

### Finding your redirect URI

1. Load the extension temporarily in Firefox (about:debugging → Load Temporary Add-on).
2. Open the browser console from the extension popup.
3. Run:
   ```javascript
   console.log(browser.identity.getRedirectURL('oauth/callback'))
   ```
4. Copy the output (format: `https://<hash>.chromiumapp.org/oauth/callback`)

### Adding it to Google Cloud Console

1. Go to **console.cloud.google.com** → APIs & Services → Credentials.
2. Click the OAuth 2.0 Client ID used for GiftHint.
3. Under **"Authorized redirect URIs"**, click **Add URI**.
4. Paste the `*.chromiumapp.org` URL from step 4 above.
5. Click Save. Changes propagate within ~5 minutes.

### Update auth.firefox.js

Replace the placeholder in `extension/auth.firefox.js`:
```javascript
// Before:
const OAUTH_CLIENT_ID = 'YOUR_OAUTH_CLIENT_ID.apps.googleusercontent.com'

// After:
const OAUTH_CLIENT_ID = '123456789-xxxx.apps.googleusercontent.com'
```

Rebuild: `npm run build:firefox`

---

## 7. Submission Checklist

Complete before clicking **Submit for Review**:

- [ ] `npm run build:firefox` runs without errors
- [ ] Extension loads in Firefox without errors (about:debugging)
- [ ] Google sign-in works (launchWebAuthFlow → /api/auth/exchange → token)
- [ ] Floating button appears on Amazon and Etsy product pages
- [ ] Item saves to correct wishlist; visible on gifthint.io/dashboard
- [ ] Source code zip prepared with build instructions
- [ ] `manifest.firefox.json` version matches the upload zip
- [ ] `browser_specific_settings.gecko.id` is `"gifthint@gifthint.io"`
- [ ] Privacy policy URL live at gifthint.io/privacy
- [ ] AMO listing description, screenshots, and category filled in
- [ ] `GOOGLE_CLIENT_ID` placeholder replaced with real value in auth.firefox.js
- [ ] Firefox redirect URI added to Google Cloud Console

---

## 8. Review Timeline

| Stage | Typical wait |
|-------|-------------|
| Automated validation | Immediate |
| **Manual review (first submission)** | **1–3 weeks** |
| Manual review (minor update to existing listed add-on) | 1–5 business days |
| Manual review (security-sensitive change) | Up to 4 weeks |
| Re-review after addressing reviewer feedback | 3–7 business days |

> **Tip:** Submit well before any launch date. Do not plan a Firefox launch
> for the same week as the Chrome submission.

### Common rejection reasons and fixes

| Reason | Fix |
|--------|-----|
| Source code not provided for bundled JS | Upload source zip + build instructions (see §5) |
| `eval()` in bundled output | Audit esbuild output; add `--pure:eval` if safe |
| Privacy policy missing or vague | Add specific data collection disclosures |
| Broad `<all_urls>` not justified | Expand the permissions explanation in the description |
| API keys visible in source | Confirm `GOOGLE_CLIENT_SECRET` is NOT in the extension source (it lives in the server-side `/api/auth/exchange` endpoint) |

---

## 9. After Approval

1. **Download the signed XPI** from AMO — this is the version users install.
2. The AMO listing goes live at: `https://addons.mozilla.org/firefox/addon/gifthint/`
3. Add the AMO listing URL to the GiftHint website's browser download section.
4. For subsequent updates: bump `version` in `manifest.firefox.json`, rebuild,
   and upload the new zip on the existing AMO listing page. Minor updates may
   skip manual review if no new permissions are added.

---

## 10. Edge Add-ons Store (for reference)

The Edge extension (`npm run build:edge`) follows the Chrome Web Store
process almost identically, since Edge uses Chrome MV3:

- Submit at: **https://partner.microsoft.com/dashboard/microsoftedge/**
- Upload `dist/gifthint-edge-<version>.zip`
- The `update_url` in `manifest.edge.json` is already set to the Edge store CDN
- Review: typically 1–7 business days
- No source code submission required (Chrome MV3, not bundled)
