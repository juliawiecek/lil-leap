#!/bin/bash
# Runs after initial-schema.sql (see docker-compose.yml init order: 01-schema.sql, 02-app-role.sh).
# Creates a restricted role for the Spring Boot app, separate from the
# POSTGRES_USER ("main") which owns the schema and runs migrations.
# NOTE: only executes on first container start against an empty db_data
# volume. To re-run against an existing volume, use `docker compose down -v`
# or apply the SQL below manually.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE ROLE app_user LOGIN PASSWORD '${DB_APP_PASSWORD}';

    -- Connect + use schema, but no CREATE/DROP/ALTER: app_user cannot run migrations.
    GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO app_user;
    GRANT USAGE ON SCHEMA public TO app_user;

    -- Standard DML for the app's runtime tables.
    GRANT SELECT, INSERT, UPDATE, DELETE ON
        users, instruments, accounts, sessions, orders, fills,
        order_status_history, holdings, cash_balances
        TO app_user;

    -- audit_log is append-only: app_user may read/insert but never update/delete.
    GRANT SELECT, INSERT ON audit_log TO app_user;

    -- Tables added later by migrations (run as \$POSTGRES_USER) get the same
    -- default grants automatically.
    ALTER DEFAULT PRIVILEGES FOR ROLE ${POSTGRES_USER} IN SCHEMA public
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
EOSQL
