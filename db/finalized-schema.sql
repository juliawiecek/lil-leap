-- ==========================================================
-- NextTrade Finalized Database Schema
-- PostgreSQL
-- Based on comparison with Fidelity brokerage schema
-- NORMALIZED: Separated auth, identity, verification, financial concerns
-- 
-- BUSINESS REQUIREMENT MAPPING:
-- BR-01: Registration → users + customer_profiles + financial_profiles (format validation in app)
-- BR-02: Secure login → users (password_hash, auth isolation)
-- BR-03: Session timeout & lockout → users + sessions
-- BR-04: Order submission → orders (with idempotency)
-- BR-05: Validation rules → orders + instruments + accounts
-- BR-06: 2-phase order acceptance → orders + fills
-- BR-07: Order status visibility → order_status_history
-- BR-08: Non-stale quotes → quotes (with timestamp)
-- BR-09: Ledger-based settlement → cash_transactions + holding_movements
-- BR-10: Holdings & cash reporting → holdings + cash_balances (caches)
-- BR-11: Trader tier minimum balance → accounts + financial_profiles
-- BR-12: Multi-asset class → instruments (COMMON_STOCK, FX, CRYPTO)
-- BR-13: Indicative price display → quotes (current bid/ask before fill)
-- BR-15: State reconstruction → ledger pattern enables full historical replay
-- BR-16: Trading activity analysis → audit_log + order_status_history
-- BR-17: Business insights → audit_log (queryable event stream)
-- BR-18: Platform differentiation → (custom application logic)
-- ==========================================================

-- Enables gen_random_uuid() used as the default for UUID primary keys
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ==========================================================
-- USERS (Authentication only - normalized for security - BR-01, BR-02, BR-03)
-- Separation of concerns: auth isolated from identity + verification + financial
-- ==========================================================

CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    
    -- User role for access control (MVP: TRADER only)
    user_role VARCHAR(20) NOT NULL DEFAULT 'TRADER' CHECK (user_role = 'TRADER'),
    
    -- BR-03: LOGIN SECURITY (lock after 3 failed attempts)
    failed_login_attempts INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_user_email CHECK (length(trim(email)) > 0),
    CONSTRAINT chk_user_password CHECK (length(trim(password_hash)) > 0),
    CONSTRAINT chk_failed_login_attempts CHECK (failed_login_attempts >= 0)
);

-- Case-insensitive, whitespace-insensitive unique emails
CREATE UNIQUE INDEX uk_users_email ON users (LOWER(TRIM(email)));
CREATE INDEX idx_users_created_at ON users(created_at DESC);

-- ==========================================================
-- CUSTOMER_PROFILES (Personal Identity - BR-01)
-- Separated from users for normalization and audit trail
-- Enables profile updates independent of auth changes
-- SECURITY: Full SSN is reversibly encrypted using pgcrypto PGP symmetric encryption.
-- Only encrypted BYTEA ciphertext is stored; plaintext SSN and encryption key
-- must never appear in logs or audit payloads.
-- ==========================================================

CREATE TABLE customer_profiles (
    profile_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    address TEXT NOT NULL,
    country VARCHAR(100),
    date_of_birth DATE NOT NULL,
    
    -- SECURITY: Full synthetic or real SSN encrypted with pgcrypto symmetric encryption.
    -- Application supplies encryption key at runtime (nexttrade.security.ssn-encryption-key).
    ssn_encrypted BYTEA NOT NULL,
    
    -- FIDELITY COMPLIANCE: Citizenship & residency (BR-01, Fidelity)
    citizenship_status VARCHAR(50),  -- 'CITIZEN', 'PERMANENT_RESIDENT', 'OTHER'
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_profile_user
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT,
    CONSTRAINT uk_profile_user UNIQUE (user_id),  -- one profile per user
    CONSTRAINT chk_first_name CHECK (length(trim(first_name)) > 0),
    CONSTRAINT chk_last_name CHECK (length(trim(last_name)) > 0),
    CONSTRAINT chk_phone CHECK (length(trim(phone)) > 0),
    CONSTRAINT chk_address CHECK (length(trim(address)) > 0),
    -- BR-01: Users must be 18+ (actual birthday, not just year)
    CONSTRAINT chk_age_18_or_older CHECK (date_of_birth <= CURRENT_DATE - INTERVAL '18 years')
);

