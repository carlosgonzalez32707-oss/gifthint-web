-- =============================================================================
-- GiftHint — Group Gifting Schema
-- Migration: 20260517_group_gifting.sql
--
-- Creates:
--   gift_pools          — one pool per group-gift item
--   gift_contributions  — one row per contributor payment
-- Alters:
--   wishlist_items      — adds is_group_gift + group_gift_target columns
-- =============================================================================

-- ── 1. gift_pools ─────────────────────────────────────────────────────────────
--
-- One pool per group-gift item. The organiser is the wisher (or a delegated
-- gifter coordinator). Stripe payouts are recorded via stripe_transfer_id once
-- the pool reaches 'funded' → 'purchased'.

CREATE TABLE IF NOT EXISTS gift_pools (
  id                   uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id              uuid          NOT NULL REFERENCES wishlist_items (id) ON DELETE CASCADE,
  target_amount        numeric(10,2) NOT NULL CHECK (target_amount > 0),
  collected_amount     numeric(10,2) NOT NULL DEFAULT 0 CHECK (collected_amount >= 0),
  status               text          NOT NULL DEFAULT 'open'
                                     CHECK (status IN ('open','funded','purchased','cancelled')),
  organiser_name       text          NOT NULL,
  organiser_email      text          NOT NULL,
  payout_instructions  text,
  created_at           timestamptz   NOT NULL DEFAULT now(),
  funded_at            timestamptz,
  stripe_transfer_id   text
);

-- Index for item look-up (gifter page loads pool by item_id)
CREATE INDEX IF NOT EXISTS gift_pools_item_id_idx ON gift_pools (item_id);

-- ── RLS: gift_pools ───────────────────────────────────────────────────────────
ALTER TABLE gift_pools ENABLE ROW LEVEL SECURITY;

-- Public gifters can read any pool (needed to render the contribution UI)
CREATE POLICY "gift_pools_public_read"
  ON gift_pools
  FOR SELECT
  USING (true);

-- Only the service role (server-side API routes) may insert / update / delete.
-- The service role bypasses RLS entirely, so no explicit service-role policy
-- is needed — this comment documents intent.
-- No INSERT / UPDATE / DELETE policies → non-service-role clients are blocked.


-- ── 2. gift_contributions ─────────────────────────────────────────────────────
--
-- One row per attempted contribution. stripe_payment_status tracks the
-- Stripe PaymentIntent lifecycle so we know when to credit collected_amount.

CREATE TABLE IF NOT EXISTS gift_contributions (
  id                        uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id                   uuid          NOT NULL REFERENCES gift_pools (id) ON DELETE CASCADE,
  contributor_name          text,
  contributor_email         text,
  amount                    numeric(10,2) NOT NULL CHECK (amount > 0),
  stripe_payment_intent_id  text          UNIQUE,
  stripe_payment_status     text          NOT NULL DEFAULT 'pending'
                                          CHECK (stripe_payment_status IN ('pending','succeeded','failed')),
  contributed_at            timestamptz   NOT NULL DEFAULT now(),
  anonymous                 boolean       NOT NULL DEFAULT false
);

-- Index for pool look-up (contribution list, collected_amount rollup)
CREATE INDEX IF NOT EXISTS gift_contributions_pool_id_idx ON gift_contributions (pool_id);
-- Index for Stripe webhook look-up by payment intent ID
CREATE INDEX IF NOT EXISTS gift_contributions_intent_id_idx
  ON gift_contributions (stripe_payment_intent_id);

-- ── RLS: gift_contributions ───────────────────────────────────────────────────
ALTER TABLE gift_contributions ENABLE ROW LEVEL SECURITY;

-- No public SELECT — contribution details (email, amount) are private.
-- Service role bypasses RLS for all writes and reads.
-- Non-service-role clients have no access (no policies defined).


-- ── 3. Extend wishlist_items ───────────────────────────────────────────────────
--
-- is_group_gift:    marks the item as a group gift (shows contribution UI)
-- group_gift_target: denormalised target for quick display without joining gift_pools

ALTER TABLE wishlist_items
  ADD COLUMN IF NOT EXISTS is_group_gift      boolean       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS group_gift_target  numeric(10,2);

-- ── 4. Trigger: auto-update collected_amount ──────────────────────────────────
--
-- When a gift_contributions row transitions to 'succeeded', add its amount to
-- the parent pool's collected_amount and flip the pool to 'funded' if target
-- is now met. Runs server-side so the API route doesn't need a separate UPDATE.

CREATE OR REPLACE FUNCTION gift_pool_collect_on_success()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pool gift_pools%ROWTYPE;
BEGIN
  -- Only act when status flips TO 'succeeded'
  IF NEW.stripe_payment_status = 'succeeded'
     AND (OLD.stripe_payment_status IS DISTINCT FROM 'succeeded')
  THEN
    -- Credit the pool
    UPDATE gift_pools
    SET collected_amount = collected_amount + NEW.amount
    WHERE id = NEW.pool_id
    RETURNING * INTO v_pool;

    -- Auto-fund the pool when target is reached
    IF v_pool.collected_amount >= v_pool.target_amount
       AND v_pool.status = 'open'
    THEN
      UPDATE gift_pools
      SET status    = 'funded',
          funded_at = now()
      WHERE id = NEW.pool_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gift_pool_collect ON gift_contributions;
CREATE TRIGGER trg_gift_pool_collect
  AFTER UPDATE ON gift_contributions
  FOR EACH ROW
  EXECUTE FUNCTION gift_pool_collect_on_success();
