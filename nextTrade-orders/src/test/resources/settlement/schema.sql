-- Minimal projection of finalized-schema.sql for settlement recovery; no holdings projection trigger.
CREATE DOMAIN jsonb AS VARCHAR(4000);
CREATE TABLE accounts (account_id UUID PRIMARY KEY);
CREATE TABLE orders (
    order_id UUID PRIMARY KEY, account_id UUID NOT NULL REFERENCES accounts, instrument_id UUID NOT NULL,
    side VARCHAR(10) NOT NULL, quantity BIGINT NOT NULL, status VARCHAR(20) NOT NULL,
    last_execution_error VARCHAR(50), updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE fills (
    fill_id UUID PRIMARY KEY, order_id UUID NOT NULL UNIQUE REFERENCES orders,
    filled_quantity BIGINT NOT NULL CHECK (filled_quantity > 0),
    execution_price NUMERIC(18,8) NOT NULL CHECK (execution_price > 0),
    filled_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE holding_movements (
    movement_id UUID DEFAULT RANDOM_UUID() PRIMARY KEY, account_id UUID NOT NULL, instrument_id UUID NOT NULL,
    fill_id UUID NOT NULL UNIQUE REFERENCES fills, quantity_change BIGINT NOT NULL,
    cost_basis NUMERIC(18,8) NOT NULL, movement_type VARCHAR(20) NOT NULL
);
CREATE TABLE cash_transactions (
    transaction_id UUID DEFAULT RANDOM_UUID() PRIMARY KEY, account_id UUID NOT NULL, fill_id UUID REFERENCES fills,
    transaction_type VARCHAR(20) NOT NULL, amount NUMERIC(18,2) NOT NULL, currency CHAR(3) NOT NULL,
    settlement_status VARCHAR(20) NOT NULL, settled_at TIMESTAMP WITH TIME ZONE
);
CREATE TABLE cash_balances (
    account_id UUID PRIMARY KEY REFERENCES accounts, currency CHAR(3) NOT NULL DEFAULT 'USD',
    balance NUMERIC(18,2) NOT NULL CHECK (balance >= 0), updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE order_status_history (
    status_history_id UUID DEFAULT RANDOM_UUID() PRIMARY KEY, order_id UUID NOT NULL REFERENCES orders,
    status VARCHAR(20) NOT NULL, reason_code VARCHAR(50)
);
CREATE TABLE audit_log (
    audit_id UUID DEFAULT RANDOM_UUID() PRIMARY KEY, account_id UUID, related_order_id UUID,
    actor_type VARCHAR(20) NOT NULL, event_type VARCHAR(100) NOT NULL, payload jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