CREATE INDEX idx_profile_user ON customer_profiles(user_id);
CREATE INDEX idx_profile_updated_at ON customer_profiles(updated_at DESC);

-- TRIGGER: Minimum age validation (18+)
-- Rejects inserts/updates where date_of_birth indicates customer is younger than 18.
-- Uses SQLSTATE 23514 (check_violation) for controlled rejection.
CREATE OR REPLACE FUNCTION check_customer_age_18()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.date_of_birth > CURRENT_DATE - INTERVAL '18 years' THEN
        RAISE EXCEPTION 'Customer must be at least 18 years old' USING SQLSTATE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_customer_profiles_age_validation
BEFORE INSERT OR UPDATE OF date_of_birth ON customer_profiles
FOR EACH ROW
EXECUTE FUNCTION check_customer_age_18();

-- CONSTRAINT: Prevent future dates of birth
-- (Additional database-level constraint alongside trigger)

-- ==========================================================
-- FINANCIAL_PROFILES (KYC + Risk Profile + Trader Tier - BR-01, BR-11)
-- Separated for scalability and regulatory compliance
-- Supports accredited investor designation, risk profiling, and tier qualification
-- Format validation (email, phone) happens in application code
-- =========================================================

CREATE TABLE financial_profiles (
    financial_profile_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    
    -- KYC Status
    kyc_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',  -- 'PENDING', 'IN_PROGRESS', 'VERIFIED', 'REJECTED'
    kyc_verified_by_user_id UUID,  -- (MVP: not used - format validation only)
    
    -- Accredited investor (SEC requirement)
    accredited_investor BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Risk profile / net worth for tier eligibility
    net_worth_bracket VARCHAR(30),  -- '$0-5k', '$5k-25k', '$25k-100k', '$100k-500k', '$500k+'
    risk_profile VARCHAR(30),  -- 'CONSERVATIVE', 'MODERATE', 'AGGRESSIVE'
    
    -- FIDELITY COMPLIANCE: Employment & income (Fidelity Brokerage Rules)
    employment_status VARCHAR(50),  -- 'EMPLOYED', 'SELF_EMPLOYED', 'RETIRED', 'STUDENT', 'UNEMPLOYED'
    employer_name VARCHAR(255),
    occupation VARCHAR(100),
    annual_income NUMERIC(18,2),  -- Optional: only if customer provides
    liquidity_position VARCHAR(100),  -- Descriptive field for financial position
    
    -- FIDELITY COMPLIANCE: Regulatory disclosures
    is_politically_exposed_person BOOLEAN NOT NULL DEFAULT FALSE,  -- PEP status for AML/KYC
    regulatory_disclosures JSONB,  -- Flexible for control persons, affiliations, broker-dealer affiliations
    beneficial_owner_info JSONB,  -- Beneficial ownership details if applicable
    funds_source_verified BOOLEAN NOT NULL DEFAULT FALSE,  -- Source of funds verification
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_financial_profile_user
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT,
    CONSTRAINT fk_financial_profile_verified_by
        FOREIGN KEY (kyc_verified_by_user_id) REFERENCES users(user_id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,  -- MVP: not enforced
    CONSTRAINT uk_financial_profile_user UNIQUE (user_id),  -- one profile per user
    CONSTRAINT chk_kyc_status CHECK (
        kyc_status IN ('PENDING', 'IN_PROGRESS', 'VERIFIED', 'REJECTED')
    ),
    CONSTRAINT chk_net_worth_bracket CHECK (
        net_worth_bracket IS NULL OR net_worth_bracket IN 
        ('$0-5k', '$5k-25k', '$25k-100k', '$100k-500k', '$500k+')
    ),
    CONSTRAINT chk_risk_profile CHECK (
        risk_profile IS NULL OR risk_profile IN ('CONSERVATIVE', 'MODERATE', 'AGGRESSIVE')
    )
);

CREATE INDEX idx_financial_profile_user ON financial_profiles(user_id);
CREATE INDEX idx_financial_profile_kyc_status ON financial_profiles(kyc_status);

-- ==========================================================
-- SESSIONS (BR-03: Time-limited, revocable sessions)
-- Session inactivity timeout defaults to approximately 10 minutes and is
-- configurable in application code (nexttrade.session.inactivity-minutes).
-- This table stores issued, last-active, expiration, and revocation timestamps.
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
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at DESC);

