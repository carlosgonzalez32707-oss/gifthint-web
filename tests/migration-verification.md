# Migration Verification Guide — GiftHint Phase 1 → Phase 2

Step-by-step process for safely running the occasion-tagging DB migration and verifying correctness before promoting to production.

---

## Overview

Phase 2 introduces:
- `wishlists` table with `occasion`, `occasion_date`, `is_default`, `slug` columns
- `wishlist_items.wishlist_id` FK pointing every item at a list
- A default wishlist auto-created for every existing user so legacy items are not orphaned

**Estimated downtime:** zero (all changes are additive; existing rows remain readable throughout)

---

## Step 0 — Back Up the Database

Run this before touching anything in production.

```bash
# Supabase managed backup (preferred — creates a point-in-time snapshot)
supabase db dump --linked --file backups/pre-phase2-$(date +%Y%m%d-%H%M%S).sql

# Verify the dump is non-empty
wc -l backups/pre-phase2-*.sql
```

Keep the dump file until you have confirmed the migration is stable in production for at least 48 hours.

---

## Step 1 — Run Migration in a Branch / Staging Environment

Never run a schema migration directly against production first.

```bash
# Create a Supabase branch (requires Supabase CLI ≥ 1.130)
supabase branches create phase2-occasion-migration

# Switch to the branch
supabase db switch phase2-occasion-migration

# Apply the migration
supabase db push
# or, if running SQL directly:
psql "$STAGING_DATABASE_URL" -f supabase/migrations/007_phase2_occasion_tagging.sql
```

Check for errors in the output. Any `ERROR:` line is a blocker — do not proceed to production.

---

## Step 2 — Verify: Every User Has Exactly One Default Wishlist

After migration, each user must have exactly one wishlist with `is_default = true`.

```sql
-- Should return 0 rows.  Any row is a bug.
SELECT u.id AS user_id, COUNT(w.id) AS default_count
FROM auth.users u
LEFT JOIN public.wishlists w
  ON w.user_id = u.id AND w.is_default = true
GROUP BY u.id
HAVING COUNT(w.id) <> 1;
```

**Expected result:** empty result set (0 rows).

If any row is returned:
- `default_count = 0` → migration did not create the default wishlist for that user. Re-run the backfill section of the migration SQL for the affected user IDs.
- `default_count > 1` → duplicate defaults. Run:

```sql
-- Identify duplicates
SELECT user_id, array_agg(id ORDER BY created_at) AS ids
FROM public.wishlists
WHERE is_default = true
GROUP BY user_id
HAVING COUNT(*) > 1;

-- Fix: keep the oldest, clear the rest
UPDATE public.wishlists
SET is_default = false
WHERE id IN (
  SELECT unnest(ids[2:]) FROM (
    SELECT array_agg(id ORDER BY created_at) AS ids
    FROM public.wishlists
    WHERE is_default = true
    GROUP BY user_id
    HAVING COUNT(*) > 1
  ) dupes
);
```

---

## Step 3 — Verify: Every wishlist_item Has a Non-Null wishlist_id

All items must be linked to a list after migration.

```sql
-- Should return 0.
SELECT COUNT(*) AS orphaned_items
FROM public.wishlist_items
WHERE wishlist_id IS NULL;
```

**Expected result:** `0`.

If non-zero, the backfill join to the user's default wishlist failed. Patch it:

```sql
-- Re-link orphaned items to their owner's default wishlist
UPDATE public.wishlist_items i
SET wishlist_id = w.id
FROM public.wishlists w
WHERE i.wishlist_id IS NULL
  AND w.user_id = i.user_id
  AND w.is_default = true;
```

Re-run the COUNT query to confirm it returns 0.

---

## Step 4 — Verify: /list/[username] Still Resolves

The legacy gifter URL must continue to work for existing shared links.

### 4a. Automated smoke test (Playwright)

```typescript
// tests/e2e/compat-redirect.spec.ts
import { test, expect } from '@playwright/test'

const KNOWN_USERNAME = process.env.QA_USERNAME ?? 'testuser'

test('legacy /list/[username] URL resolves to the default list', async ({ page }) => {
  const response = await page.goto(`/list/${KNOWN_USERNAME}`)
  // Either a redirect (3xx) or direct render — both are valid
  expect(response?.status()).toBeLessThan(400)
  await expect(page).toHaveURL(new RegExp(`/list/${KNOWN_USERNAME}`))
  // Page must display at least one gift item or the empty-state message
  const body = page.locator('main')
  await expect(body).toBeVisible()
})
```

