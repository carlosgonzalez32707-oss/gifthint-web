-- =============================================================
-- GiftHint — Supabase Alerts & Analytics SQL
-- Database: PostgreSQL (via Supabase)
-- Run in: Supabase → SQL Editor
-- =============================================================


-- -------------------------------------------------------------
-- SECTION 1: Enable pg_net extension
-- pg_net allows Postgres to make async HTTP requests directly
-- from within functions and triggers — no edge function needed
-- for simple webhook calls.
-- -------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_net;


-- -------------------------------------------------------------
-- SECTION 2: Webhook notification function
-- Fires an async HTTP POST to an external webhook URL whenever
-- a new row is inserted into the `users` table.
-- Replace 'https://YOUR_WEBHOOK_URL_HERE' with your actual
-- endpoint (e.g. a Make.com webhook, Slack incoming webhook,
-- or your own API route at /api/webhooks/new-user).
-- -------------------------------------------------------------

CREATE OR REPLACE FUNCTION notify_new_user_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM pg_net.http_post(
    url     := 'https://YOUR_WEBHOOK_URL_HERE',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json'
               ),
    body    := jsonb_build_object(
                 'event',      'new_user',
                 'user_id',    NEW.id,
                 'created_at', NEW.created_at
               )::text
  );

  -- pg_net.http_post is fire-and-forget (async).
  -- The INSERT into `users` completes immediately regardless
  -- of whether the HTTP request succeeds.
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION notify_new_user_webhook() IS
  'Sends an async HTTP POST to an external webhook on every new user sign-up. '
  'Uses pg_net so the HTTP call is non-blocking and does not delay the INSERT.';


-- -------------------------------------------------------------
-- SECTION 3: Trigger — fires after every new user row
-- Attaches notify_new_user_webhook() to the `users` table.
-- AFTER INSERT ensures the row is committed before the webhook
-- fires, so the user_id is guaranteed to exist in the database
-- when the receiving service tries to look it up.
-- -------------------------------------------------------------

DROP TRIGGER IF EXISTS on_new_user_insert ON users;

CREATE TRIGGER on_new_user_insert
  AFTER INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_user_webhook();

COMMENT ON TRIGGER on_new_user_insert ON users IS
  'Calls notify_new_user_webhook() after each new user is inserted. '
  'Non-blocking — uses pg_net async HTTP.';


-- -------------------------------------------------------------
-- SECTION 4: Daily stats view
-- Aggregates new user sign-ups and wishlist items saved per day.
-- Uses generate_series so days with zero activity still appear
-- (no invisible gaps in growth charts or dashboards).
--
-- Adjust the start date below to match your launch date.
-- -------------------------------------------------------------

CREATE OR REPLACE VIEW daily_stats AS
WITH date_series AS (
  SELECT generate_series(
    '2025-01-01'::date,
    CURRENT_DATE,
    '1 day'::interval
  )::date AS stat_date
),
user_counts AS (
  SELECT
    date(created_at) AS stat_date,
    count(*)         AS new_users
  FROM users
  GROUP BY date(created_at)
),
item_counts AS (
  SELECT
    date(created_at) AS stat_date,
    count(*)         AS items_saved
  FROM wishlist_items
  GROUP BY date(created_at)
)
SELECT
  ds.stat_date,
  coalesce(uc.new_users,   0) AS new_users,
  coalesce(ic.items_saved, 0) AS items_saved
FROM       date_series  ds
LEFT JOIN  user_counts  uc ON uc.stat_date = ds.stat_date
LEFT JOIN  item_counts  ic ON ic.stat_date = ds.stat_date
ORDER BY ds.stat_date DESC;

COMMENT ON VIEW daily_stats IS
  'Daily aggregate of new user sign-ups and wishlist items saved. '
  'Includes all dates since launch even if activity was zero that day. '
  'Used for admin dashboards and growth tracking. '
  'Query: SELECT * FROM daily_stats LIMIT 30;';
