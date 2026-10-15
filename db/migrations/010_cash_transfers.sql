-- Run as schema owner before deploying PS-05 (account-to-account cash transfers). Safe to reapply.
BEGIN;
ALTER TABLE cash_transactions DROP CONSTRAINT IF EXISTS chk_transaction_type;
ALTER TABLE cash_transactions ADD CONSTRAINT chk_transaction_type CHECK (
    transaction_type IN ('BUY', 'SELL', 'DEPOSIT', 'WITHDRAWAL', 'DIVIDEND', 'FEE', 'CORRECTION', 'TRANSFER'));
COMMIT;
