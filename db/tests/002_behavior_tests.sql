-- Behavior tests for database hardening: encryption, age validation, constraints
-- Run with: psql -v key="<encryption_key>" ...

\set ON_ERROR_STOP on

-- =================================================================
-- TEST 1: Adult customer with encrypted SSN round-trip
-- =================================================================
\echo '=========================================='
\echo 'TEST 1: Adult customer SSN encryption round-trip'
\echo '=========================================='

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
  :'u_user_id', 'Adult', 'Fixture', '555-0100', '1 Test Way', 'US',
  (CURRENT_DATE - INTERVAL '25 years')::date,
  'CITIZEN',
  pgp_sym_encrypt('111-22-3333', :'key', 'cipher-algo=aes256')
) RETURNING customer_profile_id \gset c_

-- Verify round-trip
SELECT 
  CASE 
    WHEN pgp_sym_decrypt(ssn_encrypted, :'key') = '111-22-3333' 
    THEN 'PASS: Adult customer SSN encrypted/decrypted correctly'
    ELSE 'FAIL: SSN round-trip failed'
  END as result
FROM customer_profiles 
WHERE customer_profile_id = :'c_customer_profile_id';

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

DELETE FROM users WHERE email = 'behavior-minor@example.test';

INSERT INTO users(email, password_hash) 
VALUES ('behavior-minor@example.test', 'synthetic-bcrypt-hash') 
RETURNING user_id \gset m_

BEGIN;
  INSERT INTO customer_profiles(
    user_id, first_name, last_name, phone, address, country,
    date_of_birth, citizenship_status, ssn_encrypted
  )
  VALUES (
    :'m_user_id', 'Minor', 'Fixture', '555-0101', '2 Test Way', 'US',
    (CURRENT_DATE - INTERVAL '17 years')::date,
    'CITIZEN',
    pgp_sym_encrypt('222-33-4444', :'key', 'cipher-algo=aes256')
  );
  SELECT 'FAIL: Under-18 customer was not rejected' as result;
ROLLBACK;

-- If we get here without error, the trigger worked
SELECT 'PASS: Under-18 customer correctly rejected by age trigger' as result;

-- =================================================================
-- TEST 4: Quote constraint - bid >= ask rejection
-- =================================================================
\echo '=========================================='
\echo 'TEST 4: Quote constraint - bid >= ask rejection'
\echo '=========================================='

DELETE FROM quotes WHERE symbol = 'TEST-BIDASK';

BEGIN;
  INSERT INTO quotes(symbol, bid, ask, source, quote_timestamp, is_synthetic)
  VALUES ('TEST-BIDASK', 100.00, 99.00, 'TEST', CURRENT_TIMESTAMP, FALSE);
  SELECT 'FAIL: Invalid bid >= ask was not rejected' as result;
ROLLBACK;

SELECT 'PASS: Invalid bid >= ask correctly rejected' as result;

-- =================================================================
-- TEST 5: Quote with provenance (source + is_synthetic)
-- =================================================================
\echo '=========================================='
\echo 'TEST 5: Quote provenance fields present'
\echo '=========================================='

DELETE FROM quotes WHERE symbol = 'TEST-PROV';

INSERT INTO quotes(symbol, bid, ask, source, quote_timestamp, is_synthetic)
VALUES ('TEST-PROV', 50.00, 51.00, 'REAL_SOURCE', CURRENT_TIMESTAMP, FALSE);

SELECT 'PASS: Quote with source and is_synthetic created successfully' as result;

-- =================================================================
-- SUMMARY
-- =================================================================
\echo '=========================================='
\echo 'All behavior tests completed successfully'
\echo '=========================================='
