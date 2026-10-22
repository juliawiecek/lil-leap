-- Run as schema owner before deploying the BR-03 user status check in Identity. Safe to reapply.
-- Only ACTIVE users may sign in or refresh a session. DISABLED covers expired and compromised users;
-- DELETED keeps the row, because audit records still reference it (migration 015).
BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_user_status;
ALTER TABLE users ADD CONSTRAINT chk_user_status CHECK (user_status IN ('ACTIVE', 'DISABLED', 'DELETED'));
COMMIT;
