#!/bin/bash
# Runs after initial-schema.sql (see docker-compose.yml init order: 01-schema.sql, 02-app-role.sh).
# Creates a restricted role for the Spring Boot app, separate from the
# main role which owns the schema and runs migrations.
# NOTE: only executes on first container start against an empty db_data
# volume. To re-run against an existing volume, use `docker compose down -v`
# or apply the SQL below manually.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "main" --dbname "nexttrade" <<-EOSQL
    CREATE ROLE app_user LOGIN PASSWORD 'my_app_password';

    -- Connect + use schema, but no CREATE/DROP/ALTER: app_user cannot run migrations.
    GRANT CONNECT ON DATABASE nexttrade TO app_user;
    GRANT USAGE ON SCHEMA public TO app_user;

    -- Standard DML for the app's runtime tables.
    GRANT SELECT, INSERT, UPDATE, DELETE ON
        users, instruments, accounts, sessions, orders, fills,
        order_status_history, holdings, cash_balances, financial_profiles, customer_profiles
        TO app_user;

    -- audit_log is append-only: app_user may read/insert but never update/delete.
    GRANT SELECT, INSERT ON audit_log TO app_user;

    -- Tables added later by migrations (run as main) get the same
    -- default grants automatically.
    ALTER DEFAULT PRIVILEGES FOR ROLE main IN SCHEMA public
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
EOSQL
