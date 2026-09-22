#!/bin/bash
# Runs after 01-schema.sql (see docker-compose.yml init order: 01-schema.sql, 02-app-role.sh).
# Creates or updates a restricted role for the Spring Boot app, separate from the
# admin role which owns the schema and runs migrations.
# NOTE: only executes on first container start against an empty db_data volume.
# To re-run against an existing volume, use `docker compose down -v` or apply
# the SQL below manually.

set -euo pipefail

# Read configuration from environment variables with defaults
POSTGRES_USER="${POSTGRES_USER:-main}"
POSTGRES_DB="${POSTGRES_DB:-nexttrade}"
DB_APP_USERNAME="${DB_APP_USERNAME:?DB_APP_USERNAME environment variable is required}"
DB_APP_PASSWORD="${DB_APP_PASSWORD:?DB_APP_PASSWORD environment variable is required}"

# Keep the application role distinct from the schema owner.
if [ "$DB_APP_USERNAME" = "$POSTGRES_USER" ]; then
    echo "DB_APP_USERNAME must differ from POSTGRES_USER" >&2
    exit 1
fi
export DB_APP_PASSWORD

# psql quotes identifiers/literals; the password is read from the environment,
# never interpolated into shell-generated SQL or exposed in command arguments.
psql -v ON_ERROR_STOP=1 \
    --username "$POSTGRES_USER" \
    --dbname "$POSTGRES_DB" \
    --set=app_user="$DB_APP_USERNAME" \
    --set=admin_user="$POSTGRES_USER" \
    --set=db_name="$POSTGRES_DB" <<'EOSQL'
    \getenv app_password DB_APP_PASSWORD
    SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'app_user', :'app_password')
    WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user')
    \gexec
    SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L', :'app_user', :'app_password')
    \gexec

    GRANT CONNECT ON DATABASE :"db_name" TO :"app_user";
    GRANT USAGE ON SCHEMA public TO :"app_user";

    -- Grant full DML (SELECT, INSERT, UPDATE, DELETE) on all runtime tables.
    -- Application uses these tables for normal trading and account operations.
    GRANT SELECT, INSERT, UPDATE, DELETE ON
        users,
        customer_profiles,
        financial_profiles,
        analyst_profiles,
        password_reset_tokens,
        sessions,
        instruments,
        quotes,
        accounts,
        orders,
        fills,
        order_status_history,
        holdings,
        holding_movements,
        cash_balances,
        cash_transactions
    TO :"app_user";

    -- TS-06.3: Trading clients cannot change location policy through the runtime role.
    REVOKE ALL ON instrument_jurisdiction_restrictions FROM PUBLIC, :"app_user";
    GRANT SELECT ON instrument_jurisdiction_restrictions TO :"app_user";

    -- Grant SELECT on all helper views for application queries.
    GRANT SELECT ON
        v_account_cash,
        v_account_holdings,
        v_latest_quotes,
        v_active_sessions,
        v_trader_tier_eligibility
    TO :"app_user";

    -- audit_log is append-only: application may SELECT and INSERT, never UPDATE/DELETE.
    -- Explicitly revoke UPDATE, DELETE, and TRUNCATE to prevent accidental data tampering.
    GRANT SELECT, INSERT ON audit_log TO :"app_user";
    REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM :"app_user";

    -- PUBLIC grants are inherited by every role, so remove schema CREATE there too.
    REVOKE CREATE ON SCHEMA public FROM PUBLIC, :"app_user";

    -- Explicit grants above are the allowlist. Undo legacy default grants at
    -- both levels so future tables require a deliberate permission review.
    ALTER DEFAULT PRIVILEGES FOR ROLE :"admin_user"
        REVOKE ALL ON TABLES FROM :"app_user";
    ALTER DEFAULT PRIVILEGES FOR ROLE :"admin_user" IN SCHEMA public
        REVOKE ALL ON TABLES FROM :"app_user";
EOSQL
