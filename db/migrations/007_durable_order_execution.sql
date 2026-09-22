-- Run as schema owner before deploying the order worker. Safe to reapply.
BEGIN;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS next_execution_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS execution_attempts BIGINT NOT NULL DEFAULT 0 CHECK (execution_attempts >= 0);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS last_execution_error VARCHAR(50);
CREATE INDEX IF NOT EXISTS idx_orders_execution_due
    ON orders(next_execution_at, order_id)
    WHERE accepted_at IS NOT NULL AND status IN ('ACCEPTED', 'PENDING');
-- Legacy SUBMITTED rows are deliberately not accepted retroactively: they need validation.
COMMIT;
