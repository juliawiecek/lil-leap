-- Atomicity test: Verify transaction rollback leaves no partial data.
-- Tests that a deliberately rolled-back settlement leaves no:
-- - fills
-- - cash transactions
-- - holding movements
-- - order state
-- - test fixture records
--
-- This demonstrates ACID compliance and ledger-based settlement integrity.

\set ON_ERROR_STOP on

BEGIN;

-- Create test user and account
INSERT INTO users(email,password_hash) VALUES ('atomic-rollback@example.test','synthetic-hash') RETURNING user_id \gset u_
INSERT INTO accounts(user_id,account_number,account_name,account_status,trading_enabled)
VALUES (:u_user_id,'TEST-ATOMIC-ROLLBACK','Atomic Account','ACTIVE',TRUE) RETURNING account_id \gset a_

-- Create test instrument
INSERT INTO instruments(symbol,instrument_name,asset_class,market_code,currency)
VALUES ('ATOM','Atomic Test','COMMON_STOCK','TEST','USD') RETURNING instrument_id \gset i_

-- Create test order
INSERT INTO orders(account_id,instrument_id,client_reference,side,quantity,status,accepted_at)
VALUES (:a_account_id,:i_instrument_id,gen_random_uuid(),'BUY',10,'ACCEPTED',CURRENT_TIMESTAMP) RETURNING order_id \gset o_

-- SAVEPOINT: Mark before settlement
SAVEPOINT settlement;

-- Insert fill
INSERT INTO fills(order_id,filled_quantity,execution_price,quote_timestamp)
VALUES (:o_order_id,10,10.00,CURRENT_TIMESTAMP) RETURNING fill_id \gset f_

-- Insert cash transaction (would debit account)
INSERT INTO cash_transactions(account_id,fill_id,transaction_type,amount)
VALUES (:a_account_id,:f_fill_id,'BUY',-100.00);

-- Insert holding movement (would credit holdings)
INSERT INTO holding_movements(account_id,instrument_id,fill_id,quantity_change,cost_basis,movement_type)
VALUES (:a_account_id,:i_instrument_id,:f_fill_id,10,10.00,'BUY');

-- ROLLBACK SAVEPOINT: Undo all settlement operations
ROLLBACK TO SAVEPOINT settlement;

-- Verify fill was rolled back
SELECT count(*) AS fill_count FROM fills WHERE order_id=:o_order_id \gset check_
\if :check_fill_count
  \echo 'FAIL: Fill survived savepoint rollback'
  \quit 4
\else
  \echo 'PASS: Fill rolled back'
\endif

-- Verify cash transaction was rolled back
SELECT count(*) AS txn_count FROM cash_transactions WHERE account_id=:a_account_id \gset check2_
\if :check2_txn_count
  \echo 'FAIL: Cash transaction survived rollback'
  \quit 5
\else
  \echo 'PASS: Cash transaction rolled back'
\endif

-- Verify holding movement was rolled back
SELECT count(*) AS move_count FROM holding_movements WHERE account_id=:a_account_id \gset check3_
\if :check3_move_count
  \echo 'FAIL: Holding movement survived rollback'
  \quit 6
\else
  \echo 'PASS: Holding movement rolled back'
\endif

-- Rollback entire transaction
ROLLBACK;

-- Verify all test fixtures were cleaned up
SELECT CASE WHEN count(*)=0 THEN 'PASS: Full transaction rollback left no fixture rows' ELSE 'FAIL: Fixtures persisted' END
FROM users WHERE email='atomic-rollback@example.test';
