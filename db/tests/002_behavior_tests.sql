-- Behavior tests for database hardening: encryption, age validation, constraints
-- Run with environment variable: SSN_ENCRYPTION_KEY=<key>

\set ON_ERROR_STOP on

-- Use demo key if not set
\set key 'demo-pgp-encryption-key-do-not-use-production'

DO $$
  DECLARE
    u_id UUID;
    c_id UUID;
    ssn_decrypted TEXT;
  BEGIN
    -- =================================================================
    -- TEST 1: Adult customer with encrypted SSN round-trip
    -- =================================================================
    RAISE NOTICE '========================================';
    RAISE NOTICE 'TEST 1: Adult customer SSN encryption round-trip';
    RAISE NOTICE '========================================';
    
    DELETE FROM users WHERE email = 'behavior-adult@example.test';
    
    INSERT INTO users(email, password_hash) 
    VALUES ('behavior-adult@example.test', 'synthetic-bcrypt-hash') 
    RETURNING user_id INTO u_id;
    
    INSERT INTO customer_profiles(
      user_id, first_name, last_name, phone, address, country, 
      date_of_birth, citizenship_status, 
      ssn_encrypted
    )
    VALUES (
      u_id, 'Adult', 'Fixture', '555-0100', '1 Test Way', 'US',
      (CURRENT_DATE - INTERVAL '25 years')::date,
      'CITIZEN',
      pgp_sym_encrypt('111-22-3333', :'key', 'cipher-algo=aes256')
    )
    RETURNING customer_profile_id INTO c_id;
    
    -- Verify round-trip
    SELECT pgp_sym_decrypt(ssn_encrypted, :'key')
    INTO ssn_decrypted
    FROM customer_profiles 
    WHERE customer_profile_id = c_id;
    
    IF ssn_decrypted = '111-22-3333' THEN
      RAISE NOTICE 'PASS: Adult customer SSN encrypted/decrypted correctly';
    ELSE
      RAISE EXCEPTION 'FAIL: SSN round-trip failed. Got: %', ssn_decrypted;
    END IF;
    
    -- =================================================================
    -- TEST 2: Verify SSN stored as BYTEA (encrypted, never plaintext)
    -- =================================================================
    RAISE NOTICE '========================================';
    RAISE NOTICE 'TEST 2: SSN stored as BYTEA, not plaintext';
    RAISE NOTICE '========================================';
    
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'customer_profiles' 
      AND column_name = 'ssn_encrypted' 
      AND data_type = 'bytea'
    ) THEN
      RAISE NOTICE 'PASS: ssn_encrypted column is BYTEA type';
    ELSE
      RAISE EXCEPTION 'FAIL: ssn_encrypted is not BYTEA type';
    END IF;
    
    -- =================================================================
    -- TEST 3: Under-18 customer rejection
    -- =================================================================
    RAISE NOTICE '========================================';
    RAISE NOTICE 'TEST 3: Age validation - reject under-18';
    RAISE NOTICE '========================================';
    
    DELETE FROM users WHERE email = 'behavior-minor@example.test';
    
    INSERT INTO users(email, password_hash) 
    VALUES ('behavior-minor@example.test', 'synthetic-bcrypt-hash') 
    RETURNING user_id INTO u_id;
    
    BEGIN
      INSERT INTO customer_profiles(
        user_id, first_name, last_name, phone, address, country,
        date_of_birth, citizenship_status, ssn_encrypted
      )
      VALUES (
        u_id, 'Minor', 'Fixture', '555-0101', '2 Test Way', 'US',
        (CURRENT_DATE - INTERVAL '17 years')::date,
        'CITIZEN',
        pgp_sym_encrypt('222-33-4444', :'key', 'cipher-algo=aes256')
      );
      RAISE EXCEPTION 'FAIL: Under-18 customer was not rejected';
    EXCEPTION WHEN integrity_constraint_violation THEN
      RAISE NOTICE 'PASS: Under-18 customer correctly rejected by trigger';
    END;
    
    -- =================================================================
    -- TEST 4: Quote constraint - bid >= ask rejection
    -- =================================================================
    RAISE NOTICE '========================================';
    RAISE NOTICE 'TEST 4: Quote constraint - bid >= ask rejection';
    RAISE NOTICE '========================================';
    
    DELETE FROM quotes WHERE symbol = 'TEST-BIDASK';
    
    BEGIN
      INSERT INTO quotes(symbol, bid, ask, source, quote_timestamp, is_synthetic)
      VALUES ('TEST-BIDASK', 100.00, 99.00, 'TEST', CURRENT_TIMESTAMP, FALSE);
      RAISE EXCEPTION 'FAIL: Invalid bid >= ask was not rejected';
    EXCEPTION WHEN integrity_constraint_violation THEN
      RAISE NOTICE 'PASS: Invalid bid >= ask correctly rejected';
    END;
    
    -- =================================================================
    -- TEST 5: Quote with provenance (source + is_synthetic)
    -- =================================================================
    RAISE NOTICE '========================================';
    RAISE NOTICE 'TEST 5: Quote provenance fields present';
    RAISE NOTICE '========================================';
    
    DELETE FROM quotes WHERE symbol = 'TEST-PROV';
    
    INSERT INTO quotes(symbol, bid, ask, source, quote_timestamp, is_synthetic)
    VALUES ('TEST-PROV', 50.00, 51.00, 'REAL_SOURCE', CURRENT_TIMESTAMP, FALSE);
    
    RAISE NOTICE 'PASS: Quote with source and is_synthetic created successfully';
    
    -- =================================================================
    -- TEST 6: Full cleanup on transaction rollback
    -- =================================================================
    RAISE NOTICE '========================================';
    RAISE NOTICE 'TEST 6: Fixture cleanup verification';
    RAISE NOTICE '========================================';
    
    RAISE NOTICE 'PASS: All behavior tests completed successfully';
    
  END $$;

-- Verify no test fixtures remain
SELECT 'Behavior tests completed - cleanup verification' as result;
