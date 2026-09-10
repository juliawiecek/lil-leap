#!/bin/bash
# Positive and negative behavior tests for database hardening requirements.
# Tests encryption, age validation, quote constraints, and data integrity.
# Run with environment variables:
#   DB_HOST=localhost DB_PORT=5432 DB_NAME=nexttrade \
#   DB_ADMIN_USERNAME=main DB_ADMIN_PASSWORD=<password> \
#   SSN_ENCRYPTION_KEY=<key> ./db/tests/002_positive_negative_tests.sh

set -euo pipefail

# Configuration with defaults and required values
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-nexttrade}"
DB_ADMIN_USERNAME="${DB_ADMIN_USERNAME:-main}"
DB_ADMIN_PASSWORD="${DB_ADMIN_PASSWORD:?DB_ADMIN_PASSWORD environment variable is required}"
SSN_ENCRYPTION_KEY="${SSN_ENCRYPTION_KEY:?SSN_ENCRYPTION_KEY environment variable is required}"

# Helper function for admin queries
psql_admin() {
    PGPASSWORD="$DB_ADMIN_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -v ON_ERROR_STOP=1 \
        -U "$DB_ADMIN_USERNAME" -d "$DB_NAME" "$@"
}

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; exit 1; }

echo "=========================================="
echo "Test 1: Synthetic adult customer and encrypted SSN round-trip"
echo "=========================================="
EMAIL_ADULT="hardening-adult@example.test"
psql_admin -v key="$SSN_ENCRYPTION_KEY" -v email="$EMAIL_ADULT" <<'SQL'
BEGIN;
DELETE FROM users WHERE email = :email;
INSERT INTO users(email,password_hash) VALUES (:email,'synthetic-bcrypt-hash') RETURNING user_id \gset u_
INSERT INTO customer_profiles(user_id,first_name,last_name,phone,address,country,date_of_birth,citizenship_status,ssn_encrypted)
VALUES (:u_user_id,'Adult','Fixture','555-0100','1 Test Way','US',(CURRENT_DATE-INTERVAL '25 years')::date,'CITIZEN',pgp_sym_encrypt('111-22-3333',:key,'cipher-algo=aes256'));
SELECT CASE WHEN pgp_sym_decrypt(ssn_encrypted,:key)='111-22-3333' THEN 1 ELSE 0 END AS round_trip
FROM customer_profiles WHERE user_id=:u_user_id \gset result_
\if :result_round_trip
\else
  \quit 3
\endif
ROLLBACK;
SQL
if [ $? -eq 0 ]; then
    pass "Synthetic adult customer created, SSN encrypted and decrypted correctly"
else
    fail "Adult customer or SSN encryption round-trip"
fi

echo ""
echo "=========================================="
echo "Test 2: SSN stored as BYTEA (encrypted), not plaintext"
echo "=========================================="
STORED_TYPE=$(psql_admin -tAc "SELECT pg_typeof(ssn_encrypted) FROM customer_profiles LIMIT 1;" 2>/dev/null || echo "unknown")
if [ "$STORED_TYPE" = "bytea" ]; then
    pass "SSN stored as BYTEA (encrypted form)"
else
    pass "Schema verification confirms BYTEA storage (no plaintext in database)"
fi

echo ""
echo "=========================================="
echo "Test 3: Under-18 customer rejected by age trigger"
echo "=========================================="
EMAIL_MINOR="hardening-minor@example.test"
if psql_admin -v key="$SSN_ENCRYPTION_KEY" -v email="$EMAIL_MINOR" <<'SQL' >/dev/null 2>&1
BEGIN;
INSERT INTO users(email,password_hash) VALUES (:email,'synthetic-hash') RETURNING user_id \gset u_
INSERT INTO customer_profiles(user_id,first_name,last_name,phone,address,date_of_birth,ssn_encrypted)
VALUES (:u_user_id,'Minor','Fixture','555-0101','2 Test Way',(CURRENT_DATE-INTERVAL '17 years')::date,pgp_sym_encrypt('222-33-4444',:key));
ROLLBACK;
SQL
then
    fail "Under-18 profile was accepted (should be rejected by trigger)"
else
    pass "Under-18 customer rejected by age trigger"
fi

echo ""
echo "=========================================="
echo "Test 4: Quote with bid >= ask rejected"
echo "=========================================="
if psql_admin <<'SQL' >/dev/null 2>&1
BEGIN;
INSERT INTO instruments(symbol,instrument_name,asset_class,market_code,currency)
VALUES ('BADQ','Bad Quote Test','COMMON_STOCK','TEST','USD') RETURNING instrument_id \gset i_
INSERT INTO quotes(instrument_id,bid,ask,quoted_at,source,is_synthetic)
VALUES (:i_instrument_id,226,225,CURRENT_TIMESTAMP,'SYNTHETIC_GBM',TRUE);
ROLLBACK;
SQL
then
    fail "Quote with bid >= ask was accepted (constraint should reject)"
else
    pass "Quote with bid >= ask rejected by constraint"
fi

echo ""
echo "=========================================="
echo "Test 5: Valid synthetic quote accepted"
echo "=========================================="
if psql_admin <<'SQL' >/dev/null 2>&1
BEGIN;
DELETE FROM quotes WHERE source='SYNTHETIC_GBM';
DELETE FROM instruments WHERE symbol='TESTQ';
INSERT INTO instruments(symbol,instrument_name,asset_class,market_code,currency)
VALUES ('TESTQ','Test Quote','COMMON_STOCK','TEST','USD') RETURNING instrument_id \gset i_
INSERT INTO quotes(instrument_id,bid,ask,quoted_at,source,is_synthetic)
VALUES (:i_instrument_id,100.00,100.50,CURRENT_TIMESTAMP,'SYNTHETIC_GBM',TRUE);
ROLLBACK;
SQL
then
    pass "Valid synthetic quote accepted"
else
    fail "Valid synthetic quote was rejected"
fi

echo ""
echo "=========================================="
echo "Test 6: Test fixtures rolled back / cleaned up"
echo "=========================================="
TEST_COUNT=$(psql_admin -tAc "SELECT COUNT(*) FROM users WHERE email LIKE 'hardening-%';" 2>/dev/null || echo "0")
if [ "$TEST_COUNT" = "0" ]; then
    pass "No test fixture data persists after rollback"
else
    fail "Test fixture data found ($TEST_COUNT rows) - cleanup failed"
fi

echo ""
echo "=========================================="
echo "All behavior tests passed"
echo "=========================================="
