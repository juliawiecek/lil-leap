-- Minimal relational projection of finalized-schema.sql for application isolation tests.
-- PostgreSQL triggers, ledger rules and schema migrations are tested separately in db/tests.
CREATE TABLE users (user_id UUID PRIMARY KEY, email VARCHAR(255) NOT NULL UNIQUE);
CREATE TABLE accounts (
    account_id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(user_id)
);
CREATE TABLE instruments (
    instrument_id UUID PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    instrument_name VARCHAR(100) NOT NULL
);
CREATE TABLE holdings (
    account_id UUID NOT NULL REFERENCES accounts(account_id),
    instrument_id UUID NOT NULL REFERENCES instruments(instrument_id),
    quantity BIGINT NOT NULL,
    avg_cost DECIMAL(18,4) NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    PRIMARY KEY (account_id, instrument_id)
);
CREATE TABLE cash_balances (
    account_id UUID NOT NULL REFERENCES accounts(account_id),
    currency VARCHAR(3) NOT NULL,
    balance DECIMAL(18,2) NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    PRIMARY KEY (account_id, currency)
);
CREATE TABLE orders (
    order_id UUID PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES accounts(account_id),
    instrument_id UUID NOT NULL REFERENCES instruments(instrument_id),
    client_reference UUID NOT NULL,
    side VARCHAR(10) NOT NULL,
    quantity BIGINT NOT NULL,
    order_type VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    submitted_at TIMESTAMP NOT NULL,
    accepted_at TIMESTAMP,
    updated_at TIMESTAMP NOT NULL,
    buffer_percent DECIMAL(5,2) NOT NULL
);
