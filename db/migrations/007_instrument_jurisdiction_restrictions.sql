\set ON_ERROR_STOP on

-- Apply as the schema owner with: psql ... -v app_user=app_user -f <this file>
-- Safe to reapply; existing rule data is preserved. No policy is seeded.
BEGIN;
CREATE TABLE IF NOT EXISTS instrument_jurisdiction_restrictions (
    instrument_id UUID NOT NULL REFERENCES instruments(instrument_id) ON DELETE RESTRICT,
    country_code VARCHAR(2) NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    reason VARCHAR(200) NOT NULL CHECK (length(trim(reason)) > 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (instrument_id, country_code)
);
REVOKE ALL ON instrument_jurisdiction_restrictions FROM PUBLIC;
REVOKE ALL ON instrument_jurisdiction_restrictions FROM :"app_user";
GRANT SELECT ON instrument_jurisdiction_restrictions TO :"app_user";
COMMIT;
