-- ==========================================================
-- NextTrade Initial Database Schema
-- PostgreSQL
-- MVP scope only: USD, whole-share market orders, single fill per order,
-- no limit orders, no cancellation, no joint/IRA/corporate/margin accounts.
-- ==========================================================

-- Enables gen_random_uuid() used as the default for UUID primary keys
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ==========================================================
-- USERS
-- ==========================================================

CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    country VARCHAR(100),
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_user_first_name CHECK (length(trim(first_name)) > 0),
    CONSTRAINT chk_user_last_name CHECK (length(trim(last_name)) > 0),
    CONSTRAINT chk_user_email CHECK (length(trim(email)) > 0),
    CONSTRAINT chk_user_password CHECK (length(trim(password_hash)) > 0),
    CONSTRAINT chk_user_phone CHECK (length(trim(phone)) > 0),
    CONSTRAINT chk_user_address CHECK (length(trim(address)) > 0)
);

-- Case-insensitive, whitespace-insensitive unique emails
CREATE UNIQUE INDEX uk_users_email ON users (LOWER(TRIM(email)));

-- ==========================================================
-- INSTRUMENTS
-- Tradable symbols. MVP: US common stock, USD only.
-- ==========================================================

CREATE TABLE instruments (
    instrument_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol VARCHAR(20) NOT NULL,
    instrument_name VARCHAR(200) NOT NULL,
    instrument_type VARCHAR(30) NOT NULL DEFAULT 'COMMON_STOCK',
    market_code VARCHAR(20) NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    tradable BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uk_instruments_market_symbol UNIQUE (market_code, symbol),
    CONSTRAINT chk_instrument_type CHECK (instrument_type = 'COMMON_STOCK'),
    CONSTRAINT chk_instrument_currency CHECK (currency = 'USD')
);

CREATE INDEX idx_instruments_symbol ON instruments(symbol);

-- ==========================================================
-- ACCOUNTS
-- A user may hold multiple trading accounts.
-- MVP: individual cash accounts only.
-- ==========================================================

CREATE TABLE accounts (
    account_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    account_number VARCHAR(30) NOT NULL,
    account_name VARCHAR(100) NOT NULL,
    account_type VARCHAR(30) NOT NULL DEFAULT 'INDIVIDUAL_CASH',
    account_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    trading_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_accounts_user
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT,
    CONSTRAINT uk_accounts_account_number UNIQUE (account_number),
    CONSTRAINT chk_account_name CHECK (length(trim(account_name)) > 0),
    CONSTRAINT chk_account_type CHECK (account_type = 'INDIVIDUAL_CASH'),
    CONSTRAINT chk_account_status CHECK (
        account_status IN ('PENDING', 'ACTIVE', 'BLOCKED', 'CLOSED')
    )
);

CREATE INDEX idx_accounts_user ON accounts(user_id);

-- ==========================================================
-- SESSIONS
-- ==========================================================

CREATE TABLE sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    token_hash VARCHAR(512) NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_active_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,

    CONSTRAINT fk_sessions_user
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT,
    CONSTRAINT chk_session_expiry CHECK (expires_at > issued_at),
    CONSTRAINT chk_session_last_activity CHECK (
        last_active_at IS NULL OR last_active_at >= issued_at
    ),
    CONSTRAINT chk_session_revocation CHECK (
        revoked_at IS NULL OR revoked_at >= issued_at
    )
);

CREATE INDEX idx_sessions_user ON sessions(user_id);

-- ==========================================================
-- ORDERS
-- MVP: market orders only, no cancellation, no partial fills.
-- ==========================================================

CREATE TABLE orders (
    order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL,
    instrument_id UUID NOT NULL,
    side VARCHAR(10) NOT NULL,
    quantity BIGINT NOT NULL,
    order_type VARCHAR(20) NOT NULL DEFAULT 'MARKET',
    status VARCHAR(20) NOT NULL DEFAULT 'SUBMITTED',
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    accepted_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_orders_account
        FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE RESTRICT,
    CONSTRAINT fk_orders_instrument
        FOREIGN KEY (instrument_id) REFERENCES instruments(instrument_id) ON DELETE RESTRICT,
    CONSTRAINT chk_order_side CHECK (side IN ('BUY', 'SELL')),
    CONSTRAINT chk_order_quantity CHECK (quantity > 0),
    CONSTRAINT chk_order_type CHECK (order_type = 'MARKET'),
    CONSTRAINT chk_order_status CHECK (
        status IN ('SUBMITTED', 'ACCEPTED', 'FILLED', 'REJECTED')
    )
);

