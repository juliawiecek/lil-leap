-- Apply before deploying the advanced Orders service.
BEGIN;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS price_waits BIGINT NOT NULL DEFAULT 0 CHECK (price_waits >= 0);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS limit_price NUMERIC(18,4) CHECK (limit_price > 0);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS take_profit_price NUMERIC(18,4) CHECK (take_profit_price > 0);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stop_loss_price NUMERIC(18,4) CHECK (stop_loss_price > 0);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS exit_parent_id UUID UNIQUE REFERENCES orders(order_id);
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_order_type;
ALTER TABLE orders ADD CONSTRAINT chk_order_type CHECK (order_type IN ('MARKET', 'LIMIT'));
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_limit_price_required;
ALTER TABLE orders ADD CONSTRAINT chk_limit_price_required CHECK ((order_type = 'LIMIT') = (limit_price IS NOT NULL));
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_exit_prices;
ALTER TABLE orders ADD CONSTRAINT chk_exit_prices CHECK (exit_parent_id IS NULL OR (take_profit_price IS NOT NULL OR stop_loss_price IS NOT NULL));
COMMIT;
