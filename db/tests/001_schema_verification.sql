\set ON_ERROR_STOP on

-- Verify all 17 required tables exist
DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(expected.name, ', ')
  INTO missing
  FROM (VALUES
    ('users'),('customer_profiles'),('financial_profiles'),('analyst_profiles'),('password_reset_tokens'),('sessions'),
    ('instruments'),('quotes'),('accounts'),('orders'),('fills'),
    ('order_status_history'),('holdings'),('holding_movements'),
    ('cash_balances'),('cash_transactions'),('audit_log')
  ) expected(name)
  WHERE to_regclass('public.' || expected.name) IS NULL;
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'Missing tables: %', missing; END IF;
END $$;

-- Verify all 5 required views exist
DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(expected.name, ', ')
  INTO missing
  FROM (VALUES
    ('v_account_cash'),('v_account_holdings'),('v_latest_quotes'),
    ('v_active_sessions'),('v_trader_tier_eligibility')
  ) expected(name)
  WHERE to_regclass('public.' || expected.name) IS NULL;
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'Missing views: %', missing; END IF;
END $$;

-- Verify critical security and schema requirements
DO $$
BEGIN
  -- customer_profiles.ssn_encrypted must exist as BYTEA (not TEXT or other type)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='customer_profiles' AND column_name='ssn_encrypted' AND data_type='bytea'
  ) THEN RAISE EXCEPTION 'customer_profiles.ssn_encrypted BYTEA is missing or wrong type'; END IF;
  
  -- Plaintext users.ssn must not exist (security requirement)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='ssn'
  ) THEN RAISE EXCEPTION 'plaintext users.ssn column still exists (security violation)'; END IF;

  -- quotes.source must exist and be VARCHAR (not null)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='quotes' AND column_name='source' AND data_type='character varying'
  ) THEN RAISE EXCEPTION 'quotes.source VARCHAR is missing'; END IF;

  -- quotes.is_synthetic must exist as BOOLEAN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='quotes' AND column_name='is_synthetic' AND data_type='boolean'
  ) THEN RAISE EXCEPTION 'quotes.is_synthetic BOOLEAN is missing'; END IF;

  -- instruments.sector must exist as VARCHAR (nullable)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='instruments' AND column_name='sector' AND data_type='character varying'
  ) THEN RAISE EXCEPTION 'instruments.sector VARCHAR is missing'; END IF;

  -- Age trigger must exist on customer_profiles
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name='tg_customer_profiles_age_validation' AND event_object_table='customer_profiles'
  ) THEN RAISE EXCEPTION 'Age validation trigger tg_customer_profiles_age_validation is missing'; END IF;

  -- users.user_role CHECK constraint must accept 'ANALYST' (not just 'TRADER')
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%user_role%ANALYST%'
  ) THEN RAISE EXCEPTION 'users.user_role CHECK constraint does not permit ANALYST'; END IF;

END $$;

SELECT 'PASS: Schema verification successful - all 17 tables, 5 views, encrypted SSN, no plaintext SSN, trigger, quote provenance fields, and ANALYST role present' AS result;
