-- Run as schema owner before deploying TS-03.5 (OPERATIONS role for trade investigation). Safe to reapply.
-- Operations staff are seeded, not self-registered; auth still registers only TRADER and ANALYST.
BEGIN;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_user_role_check;
ALTER TABLE users ADD CONSTRAINT users_user_role_check
    CHECK (user_role IN ('TRADER', 'ANALYST', 'OPERATIONS'));
COMMIT;
