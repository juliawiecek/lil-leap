#!/bin/bash
# Integration test for db/init-app-role.sh
# Verifies application role exists with correct, least-privilege grants.
# Uses configurable database connection values.

set -euo pipefail

# Configuration with environment variable overrides and defaults
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-nexttrade}"
DB_ADMIN_USERNAME="${DB_ADMIN_USERNAME:-main}"
DB_ADMIN_PASSWORD="${DB_ADMIN_PASSWORD:?DB_ADMIN_PASSWORD environment variable is required}"
DB_APP_USERNAME="${DB_APP_USERNAME:-app_user}"
DB_APP_PASSWORD="${DB_APP_PASSWORD:?DB_APP_PASSWORD environment variable is required}"

# Test helpers
psql_admin() {
    PGPASSWORD="$DB_ADMIN_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -v ON_ERROR_STOP=1 \
        --username "$DB_ADMIN_USERNAME" --dbname "$DB_NAME" "$@"
}

# Feed SQL on stdin so psql safely expands the role literal (including quotes).
psql_admin_query() {
    psql_admin -tA --set=app_user="$DB_APP_USERNAME" <<< "$1"
}

psql_app() {
    PGPASSWORD="$DB_APP_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -v ON_ERROR_STOP=1 \
        --username "$DB_APP_USERNAME" --dbname "$DB_NAME" "$@"
}

fail() { echo "FAIL: $1"; exit 1; }
pass() { echo "PASS: $1"; }

echo "=========================================="
echo "Test 1: Application role exists"
echo "=========================================="
ROLE_EXISTS=$(psql_admin_query "SELECT 1 FROM pg_roles WHERE rolname=:'app_user';")
[ "$ROLE_EXISTS" = "1" ] && pass "Role $DB_APP_USERNAME exists" || fail "Role $DB_APP_USERNAME missing"

echo ""
echo "=========================================="
echo "Test 2: Application role can connect"
echo "=========================================="
psql_app -c "SELECT 1;" > /dev/null && pass "Application role can connect to database" || fail "Application role cannot connect"

echo ""
echo "=========================================="
echo "Test 3: SELECT, INSERT, UPDATE, DELETE on runtime tables"
echo "=========================================="
TABLES=(users customer_profiles financial_profiles analyst_profiles password_reset_tokens sessions instruments quotes accounts orders fills order_status_history holdings holding_movements cash_balances cash_transactions)
for TABLE in "${TABLES[@]}"; do
    for PRIV in SELECT INSERT UPDATE DELETE; do
        RESULT=$(psql_admin_query "SELECT has_table_privilege(:'app_user', '$TABLE', '$PRIV');")
        if [ "$RESULT" = "t" ]; then
            pass "$PRIV on $TABLE"
        else
            fail "$PRIV on $TABLE missing"
        fi
    done
done

echo ""
echo "=========================================="
echo "Test 4: SELECT on all helper views"
echo "=========================================="
VIEWS=(v_account_cash v_account_holdings v_latest_quotes v_active_sessions v_trader_tier_eligibility)
for VIEW in "${VIEWS[@]}"; do
    SELECT_OK=$(psql_admin_query "SELECT has_table_privilege(:'app_user', '$VIEW', 'SELECT');")
    if [ "$SELECT_OK" = "t" ]; then
        pass "SELECT on $VIEW"
    else
        fail "SELECT on $VIEW missing"
    fi
done

echo ""
echo "=========================================="
echo "Test 5: audit_log is append-only (SELECT/INSERT yes, UPDATE/DELETE no)"
echo "=========================================="
SELECT_OK=$(psql_admin_query "SELECT has_table_privilege(:'app_user', 'audit_log', 'SELECT');")
INSERT_OK=$(psql_admin_query "SELECT has_table_privilege(:'app_user', 'audit_log', 'INSERT');")
UPDATE_OK=$(psql_admin_query "SELECT has_table_privilege(:'app_user', 'audit_log', 'UPDATE');")
DELETE_OK=$(psql_admin_query "SELECT has_table_privilege(:'app_user', 'audit_log', 'DELETE');")
TRUNCATE_OK=$(psql_admin_query "SELECT has_table_privilege(:'app_user', 'audit_log', 'TRUNCATE');")

[ "$SELECT_OK" = "t" ] && pass "SELECT on audit_log granted" || fail "SELECT on audit_log missing"
[ "$INSERT_OK" = "t" ] && pass "INSERT on audit_log granted" || fail "INSERT on audit_log missing"
[ "$UPDATE_OK" = "f" ] && pass "UPDATE on audit_log correctly denied" || fail "UPDATE on audit_log should be denied"
[ "$DELETE_OK" = "f" ] && pass "DELETE on audit_log correctly denied" || fail "DELETE on audit_log should be denied"
[ "$TRUNCATE_OK" = "f" ] && pass "TRUNCATE on audit_log correctly denied" || fail "TRUNCATE on audit_log should be denied"

echo ""
echo "=========================================="
echo "Test 6: Application role cannot CREATE/DROP/ALTER (no migration rights)"
echo "=========================================="
if psql_app -c "CREATE TABLE should_fail (id int);" 2>/dev/null; then
    psql_admin -c "DROP TABLE IF EXISTS should_fail;" > /dev/null
    fail "Application role should NOT be able to CREATE TABLE"
else
    pass "CREATE TABLE correctly denied to application role"
fi

# New tables must remain private until an explicit grant is reviewed.
psql_admin --set=app_user="$DB_APP_USERNAME" <<'EOSQL'
BEGIN;
CREATE TABLE public.role_default_privilege_probe (id integer);
SELECT NOT (
    has_table_privilege(:'app_user', 'public.role_default_privilege_probe', 'SELECT') OR
    has_table_privilege(:'app_user', 'public.role_default_privilege_probe', 'INSERT') OR
    has_table_privilege(:'app_user', 'public.role_default_privilege_probe', 'UPDATE') OR
    has_table_privilege(:'app_user', 'public.role_default_privilege_probe', 'DELETE')
) AS private_table \gset
\if :private_table
\else
    \echo 'FAIL: future tables inherit application permissions'
    \quit 1
\endif
ROLLBACK;
EOSQL
pass "Future tables require explicit grants"

echo ""
echo "=========================================="
echo "All tests passed"
echo "=========================================="