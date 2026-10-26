-- Run as schema owner before deploying password expiry in Identity. Safe to reapply.
-- Passwords age from password_changed_at (BR-03). Existing rows start the clock at upgrade time,
-- so nobody is locked out by the upgrade itself. password_expiry_warned_at records the one
-- "expires soon" email per password, so a restart or a second Identity instance never resends it.
BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_expiry_warned_at TIMESTAMPTZ;
COMMIT;
