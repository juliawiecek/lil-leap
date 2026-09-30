#!/bin/bash
# Idempotent: run on the primary, including when upgrading an existing volume.
set -euo pipefail
: "${REPORTING_DB_PASSWORD:?REPORTING_DB_PASSWORD is required}"
: "${REPLICATION_PASSWORD:?REPLICATION_PASSWORD is required}"
export REPORTING_DB_PASSWORD REPLICATION_PASSWORD
psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER:-main}" --dbname "${POSTGRES_DB:-nexttrade}" <<'SQL'
\getenv reporting_password REPORTING_DB_PASSWORD
\getenv replication_password REPLICATION_PASSWORD
SELECT 'CREATE ROLE reporting_user LOGIN' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'reporting_user') \gexec
SELECT format('ALTER ROLE reporting_user NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD %L', :'reporting_password') \gexec
ALTER ROLE reporting_user SET default_transaction_read_only = on;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM reporting_user;
GRANT USAGE ON SCHEMA public TO reporting_user;
-- Deliberately excludes credentials, sessions, password-reset tokens and PII.
GRANT SELECT ON accounts, instruments, quotes, orders, fills, order_status_history,
    holdings, holding_movements, cash_balances, cash_transactions TO reporting_user;
SELECT 'CREATE ROLE replicator LOGIN REPLICATION' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'replicator') \gexec
SELECT format('ALTER ROLE replicator REPLICATION PASSWORD %L', :'replication_password') \gexec
SELECT pg_create_physical_replication_slot('reporting_replica')
WHERE NOT EXISTS (SELECT FROM pg_replication_slots WHERE slot_name = 'reporting_replica');
SQL

# The dedicated Docker network and SCRAM credentials gate replication connections.
if ! grep -q '^host replication replicator ' "$PGDATA/pg_hba.conf"; then
    printf '\nhost replication replicator all scram-sha-256\n' >> "$PGDATA/pg_hba.conf"
fi
psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER:-main}" --dbname "${POSTGRES_DB:-nexttrade}" -c 'SELECT pg_reload_conf();'
