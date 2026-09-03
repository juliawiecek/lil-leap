#!/bin/bash
# Integration test for db/init-app-role.sh
# Verifies app_user role exists with correct, least-privilege grants.
# Run against the db service from docker-compose.yml:
#   docker compose up -d db
#   ./db/test-init-app-role.sh
set -euo pipefail

: "${DB_PASSWORD:?DB_PASSWORD not set}"
: "${DB_APP_PASSWORD:?DB_APP_PASSWORD not set}"

POSTGRES_USER="main"
POSTGRES_DB="nexttrade"

psql_admin() {
    PGPASSWORD="$DB_PASSWORD" psql -h localhost -p 5432 -v ON_ERROR_STOP=1 \
        --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" "$@"
}

psql_app() {
    PGPASSWORD="$DB_APP_PASSWORD" psql -h localhost -p 5432 -v ON_ERROR_STOP=1 \
        --username app_user --dbname "$POSTGRES_DB" "$@"
}

fail() { echo "FAIL: $1"; exit 1; }
pass() { echo "PASS: $1"; }

echo "== Test 1: app_user role exists =="
ROLE_EXISTS=$(psql_admin -tAc "SELECT 1 FROM pg_roles WHERE rolname='app_user';")
[ "$ROLE_EXISTS" = "1" ] && pass "app_user role exists" || fail "app_user role missing"

echo "== Test 2: app_user can connect =="
psql_app -c "SELECT 1;" > /dev/null && pass "app_user can connect" || fail "app_user cannot connect"

echo "== Test 3: app_user has full DML on runtime tables =="
for TABLE in users instruments accounts sessions orders fills order_status_history holdings cash_balances; do
    for PRIV in SELECT INSERT UPDATE DELETE; do
        RESULT=$(psql_app -tAc "SELECT has_table_privilege('app_user', '$TABLE', '$PRIV');")
        [ "$RESULT" = "t" ] && pass "$PRIV on $TABLE granted" || fail "$PRIV on $TABLE missing"
    done
done

echo "== Test 4: audit_log is append-only (SELECT/INSERT yes, UPDATE/DELETE no) =="
SELECT_OK=$(psql_app -tAc "SELECT has_table_privilege('app_user', 'audit_log', 'SELECT');")
INSERT_OK=$(psql_app -tAc "SELECT has_table_privilege('app_user', 'audit_log', 'INSERT');")
UPDATE_OK=$(psql_app -tAc "SELECT has_table_privilege('app_user', 'audit_log', 'UPDATE');")
DELETE_OK=$(psql_app -tAc "SELECT has_table_privilege('app_user', 'audit_log', 'DELETE');")

[ "$SELECT_OK" = "t" ] && pass "SELECT on audit_log granted" || fail "SELECT on audit_log missing"
[ "$INSERT_OK" = "t" ] && pass "INSERT on audit_log granted" || fail "INSERT on audit_log missing"
[ "$UPDATE_OK" = "f" ] && pass "UPDATE on audit_log correctly denied" || fail "UPDATE on audit_log should be denied"
[ "$DELETE_OK" = "f" ] && pass "DELETE on audit_log correctly denied" || fail "DELETE on audit_log should be denied"

echo "== Test 5: app_user cannot CREATE/DROP/ALTER (no migration rights) =="
if psql_app -c "CREATE TABLE should_fail (id int);" 2>/dev/null; then
    psql_admin -c "DROP TABLE IF EXISTS should_fail;" > /dev/null
    fail "app_user should NOT be able to CREATE TABLE"
else
    pass "CREATE TABLE correctly denied"
fi

echo "== Test 6: default privileges apply to future tables =="
psql_admin -c "CREATE TABLE test_future_table (id int);" > /dev/null
FUTURE_OK=$(psql_app -tAc "SELECT has_table_privilege('app_user', 'test_future_table', 'SELECT');")
psql_admin -c "DROP TABLE test_future_table;" > /dev/null
[ "$FUTURE_OK" = "t" ] && pass "Default privileges applied to new table" || fail "Default privileges NOT applied"

echo "All tests passed."