-- ==========================================================
-- INSTRUMENTS (BR-12: Multi-asset class support)
-- Supports COMMON_STOCK, FX, CRYPTO at launch
-- Market codes allow multiple exchanges per symbol
-- ==========================================================

CREATE TABLE instruments (
    instrument_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol VARCHAR(20) NOT NULL,
    instrument_name VARCHAR(200) NOT NULL,
    asset_class VARCHAR(30) NOT NULL,  -- 'COMMON_STOCK', 'FX', 'CRYPTO'
    market_code VARCHAR(20) NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    sector VARCHAR(100),  -- Industry/sector classification, nullable
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    tradable BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uk_instruments_market_symbol UNIQUE (market_code, symbol),
    CONSTRAINT chk_asset_class CHECK (
        asset_class IN ('COMMON_STOCK', 'FX', 'CRYPTO')
    ),
    CONSTRAINT chk_instrument_currency CHECK (currency = 'USD')
);

CREATE INDEX idx_instruments_symbol ON instruments(symbol);
CREATE INDEX idx_instruments_asset_class ON instruments(asset_class);
CREATE INDEX idx_instruments_tradable ON instruments(tradable);

-- ==========================================================
-- QUOTES (BR-08: Non-stale quotes, BR-13: Indicative pricing)
-- Current bid/ask prices with timestamp for staleness detection
-- Multiple quotes per instrument for market depth + historical tracking
-- source: Identifies the data provider or 'SYNTHETIC_GBM' for generated quotes
-- is_synthetic: Mark quotes as synthetic for demonstration/testing
-- ==========================================================

CREATE TABLE quotes (
    quote_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instrument_id UUID NOT NULL,
    bid NUMERIC(18,8) NOT NULL,
    ask NUMERIC(18,8) NOT NULL,
    bid_size BIGINT,  -- number of shares/units at bid
    ask_size BIGINT,  -- number of shares/units at ask
    quoted_at TIMESTAMPTZ NOT NULL,  -- when this quote was generated (staleness check)
    source VARCHAR(50) NOT NULL,  -- quote provider or 'SYNTHETIC_GBM'
    is_synthetic BOOLEAN NOT NULL DEFAULT FALSE,  -- TRUE for test/demo quotes
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_quotes_instrument
        FOREIGN KEY (instrument_id) REFERENCES instruments(instrument_id) ON DELETE RESTRICT,
    CONSTRAINT chk_quote_bid CHECK (bid > 0),
    CONSTRAINT chk_quote_ask CHECK (ask > 0),
    CONSTRAINT chk_quote_bid_less_than_ask CHECK (bid < ask),
    CONSTRAINT chk_bid_size CHECK (bid_size IS NULL OR bid_size > 0),
    CONSTRAINT chk_ask_size CHECK (ask_size IS NULL OR ask_size > 0),
    CONSTRAINT chk_quote_source CHECK (length(trim(source)) > 0),
    CONSTRAINT uk_quotes_instrument_quoted_at_source UNIQUE (instrument_id, quoted_at, source)
);

