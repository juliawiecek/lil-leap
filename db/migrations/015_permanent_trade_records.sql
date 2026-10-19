-- Run as schema owner before deploying TS-15.5 (permanent trade records). Safe to reapply.
-- Trade records can no longer be changed or removed by anyone, and deleting a user or account
-- can no longer erase who an audit record belongs to.
BEGIN;
REVOKE UPDATE, DELETE, TRUNCATE ON order_status_history, holding_movements, cash_transactions FROM PUBLIC;
DO $$
DECLARE app_role TEXT;
BEGIN
    FOR app_role IN SELECT grantee FROM information_schema.role_table_grants
                    WHERE table_name = 'cash_transactions' AND privilege_type = 'INSERT'
                      AND grantee NOT IN (SELECT tableowner FROM pg_tables WHERE tablename = 'cash_transactions')
    LOOP
        EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON order_status_history, holding_movements, cash_transactions FROM %I', app_role);
    END LOOP;
END $$;

ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS fk_audit_user;
ALTER TABLE audit_log ADD CONSTRAINT fk_audit_user
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT;
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS fk_audit_account;
ALTER TABLE audit_log ADD CONSTRAINT fk_audit_account
    FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE RESTRICT;
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS fk_audit_order;
ALTER TABLE audit_log ADD CONSTRAINT fk_audit_order
    FOREIGN KEY (related_order_id) REFERENCES orders(order_id) ON DELETE RESTRICT;

-- ==========================================================
-- PERMANENT TRADE RECORDS (BR-14, TS-15.5)
-- ==========================================================
-- Trade records are never changed once written, by the application, the owner or a migration.
-- The application role has no UPDATE/DELETE grant on these tables; this trigger also stops the owner.
-- Tests that must clear them disable the trigger inside their own transaction, as the owner.
CREATE OR REPLACE FUNCTION forbid_trade_record_change() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION '% is a permanent trade record: % is not allowed', TG_TABLE_NAME, TG_OP
        USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_audit_log_permanent BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION forbid_trade_record_change();
CREATE OR REPLACE TRIGGER trg_audit_log_no_truncate BEFORE TRUNCATE ON audit_log
    FOR EACH STATEMENT EXECUTE FUNCTION forbid_trade_record_change();
CREATE OR REPLACE TRIGGER trg_order_status_history_permanent BEFORE UPDATE OR DELETE ON order_status_history
    FOR EACH ROW EXECUTE FUNCTION forbid_trade_record_change();
CREATE OR REPLACE TRIGGER trg_order_status_history_no_truncate BEFORE TRUNCATE ON order_status_history
    FOR EACH STATEMENT EXECUTE FUNCTION forbid_trade_record_change();
CREATE OR REPLACE TRIGGER trg_holding_movements_permanent BEFORE UPDATE OR DELETE ON holding_movements
    FOR EACH ROW EXECUTE FUNCTION forbid_trade_record_change();
CREATE OR REPLACE TRIGGER trg_holding_movements_no_truncate BEFORE TRUNCATE ON holding_movements
    FOR EACH STATEMENT EXECUTE FUNCTION forbid_trade_record_change();
CREATE OR REPLACE TRIGGER trg_cash_transactions_permanent BEFORE UPDATE OR DELETE ON cash_transactions
    FOR EACH ROW EXECUTE FUNCTION forbid_trade_record_change();
CREATE OR REPLACE TRIGGER trg_cash_transactions_no_truncate BEFORE TRUNCATE ON cash_transactions
    FOR EACH STATEMENT EXECUTE FUNCTION forbid_trade_record_change();
COMMIT;