CREATE INDEX idx_orders_account ON orders(account_id);
CREATE INDEX idx_orders_instrument ON orders(instrument_id);

-- ==========================================================
-- FILLS
-- One full fill per order (no partial fills in MVP)
-- ==========================================================

CREATE TABLE fills (
    fill_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL,
    filled_quantity BIGINT NOT NULL,
    execution_price NUMERIC(18,8) NOT NULL,
    quote_timestamp TIMESTAMPTZ NOT NULL,
    filled_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_fills_order
        FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE RESTRICT,
    CONSTRAINT uk_fills_order UNIQUE (order_id),
    CONSTRAINT chk_fill_quantity CHECK (filled_quantity > 0),
    CONSTRAINT chk_execution_price CHECK (execution_price > 0)
);

-- ==========================================================
-- ORDER STATUS HISTORY
-- Append-only lifecycle trail for each order
-- ==========================================================

CREATE TABLE order_status_history (
    status_history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL,
    status VARCHAR(20) NOT NULL,
    reason_code VARCHAR(50),
    reason_text TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_status_history_order
        FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE RESTRICT,
    CONSTRAINT chk_status_history_status CHECK (
        status IN ('SUBMITTED', 'ACCEPTED', 'FILLED', 'REJECTED')
    )
);

CREATE INDEX idx_status_history_order ON order_status_history(order_id);

-- ==========================================================
-- HOLDINGS
-- ==========================================================

CREATE TABLE holdings (
    account_id UUID NOT NULL,
    instrument_id UUID NOT NULL,
    quantity BIGINT NOT NULL DEFAULT 0,
    avg_cost NUMERIC(18,8) NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (account_id, instrument_id),
    CONSTRAINT fk_holdings_account
        FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE RESTRICT,
    CONSTRAINT fk_holdings_instrument
        FOREIGN KEY (instrument_id) REFERENCES instruments(instrument_id) ON DELETE RESTRICT,
    CONSTRAINT chk_holding_quantity CHECK (quantity >= 0),
    CONSTRAINT chk_holding_avg_cost CHECK (avg_cost >= 0)
);

-- ==========================================================
-- CASH BALANCES
-- ==========================================================

CREATE TABLE cash_balances (
    account_id UUID PRIMARY KEY,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    balance NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_cash_account
        FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE RESTRICT,
    CONSTRAINT chk_cash_balance CHECK (balance >= 0),
    CONSTRAINT chk_cash_currency CHECK (currency = 'USD')
);

-- ==========================================================
-- AUDIT LOG
-- Append-only. The application DB role must not be granted
-- UPDATE or DELETE on this table.
-- ==========================================================

CREATE TABLE audit_log (
    audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    account_id UUID,
    related_order_id UUID,
    actor_type VARCHAR(20) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_audit_user
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT,
    CONSTRAINT fk_audit_account
        FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE RESTRICT,
    CONSTRAINT fk_audit_order
        FOREIGN KEY (related_order_id) REFERENCES orders(order_id) ON DELETE RESTRICT,
    CONSTRAINT chk_audit_actor_type CHECK (
        actor_type IN ('USER', 'SYSTEM', 'ADMIN')
    )
);

CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_account ON audit_log(account_id);
CREATE INDEX idx_audit_order ON audit_log(related_order_id);

-- ==========================================================
-- VERIFICATION (manual, run on a disposable database)
-- ==========================================================
-- \i /full/path/to/initial_schema.sql
-- \dt
-- \d users \d instruments \d accounts \d sessions \d orders
-- \d fills \d order_status_history \d holdings \d cash_balances \d audit_log
--
-- Negative tests to try manually (each should fail):
-- INSERT INTO users (first_name,last_name,email,password_hash,phone,address)
--   VALUES ('A','B','dup@example.com','hash','555-0100','1 Main St');
-- INSERT INTO users (first_name,last_name,email,password_hash,phone,address)
--   VALUES ('A','B','DUP@example.com','hash','555-0100','1 Main St'); -- duplicate email
-- INSERT INTO accounts (user_id, account_number, account_name, account_type)
--   VALUES (gen_random_uuid(), 'ACC-1', 'Test', 'JOINT'); -- invalid account_type
-- INSERT INTO orders (account_id, instrument_id, side, quantity)
--   VALUES (gen_random_uuid(), gen_random_uuid(), 'HOLD', 10); -- invalid side
-- INSERT INTO orders (account_id, instrument_id, side, quantity)
--   VALUES (gen_random_uuid(), gen_random_uuid(), 'BUY', 0); -- non-positive quantity
