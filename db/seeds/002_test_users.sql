-- ==========================================================
-- TS-DB-04: Always-ready test users for local development (DEV/DEMO ONLY)
--
-- Never mount this file in a production compose file.
--
-- Accounts (one shared password, shared with the team privately; never commit it)
--   novice@nexttrade.local    TRADER, NOVICE    $10,000 cash, AAPL + MSFT, 3 fills, 1 rejected order
--   advanced@nexttrade.local  TRADER, ADVANCED  $150,000 cash, 5 holdings, 6 fills, 1 rejected order
--   analyst@nexttrade.local   ANALYST           insights (reporting) app
--   ops@nexttrade.local       OPERATIONS        insights trade investigation (TS-03.5)
--
-- Runs automatically on an empty volume as /docker-entrypoint-initdb.d/05-test-users.sql.
-- Idempotent, so it can be re-run on an existing volume, which also resets the test logins:
--   docker compose exec db psql -U main -d nexttrade -f /docker-entrypoint-initdb.d/05-test-users.sql
--   native setup: psql -h localhost -U main -d nexttrade -f db/seeds/002_test_users.sql
--
-- Every row has a fixed id (derived ids use md5(...)::uuid) and every insert is
-- ON CONFLICT DO NOTHING, so a re-run changes nothing, except that the four users
-- get the shared password back and any lockout cleared. Holdings are not inserted
-- directly: the holding_movements trigger projects them. cash_balances is written
-- from the cash_transactions ledger so the cache always matches it.
-- ==========================================================

-- SSN ciphertext must use the same key as auth. Native setups export auth's own
-- NEXTTRADE_SECURITY_SSN_ENCRYPTION_KEY; docker-compose.yml passes SSN_ENCRYPTION_KEY
-- to the db container. Unset or empty falls back to the compose default.
\getenv ssn_key NEXTTRADE_SECURITY_SSN_ENCRYPTION_KEY
\if :{?ssn_key}
\else
\getenv ssn_key SSN_ENCRYPTION_KEY
\endif
\if :{?ssn_key}
\else
\set ssn_key ''
\endif
SELECT set_config('nexttrade.seed_ssn_key', COALESCE(NULLIF(:'ssn_key', ''), 'replace_me'), false) AS ssn_key_set \gset

BEGIN;

-- A dev who registered one of these emails by hand has a different user_id; stop
-- with a clear message instead of failing on a foreign key halfway through.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM users
        WHERE LOWER(TRIM(email)) IN ('novice@nexttrade.local', 'advanced@nexttrade.local', 'analyst@nexttrade.local',
                                     'ops@nexttrade.local')
          AND user_id NOT IN ('a0000000-0000-4000-8000-000000000001',
                              'a0000000-0000-4000-8000-000000000002',
                              'a0000000-0000-4000-8000-000000000003',
                              'a0000000-0000-4000-8000-000000000004')
    ) THEN
        RAISE EXCEPTION 'A test user email is already registered with a different id; delete that user or use a fresh volume';
    END IF;
END $$;

