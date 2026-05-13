# Chrome Web Store — Submission Package
# GiftHint — Gift Wishlist from Any Store

---

## 1. EXTENSION NAME

GiftHint — Gift Wishlist from Any Store

---

## 2. SHORT DESCRIPTION (132 characters max — pick one)

**Option A (128 chars):**
Save gift ideas from any online store, share your wishlist link, and let friends claim what they're buying. No more duplicate gifts.

**Option B (124 chars):**
Click the heart on any product to save it to your gift wishlist. Share one link so gifters always know what you actually want.

**Option C (131 chars):**
Build your gift wishlist from any store with one click. Share a link, let friends claim items — works everywhere, no duplicates.

---

## 3. DETAILED DESCRIPTION

(Plain text, no markdown — paste directly into Chrome Web Store)

```
Stop sending screenshots. Stop guessing what people want. GiftHint lets you save gift ideas from any online store — Amazon, ASOS, Apple, Etsy, anywhere — and share a single link so the people who love you know exactly what to buy.

HOW IT WORKS IN 3 STEPS

1. Browse any store and click the heart button that appears on product pages. GiftHint captures the name, price, image, and link automatically.

2. Your item appears instantly in your GiftHint list. Add a hint or DNA tag to personalise it — size, colour, variant, anything the buyer needs to know.

3. Share your list link (gifthint.com/list/yourname) with family and friends. They can browse, claim items they're buying, and see what's already taken — all without creating an account.

KEY FEATURES

Universal save — works on virtually any product page, not just Amazon.
Shareable link — one URL, always up to date, works on any device.
Claim system — gifters mark what they're buying so nothing gets bought twice.
Zero friction for gifters — no sign-up, no app download required.
Affiliate-powered — GiftHint uses affiliate links to stay free for everyone.

Perfect for birthdays, holidays, weddings, or any time someone asks "what do you want?"

Add GiftHint and share your list today.
```

---

## 4. PERMISSION JUSTIFICATIONS

**activeTab**
GiftHint uses the activeTab permission to read the product name, price, image URL, and page URL from the tab the user is currently viewing when they click the save button or the floating heart icon. This data is captured only at the moment of user interaction — the extension does not run in the background, does not monitor browsing history, and does not access any tab the user has not explicitly chosen to save from.

**storage**
GiftHint uses the storage permission (chrome.storage.local) to cache the authenticated user's ID and display name locally. This avoids requiring the user to sign in on every browser session and allows the floating heart button to render correctly without an extra network round-trip. No sensitive personal data beyond the user identifier is stored in local extension storage.

**identity**
GiftHint uses the identity permission to authenticate users via Google OAuth through Chrome's built-in identity API (chrome.identity.getAuthToken). This is the minimum mechanism needed to securely associate saved wishlist items with the correct user account without building a separate sign-in flow inside the extension popup. The token is used solely to identify the user to GiftHint's backend and is never shared with third parties.

---

## 5. CATEGORY

Shopping

---

## 6. SCREENSHOT CAPTIONS (1280×800)

**Screenshot 1 — Extension Popup: Your Saved List**
Caption: "Your gift wishlist in one click — see everything you've saved, with prices and images, right inside the extension."

**Screenshot 2 — Floating Heart Button on Amazon**
Caption: "A heart button appears automatically on product pages. Click it to save any item to your list in one tap."

**Screenshot 3 — Hint & DNA Tags Input Sheet**
Caption: "Add a hint or specify size, colour, and variant so your gifters buy exactly the right thing."

**Screenshot 4 — Public Gifter Page (gifthint.com/list/username)**
Caption: "Share one link. Gifters see your full wishlist — no account needed, works on any device."

**Screenshot 5 — Item Claim Modal**
Caption: "Gifters claim what they're buying so nothing gets purchased twice. The item is marked 'taken' for everyone else."

---

## 7. PRIVACY PRACTICES

**Does the extension collect user data?**
Yes.

**What data is collected?**

| Data type | Collected? | Purpose | Sold to third parties? |
|---|---|---|---|
| Google account identifier (user ID) | Yes | To associate wishlist items with the correct user account | No |
| Product page URL | Yes | To generate the affiliate link for saved items and link back to the product | No |
| Product name, price, image URL | Yes | To display the item on the user's wishlist | No |
| Display name / username | Yes | To generate the user's public wishlist URL (gifthint.com/list/username) | No |
| Browsing history | No | — | — |
| Precise geolocation | No | — | — |
| Financial or payment information | No | — | — |
| Health information | No | — | — |

**Why is data collected?**
User identity data is required to save and retrieve the correct wishlist. Product data (name, price, image, URL) is the core content of the wishlist — without it the product cannot be saved.

**Is any data sold?**
No. GiftHint does not sell, rent, or trade user data to any third party. Affiliate commissions are earned when users click product links and make purchases; no personal data is shared with affiliate networks.

**Privacy policy URL:** https://gifthint.com/privacy
