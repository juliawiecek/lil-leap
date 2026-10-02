-- Run as the primary database owner after init-reporting.sh.
-- Verifies the reporting role remains read-only even on the writable primary.
BEGIN;
SET LOCAL ROLE reporting_user;
SELECT COUNT(*) FROM orders;
SELECT COUNT(*) FROM holdings;
DO $$
BEGIN
    BEGIN
        UPDATE orders SET status = status WHERE FALSE;
        RAISE EXCEPTION 'reporting_user unexpectedly has write privileges';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
        PERFORM password_hash FROM users LIMIT 1;
        RAISE EXCEPTION 'reporting_user unexpectedly has access to credentials';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
END;
$$;
ROLLBACK;