CREATE INDEX idx_quotes_instrument ON quotes(instrument_id);
CREATE INDEX idx_quotes_quoted_at ON quotes(quoted_at DESC);
CREATE INDEX idx_quotes_instrument_latest ON quotes(instrument_id, quoted_at DESC);

-- ==========================================================
-- ACCOUNTS (BR-04, BR-05, BR-11: Trading accounts with tier constraints)
-- Trader tier enforcement: NOVICE ($5k min), ADVANCED ($100k min)
-- User can self-classify and upgrade when requirements met
-- ==========================================================

CREATE TABLE accounts (
    account_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    account_number VARCHAR(30) NOT NULL,
    account_name VARCHAR(100) NOT NULL,
    account_type VARCHAR(30) NOT NULL DEFAULT 'INDIVIDUAL_CASH',
    account_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',  -- BR-05: account must be ACTIVE to trade
    
    -- BR-11: TRADER TIER (minimum balance enforcement)
    trader_level VARCHAR(20) NOT NULL DEFAULT 'NOVICE',  -- 'NOVICE' ($5k), 'ADVANCED' ($100k)
    min_balance_requirement NUMERIC(18,2) NOT NULL DEFAULT 5000.00,
    
    -- Price tolerance: Default execution price buffer per account (% above market price user accepts)
    execution_buffer_percent NUMERIC(5,2) NOT NULL DEFAULT 2.00 CHECK (execution_buffer_percent >= 0),
    
    -- FIDELITY COMPLIANCE: Product approvals (Fidelity Brokerage Rules)
    margin_approved BOOLEAN NOT NULL DEFAULT FALSE,  -- Requires additional approval and financial info
    margin_approved_at TIMESTAMPTZ,
    options_approved BOOLEAN NOT NULL DEFAULT FALSE,  -- Requires additional approval and financial info
    options_approved_at TIMESTAMPTZ,
    
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
    ),
    CONSTRAINT chk_trader_level CHECK (
        trader_level IN ('NOVICE', 'ADVANCED')
    ),
    CONSTRAINT chk_min_balance CHECK (min_balance_requirement > 0)
);

CREATE INDEX idx_accounts_user ON accounts(user_id);
CREATE INDEX idx_accounts_trader_level ON accounts(trader_level);
CREATE INDEX idx_accounts_status ON accounts(account_status);

-- ==========================================================
-- ORDERS (BR-04, BR-06, BR-07: Order submission & 2-phase commitment)
-- BR-16: Idempotency via client_reference prevents duplicate fills on retry
-- ==========================================================

CREATE TABLE orders (
    order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL,
    instrument_id UUID NOT NULL,
    
    -- BR-16: IDEMPOTENCY KEY (client-supplied UUID, unique per account)
    -- Allows safe retry: same client_reference = same order
    client_reference UUID NOT NULL,
    
    side VARCHAR(10) NOT NULL,  -- BR-04: BUY or SELL
    quantity BIGINT NOT NULL,
    order_type VARCHAR(20) NOT NULL DEFAULT 'MARKET',
    status VARCHAR(20) NOT NULL DEFAULT 'SUBMITTED',  -- BR-06: 2-phase: SUBMITTED → ACCEPTED or REJECTED
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    accepted_at TIMESTAMPTZ,  -- BR-06: separate acceptance from execution
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Per-order price tolerance override (NULL = use account default)
    buffer_percent NUMERIC(5,2) CHECK (buffer_percent IS NULL OR buffer_percent >= 0),

    CONSTRAINT fk_orders_account
        FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE RESTRICT,
    CONSTRAINT fk_orders_instrument
        FOREIGN KEY (instrument_id) REFERENCES instruments(instrument_id) ON DELETE RESTRICT,
    CONSTRAINT uk_orders_account_client_reference UNIQUE (account_id, client_reference),
    CONSTRAINT chk_order_side CHECK (side IN ('BUY', 'SELL')),
    CONSTRAINT chk_order_quantity CHECK (quantity > 0),
    CONSTRAINT chk_order_type CHECK (order_type = 'MARKET'),
    CONSTRAINT chk_order_status CHECK (
        status IN ('SUBMITTED', 'ACCEPTED', 'FILLED', 'REJECTED', 'PENDING', 'DELAYED')
    )
);

