# GiftHint DNA Tag System — Manual UX Walkthrough Script

**Version:** 1.0  
**Scope:** End-to-end flow covering the wisher's tagging workflow (extension → dashboard) and the gifter's discovery experience (tag pills → alternative guidance → retailer search).  
**Environment:** Local dev (`http://localhost:3000`) or staging. Use a fresh test account so wishlists are predictable.

---

## Prerequisites

| Requirement | Check |
|---|---|
| GiftHint extension installed and pinned | ☐ |
| Logged into the wisher test account | ☐ |
| At least one wishlist exists with 3+ items | ☐ |
| A second browser / incognito window for the gifter view | ☐ |
| `npm run dev` running (or staging URL available) | ☐ |

---

## Step 1 — Wisher saves an item via the browser extension

**Goal:** Confirm that the extension hint sheet correctly saves DNA tags and displays the success screen with a deep link back to the dashboard editor.

### 1.1 Navigate to a product page

1. Open **Amazon, ASOS, or Nordstrom** in Chrome.  
2. Find a product you want to wishlist (e.g. a pair of headphones or a dress).  
3. Click the **GiftHint extension icon** in the Chrome toolbar.  
   _Expected: The hint sheet slides open at the bottom of the screen._

### 1.2 Enter hint text and add tags

4. In the **"Add a hint"** field, type:  
   `Please get the wired version — I need it for work calls`
5. In the **DNA tag autocomplete** field, type `#Wir` and select **#WiredOnly** from the dropdown.
6. Type `#No` and select **#NoWhite**.
7. Confirm both tag pills are visible in the tag strip above the input.

**Expected state:** hint text filled, two tag pills shown (`#WiredOnly`, `#NoWhite`), Save button is active.

### 1.3 Save and observe the success screen

8. Click **Save**.  
   _Expected: Button changes to "Saving…", form is disabled._
9. After ~1 s, the form is replaced by the **success screen**:
   - ✓ icon at the top
   - Hint text preview: "Please get the wired version — I need it for work calls"
   - Tag summary: "#WiredOnly  #NoWhite"
   - "Edit in dashboard ↗" button
   - Countdown: "Closing in 3… 2… 1…"

### 1.4 Verify the deep link

10. Click **"Edit in dashboard ↗"** before the countdown hits 0.  
    _Expected: A new tab opens at `/dashboard/[slug]?edit=[itemId]`._
11. Confirm the dashboard loads with the correct wishlist and the newly saved item's editor is **already open** (auto-expanded via `autoOpenEditor` prop).

### 1.5 Verify auto-close

12. Repeat the save flow. This time, **do not click** the "Edit in dashboard" button.  
    _Expected: The extension sheet closes automatically after 3 seconds._

**Pass criteria:** ✅ Success screen renders after save. ✅ Deep link opens dashboard with editor open. ✅ Auto-close works.

---

## Step 2 — Gifter views tag pills and hover tooltips

**Goal:** Confirm that DNA tag pills are visible on the gifter page, that tooltip text is correct, and that the overflow pill works when more than 3 tags are present.

### 2.1 Open the gifter page

1. In the **incognito window** (not logged in), navigate to:  
   `http://localhost:3000/list/[wisher-username]`  
   _Expected: The public wishlist loads with the wisher's items._

### 2.2 Inspect tag pills on an unclaimed item

2. Find the item saved in Step 1.  
3. Confirm **`#WiredOnly`** and **`#NoWhite`** pills are visible below the item title.  
4. **Hover** over the `#WiredOnly` pill.  
   _Expected: A tooltip appears reading "Must be wired — no wireless or Bluetooth version"._
5. **Hover** over the `#NoWhite` pill.  
   _Expected: A tooltip appears reading "Please avoid white colourways — any other colour is fine"._

### 2.3 Verify the overflow pill

6. On the wisher's dashboard, add 5 tags to a single item (use the inline editor from Step 1.4).  
   Save. Reload the gifter page.
7. Confirm that the item shows exactly **3 tag pills** plus an overflow badge, e.g. **`+2`**.  
8. Verify the overflow badge has a muted style (not clickable — informational only).

**Pass criteria:** ✅ Correct tooltip per tag. ✅ Overflow badge shown at 4+ tags.

---

## Step 3 — Gifter sees alternative gift guidance for an unclaimed item

**Goal:** Confirm that the "💡 Gifting Tips" section and `AlternativeGiftPanel` render correctly with sensible English copy derived from the item's DNA tags.

### 3.1 Check the guidance text

1. On the gifter page, locate an unclaimed item with at least 2 DNA tags.  
2. Look for the collapsible **"💡 Gifting Tips"** section (or the inline `<p>` with guidance in `GifterPage`).
3. Click to expand if collapsed.  
   _Expected: A sentence such as "Must be wired — just not white" appears (matching the tags)._

### 3.2 Verify the alternative gift panel

4. Verify the `AlternativeGiftPanel` is **not visible** on an unclaimed item.  
   _(The panel only appears after the item is claimed.)_
5. In the incognito tab, claim the item by entering your gifter name.  
   _Expected: The item switches to claimed state._
6. Reload. Confirm the `AlternativeGiftPanel` is now visible, showing:
   - Guidance sentence (e.g. "Must be wired — just not white")
   - "Find on [Retailer]" button
   - "Find on Google Shopping" fallback link

### 3.3 Verify the retailer search URL

7. Click **"Find on [Retailer]"**.  
   _Expected: A new tab opens with a pre-filled search query on the correct retailer site._
8. Confirm the query includes title keywords (without noise words) and positive tag keywords (e.g. "wired").  
9. Confirm it does **not** include negative tag keywords (e.g. "white" from `#NoWhite`).

