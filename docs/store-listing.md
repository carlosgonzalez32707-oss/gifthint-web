# Chrome Web Store — Submission Package
# GiftHint — Gift Wishlist from Any Store
# v1.1.0 update — Multi-list, Occasion Tags, Share Button

---

## 1. EXTENSION NAME

GiftHint — Gift Wishlist from Any Store

---

## 2. SHORT DESCRIPTION (132 characters max — pick one)

**v1.1 — Option A (130 chars) [RECOMMENDED]:**
Save gifts from any store to multiple wishlists. Tag by occasion, share a link, let friends claim items — no more duplicate gifts.

**v1.1 — Option B (128 chars):**
Multiple wishlists for every occasion. Save from any store, share a link, and let friends claim what they're buying — all in one click.

**v1.1 — Option C (132 chars):**
Build wishlists for birthdays, weddings & more from any store. Share a link so gifters know what to buy — and what's already taken.

--- legacy options (v1.0) ---

**Option A (128 chars):**
Save gift ideas from any online store, share your wishlist link, and let friends claim what they're buying. No more duplicate gifts.

**Option B (124 chars):**
Click the heart on any product to save it to your gift wishlist. Share one link so gifters always know what you actually want.

**Option C (131 chars):**
Build your gift wishlist from any store with one click. Share a link, let friends claim items — works everywhere, no duplicates.

---

## 3. DETAILED DESCRIPTION

(Plain text, no markdown — paste directly into Chrome Web Store)

**v1.1 — UPDATED DESCRIPTION [USE THIS]**

```
Stop sending screenshots. Stop guessing what people want. GiftHint lets you save gift ideas from any online store — Amazon, ASOS, Apple, Etsy, anywhere — and share a single link so the people who love you know exactly what to buy.

NEW IN VERSION 1.1: Multiple wishlists and occasion tags

You can now keep separate wishlists for every occasion — your birthday, a wedding registry, a baby shower, a holiday list — all organised and shareable from one extension. A countdown badge on each list reminds you (and your gifters) how many days are left until the big day.

HOW IT WORKS IN 3 STEPS

1. Browse any store and click the floating heart button that appears on product pages. GiftHint captures the name, price, image, and link automatically. If you have multiple lists, a mini picker lets you choose which one to save to — right on the page, no popup needed.

2. Your item appears instantly in the list you chose. Add a hint or DNA tag to personalise it — size, colour, variant, anything the buyer needs to know.

3. Share your list link (gifthint.io/list/yourname/your-list) with family and friends. They can browse, claim items they're buying, and see what's already taken — all without creating an account. Copy your share link in one tap from the extension popup.

KEY FEATURES

Multiple wishlists — create separate lists for every occasion and switch between them in the popup.
Occasion tags — label each list: Birthday, Christmas, Wedding, Baby Shower, Graduation, Housewarming, Anniversary, or a custom list.
Countdown badge — see how many days until your occasion; turns amber when it's close, green when it's tomorrow.
Universal save — works on virtually any product page, not just Amazon.
Smart floating button — appears automatically on product pages; routes straight to your last-used list so single-list users experience zero extra taps.
One-tap share — copy your list link to the clipboard directly from the popup.
Claim system — gifters mark what they're buying so nothing gets bought twice.
Zero friction for gifters — no sign-up, no app download required.
Affiliate-powered — GiftHint uses affiliate links to stay free for everyone.

Perfect for birthdays, holidays, weddings, or any time someone asks "what do you want?"

Add GiftHint and start saving today.
```

---

**v1.0 — LEGACY DESCRIPTION (keep for reference)**

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

**[v1.1 — NEW] Screenshot 1 — Multi-List Selector in the Popup**
Caption: "Manage all your wishlists in one place — switch lists, see item counts, and spot which occasion is coming up next."
Design notes: Show the popup with the custom dropdown open. Three lists visible: "🎂 Birthday · 12 items · 14 days away", "🎄 Christmas · 8 items", "💍 Wedding Registry · 23 items". Active list has a purple checkmark and bold name. Countdown badge (amber, "14 days") visible next to the Birthday list in the trigger row.

**[v1.1 — NEW] Screenshot 2 — Occasion Countdown Badge + Share Button**
Caption: "Know exactly how long you have — and share your list with one tap."
Design notes: Show the popup in signed-in state for a user whose birthday is 6 days away. The trigger row shows the 🎂 Birthday list selected with an amber "6 days" countdown badge. The quick-actions row is visible below with a "Share Link" button and an "Open List" button. After clicking Share Link the button text reads "✓ Copied!". Dark background (#0C0C0E), purple accent (#8B83F0).

**Screenshot 3 — Extension Popup: Your Saved List** *(was Screenshot 1)*
Caption: "Your gift wishlist in one click — see everything you've saved, with prices and images, right inside the extension."

**Screenshot 4 — Floating Heart Button + Mini List Picker on Amazon** *(was Screenshot 2)*
Caption: "Save any product to the right list without opening the popup — a mini picker appears right on the page."
Design notes: Show the floating heart button in the bottom-right corner of an Amazon product page. Below it, the mini list-picker card is open with two list options: "🎂 Birthday (last used)" highlighted in purple, and "🎄 Christmas". Update from v1.0 which showed only the single-tap flow.

**Screenshot 5 — Hint & DNA Tags Input Sheet** *(was Screenshot 3)*
Caption: "Add a hint or specify size, colour, and variant so your gifters buy exactly the right thing."

**Screenshot 6 — Public Gifter Page (gifthint.io/list/username/slug)** *(was Screenshot 4)*
Caption: "Share one link. Gifters see your full wishlist — no account needed, works on any device."

**Screenshot 7 — Item Claim Modal** *(was Screenshot 5)*
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
