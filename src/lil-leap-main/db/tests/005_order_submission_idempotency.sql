\set ON_ERROR_STOP on
BEGIN;

INSERT INTO users(email, password_hash)
VALUES ('next97@example.test', 'synthetic-hash')
RETURNING user_id \gset user_

INSERT INTO accounts(user_id, account_number, account_name, account_status, trading_enabled)
VALUES (:'user_user_id', 'NEXT97-TEST', 'NEXT-97 Test Account', 'ACTIVE', TRUE)
RETURNING account_id \gset account_

INSERT INTO instruments(symbol, instrument_name, asset_class, market_code, currency, sector)
VALUES ('N97', 'NEXT-97 Synthetic Instrument', 'COMMON_STOCK', 'TEST', 'USD', 'Technology')
RETURNING instrument_id \gset instrument_

SELECT gen_random_uuid() AS client_reference \gset idempotency_

INSERT INTO orders(account_id, instrument_id, client_reference, side, quantity, order_type, status)
VALUES (:'account_account_id', :'instrument_instrument_id', :'idempotency_client_reference',
        'BUY', 10, 'MARKET', 'SUBMITTED');

SELECT (COUNT(*) = 1)::int AS first_insert_ok
FROM orders
WHERE account_id = :'account_account_id'
  AND client_reference = :'idempotency_client_reference'
  AND status = 'SUBMITTED'
\gset

SELECT (COUNT(*) = 0)::int AS no_fill_ok
FROM fills f
JOIN orders o ON o.order_id = f.order_id
WHERE o.account_id = :'account_account_id'
\gset

\if :first_insert_ok
\else
  \echo 'FAIL: submitted order was not persisted exactly once'
  \quit 3
\endif

\if :no_fill_ok
\else
  \echo 'FAIL: submission unexpectedly created a fill'
  \quit 4
\endif

ROLLBACK;
SELECT 'PASS: order submission persists SUBMITTED order and creates no fill' AS result;
