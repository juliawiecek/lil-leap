\set ON_ERROR_STOP on
BEGIN;

INSERT INTO users(email, password_hash)
VALUES ('next97@example.test', 'synthetic-hash')
RETURNING user_id AS user_id \gset

INSERT INTO accounts(
    user_id, account_number, account_name, account_status,
    trader_level, min_balance_requirement, execution_buffer_percent,
    trading_enabled
) VALUES (
    :'user_id', 'NEXT97-ACCOUNT', 'NEXT-97 Account', 'ACTIVE',
    'NOVICE', 5000, 2, true
)
RETURNING account_id AS account_id \gset

INSERT INTO instruments(symbol, instrument_name, asset_class, market_code, currency, sector)
VALUES ('N97', 'NEXT-97 Synthetic Instrument', 'COMMON_STOCK', 'TEST', 'USD', 'Technology')
RETURNING instrument_id AS instrument_id \gset

SELECT gen_random_uuid() AS client_reference \gset

INSERT INTO orders(
    account_id, instrument_id, client_reference,
    side, quantity, order_type, status
) VALUES (
    :'account_id', :'instrument_id', :'client_reference',
    'BUY', 10, 'MARKET', 'SUBMITTED'
);

SELECT (COUNT(*) = 1)::int AS one_order
FROM orders
WHERE account_id = :'account_id'
  AND client_reference = :'client_reference'
\gset

\if :one_order
\else
  \echo 'FAIL: valid order was not persisted exactly once'
  \quit 3
\endif

SAVEPOINT duplicate_submission;
\set ON_ERROR_STOP off
INSERT INTO orders(
    account_id, instrument_id, client_reference,
    side, quantity, order_type, status
) VALUES (
    :'account_id', :'instrument_id', :'client_reference',
    'BUY', 10, 'MARKET', 'SUBMITTED'
);
\set duplicate_sqlstate :SQLSTATE
\set ON_ERROR_STOP on
ROLLBACK TO SAVEPOINT duplicate_submission;

SELECT (:'duplicate_sqlstate' = '23505')::int AS duplicate_rejected \gset
\if :duplicate_rejected
\else
  \echo 'FAIL: duplicate idempotency key was not rejected by the database'
  \quit 4
\endif

ROLLBACK;
SELECT 'PASS: valid order persisted and duplicate idempotency key prevented' AS result;
