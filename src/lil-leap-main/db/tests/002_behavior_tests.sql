-- Transactional behavior checks; run with -v key=<synthetic_test_key>
-- or SSN_ENCRYPTION_KEY in the environment. No fixtures survive success/failure.
\set ON_ERROR_STOP on
\if :{?key}
\else
  \getenv key SSN_ENCRYPTION_KEY
\endif
BEGIN;
SELECT set_config('test.ssn_key', :'key', true) AS ignored \gset

DO $$
DECLARE
    adult_id uuid;
    minor_id uuid;
    instrument_id_value uuid;
    encrypted bytea;
    test_key text := current_setting('test.ssn_key');
BEGIN
    INSERT INTO users(email, password_hash)
    VALUES (gen_random_uuid() || '@behavior.example.test', 'synthetic-hash')
    RETURNING user_id INTO adult_id;
    INSERT INTO customer_profiles(user_id, first_name, last_name, phone, address,
                                  date_of_birth, ssn_encrypted)
    VALUES (adult_id, 'Adult', 'Fixture', '555-0100', '1 Test Way',
            (CURRENT_DATE - INTERVAL '25 years')::date,
            pgp_sym_encrypt('111-22-3333', test_key, 'cipher-algo=aes256'))
    RETURNING ssn_encrypted INTO encrypted;
    IF pgp_sym_decrypt(encrypted, test_key) <> '111-22-3333' THEN
        RAISE EXCEPTION 'SSN round-trip failed';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'customer_profiles'
                     AND column_name = 'ssn_encrypted' AND data_type = 'bytea') THEN
        RAISE EXCEPTION 'SSN column must be BYTEA';
    END IF;

    INSERT INTO users(email, password_hash)
    VALUES (gen_random_uuid() || '@behavior.example.test', 'synthetic-hash')
    RETURNING user_id INTO minor_id;
    BEGIN
        INSERT INTO customer_profiles(user_id, first_name, last_name, phone, address,
                                      date_of_birth, ssn_encrypted)
        VALUES (minor_id, 'Minor', 'Fixture', '555-0101', '2 Test Way',
                (CURRENT_DATE - INTERVAL '19 years')::date, encrypted);
        RAISE EXCEPTION 'Under-21 customer was accepted';
    EXCEPTION WHEN check_violation THEN
        NULL; -- Only the expected constraint error counts as success.
    END;

    INSERT INTO instruments(symbol, instrument_name, asset_class, market_code)
    VALUES (left(gen_random_uuid()::text, 20), 'Behavior fixture', 'COMMON_STOCK', 'TEST')
    RETURNING instrument_id INTO instrument_id_value;
    BEGIN
        INSERT INTO quotes(instrument_id, bid, ask, quoted_at, source, is_synthetic)
        VALUES (instrument_id_value, 226, 225, CURRENT_TIMESTAMP, 'TEST-BEHAVIOR', TRUE);
        RAISE EXCEPTION 'Inverted bid/ask was accepted';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;
    BEGIN
        INSERT INTO quotes(instrument_id, bid, ask, quoted_at, source, is_synthetic)
        VALUES (instrument_id_value, 225, 225, CURRENT_TIMESTAMP, 'TEST-BEHAVIOR', TRUE);
        RAISE EXCEPTION 'Equal bid/ask was accepted';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;
    INSERT INTO quotes(instrument_id, bid, ask, quoted_at, source, is_synthetic)
    VALUES (instrument_id_value, 100, 100.50, CURRENT_TIMESTAMP, 'TEST-BEHAVIOR', TRUE);
END $$;
ROLLBACK;
SELECT 'PASS: encrypted BYTEA round-trip, age validation, quote constraints and provenance; fixtures rolled back' AS result;
