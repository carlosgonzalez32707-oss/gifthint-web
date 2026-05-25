# GiftHint — Database Maintenance Guide

Ongoing health procedures for the GiftHint Supabase Postgres instance.  
All SQL blocks are designed to run from the **Supabase SQL Editor** or via a
scheduled cron in the Supabase dashboard (**Database → Cron Jobs**).

---

## 1. Slow Query Identification (pg_stat_statements)

`pg_stat_statements` is enabled by default on all Supabase projects.

### 1.1 Top 10 slowest queries by mean execution time

```sql
SELECT
  LEFT(query, 120)    AS query_preview,
  calls,
  ROUND(mean_exec_time::numeric, 2)  AS mean_ms,
  ROUND(total_exec_time::numeric, 2) AS total_ms,
  ROUND(stddev_exec_time::numeric, 2) AS stddev_ms,
  rows
FROM  pg_stat_statements
WHERE query NOT LIKE '%pg_stat_statements%'
  AND query NOT LIKE 'COMMIT%'
  AND query NOT LIKE 'BEGIN%'
ORDER BY mean_exec_time DESC
LIMIT 10;
```

### 1.2 Top 10 by total time (most impactful to throughput)

```sql
SELECT
  LEFT(query, 120)    AS query_preview,
  calls,
  ROUND(mean_exec_time::numeric, 2)  AS mean_ms,
  ROUND(total_exec_time::numeric, 2) AS total_ms
FROM  pg_stat_statements
WHERE query NOT LIKE '%pg_stat_statements%'
ORDER BY total_exec_time DESC
LIMIT 10;
```

### 1.3 Analysis workflow for each slow query

```
1. Copy the full query from pg_stat_statements.query
2. Run EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) <query>;
3. Look for:
     Seq Scan on <large table>   →  missing index
     Hash Join / Nested Loop     →  join order or index issue
     Rows Removed by Filter: N   →  high filter cost — consider partial index
4. Identify the WHERE / ORDER BY columns
5. Add an index using the naming convention: idx_<table>_<columns>
6. Re-run EXPLAIN ANALYZE to confirm the planner switches to Index Scan
```

### 1.4 Index template for common patterns

```sql
-- Equality + range (most common):
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_<table>_<col1>_<col2>
  ON <table> (<col1>, <col2> DESC);

-- Filtered (partial) index — when a WHERE clause eliminates most rows:
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_<table>_<col>_partial
  ON <table> (<col>)
  WHERE <filter_column> = <filter_value>;

-- After adding the index, verify it is used:
EXPLAIN (ANALYZE, BUFFERS) <original slow query>;
-- Look for: "Index Scan using idx_<table>_<col>"
```

### 1.5 Reset statistics (after a major schema change or index addition)

```sql
SELECT pg_stat_statements_reset();
-- Wait 24 h then re-run §1.1 to see fresh numbers.
```

---

## 2. VACUUM ANALYZE

Postgres uses MVCC — deleted rows are not physically removed until `VACUUM`
runs. Without regular vacuuming, tables bloat and query plans degrade.
Supabase runs autovacuum, but high-write tables like `click_events`,
`page_views`, and `price_history` benefit from manual scheduling.

### 2.1 Schedule via Supabase Cron (Database → Cron Jobs)

**Job name:** `vacuum-analyze-hot-tables`  
**Schedule:** `0 3 * * 0` (Sundays at 03:00 UTC, low-traffic window)

```sql
-- Supabase Cron function body (SQL)
VACUUM ANALYZE wishlist_items;
VACUUM ANALYZE wishlists;
VACUUM ANALYZE click_events;
VACUUM ANALYZE page_views;
VACUUM ANALYZE price_history;
VACUUM ANALYZE referral_events;
VACUUM ANALYZE digest_sends;
```

> **Note:** `VACUUM ANALYZE` on a live table does not lock readers or writers.
> `VACUUM FULL` (which rewrites the table) *does* lock — only run it during a
> maintenance window and only when bloat is confirmed (see §3).

### 2.2 Verify autovacuum is keeping up

```sql
SELECT
  relname                                 AS table_name,
  n_live_tup,
  n_dead_tup,
  ROUND(n_dead_tup::numeric / NULLIF(n_live_tup, 0) * 100, 1) AS dead_pct,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze
FROM  pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_dead_tup DESC;
```