Run with:
```bash
QA_USERNAME=your_test_account npx playwright test tests/e2e/compat-redirect.spec.ts
```

### 4b. Manual check

1. Navigate to `https://[staging-domain]/list/[any_existing_username]`
2. Confirm the page loads (no 404 / 500)
3. Confirm the gift items displayed match the items that were visible before the migration

---

## Step 5 — Verify: /list/[username]/[default-slug] Shows the Same Items

The new canonical URL must render identical content to the legacy URL.

```typescript
// tests/e2e/canonical-items.spec.ts
import { test, expect } from '@playwright/test'

const USERNAME  = process.env.QA_USERNAME  ?? 'testuser'
const DEF_SLUG  = process.env.QA_DEF_SLUG  ?? 'my-wishlist'

test('canonical slug URL shows same items as legacy URL', async ({ page }) => {
  // Collect item titles from legacy URL
  await page.goto(`/list/${USERNAME}`)
  const legacyTitles = await page.locator('[data-testid="item-title"]').allTextContents()

  // Collect item titles from canonical URL
  await page.goto(`/list/${USERNAME}/${DEF_SLUG}`)
  const canonicalTitles = await page.locator('[data-testid="item-title"]').allTextContents()

  expect(canonicalTitles.sort()).toEqual(legacyTitles.sort())
})
```

Run with:
```bash
QA_USERNAME=testuser QA_DEF_SLUG=my-wishlist npx playwright test tests/e2e/canonical-items.spec.ts
```

**Manual alternative:** open both URLs side by side in the browser and compare item lists visually.

---

## Step 6 — Promote to Production

Only after all checks above pass in staging:

```bash
# Switch back to production
supabase db switch main   # or however your project references the prod branch

# Apply the same migration
supabase db push

# Re-run the SQL verification queries (Steps 2 and 3) against production
psql "$PRODUCTION_DATABASE_URL" -c "
  SELECT COUNT(*) FROM (
    SELECT user_id FROM public.wishlists
    WHERE is_default = true
    GROUP BY user_id HAVING COUNT(*) <> 1
  ) bad;
"
psql "$PRODUCTION_DATABASE_URL" -c "
  SELECT COUNT(*) FROM public.wishlist_items WHERE wishlist_id IS NULL;
"
```

Both queries must return `0`.

---

## Roll-Back Plan

If the migration causes issues, revert with the following SQL. **This is destructive — it drops Phase 2 columns and the wishlists table. Only run if you have a verified backup from Step 0.**

```sql
-- ⚠️  DESTRUCTIVE — run only when rolling back to Phase 1

BEGIN;

-- 1. Remove FK from wishlist_items
ALTER TABLE public.wishlist_items
  DROP COLUMN IF EXISTS wishlist_id;

-- 2. Drop wishlists table (all list rows lost)
DROP TABLE IF EXISTS public.wishlists;

-- 3. Drop any associated RLS policies that reference wishlists
--    (Supabase will error on dangling policies — adjust names to match your migration)
DROP POLICY IF EXISTS "owner_select_wishlists" ON public.wishlists;
DROP POLICY IF EXISTS "owner_insert_wishlists" ON public.wishlists;
DROP POLICY IF EXISTS "owner_update_wishlists" ON public.wishlists;
DROP POLICY IF EXISTS "owner_delete_wishlists" ON public.wishlists;

COMMIT;
```

After roll-back, restore from backup if any data was written to the new tables between migration and roll-back:

```bash
psql "$PRODUCTION_DATABASE_URL" < backups/pre-phase2-<timestamp>.sql
```

Contact Supabase support if point-in-time restore is needed.

---

## Checklist Summary

| # | Check | SQL / Tool | Expected |
|---|-------|------------|----------|
| 0 | Database backed up | `supabase db dump` | Non-empty `.sql` file |
| 1 | Migration runs without errors in staging | `supabase db push` | No `ERROR:` lines |
| 2 | Every user has exactly one default wishlist | SQL `HAVING COUNT(*) <> 1` | 0 rows |
| 3 | No orphaned wishlist_items | SQL `WHERE wishlist_id IS NULL` | COUNT = 0 |
| 4 | Legacy `/list/[username]` resolves | Playwright / manual | HTTP < 400, items visible |
| 5 | Canonical `/list/[username]/[slug]` matches legacy | Playwright / manual | Same item set |
| 6 | Production migration runs without errors | `supabase db push` | No `ERROR:` lines |
| 7 | Production SQL checks pass | Same queries as staging | Both return 0 |
