-- ==========================================================
-- NextTrade Initial Database Schema
-- PostgreSQL
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
    phone VARCHAR(20),
    password_hash VARCHAR(255) NOT NULL,
    address TEXT,
    country VARCHAR(100),
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_user_first_name CHECK (length(trim(first_name)) > 0),
    CONSTRAINT chk_user_last_name CHECK (length(trim(last_name)) > 0),
    CONSTRAINT chk_user_email CHECK (length(trim(email)) > 0),
    CONSTRAINT chk_user_password CHECK (length(trim(password_hash)) > 0)
);

-- Case-insensitive unique emails
CREATE UNIQUE INDEX uk_users_email ON users (LOWER(email));
CREATE INDEX idx_users_email ON users(email);

-- ==========================================================
-- ACCOUNTS
-- A user may hold multiple trading accounts
-- ==========================================================

CREATE TABLE accounts (
    account_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    account_name VARCHAR(100) NOT NULL,
    account_type VARCHAR(20) NOT NULL DEFAULT 'INDIVIDUAL',
    account_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_accounts_user
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT chk_account_name CHECK (length(trim(account_name)) > 0),
    CONSTRAINT chk_account_type CHECK (
        account_type IN ('INDIVIDUAL', 'JOINT', 'IRA', 'CORPORATE', 'BROKERAGE')
    ),
    CONSTRAINT chk_account_status CHECK (
        account_status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED')
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
    issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_active_at TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP,

    CONSTRAINT fk_sessions_user
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_user ON sessions(user_id);

-- ==========================================================
-- ORDERS
-- ==========================================================

CREATE TABLE orders (
    order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    -- Records whether the order is a buy or sell
    side VARCHAR(10) NOT NULL,
    quantity BIGINT NOT NULL,
    order_type VARCHAR(20) NOT NULL DEFAULT 'MARKET',
    limit_price NUMERIC(18,8),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_orders_account
        FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE RESTRICT,
    CONSTRAINT chk_order_side CHECK (side IN ('BUY', 'SELL')),
    CONSTRAINT chk_order_quantity CHECK (quantity > 0),
    CONSTRAINT chk_order_status CHECK (
        status IN ('PENDING', 'SUBMITTED', 'ACCEPTED', 'FILLED', 'CANCELLED', 'REJECTED')
    )
);

CREATE INDEX idx_orders_account ON orders(account_id);
CREATE INDEX idx_orders_symbol ON orders(symbol);

-- ==========================================================
-- HOLDINGS
-- ==========================================================

CREATE TABLE holdings (
    account_id UUID NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    quantity NUMERIC(18,8) NOT NULL DEFAULT 0,
    avg_cost NUMERIC(18,8) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (account_id, symbol),
    CONSTRAINT fk_holdings_account
        FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE,
    CONSTRAINT chk_holding_quantity CHECK (quantity >= 0)
);

-- ==========================================================
-- CASH BALANCES
-- ==========================================================

CREATE TABLE cash_balances (
    account_id UUID PRIMARY KEY,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    balance NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_cash_account
        FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE,
    CONSTRAINT chk_cash_balance CHECK (balance >= 0)
);

-- ==========================================================
-- AUDIT LOG
-- ==========================================================

CREATE TABLE audit_log (
    audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    related_order_id UUID,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_audit_user
        FOREIGN KEY (user_id) REFERENCES users(user_id),
    CONSTRAINT fk_audit_order
        FOREIGN KEY (related_order_id) REFERENCES orders(order_id)
);

CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_order ON audit_log(related_order_id);
