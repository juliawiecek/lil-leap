# Signup field mapping

The supplied finalized PostgreSQL SQL is authoritative where the diagram is less specific. This page remains an in-memory preview; there is no API submission or database write.

| Form fields | Schema destination |
| --- | --- |
| Email and password on the existing signup page | users.email; the future server hashes the password into users.password_hash |
| ssn (optional, masked on review) | users.ssn |
| first_name, last_name, phone, address, country, date_of_birth, citizenship_status | customer_profiles columns with the same names |
| employment_status, employer_name, occupation, annual_income, net_worth_bracket, risk_profile, liquidity_position, accredited_investor, is_politically_exposed_person | financial_profiles columns with the same names |
| broker_affiliation, broker_firm_name, broker_affiliation_details, control_person, control_company_name, control_company_role | Proposed keys inside financial_profiles.regulatory_disclosures JSONB |
| other_beneficial_owner, beneficial_owner_name, beneficial_owner_relationship | Proposed keys inside financial_profiles.beneficial_owner_info JSONB |
| account_name, account_type, trader_level | accounts columns with the same names |

Select option values match SQL enums; labels are friendly text. Before a future API submission, convert true/false selection strings to booleans, blank optional values to null, and annual_income to a decimal representation. Exclude detail fields when their controlling answer is No, and employer details when not employed/self-employed. JSONB key names above are an application convention; the SQL does not constrain their shape.

The full name entered at signup is split into editable first/last names for confirmation. Age validation uses the actual birthday and an 18-year cutoff. Phone and string lengths reflect the SQL limits. Annual income is optional, nonnegative, and accepts cents. SSN is optional as in the SQL, with format validation when provided.

Country, citizenship, employment, net worth, risk, and liquidity are kept as required application questions even where the database permits null. Accredited and politically exposed declarations require an explicit answer. Employer and occupation are required only for employed/self-employed applicants.

The account type is INDIVIDUAL_CASH only. Novice/Advanced selections describe the schema's $5,000/$100,000 funding requirements; they do not establish eligibility or enable trading. A future server must derive and enforce the minimum balance from the selected tier.

Server-owned fields are not editable: IDs, account number, role, password hash, login counters, timestamps, KYC status/verifier, funds_source_verified, account status, margin/options approvals, trading_enabled, and balance requirements. Execution buffer retains the database default of 2%; it is not a signup question.

Removed the prior margin choice, tax-residence country, employer address, generic income ranges, investment-goal/experience/time-horizon questions, and trusted-contact fields to fit the supplied schema. No SQL changes were made.

Address UI: street_address, apartment (optional), city, state_province, and postal_code are collected separately and combined into values.address for customer_profiles.address. Country uses a native searchable datalist of all 249 ISO 3166-1 countries and territories, with selection validation and English display names. The original SQL remains unchanged.