CREATE INDEX idx_orders_account ON orders(account_id);
CREATE INDEX idx_orders_instrument ON orders(instrument_id);
CREATE INDEX idx_orders_submitted_at ON orders(submitted_at DESC);
CREATE INDEX idx_orders_status ON orders(status);

-- ==========================================================
-- FILLS (BR-06, BR-08: Execution against non-stale quotes)
-- One fill per order in MVP (no partial fills)
-- Quote timestamp proves price was current at execution time
-- ==========================================================

CREATE TABLE fills (
    fill_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL,
    filled_quantity BIGINT NOT NULL,
    execution_price NUMERIC(18,8) NOT NULL,
    quote_timestamp TIMESTAMPTZ NOT NULL,  -- BR-08: quote must not be stale
    filled_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_fills_order
        FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE RESTRICT,
    CONSTRAINT uk_fills_order UNIQUE (order_id),
    CONSTRAINT chk_fill_quantity CHECK (filled_quantity > 0),
    CONSTRAINT chk_execution_price CHECK (execution_price > 0)
);

CREATE INDEX idx_fills_order ON fills(order_id);
CREATE INDEX idx_fills_filled_at ON fills(filled_at DESC);

-- ==========================================================
-- ORDER_STATUS_HISTORY (BR-07, BR-16: Order lifecycle audit)
-- Append-only history of all status changes with reasons
-- Enables order status visibility and compliance audit trail
-- ==========================================================

CREATE TABLE order_status_history (
    status_history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL,
    status VARCHAR(20) NOT NULL,  -- BR-07: SUBMITTED, ACCEPTED, FILLED, REJECTED, etc.
    reason_code VARCHAR(50),
    reason_text TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_status_history_order
        FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE RESTRICT,
    CONSTRAINT chk_status_history_status CHECK (
        status IN ('SUBMITTED', 'ACCEPTED', 'FILLED', 'REJECTED', 'PENDING', 'DELAYED')
    )
);

CREATE INDEX idx_status_history_order ON order_status_history(order_id);
CREATE INDEX idx_status_history_occurred_at ON order_status_history(occurred_at DESC);

-- ==========================================================
-- HOLDINGS (Cache layer only)
-- Real source of truth: holding_movements ledger
-- BR-09, BR-10: If cache diverges from ledger, ledger is authoritative
-- Application can compute balance from holding_movements if needed
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

CREATE INDEX idx_holdings_account ON holdings(account_id);
CREATE INDEX idx_holdings_updated_at ON holdings(updated_at DESC);

-- ==========================================================
-- HOLDING_MOVEMENTS (BR-09, BR-10: Append-only ledger)
-- Every fill creates immutable movement record
-- Source of truth for holdings: holdings table is computed cache
-- BR-15: Enables reconstruction of any account state from ledger
-- ==========================================================

CREATE TABLE holding_movements (
    movement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL,
    instrument_id UUID NOT NULL,
    fill_id UUID NOT NULL,
    quantity_change BIGINT NOT NULL,  -- signed: +100 for buy, -50 for sell
    cost_basis NUMERIC(18,8) NOT NULL,  -- execution price
    movement_type VARCHAR(20) NOT NULL,  -- 'BUY', 'SELL', 'DIVIDEND', 'SPLIT', 'CORRECTION'
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_movement_account
        FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE RESTRICT,
    CONSTRAINT fk_movement_instrument
        FOREIGN KEY (instrument_id) REFERENCES instruments(instrument_id) ON DELETE RESTRICT,
    CONSTRAINT fk_movement_fill
        FOREIGN KEY (fill_id) REFERENCES fills(fill_id) ON DELETE RESTRICT,
    CONSTRAINT uk_movement_fill UNIQUE (fill_id),  -- one movement per fill
    CONSTRAINT chk_movement_type CHECK (
        movement_type IN ('BUY', 'SELL', 'DIVIDEND', 'SPLIT', 'CORRECTION')
    )
);

