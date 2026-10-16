-- Run as schema owner before deploying PS-14 (cancel a pending order). Safe to reapply.
-- A client may cancel an order that is still waiting to execute; it ends as CANCELLED with no
-- cash or holdings change.
BEGIN;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_order_status;
ALTER TABLE orders ADD CONSTRAINT chk_order_status CHECK (
    status IN ('SUBMITTED', 'ACCEPTED', 'FILLED', 'REJECTED', 'PENDING', 'DELAYED', 'CANCELLED'));
ALTER TABLE order_status_history DROP CONSTRAINT IF EXISTS chk_status_history_status;
ALTER TABLE order_status_history ADD CONSTRAINT chk_status_history_status CHECK (
    status IN ('SUBMITTED', 'ACCEPTED', 'FILLED', 'REJECTED', 'PENDING', 'DELAYED', 'CANCELLED'));
COMMIT;
