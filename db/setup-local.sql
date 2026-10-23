-- Native primary-only development setup. This does not provision the reporting
-- role/replica from Compose; see docs/DATABASE_SETUP.md for the complete topology.
-- Run as the local PostgreSQL administrator, connected to the postgres database:
-- psql -h localhost -p 5432 -U postgres -d postgres -f db/setup-local.sql
\set ON_ERROR_STOP on

-- Only create missing roles. Never reset an existing role's password.
SELECT 'CREATE ROLE main LOGIN PASSWORD ''main_password'''
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'main') \gexec
SELECT 'CREATE ROLE app_user LOGIN PASSWORD ''my_app_password'''
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') \gexec
SELECT 'CREATE DATABASE nexttrade OWNER main'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'nexttrade') \gexec

\connect nexttrade
SET ROLE main;
SELECT to_regclass('public.users') IS NULL AS needs_schema \gset
\if :needs_schema
    BEGIN;
    \ir finalized-schema.sql
    COMMIT;
\else
    \echo 'Existing schema retained. Replaying safe local migrations before seeding test users.'
\endif

-- Safe to reapply on fresh or retained schemas; these keep local databases aligned
-- with the current seed data and app expectations.
\ir migrations/007_durable_order_execution.sql
\ir migrations/008_holdings_projection.sql
\ir migrations/009_cash_settlement_detail.sql
\ir migrations/010_cash_transfers.sql
\ir migrations/011_order_reference_price.sql
\ir migrations/012_operations_role.sql
\ir startup-migrations.sql

-- Idempotent seeds, so they also run on an existing database: the instrument
-- universe, dev test logins (TS-DB-04), and demo trading activity (which adds
-- today's trades again when the database was seeded on an earlier day).
\ir seeds/001_us_equity_instruments.sql
\ir seeds/002_test_users.sql
\ir seeds/003_demo_trading_activity.sql

-- Same application permissions as init-app-role.sh in the Docker setup.
GRANT CONNECT ON DATABASE nexttrade TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON
    users, customer_profiles, financial_profiles, analyst_profiles,
    password_reset_tokens, sessions, instruments, quotes, accounts, orders,
    fills, order_status_history, holdings, holding_movements,
    cash_balances, cash_transactions TO app_user;
GRANT SELECT ON cash_holds TO app_user;
GRANT SELECT ON v_account_cash, v_account_holdings, v_latest_quotes,
    v_active_sessions, v_trader_tier_eligibility, v_trade_audit_events, v_trade_clients TO app_user;
GRANT SELECT, INSERT ON audit_log TO app_user;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM app_user;
REVOKE CREATE ON SCHEMA public FROM PUBLIC, app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE main REVOKE ALL ON TABLES FROM app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE main IN SCHEMA public REVOKE ALL ON TABLES FROM app_user;
RESET ROLE;
