-- TS-01.5: align existing normalized databases with the updated 21+ registration rule.
-- Run as the schema owner; no customer data is rewritten.
BEGIN;

-- Refuse to silently remove or alter customers accepted under a previous policy.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM customer_profiles
               WHERE date_of_birth > CURRENT_DATE - INTERVAL '21 years') THEN
        RAISE EXCEPTION 'Cannot apply 21+ policy: existing under-21 profiles require review. No customer data was changed.';
    END IF;
END;
$$;

ALTER TABLE customer_profiles DROP CONSTRAINT IF EXISTS chk_age_21_or_older;
ALTER TABLE customer_profiles DROP CONSTRAINT IF EXISTS chk_age_18_or_older;
ALTER TABLE customer_profiles ADD CONSTRAINT chk_age_21_or_older
    CHECK (date_of_birth <= CURRENT_DATE - INTERVAL '21 years');

DROP TRIGGER IF EXISTS tg_customer_profiles_age_validation ON customer_profiles;
DROP FUNCTION IF EXISTS check_customer_age_18();

CREATE OR REPLACE FUNCTION check_customer_age_21()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.date_of_birth > CURRENT_DATE - INTERVAL '21 years' THEN
        RAISE EXCEPTION 'Customer must be at least 21 years old' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_customer_profiles_age_validation
BEFORE INSERT OR UPDATE OF date_of_birth ON customer_profiles
FOR EACH ROW EXECUTE FUNCTION check_customer_age_21();

COMMIT;