**Action threshold:** `dead_pct > 10%` on any table → trigger manual `VACUUM`.

---

## 3. Table Bloat Monitoring

### 3.1 Estimated bloat per table

```sql
SELECT
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) AS total_size,
  pg_size_pretty(pg_relation_size(schemaname || '.' || tablename))        AS table_size,
  pg_size_pretty(
    pg_total_relation_size(schemaname || '.' || tablename)
    - pg_relation_size(schemaname || '.' || tablename)
  )                                                                       AS index_size,
  n_live_tup,
  n_dead_tup
FROM  pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC;
```

### 3.2 Index bloat (unused or redundant indices)

```sql
-- Unused indices (zero scans since last stats reset):
SELECT
  schemaname,
  relname   AS table_name,
  indexrelname AS index_name,
  idx_scan,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM  pg_stat_user_indexes
WHERE idx_scan = 0
  AND schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;
```

> Unused indices cost write overhead on every INSERT/UPDATE/DELETE.
> Review before dropping: some indices exist for future queries or constraints.

### 3.3 When to run VACUUM FULL

Only if `dead_pct` stays above 20% for more than 48 h after a normal VACUUM:

```sql
-- During a maintenance window (blocks all access):
VACUUM FULL ANALYZE click_events;
```

For zero-downtime reclamation on Postgres 12+, use `pg_repack` (not available
on Supabase managed hosting — plan a maintenance window instead).

---

## 4. click_events Archiving Strategy

`click_events` is the highest-write table in GiftHint (~1 row per buy-click).
At 10 k active users clicking 5× per week that is ~50 k rows/week (~2.5 M/year).
Rows older than 1 year are unlikely to be queried in dashboards or analytics
but are still needed for partner commission audits.

The `archive_click_events()` function was added in `20260518_db_optimisation.sql`.

### 4.1 Monthly archive cron

**Job name:** `archive-click-events`  
**Schedule:** `0 2 1 * *` (1st of every month at 02:00 UTC)

```sql
-- Moves rows older than 1 year from click_events → click_events_archive.
-- Returns the number of rows archived (appears in Supabase Cron logs).
SELECT archive_click_events(NOW() - INTERVAL '1 year');
```

### 4.2 Manual archive (catch-up or one-off)

```sql
-- Preview what would be archived (no writes):
SELECT COUNT(*) FROM click_events WHERE clicked_at < NOW() - INTERVAL '1 year';

-- Run the archive:
SELECT archive_click_events(NOW() - INTERVAL '1 year');

-- Confirm hot table row count decreased:
SELECT COUNT(*) FROM click_events;
SELECT COUNT(*) FROM click_events_archive;
```

### 4.3 Verify archive integrity

```sql
-- Row counts should agree with what was moved:
SELECT
  'click_events'          AS table_name, COUNT(*) FROM click_events
UNION ALL
SELECT
  'click_events_archive'  AS table_name, COUNT(*) FROM click_events_archive;

-- Oldest row in hot table should now be within the retention window:
SELECT MIN(clicked_at) AS oldest_hot_row FROM click_events;
```

### 4.4 Querying historical data

The archive table has the same schema as `click_events`. For queries that span
both windows, use UNION ALL:

```sql
SELECT wisher_user_id, COUNT(*) AS lifetime_clicks
FROM (
  SELECT wisher_user_id FROM click_events
  UNION ALL
  SELECT wisher_user_id FROM click_events_archive
) combined
GROUP BY wisher_user_id
ORDER BY lifetime_clicks DESC
LIMIT 20;
```

---

## 5. Backup Verification — Monthly Test Restore

Supabase takes automated daily backups (PITR on Pro plan). Backups are
worthless unless they are tested. Run this procedure on the first Monday of
each month.

### 5.1 Restore to a scratch project