**Pass criteria:** ✅ Guidance text is correct English. ✅ Panel appears only on claimed items. ✅ Retailer search URL is well-formed.

---

## Step 4 — Wisher edits an item inline in the dashboard

**Goal:** Confirm the `ItemEditor` expands in-place, validates fields, saves correctly, and updates the item list without a page reload.

### 4.1 Open the inline editor

1. In the **wisher's logged-in browser**, go to `/dashboard/[slug]`.  
2. Find any item in the list and click the **✏️ Edit** button.  
   _Expected: The `ItemEditor` expands below the row without navigating away._

### 4.2 Edit the hint

3. Clear the hint field and type:  
   `Size up one — runs small. Gift receipt welcome.`  
   _Expected: Character counter shows the remaining characters. No red/amber warning for this length._
4. Continue typing until you are within 20 characters of the 120-char limit.  
   _Expected: Counter turns amber._
5. Keep typing past the limit.  
   _Expected: Counter turns red and Save is blocked._
6. Delete back to a valid length. Character counter returns to default colour.

### 4.3 Edit DNA tags

7. Click the **✕** on an existing tag pill to remove it.  
   _Expected: Pill disappears immediately._
8. Start typing in the tag autocomplete field. Select a tag from the dropdown.  
   _Expected: New pill appears in the strip._

### 4.4 Edit image URL

9. Paste an invalid URL (e.g. `not-a-url`) into the image URL field.  
   _Expected: An inline validation error appears. Save remains blocked._
10. Replace with a valid image URL (e.g. `https://example.com/image.jpg`).  
    _Expected: Validation error clears. A small preview thumbnail appears._

### 4.5 Save and verify optimistic update

11. Click **Save**.  
    _Expected: Button changes to "Saving…", fields are disabled._
12. After ~1 s, the editor closes.  
    _Expected: The item row in the list reflects the new hint and tag changes WITHOUT a full page reload._

### 4.6 Verify 500 error handling (simulate failure)

13. In DevTools, set the network to **offline** mode.  
14. Open the editor on another item, make a change, and click Save.  
    _Expected: An error message appears below the Save button. The editor stays open. No changes are applied to the list._
15. Re-enable network. The editor should still be usable.

**Pass criteria:** ✅ Character counter colours are correct. ✅ Image preview renders. ✅ Save updates list in place. ✅ Error state shown on failure.

---

## Step 5 — Wisher uses the Bulk Tag Editor

**Goal:** Confirm the `BulkTagEditor` correctly applies add/remove operations across multiple items, handles the optimistic update, and shows progress state while saving.

### 5.1 Open the bulk editor

1. On the dashboard, click **"🏷️ Bulk edit tags"** in the items section header.  
   _Expected: The `BulkTagEditor` panel opens (modal or inline). It lists all items with checkboxes._

### 5.2 Select items

2. Select 3 items using the checkboxes.  
   _Expected: The selected count updates. The indeterminate checkbox state (neither all/none) is shown._
3. Click **Select all**.  
   _Expected: All items are checked._
4. Click the header checkbox again to deselect all.  
   _Expected: All items unchecked._
5. Re-select 2 specific items.

### 5.3 Add tags

6. In the **"Add tags"** tab/section, search for `#EcoFriendly` and select it.  
   _Expected: A chip appears in the "to add" strip._
7. Verify the autocomplete suggestions also include tags already on the selected items (from `collectExistingTags`).

### 5.4 Remove tags

8. Switch to the **"Remove tags"** section.  
   _Expected: Tag pills show only tags that currently exist on at least one selected item._
9. Click a tag pill to toggle it for removal.  
   _Expected: Pill is highlighted / selected for removal._

### 5.5 Apply and verify optimistic update

10. Click **Apply**.  
    _Expected: The bulk editor closes. The items list is updated immediately (optimistic) — added tags appear on selected items, removed tags disappear._

### 5.6 Verify on gifter page

11. Navigate to the gifter page.  
    _Expected: The updated tags are visible on the affected items._

### 5.7 Verify rollback on failure (simulate)

12. Open the bulk editor again. Select 2 items. Add a tag.  
13. Set network to **offline** in DevTools.  
14. Click **Apply**.  
    _Expected: The items list briefly shows the optimistic update, then reverts to the previous state when the API calls fail. An error is shown to the user._

**Pass criteria:** ✅ Checkbox states (all / none / indeterminate) work correctly. ✅ Tags are added/removed correctly. ✅ Gifter page reflects changes. ✅ Optimistic update rolls back on failure.

---

## Regression Checklist

After completing all 5 steps, verify:

- [ ] No console errors in the browser DevTools during any step
- [ ] The extension hint sheet does not show a blank success screen
- [ ] Tag pills on the gifter page have correct ARIA `role="tooltip"` attributes
- [ ] The `AlternativeGiftPanel` is never shown on unclaimed items
- [ ] The bulk editor "Apply" button is disabled when no items are selected
- [ ] Deep links from the extension (`?edit=[id]`) open the correct item editor
- [ ] The dashboard item list is never out of sync after an editor save (no stale data)
- [ ] All forms show visible error states — no silent failures

---

## Known Limitations / Out of Scope

| Item | Notes |
|---|---|
| Keyboard-only navigation of tag autocomplete | Not tested in this script — cover separately with accessibility audit |
| Mobile / touch behaviour of tag pills and tooltips | Use real device or DevTools device emulation |
| Extension behaviour on non-product pages | Handled by the extension's own item-detection logic — separate test |
| Concurrent edits by two users on the same item | Race condition covered by the claim system tests, not the editor |
