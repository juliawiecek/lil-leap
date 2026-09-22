\set ON_ERROR_STOP on

-- Run as the schema owner in a disposable database with -v app_user=app_user.
-- Fixtures and permission checks leave no persistent changes.
BEGIN;
DO $$
DECLARE
    instrument UUID;
BEGIN
    INSERT INTO instruments(symbol, instrument_name, asset_class, market_code)
    VALUES (substr(gen_random_uuid()::text, 1, 20), 'Synthetic jurisdiction fixture', 'COMMON_STOCK', 'TEST')
    RETURNING instrument_id INTO instrument;
    INSERT INTO instrument_jurisdiction_restrictions(instrument_id, country_code, reason)
    VALUES (instrument, 'US', 'Synthetic test only');
    IF NOT EXISTS (SELECT 1 FROM instrument_jurisdiction_restrictions
                   WHERE instrument_id = instrument AND country_code = 'US' AND enabled) THEN
        RAISE EXCEPTION 'Restriction must be enabled by default';
    END IF;
    BEGIN
        INSERT INTO instrument_jurisdiction_restrictions(instrument_id, country_code, reason)
        VALUES (instrument, 'US', 'Duplicate');
        RAISE EXCEPTION 'Duplicate instrument/country rule accepted';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO instrument_jurisdiction_restrictions(instrument_id, country_code, reason)
        VALUES (instrument, 'us', 'Malformed rule');
        RAISE EXCEPTION 'Lowercase country code accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO instrument_jurisdiction_restrictions(instrument_id, country_code, reason)
        VALUES (instrument, 'CA', '  ');
        RAISE EXCEPTION 'Blank rule reason accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO instrument_jurisdiction_restrictions(instrument_id, country_code, reason)
        VALUES (gen_random_uuid(), 'US', 'Unknown instrument');
        RAISE EXCEPTION 'Nonexistent instrument accepted';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;
END $$;

SELECT has_table_privilege(:'app_user', 'instrument_jurisdiction_restrictions', 'SELECT')
       AND NOT has_table_privilege(:'app_user', 'instrument_jurisdiction_restrictions', 'INSERT')
       AND NOT has_table_privilege(:'app_user', 'instrument_jurisdiction_restrictions', 'UPDATE')
       AND NOT has_table_privilege(:'app_user', 'instrument_jurisdiction_restrictions', 'DELETE')
       AND NOT has_table_privilege(:'app_user', 'instrument_jurisdiction_restrictions', 'TRUNCATE')
       AS read_only \gset
\if :read_only
\else
    \echo 'FAIL: runtime restriction rules must be read-only'
    \quit 1
\endif

SET LOCAL ROLE :"app_user";
SELECT count(*) FROM instrument_jurisdiction_restrictions;
DO $$
BEGIN
    BEGIN
        INSERT INTO instrument_jurisdiction_restrictions(instrument_id, country_code, reason)
        VALUES (gen_random_uuid(), 'US', 'Must not be writable');
        RAISE EXCEPTION 'Application role was allowed to insert a rule';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS: jurisdiction constraints and runtime read-only access' AS result;
