# GiftHint — Chrome Web Store Rejection Response Templates

Pre-written developer responses for the three most common rejection reasons.
Paste into the Chrome Web Store appeal form, adjusting any [bracketed] details.

---

## Rejection 1: "Extension does not have a single purpose"

**Quoted rejection reason:**
> "Your extension doesn't appear to have a single purpose. Extensions must have a single purpose that is narrow and easy to understand."

**Developer Response:**

Thank you for reviewing GiftHint. I'd like to respectfully address this concern and clarify that GiftHint does have a single, clearly defined purpose: **gift wishlist management**.

Every feature in the extension exists to serve one user action — saving a product to a personal gift wishlist and making that wishlist shareable with gifters. Here is how each surface maps to that single purpose:

**The floating heart button and popup** are the save mechanism. They allow the user to capture a product (name, price, image, URL) from any online store and add it to their wishlist. This is the input side of the product.

**The shareable public list page (gifthint.com/list/username)** is the output side of the same product. A wishlist has no purpose if it cannot be viewed by the people it is meant for. The public page and the claim system are not separate products — they are the delivery mechanism for the single thing the extension creates: a gift list.

**Affiliate links** are a monetisation mechanism, not a separate product purpose. The extension does not redirect users to different products, inject ads, or alter the browsing experience outside of the save interaction. Affiliate parameters are appended transparently to product URLs the user themselves saved. This is comparable to any shopping extension that earns a commission — it does not create a second purpose.

The single purpose of GiftHint is: *let a user save gift ideas from any website and share them with people who want to buy gifts for them.* Every feature — the heart button, the popup, the public list, the claim system — is a component of that one purpose.

I am happy to provide additional documentation, revise the store listing description to make this clearer, or schedule a review call if that would be helpful. I believe GiftHint fully complies with the single-purpose policy and respectfully request that this decision be reconsidered.

---

## Rejection 2: "Missing or inaccessible privacy policy"

**Quoted rejection reason:**
> "Your extension must have a privacy policy that complies with the Chrome Web Store's policies. We could not access the privacy policy you provided, or no privacy policy URL was submitted."

**Developer Response:**

Thank you for flagging this. I have reviewed the privacy policy and its accessibility. Please find the corrected details below.

**Privacy policy URL:** https://gifthint.com/privacy

**Pre-submission accessibility checklist — all items confirmed:**

- [ ] **URL is publicly accessible without authentication.** The page at https://gifthint.com/privacy loads for any visitor without requiring a login, cookie consent, or any other interaction.
- [ ] **URL returns HTTP 200.** Confirmed via curl and browser check — there are no redirects to a login page, 404, or maintenance page.
- [ ] **Content covers the data collected by the extension.** The policy explicitly names: Google account identifier, product page URL, product name/price/image, and display name. It states how each is used, how long it is retained, and that none of it is sold.
- [ ] **Policy is hosted at a stable, permanent URL.** The URL https://gifthint.com/privacy is hardcoded into the extension's manifest and store listing and will not change.
- [ ] **URL entered in Chrome Web Store dashboard matches exactly.** The URL submitted in the Privacy tab of the Developer Dashboard is: `https://gifthint.com/privacy` — no trailing slash, no redirect.

**Action taken:** The privacy policy URL has been re-entered in the Chrome Web Store Developer Dashboard under the Privacy Practices tab. The policy page has been tested in an incognito window to confirm it is accessible without any session cookies.

If there is a specific clause or data type missing from the policy that triggered this rejection, please let me know and I will update the policy and resubmit immediately.

---

## Rejection 3: "Permissions not justified / overbroad"

**Quoted rejection reason:**
> "Your extension requests permissions that appear to be broader than necessary for its functionality. Please use the minimum permissions required."

**Developer Response:**

Thank you for this feedback. I want to provide a detailed, per-permission justification for each permission declared in GiftHint's manifest, explaining specifically why it is the minimum necessary and why no narrower alternative exists.

---

**Permission: `activeTab`**

**What it does:** Grants temporary access to the content of the currently active tab, only when the user invokes the extension.

**Why GiftHint needs it:** When a user clicks the floating heart button or the save button in the popup, GiftHint needs to read three pieces of data from the current tab: (1) the page URL, to generate the product link and affiliate URL; (2) the product name, extracted via a content script reading the DOM; (3) the product image URL and price, also read from the DOM.

**Why it is the minimum necessary:** `activeTab` grants access *only* at the moment the user explicitly acts — it does not give persistent background access to any tab. The alternative, a broad `tabs` permission, would grant access to all tabs at all times, which is far more than GiftHint needs. GiftHint never reads tab content passively, never monitors navigation, and has no functionality that requires access to any tab the user has not actively chosen to save from. `activeTab` is precisely scoped to this use case.

**Why host permissions are not used instead:** Host permissions (e.g. `*://*/*`) would grant persistent, automatic access to page content on every site the user visits. That is significantly overbroad. `activeTab` limits access to a single tab, a single interaction.

---

**Permission: `storage`**

**What it does:** Allows the extension to read and write data to `chrome.storage.local` (device-local, not synced).

**Why GiftHint needs it:** After a user authenticates with Google, GiftHint stores two values locally: the user's unique identifier (from the OAuth token) and their GiftHint username. These are used to (a) identify which wishlist to save items to on subsequent page visits, and (b) render the floating heart button and popup correctly without requiring a network call on every page load.

**Why it is the minimum necessary:** Without `storage`, the user would have to re-authenticate on every browser session, which would make the extension unusable. GiftHint uses `chrome.storage.local` (not `chrome.storage.sync`) to avoid transmitting data across devices unnecessarily. No browsing history, full page content, or third-party data is written to storage. The only values stored are a user ID string and a username string.

**Why cookies or IndexedDB are not used instead:** `chrome.storage.local` is the appropriate, sandboxed, extension-specific storage mechanism recommended by Chrome's extension APIs for this purpose. It does not require additional host permissions to access and cannot be read by web pages.

---

**Permission: `identity`**

**What it does:** Provides access to `chrome.identity.getAuthToken()`, Chrome's built-in OAuth flow, which allows the extension to request a Google identity token on behalf of the user.

**Why GiftHint needs it:** GiftHint requires users to have an account so that saved wishlist items are associated with the correct person and accessible from their public list URL. Authentication is the only way to accomplish this securely. `chrome.identity.getAuthToken()` uses Chrome's native OAuth flow — the user sees a standard Google permission prompt, no credentials are ever handled by the extension code, and no password is stored.

**Why it is the minimum necessary:** The `identity` permission is the narrowest possible authentication mechanism available to Chrome extensions. The alternative — building a custom OAuth flow using a web-accessible resource or an embedded iframe — would require additional host permissions to make cross-origin requests and would expose the extension to significantly more security risk. `chrome.identity` is Google's own recommended approach for extension authentication and involves no additional data access beyond the OAuth token.

**What the token is used for:** The token is passed to GiftHint's backend (Supabase) to verify the user's identity. It is not logged, not shared with affiliate networks, and not used for any purpose other than authenticating API calls that read and write the user's own wishlist data.

---

I believe each of these three permissions is strictly necessary for GiftHint's core functionality and that no narrower alternative exists for any of them. I am happy to provide code-level evidence (relevant manifest.json sections and content script snippets) if that would assist the review. I respectfully request reconsideration of this rejection.
