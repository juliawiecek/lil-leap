-- Run as schema owner before deploying TS-16.1b (GET /trades/{id}/events in Insights). Safe to reapply.
-- Insights reads an order's audit trail through this view; it leaves out user and account ids.
BEGIN;
CREATE OR REPLACE VIEW v_trade_audit_events AS
    SELECT audit_id, related_order_id AS order_id, actor_type, event_type, payload, created_at
    FROM audit_log
    WHERE related_order_id IS NOT NULL;
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'reporting_user') THEN
        GRANT SELECT ON v_trade_audit_events TO reporting_user;
    END IF;
END $$;
COMMIT;
