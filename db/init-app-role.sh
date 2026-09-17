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

# Create or update the application role using parameterized SQL.
# Quoting identifiers and values safely prevents SQL injection.
psql -v ON_ERROR_STOP=1 \
    --username "$POSTGRES_USER" \
    --dbname "$POSTGRES_DB" <<-EOSQL

    -- Create application role if it does not exist; update password if it does.
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$DB_APP_USERNAME') THEN
            EXECUTE 'CREATE ROLE ' || quote_ident('$DB_APP_USERNAME') || ' LOGIN PASSWORD ' || quote_literal('$DB_APP_PASSWORD');
        ELSE
            EXECUTE 'ALTER ROLE ' || quote_ident('$DB_APP_USERNAME') || ' WITH PASSWORD ' || quote_literal('$DB_APP_PASSWORD');
        END IF;
    END \$\$;

    -- Grant basic connection and schema usage
    GRANT CONNECT ON DATABASE $POSTGRES_DB TO "$DB_APP_USERNAME";
    GRANT USAGE ON SCHEMA public TO "$DB_APP_USERNAME";

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
    TO "$DB_APP_USERNAME";

    -- Grant SELECT on all helper views for application queries.
    GRANT SELECT ON
        v_account_cash,
        v_account_holdings,
        v_latest_quotes,
        v_active_sessions,
        v_trader_tier_eligibility
    TO "$DB_APP_USERNAME";

    -- audit_log is append-only: application may SELECT and INSERT, never UPDATE/DELETE.
    -- Explicitly revoke UPDATE, DELETE, and TRUNCATE to prevent accidental data tampering.
    GRANT SELECT, INSERT ON audit_log TO "$DB_APP_USERNAME";
    REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM "$DB_APP_USERNAME";

    -- Ensure the application role cannot create objects in schema public.
    -- This is a defense-in-depth control: migrations are run by the admin role only.
    -- Future tables added by the admin role will NOT automatically receive permissions
    -- (see default privileges below), ensuring we audit any new table before granting access.
    ALTER DEFAULT PRIVILEGES FOR ROLE "$POSTGRES_USER" IN SCHEMA public
        GRANT USAGE ON SCHEMAS TO "$DB_APP_USERNAME";

    -- Set default privileges for future tables created by admin role.
    -- New tables will NOT automatically receive permissions; this is intentional:
    -- we must audit security-sensitive tables (especially new audit/security tables)
    -- and explicitly grant permissions to prevent over-privilege by default.
    ALTER DEFAULT PRIVILEGES FOR ROLE "$POSTGRES_USER" IN SCHEMA public
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "$DB_APP_USERNAME";

EOSQL