-- ----------------------------------------------------------
-- Users. Only bcrypt hashes are stored (auth's format: '{bcrypt}' prefix, cost 10),
-- so the password itself is not in the repository.
-- ----------------------------------------------------------
INSERT INTO users (user_id, email, password_hash, user_role) VALUES
    ('a0000000-0000-4000-8000-000000000001', 'novice@nexttrade.local',
     '{bcrypt}$2a$10$r61.WVDqMOCcMYtjIyQ84.cd4C/1nL2dBPU37BDiDcxMvt8PZkVBC', 'TRADER'),
    ('a0000000-0000-4000-8000-000000000002', 'advanced@nexttrade.local',
     '{bcrypt}$2a$10$YqpOCB4wU1lVu/6q5L2Wv.zTIOogHu2MfLdS4sKZHoehrduJUpRb6', 'TRADER'),
    ('a0000000-0000-4000-8000-000000000003', 'analyst@nexttrade.local',
     '{bcrypt}$2a$10$4P5ar9VW2l8fGwc07BF9Oe6icRQ/I36vAbLCbqS60WhgQ2m0vWOmq', 'ANALYST'),
    -- Same shared password as the others, so the analyst's hash is reused.
    ('a0000000-0000-4000-8000-000000000004', 'ops@nexttrade.local',
     '{bcrypt}$2a$10$4P5ar9VW2l8fGwc07BF9Oe6icRQ/I36vAbLCbqS60WhgQ2m0vWOmq', 'OPERATIONS')
-- A re-run restores the shared password and clears any lockout, so a test login
-- whose password was changed or that was locked out works again.
ON CONFLICT (user_id) DO UPDATE
    SET password_hash = EXCLUDED.password_hash, failed_login_attempts = 0, locked_until = NULL;

-- ----------------------------------------------------------
-- Trader identity and KYC (SSNs are synthetic, stored as digits like auth does)
-- ----------------------------------------------------------
INSERT INTO customer_profiles (profile_id, user_id, first_name, last_name, phone, address, country,
                               date_of_birth, ssn_encrypted, citizenship_status) VALUES
    ('a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
     'Nova', 'Tester', '+1 555 010 0001', '1 Test Street, Boston, MA 02110', 'United States', DATE '1995-04-12',
     pgp_sym_encrypt('900000001', current_setting('nexttrade.seed_ssn_key'), 'cipher-algo=aes256'), 'CITIZEN'),
    ('a1000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002',
     'Ada', 'Vance', '+1 555 010 0002', '2 Test Street, New York, NY 10004', 'United States', DATE '1984-09-30',
     pgp_sym_encrypt('900000002', current_setting('nexttrade.seed_ssn_key'), 'cipher-algo=aes256'), 'CITIZEN')
ON CONFLICT DO NOTHING;

INSERT INTO financial_profiles (financial_profile_id, user_id, kyc_status, accredited_investor, net_worth_bracket,
                                risk_profile, employment_status, employer_name, occupation, annual_income,
                                liquidity_position, funds_source_verified) VALUES
    ('a2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'VERIFIED', FALSE,
     '$25k-100k', 'MODERATE', 'EMPLOYED', 'NextTrade Test Co', 'Engineer', 85000.00, 'Moderate', TRUE),
    ('a2000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', 'VERIFIED', TRUE,
     '$500k+', 'AGGRESSIVE', 'EMPLOYED', 'NextTrade Test Co', 'Portfolio Manager', 320000.00, 'High', TRUE)
ON CONFLICT DO NOTHING;

INSERT INTO analyst_profiles (analyst_profile_id, user_id, employee_id, department) VALUES
    ('a3000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000003', 'EMP-DEV-0001', 'Insights'),
    -- Staff identity for the operations user too: the table holds every internal employee's profile.
    ('a3000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000004', 'EMP-DEV-0002', 'Trading Operations')
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------
-- Accounts: ACTIVE and trading-enabled, with the tier's minimum balance
-- ----------------------------------------------------------
INSERT INTO accounts (account_id, user_id, account_number, account_name, account_status,
                      trader_level, min_balance_requirement, trading_enabled, created_at) VALUES
    ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'NT-DEV-0001',
     'Novice Test Account', 'ACTIVE', 'NOVICE', 5000.00, TRUE, CURRENT_TIMESTAMP - INTERVAL '30 days'),
    ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', 'NT-DEV-0002',
     'Advanced Test Account', 'ACTIVE', 'ADVANCED', 100000.00, TRUE, CURRENT_TIMESTAMP - INTERVAL '30 days')
ON CONFLICT DO NOTHING;

-- Opening deposits, sized so the cash left after the history below is exactly
-- $10,000.00 (novice) and $150,000.00 (advanced).
INSERT INTO cash_transactions (transaction_id, account_id, transaction_type, amount, created_at, settled_at) VALUES
    ('b1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'DEPOSIT', 14208.00,
     CURRENT_TIMESTAMP - INTERVAL '30 days', CURRENT_TIMESTAMP - INTERVAL '30 days'),
    ('b1000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', 'DEPOSIT', 259850.50,
     CURRENT_TIMESTAMP - INTERVAL '30 days', CURRENT_TIMESTAMP - INTERVAL '30 days')
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------
-- Order history. reason IS NULL means the order filled; otherwise it was
-- rejected at execution with that reason code, as the execution worker does.
-- ----------------------------------------------------------
CREATE TEMP TABLE seed_trades (
    order_id UUID, account_id UUID, symbol TEXT, side TEXT, quantity BIGINT,
    price NUMERIC(18,8), reason TEXT, at TIMESTAMPTZ
) ON COMMIT DROP;

