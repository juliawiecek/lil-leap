-- Account-owned presets available across browsers/devices. Safe to reapply.
BEGIN;
CREATE TABLE IF NOT EXISTS account_order_presets (
    account_id UUID NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    name VARCHAR(40) NOT NULL CHECK (length(trim(name)) > 0),
    order_type VARCHAR(10) NOT NULL CHECK (order_type IN ('MARKET', 'LIMIT')),
    quantity BIGINT NOT NULL CHECK (quantity BETWEEN 1 AND 9007199254740991),
    tolerance NUMERIC NOT NULL CHECK (tolerance BETWEEN 0.1 AND 10),
    profit_percent NUMERIC CHECK (profit_percent > 0 AND profit_percent < 100),
    stop_percent NUMERIC CHECK (stop_percent > 0 AND stop_percent < 100),
    risk_budget NUMERIC CHECK (risk_budget > 0 AND risk_budget <= 99999999999999),
    PRIMARY KEY (account_id, name)
);
DO $$ BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON account_order_presets TO app_user;
    END IF;
END $$;
COMMIT;
