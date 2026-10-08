-- Minimal projection of finalized-schema.sql; no execution or settlement triggers.
CREATE TABLE instruments (
    instrument_id UUID PRIMARY KEY, symbol VARCHAR(20) NOT NULL, instrument_name VARCHAR(100),
    asset_class VARCHAR(30), market_code VARCHAR(20), currency CHAR(3), sector VARCHAR(50),
    enabled BOOLEAN NOT NULL, tradable BOOLEAN NOT NULL
);
CREATE TABLE accounts (
    account_id UUID PRIMARY KEY, user_id UUID NOT NULL, account_status VARCHAR(20),
    trading_enabled BOOLEAN, trader_level VARCHAR(20), min_balance_requirement NUMERIC(18,2),
    execution_buffer_percent NUMERIC(5,2)
);
CREATE TABLE customer_profiles (user_id UUID PRIMARY KEY, country VARCHAR(100));
CREATE TABLE cash_balances (account_id UUID REFERENCES accounts, currency CHAR(3), balance NUMERIC(18,2));
CREATE TABLE holdings (account_id UUID REFERENCES accounts, instrument_id UUID REFERENCES instruments, quantity BIGINT);
CREATE TABLE quotes (
    quote_id UUID PRIMARY KEY, instrument_id UUID REFERENCES instruments, bid NUMERIC(18,4), ask NUMERIC(18,4),
    quoted_at TIMESTAMP WITH TIME ZONE, created_at TIMESTAMP WITH TIME ZONE, source VARCHAR(20), is_synthetic BOOLEAN
);
CREATE TABLE orders (
    order_id UUID DEFAULT gen_random_uuid() PRIMARY KEY, account_id UUID NOT NULL REFERENCES accounts,
    instrument_id UUID NOT NULL REFERENCES instruments, client_reference UUID NOT NULL,
    side VARCHAR(10) NOT NULL, quantity BIGINT NOT NULL, order_type VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL, submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    buffer_percent NUMERIC(5,2), UNIQUE(account_id, client_reference)
);
CREATE TABLE fills (fill_id UUID PRIMARY KEY, order_id UUID REFERENCES orders);
CREATE TABLE order_status_history (
    status_history_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id UUID NOT NULL,
    status VARCHAR(20) NOT NULL,
    reason_code VARCHAR(50)
);