-- Fixed UTC times of day, so these fills land in the same hour buckets as the insights
-- reporting CSV (generated by generate_demo_trades.py, which lists these fills too).
INSERT INTO seed_trades VALUES
    -- novice: ends with 10 AAPL @ 220.00 and 4 MSFT @ 505.00
    ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'AAPL', 'BUY', 12, 220.00, NULL, date_trunc('day', CURRENT_TIMESTAMP, 'UTC') - INTERVAL '21 days' + INTERVAL '14:35'),
    ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'AAPL', 'SELL', 2, 226.00, NULL, date_trunc('day', CURRENT_TIMESTAMP, 'UTC') - INTERVAL '14 days' + INTERVAL '15:10'),
    ('c0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', 'MSFT', 'BUY', 4, 505.00, NULL, date_trunc('day', CURRENT_TIMESTAMP, 'UTC') - INTERVAL '9 days' + INTERVAL '16:20'),
    ('c0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001', 'NVDA', 'BUY', 100, 175.00, 'INSUFFICIENT_CASH', date_trunc('day', CURRENT_TIMESTAMP, 'UTC') - INTERVAL '3 days' + INTERVAL '17:45'),
    -- advanced: ends with 100 AAPL, 60 MSFT, 150 NVDA, 80 AMZN, 70 GOOGL
    ('c0000000-0000-4000-8000-000000000101', 'b0000000-0000-4000-8000-000000000002', 'AAPL', 'BUY', 100, 221.50, NULL, date_trunc('day', CURRENT_TIMESTAMP, 'UTC') - INTERVAL '25 days' + INTERVAL '13:45'),
    ('c0000000-0000-4000-8000-000000000102', 'b0000000-0000-4000-8000-000000000002', 'MSFT', 'BUY', 60, 502.00, NULL, date_trunc('day', CURRENT_TIMESTAMP, 'UTC') - INTERVAL '22 days' + INTERVAL '14:05'),
    ('c0000000-0000-4000-8000-000000000103', 'b0000000-0000-4000-8000-000000000002', 'NVDA', 'BUY', 200, 168.25, NULL, date_trunc('day', CURRENT_TIMESTAMP, 'UTC') - INTERVAL '18 days' + INTERVAL '15:40'),
    ('c0000000-0000-4000-8000-000000000104', 'b0000000-0000-4000-8000-000000000002', 'AMZN', 'BUY', 80, 231.10, NULL, date_trunc('day', CURRENT_TIMESTAMP, 'UTC') - INTERVAL '15 days' + INTERVAL '17:15'),
    ('c0000000-0000-4000-8000-000000000105', 'b0000000-0000-4000-8000-000000000002', 'NVDA', 'SELL', 50, 176.40, NULL, date_trunc('day', CURRENT_TIMESTAMP, 'UTC') - INTERVAL '10 days' + INTERVAL '18:30'),
    ('c0000000-0000-4000-8000-000000000106', 'b0000000-0000-4000-8000-000000000002', 'GOOGL', 'BUY', 70, 203.75, NULL, date_trunc('day', CURRENT_TIMESTAMP, 'UTC') - INTERVAL '6 days' + INTERVAL '19:05'),
    ('c0000000-0000-4000-8000-000000000107', 'b0000000-0000-4000-8000-000000000002', 'AMZN', 'BUY', 40, 236.00, 'STALE_QUOTE', date_trunc('day', CURRENT_TIMESTAMP, 'UTC') - INTERVAL '2 days' + INTERVAL '15:55');

CREATE TEMP VIEW seed_orders AS
SELECT t.*, i.instrument_id,
       md5('seed-fill-' || t.order_id)::uuid AS fill_id,
       ROUND(t.quantity * t.price, 2) * CASE t.side WHEN 'BUY' THEN -1 ELSE 1 END AS cash_delta
FROM seed_trades t
JOIN instruments i ON i.market_code = 'NASDAQ' AND i.symbol = t.symbol;