CREATE INDEX idx_movement_account ON holding_movements(account_id);
CREATE INDEX idx_movement_instrument ON holding_movements(instrument_id);
CREATE INDEX idx_movement_created_at ON holding_movements(created_at DESC);
CREATE INDEX idx_movement_fill ON holding_movements(fill_id);

-- ==========================================================
-- CASH_BALANCES (Cache layer only)
-- Real source of truth: cash_transactions ledger
-- BR-09, BR-10: If cache diverges from ledger, ledger is authoritative
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

CREATE INDEX idx_cash_updated_at ON cash_balances(updated_at DESC);

-- ==========================================================
-- CASH_TRANSACTIONS (BR-09, BR-10: Append-only ledger)
-- Every cash movement creates immutable transaction record
-- Source of truth: cash_balances is computed cache
-- Signed amounts: negative for outflow (buy, fee, withdrawal), positive for inflow
-- BR-15: Enables reconstruction of account history from ledger
-- ==========================================================

CREATE TABLE cash_transactions (
    transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL,
    fill_id UUID,  -- NULL for deposits/withdrawals/dividends/fees
    transaction_type VARCHAR(20) NOT NULL,  -- 'BUY', 'SELL', 'DEPOSIT', 'WITHDRAWAL', 'DIVIDEND', 'FEE', 'CORRECTION'
    amount NUMERIC(18,2) NOT NULL,  -- signed: negative for outflow, positive for inflow
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_transaction_account
        FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE RESTRICT,
    CONSTRAINT fk_transaction_fill
        FOREIGN KEY (fill_id) REFERENCES fills(fill_id) ON DELETE SET NULL,
    CONSTRAINT chk_transaction_type CHECK (
        transaction_type IN ('BUY', 'SELL', 'DEPOSIT', 'WITHDRAWAL', 'DIVIDEND', 'FEE', 'CORRECTION')
    ),
    CONSTRAINT chk_transaction_currency CHECK (currency = 'USD')
);

CREATE INDEX idx_transaction_account ON cash_transactions(account_id);
CREATE INDEX idx_transaction_created_at ON cash_transactions(created_at DESC);
CREATE INDEX idx_transaction_type ON cash_transactions(transaction_type);
CREATE INDEX idx_transaction_fill ON cash_transactions(fill_id);

-- ==========================================================
-- AUDIT_LOG (BR-16, BR-17, BR-18: Compliance & insights)
-- Append-only event stream for all significant actions
-- Source for trading activity analysis (BR-16) and business insights (BR-17)
-- Application DB role must not have UPDATE/DELETE on this table
-- ==========================================================

CREATE TABLE audit_log (
    audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    account_id UUID,
    related_order_id UUID,
    actor_type VARCHAR(20) NOT NULL,  -- 'USER', 'SYSTEM'
    event_type VARCHAR(100) NOT NULL,  -- 'LOGIN', 'ORDER_SUBMITTED', 'ORDER_FILLED', 'LOGIN_FAILED', etc.
    payload JSONB,  -- flexible event details (BR-17: can include trading volumes, trends)
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_audit_user
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,
    CONSTRAINT fk_audit_account
        FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE SET NULL,
    CONSTRAINT fk_audit_order
        FOREIGN KEY (related_order_id) REFERENCES orders(order_id) ON DELETE SET NULL,
    CONSTRAINT chk_audit_actor_type CHECK (
        actor_type IN ('USER', 'SYSTEM')
    )
);

CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_account ON audit_log(account_id);
CREATE INDEX idx_audit_order ON audit_log(related_order_id);
CREATE INDEX idx_audit_created_at ON audit_log(created_at DESC);
CREATE INDEX idx_audit_event_type ON audit_log(event_type);

-- ==========================================================
-- HELPER VIEWS (Application query convenience)
-- ==========================================================

-- BR-10: Current balance per account (computed from ledger)
CREATE OR REPLACE VIEW v_account_cash AS
    SELECT 
        account_id,
        'USD' as currency,
        COALESCE(SUM(amount), 0) as balance
    FROM cash_transactions
    GROUP BY account_id;

-- BR-10: Current holdings per account (computed from ledger)
CREATE OR REPLACE VIEW v_account_holdings AS
    SELECT 
        account_id,
        instrument_id,
        COALESCE(SUM(quantity_change), 0) as quantity,
        CASE 
            WHEN SUM(quantity_change) = 0 THEN 0
            ELSE ROUND(SUM(quantity_change * cost_basis) / SUM(quantity_change)::NUMERIC, 8)
        END as avg_cost
    FROM holding_movements
    GROUP BY account_id, instrument_id
    HAVING SUM(quantity_change) > 0;

-- BR-08, BR-13: Latest quote per instrument (for price displays)
-- Includes bid/ask midpoint price calculated as ROUND((bid + ask) / 2, 8)
CREATE OR REPLACE VIEW v_latest_quotes AS
    SELECT DISTINCT ON (instrument_id)
        instrument_id,
        bid,
        ask,
        ROUND((bid + ask) / 2::NUMERIC, 8) as midpoint,
        bid_size,
        ask_size,
        quoted_at,
        source,
        is_synthetic
    FROM quotes
    ORDER BY instrument_id, quoted_at DESC;

-- BR-03: Active sessions per user
CREATE OR REPLACE VIEW v_active_sessions AS
    SELECT 
        user_id,
        COUNT(*) as active_sessions
    FROM sessions
    WHERE expires_at > CURRENT_TIMESTAMP
      AND revoked_at IS NULL
    GROUP BY user_id;

-- BR-11: Trader tier eligibility check (cash balance vs min requirement)
CREATE OR REPLACE VIEW v_trader_tier_eligibility AS
    SELECT 
        a.account_id,
        a.user_id,
        a.trader_level,
        a.min_balance_requirement,
        COALESCE(ct.balance, 0) as current_balance,
        CASE 
            WHEN COALESCE(ct.balance, 0) >= a.min_balance_requirement THEN 'ELIGIBLE'
            ELSE 'INELIGIBLE'
        END as tier_status
    FROM accounts a
    LEFT JOIN (
        SELECT account_id, SUM(amount) as balance
        FROM cash_transactions
        GROUP BY account_id
    ) ct ON a.account_id = ct.account_id;

-- ==========================================================
-- VERIFICATION & TESTING (manual steps)
-- ==========================================================
-- \i /full/path/to/finalized-schema.sql
-- \dt  -- list all tables
-- \dv  -- list all views
-- 
-- Key test scenarios:
-- 1. Create user → customer_profile → customer_verification → financial_profile
-- 2. Verify email verification flow (partial verification)
-- 3. Create account → check trader tier eligibility view
-- 4. Post quote → submit order (idempotency key check) → fill
-- 5. Verify cash_transactions and holding_movements ledgers
-- 6. Test failed_login_attempts lockout (BR-03)
-- 7. Verify trader tier minimum balance constraint (BR-11)
-- 8. Test order status history (BR-07, BR-16)
-- 9. Verify audit_log event capture for compliance (BR-16, BR-17)
-- 10. Test v_account_cash, v_account_holdings, v_latest_quotes views
-- 11. Test v_trader_tier_eligibility for tier enforcement
