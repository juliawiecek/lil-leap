\set ON_ERROR_STOP on
BEGIN;

INSERT INTO users(email, password_hash) VALUES
  ('next88-a@example.test', 'synthetic-hash'),
  ('next88-b@example.test', 'synthetic-hash');

SELECT user_id AS user_a FROM users WHERE email='next88-a@example.test' \gset
SELECT user_id AS user_b FROM users WHERE email='next88-b@example.test' \gset

INSERT INTO accounts(user_id, account_number, account_name, account_status, trader_level,
                     min_balance_requirement, execution_buffer_percent, trading_enabled)
VALUES
  (:'user_a', 'NEXT88-A', 'NEXT-88 A', 'ACTIVE', 'NOVICE', 5000, 2, true),
  (:'user_b', 'NEXT88-B', 'NEXT-88 B', 'ACTIVE', 'NOVICE', 5000, 2, true);

SELECT account_id AS account_a FROM accounts WHERE account_number='NEXT88-A' \gset
SELECT account_id AS account_b FROM accounts WHERE account_number='NEXT88-B' \gset

INSERT INTO instruments(symbol, instrument_name, asset_class, market_code, currency, sector)
VALUES ('N88', 'NEXT-88 Synthetic Instrument', 'COMMON_STOCK', 'TEST', 'USD', 'Technology');
SELECT instrument_id AS instrument_id FROM instruments WHERE symbol='N88' AND market_code='TEST' \gset

INSERT INTO holdings(account_id, instrument_id, quantity, avg_cost)
VALUES (:'account_a', :'instrument_id', 10, 5), (:'account_b', :'instrument_id', 20, 5);
INSERT INTO cash_balances(account_id, currency, balance)
VALUES (:'account_a', 'USD', 1000), (:'account_b', 'USD', 2000);
INSERT INTO orders(account_id, instrument_id, client_reference, side, quantity, order_type, status)
VALUES
  (:'account_a', :'instrument_id', gen_random_uuid(), 'BUY', 1, 'MARKET', 'SUBMITTED'),
  (:'account_b', :'instrument_id', gen_random_uuid(), 'BUY', 2, 'MARKET', 'SUBMITTED');

DO $$
DECLARE
  a UUID := :'user_a';
  holding_count integer;
  cash_count integer;
  order_count integer;
  leaked_count integer;
BEGIN
  SELECT count(*) INTO holding_count FROM holdings h JOIN accounts ac ON ac.account_id=h.account_id WHERE ac.user_id=a;
  SELECT count(*) INTO cash_count FROM cash_balances cb JOIN accounts ac ON ac.account_id=cb.account_id WHERE ac.user_id=a;
  SELECT count(*) INTO order_count FROM orders o JOIN accounts ac ON ac.account_id=o.account_id WHERE ac.user_id=a;
  SELECT count(*) INTO leaked_count FROM accounts WHERE user_id<>a AND account_id IN (
    SELECT h.account_id FROM holdings h JOIN accounts ac ON ac.account_id=h.account_id WHERE ac.user_id=a
  );
  IF holding_count <> 1 OR cash_count <> 1 OR order_count <> 1 OR leaked_count <> 0 THEN
    RAISE EXCEPTION 'NEXT-88 isolation failed: holdings %, cash %, orders %, leaked %', holding_count, cash_count, order_count, leaked_count;
  END IF;
END $$;

ROLLBACK;
SELECT 'PASS: authenticated user scoping isolates holdings, cash, and orders' AS result;
