-- Run as schema owner before deploying TS-11.3. Pause settlement writers.
-- Existing ledger entries were settled immediately; preserve that behavior.
BEGIN;
LOCK TABLE cash_transactions IN ACCESS EXCLUSIVE MODE;
ALTER TABLE cash_transactions ADD COLUMN IF NOT EXISTS settlement_status VARCHAR(20) NOT NULL DEFAULT 'SETTLED';
ALTER TABLE cash_transactions ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;
UPDATE cash_transactions SET settled_at = created_at WHERE settlement_status = 'SETTLED' AND settled_at IS NULL;
ALTER TABLE cash_transactions ALTER COLUMN settled_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE cash_transactions DROP CONSTRAINT IF EXISTS chk_settlement_status;
ALTER TABLE cash_transactions ADD CONSTRAINT chk_settlement_status CHECK (settlement_status IN ('PENDING', 'SETTLED'));
ALTER TABLE cash_transactions DROP CONSTRAINT IF EXISTS chk_settled_at_logic;
ALTER TABLE cash_transactions ADD CONSTRAINT chk_settled_at_logic CHECK (
    (settlement_status = 'SETTLED' AND settled_at IS NOT NULL) OR
    (settlement_status = 'PENDING' AND settled_at IS NULL));
CREATE INDEX IF NOT EXISTS idx_transaction_settlement_status ON cash_transactions(settlement_status);
CREATE TABLE IF NOT EXISTS cash_holds (
    hold_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL,
    order_id UUID NOT NULL,
    held_amount NUMERIC(18,2) NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    hold_reason VARCHAR(50) NOT NULL,  -- 'ORDER_PLACED', 'ORDER_PENDING', etc.
    released_at TIMESTAMPTZ,  -- NULL until hold is released
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_hold_account
        FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE RESTRICT,
    CONSTRAINT fk_hold_order
        FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE RESTRICT,
    CONSTRAINT chk_hold_amount CHECK (held_amount > 0),
    CONSTRAINT chk_hold_currency CHECK (currency = 'USD')
);

CREATE INDEX IF NOT EXISTS idx_hold_account ON cash_holds(account_id);
CREATE INDEX IF NOT EXISTS idx_hold_order ON cash_holds(order_id);
CREATE INDEX IF NOT EXISTS idx_hold_released_at ON cash_holds(released_at) WHERE released_at IS NULL;

CREATE OR REPLACE VIEW v_account_cash AS
    SELECT
        account_id,
        'USD' as currency,
        COALESCE(SUM(amount), 0) as balance,
        COALESCE(SUM(CASE WHEN settlement_status = 'SETTLED' THEN amount ELSE 0 END), 0) as settled_balance,
        COALESCE(SUM(CASE WHEN settlement_status = 'PENDING' THEN amount ELSE 0 END), 0) as pending_balance,
        COALESCE(SUM(CASE WHEN settlement_status = 'SETTLED' THEN amount ELSE 0 END), 0) -
        COALESCE(
            (SELECT SUM(held_amount) FROM cash_holds WHERE cash_holds.account_id = cash_transactions.account_id AND released_at IS NULL),
            0
        ) as available_balance,
        COALESCE(SUM(amount), 0) as total_balance
    FROM cash_transactions
    GROUP BY account_id;
-- Give existing ledger readers the same read access to holds, including custom
-- application role names. Do not grant write privileges or change default ACLs.
DO $$
DECLARE reader RECORD;
BEGIN
    FOR reader IN SELECT DISTINCT grantee FROM information_schema.role_table_grants
        WHERE table_schema = current_schema() AND table_name = 'cash_transactions'
          AND privilege_type = 'SELECT' AND grantee NOT IN ('PUBLIC', CURRENT_USER)
    LOOP
        EXECUTE format('GRANT SELECT ON cash_holds TO %I', reader.grantee);
    END LOOP;
END $$;
COMMIT;
