-- Run as schema owner before deploying Trade lookup from the database (BR-15). Safe to reapply.
-- Insights shows who placed a trade. The reporting role has no access to users or customer_profiles,
-- so this view exposes only a trader's id, name and email: no password, phone, address, birth date or SSN.
BEGIN;
CREATE OR REPLACE VIEW v_trade_clients AS
    SELECT u.user_id, p.first_name, p.last_name, u.email
    FROM users u
    LEFT JOIN customer_profiles p ON p.user_id = u.user_id
    WHERE u.user_role = 'TRADER';
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'reporting_user') THEN
        GRANT SELECT ON v_trade_clients TO reporting_user;
    END IF;
    -- Insights connects as app_user outside the replica setup (compose, local).
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
        GRANT SELECT ON v_trade_clients TO app_user;
    END IF;
END $$;
COMMIT;