INSERT INTO orders (order_id, account_id, instrument_id, client_reference, side, quantity, order_type, status,
                    submitted_at, accepted_at, next_execution_at, execution_attempts, last_execution_error, updated_at)
SELECT order_id, account_id, instrument_id, md5('seed-client-ref-' || order_id)::uuid, side, quantity, 'MARKET',
       CASE WHEN reason IS NULL THEN 'FILLED' ELSE 'REJECTED' END,
       at, at + INTERVAL '1 second', at + INTERVAL '1 second', 1, reason, at + INTERVAL '2 seconds'
FROM seed_orders
ON CONFLICT DO NOTHING;

INSERT INTO order_status_history (status_history_id, order_id, status, reason_code, occurred_at)
SELECT md5('seed-history-' || s.step || '-' || o.order_id)::uuid, o.order_id, s.status, s.reason_code,
       o.at + s.offset_seconds * INTERVAL '1 second'
FROM seed_orders o
CROSS JOIN LATERAL (VALUES
    (1, 'SUBMITTED', 'SUBMISSION_VALIDATED', 0),
    (2, 'ACCEPTED', 'ORDER_ACCEPTED', 1),
    (3, CASE WHEN o.reason IS NULL THEN 'FILLED' ELSE 'REJECTED' END,
        COALESCE(o.reason, 'EXECUTION_SUCCESS'), 2)
) AS s(step, status, reason_code, offset_seconds)
ON CONFLICT DO NOTHING;

INSERT INTO fills (fill_id, order_id, filled_quantity, execution_price, quote_timestamp, filled_at)
SELECT fill_id, order_id, quantity, price, at + INTERVAL '1 second', at + INTERVAL '2 seconds'
FROM seed_orders WHERE reason IS NULL
ON CONFLICT DO NOTHING;

-- The tg_holding_movement_projection trigger updates holdings from these rows.
INSERT INTO holding_movements (movement_id, account_id, instrument_id, fill_id, quantity_change, cost_basis,
                               movement_type, created_at)
SELECT md5('seed-movement-' || order_id)::uuid, account_id, instrument_id, fill_id,
       CASE side WHEN 'BUY' THEN quantity ELSE -quantity END, price, side, at + INTERVAL '2 seconds'
FROM seed_orders WHERE reason IS NULL
ORDER BY at
ON CONFLICT DO NOTHING;

INSERT INTO cash_transactions (transaction_id, account_id, fill_id, transaction_type, amount, created_at, settled_at)
SELECT md5('seed-cash-' || order_id)::uuid, account_id, fill_id, side, cash_delta,
       at + INTERVAL '2 seconds', at + INTERVAL '2 seconds'
FROM seed_orders WHERE reason IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO audit_log (audit_id, user_id, account_id, related_order_id, actor_type, event_type, payload, created_at)
SELECT md5('seed-audit-' || e.event_type || '-' || o.order_id)::uuid, NULL, o.account_id, o.order_id, 'SYSTEM',
       e.event_type, e.payload, o.at + INTERVAL '2 seconds'
FROM seed_orders o
CROSS JOIN LATERAL (
    SELECT 'ORDER_FILLED' AS event_type,
           jsonb_build_object('fillId', o.fill_id, 'quantity', o.quantity,
                              'executionPrice', o.price, 'cashDelta', o.cash_delta) AS payload
    WHERE o.reason IS NULL
    UNION ALL
    SELECT 'SETTLEMENT_COMPLETED',
           jsonb_build_object('fillId', o.fill_id, 'quantity', o.quantity,
                              'executionPrice', o.price, 'cashDelta', o.cash_delta)
    WHERE o.reason IS NULL
    UNION ALL
    SELECT 'ORDER_REJECTED', jsonb_build_object('reasonCode', o.reason, 'attemptNumber', 1)
    WHERE o.reason IS NOT NULL
) AS e
ON CONFLICT DO NOTHING;

-- Balance cache from the ledger: 10,000.00 (novice) and 150,000.00 (advanced).
INSERT INTO cash_balances (account_id, currency, balance)
SELECT account_id, 'USD', SUM(amount)
FROM cash_transactions
WHERE account_id IN ('b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002')
GROUP BY account_id
ON CONFLICT DO NOTHING;

COMMIT;