1. Open [Supabase Dashboard](https://app.supabase.com) → your project
2. **Settings → Backups** → select the most recent backup
3. Click **Restore to new project** and name it `gifthint-restore-test-YYYY-MM`
4. Wait for the restore to complete (~5–15 min depending on DB size)

### 5.2 Smoke-test the restored project

Run these checks against the restored project's SQL editor:

```sql
-- 1. Row counts match production (compare numbers manually):
SELECT 'users'              AS tbl, COUNT(*) FROM users
UNION ALL SELECT 'wishlists',        COUNT(*) FROM wishlists
UNION ALL SELECT 'wishlist_items',   COUNT(*) FROM wishlist_items
UNION ALL SELECT 'click_events',     COUNT(*) FROM click_events
UNION ALL SELECT 'price_history',    COUNT(*) FROM price_history
UNION ALL SELECT 'gift_pools',       COUNT(*) FROM gift_pools
UNION ALL SELECT 'gift_contributions', COUNT(*) FROM gift_contributions
UNION ALL SELECT 'referral_events',  COUNT(*) FROM referral_events
ORDER BY 1;

-- 2. Most recent user created_at should be within 24 h of backup time:
SELECT MAX(created_at) AS latest_user FROM users;

-- 3. Schema version — latest migration file name should match production:
SELECT MAX(name) FROM supabase_migrations.schema_migrations;
```

### 5.3 Record the result

| Date | Backup age | Row count check | Schema check | Restore time | Tester |
|------|-----------|-----------------|--------------|-------------|--------|
| YYYY-MM-DD | Xh | ✅ / ❌ | ✅ / ❌ | Xm | name |

### 5.4 Clean up

Delete the scratch project after verifying (`Settings → General → Delete project`).
Supabase bills by compute time, so leaving it running wastes money.

---

## 6. Routine Health Checklist (run weekly)

```sql
-- 6.1 Dead-tuple ratio: any table over 10% needs manual VACUUM
SELECT relname, ROUND(n_dead_tup * 100.0 / NULLIF(n_live_tup, 0), 1) AS dead_pct
FROM   pg_stat_user_tables
WHERE  schemaname = 'public'
ORDER  BY dead_pct DESC NULLS LAST;

-- 6.2 Slowest queries since last reset
SELECT LEFT(query, 80) AS q, ROUND(mean_exec_time::numeric, 1) AS mean_ms, calls
FROM   pg_stat_statements
WHERE  query NOT LIKE '%pg_stat%'
ORDER  BY mean_exec_time DESC LIMIT 5;

-- 6.3 Table sizes (flag if click_events exceeds 1 GB)
SELECT relname, pg_size_pretty(pg_total_relation_size('public.' || relname)) AS size
FROM   pg_stat_user_tables
WHERE  schemaname = 'public'
ORDER  BY pg_total_relation_size('public.' || relname) DESC;

-- 6.4 Active connections (flag if approaching Supabase project limit)
SELECT COUNT(*) AS active_connections FROM pg_stat_activity WHERE state = 'active';

-- 6.5 Lock waits (flag if any query is waiting > 5 s)
SELECT pid, state, wait_event_type, wait_event, LEFT(query, 60) AS q,
       NOW() - query_start AS duration
FROM   pg_stat_activity
WHERE  wait_event_type = 'Lock'
ORDER  BY duration DESC;
```

---

## 7. Quick Reference — Key Indices Added (20260518_db_optimisation.sql)

| Index | Table | Columns | Purpose |
|-------|-------|---------|---------|
| `idx_wishlist_items_wishlist_id` | wishlist_items | (wishlist_id, sort_order) WHERE !claimed | Gifter page unclaimed items |
| `idx_wishlist_items_user_id` | wishlist_items | (user_id, sort_order) | Polling API, digest |
| `idx_wishlists_slug` | wishlists | (slug) WHERE public | Public URL resolution |
| `idx_wishlists_user_id` | wishlists | (user_id) | Dashboard list |
| `idx_users_username` | users | (public_username) WHERE not null | Username → user_id |
| `idx_click_events_wisher` | click_events | (wisher_user_id, clicked_at DESC) | Attribution dashboard |
| `idx_click_events_item_id` | click_events | (item_id) | Per-item click count RPC |
| `idx_page_views_wishlist_date` | page_views | (wishlist_id, viewed_at DESC) | 14-day sparkline |
| `idx_digest_sends_user_week` | digest_sends | (user_id, week_start) UNIQUE | Digest deduplication |
| `idx_price_history_item_date` | price_history | (item_id, checked_at DESC) | Price history page |

Previously created indices (not duplicated):  
`idx_users_referral_code`, `price_history_item_checked_idx`,
`wishlist_items_price_check_eligible_idx`, `gift_pools_item_id_idx`,
`gift_contributions_pool_id_idx`, `gift_contributions_intent_id_idx`,
`partners_slug_idx`, `partners_user_id_idx`, all `partner_payouts_*` indices,
all `idx_referral_events_*` indices.
