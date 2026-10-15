-- Run as schema owner before deploying PS-12 (price protection). Safe to reapply.
-- The price orders saw when the order was submitted (ask for a buy, bid for a sell); execution
-- rejects a fill that moved past it by more than the order's tolerance.
BEGIN;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reference_price NUMERIC(18,4);
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_orders_reference_price;
ALTER TABLE orders ADD CONSTRAINT chk_orders_reference_price
    CHECK (reference_price IS NULL OR reference_price > 0);
COMMIT;
