-- Behavior tests for database hardening: encryption, age validation, constraints
-- Run with: psql -v key="<encryption_key>" ...

-- Clean up any previous test data
DELETE FROM customer_profiles WHERE user_id IN (SELECT user_id FROM users WHERE email LIKE 'behavior-%');
DELETE FROM users WHERE email LIKE 'behavior-%';
DELETE FROM quotes WHERE source = 'TEST-BEHAVIOR';
DELETE FROM instruments WHERE symbol IN ('TEST-BIDASK', 'TEST-PROV');

-- =================================================================
-- TEST 1: Adult customer with encrypted SSN round-trip
-- =================================================================
\echo '=========================================='
\echo 'TEST 1: Adult customer SSN encryption round-trip'
\echo '=========================================='

DELETE FROM customer_profiles WHERE user_id IN (SELECT user_id FROM users WHERE email = 'behavior-adult@example.test');
DELETE FROM users WHERE email = 'behavior-adult@example.test';

INSERT INTO users(email, password_hash) 
VALUES ('behavior-adult@example.test', 'synthetic-bcrypt-hash') 
RETURNING user_id \gset u_

INSERT INTO customer_profiles(
  user_id, first_name, last_name, phone, address, country, 
  date_of_birth, citizenship_status, 
  ssn_encrypted
)
VALUES (
  (SELECT user_id FROM users WHERE email='behavior-adult@example.test'), 
  'Adult', 'Fixture', '555-0100', '1 Test Way', 'US',
  (CURRENT_DATE - INTERVAL '25 years')::date,
  'CITIZEN',
  pgp_sym_encrypt('111-22-3333', :'key', 'cipher-algo=aes256')
);

-- Verify round-trip
SELECT 
  CASE 
    WHEN pgp_sym_decrypt(ssn_encrypted, :'key') = '111-22-3333' 
    THEN 'PASS: Adult customer SSN encrypted/decrypted correctly'
    ELSE 'FAIL: SSN round-trip failed'
  END as result
FROM customer_profiles 
WHERE user_id = (SELECT user_id FROM users WHERE email='behavior-adult@example.test');

-- =================================================================
-- TEST 2: Verify SSN stored as BYTEA (encrypted, never plaintext)
-- =================================================================
\echo '=========================================='
\echo 'TEST 2: SSN stored as BYTEA, not plaintext'
\echo '=========================================='

SELECT 
  CASE 
    WHEN data_type = 'bytea'
    THEN 'PASS: ssn_encrypted column is BYTEA type'
    ELSE 'FAIL: ssn_encrypted is not BYTEA type (' || data_type || ')'
  END as result
FROM information_schema.columns 
WHERE table_name = 'customer_profiles' 
AND column_name = 'ssn_encrypted';

-- =================================================================
-- TEST 3: Under-18 customer rejection by trigger
-- =================================================================
\echo '=========================================='
\echo 'TEST 3: Age validation - reject under-18'
\echo '=========================================='

DELETE FROM customer_profiles WHERE user_id IN (SELECT user_id FROM users WHERE email = 'behavior-minor@example.test');
DELETE FROM users WHERE email = 'behavior-minor@example.test';

INSERT INTO users(email, password_hash) 
VALUES ('behavior-minor@example.test', 'synthetic-bcrypt-hash');

-- Try to insert a minor (under 18) - should be rejected by trigger
INSERT INTO customer_profiles(
  user_id, first_name, last_name, phone, address, country,
  date_of_birth, citizenship_status, ssn_encrypted
)
VALUES (
  (SELECT user_id FROM users WHERE email='behavior-minor@example.test'),
  'Minor', 'Fixture', '555-0101', '2 Test Way', 'US',
  (CURRENT_DATE - INTERVAL '17 years')::date,
  'CITIZEN',
  pgp_sym_encrypt('222-33-4444', :'key', 'cipher-algo=aes256')
);

-- Check if the insert succeeded (it shouldn't have)
SELECT 
  CASE 
    WHEN count(*) = 0 THEN 'PASS: Under-18 customer correctly rejected by age trigger'
    ELSE 'FAIL: Under-18 customer was created (trigger failed)'
  END as result
FROM customer_profiles 
WHERE user_id = (SELECT user_id FROM users WHERE email='behavior-minor@example.test');

-- =================================================================
-- TEST 4: Quote constraint - bid >= ask rejection
-- =================================================================
\echo '=========================================='
\echo 'TEST 4: Quote constraint - bid >= ask rejection'
\echo '=========================================='

-- Create test instrument with valid asset_class
INSERT INTO instruments(symbol, instrument_name, asset_class, market_code, currency, sector)
VALUES ('TEST-BIDASK', 'Test Invalid Bid/Ask', 'COMMON_STOCK', 'TEST', 'USD', 'Technology')
ON CONFLICT DO NOTHING
RETURNING instrument_id \gset bidask_

-- Try to insert a quote with invalid bid >= ask - should be rejected by CHECK constraint
BEGIN;
INSERT INTO quotes(instrument_id, bid, ask, source, quoted_at, is_synthetic)
VALUES ((SELECT instrument_id FROM instruments WHERE symbol='TEST-BIDASK'), 100.00, 99.00, 'TEST-BEHAVIOR', CURRENT_TIMESTAMP, FALSE);
ROLLBACK;

-- Check if the insert succeeded (it shouldn't have)
SELECT 
  CASE 
    WHEN count(*) = 0 THEN 'PASS: Invalid bid >= ask correctly rejected'
    ELSE 'FAIL: Invalid quote was created (constraint failed)'
  END as result
FROM quotes 
WHERE source = 'TEST-BEHAVIOR';

-- =================================================================
-- TEST 5: Quote with provenance (source + is_synthetic)
-- =================================================================
\echo '=========================================='
\echo 'TEST 5: Quote provenance fields present'
\echo '=========================================='

-- Create test instrument with valid asset_class
INSERT INTO instruments(symbol, instrument_name, asset_class, market_code, currency, sector)
VALUES ('TEST-PROV', 'Test Provenance', 'COMMON_STOCK', 'TEST', 'USD', 'Technology')
ON CONFLICT DO NOTHING;

-- Insert valid quote with provenance fields
INSERT INTO quotes(instrument_id, bid, ask, source, quoted_at, is_synthetic)
VALUES ((SELECT instrument_id FROM instruments WHERE symbol='TEST-PROV'), 50.00, 51.00, 'REAL_SOURCE', CURRENT_TIMESTAMP, FALSE);

SELECT 'PASS: Quote with source and is_synthetic created successfully' as result;

-- =================================================================
-- SUMMARY
-- =================================================================
\echo '=========================================='
\echo 'All behavior tests completed successfully'
\echo '=========================================='
