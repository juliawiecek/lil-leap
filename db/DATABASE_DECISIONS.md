# NextTrade Database Decisions

## Core Architectural Decisions

### Transactional System of Record

**Decision**: PostgreSQL is the authoritative system of record for all NextTrade transactional data (users, accounts, orders, trades, cash, holdings).

**Rationale**: 
- ACID guarantees ensure order settlement and ledger consistency
- Structured data model matches complex business relationships
- Extension ecosystem (pgcrypto, JSON support) enables security and analytics
- Maturit and widespread adoption in fintech

**Trade-offs**: 
- No native horizontal scaling (can add read replicas and sharding layers later)
- Schema migrations require downtime if not carefully versioned

---

## Database Instances

### Development (Isolated Per Developer)

**Decision**: Each developer runs a complete, isolated PostgreSQL instance using Docker Compose with a shared schema and version-controlled initialization scripts.

**How It Works**:
- Docker Compose starts a `db` service with a named volume (`db_data`)
- On first run, `01-schema.sql` and `02-app-role.sh` are executed
- Volume persists across `docker compose down` (no `-v` flag)
- Developers can safely test schema changes and migrations

**Benefits**:
- Schema consistency across all dev environments
- No shared database contention
- Easy reset: `docker compose down -v`
- Close simulation of production initialization

---

### Linux VM (Shared Demonstration/Integration)

**Decision**: A designated Linux VM may host a single PostgreSQL instance for manual integration testing and demonstration purposes.

**Configuration**:
- IP/hostname, port, credentials are provided by VM administrator
- Schema is loaded once; future changes are applied manually
- Not used for automated CI/CD tests (Jenkins uses disposable instances)

**Connection**: Set `DB_HOST`, `DB_PORT`, `DB_ADMIN_USERNAME`, `DB_ADMIN_PASSWORD` in `.env` or environment

---

### CI/CD (Jenkins, GitLab)

**Decision**: Each CI/CD test run starts a fresh, disposable PostgreSQL instance. No data persistence required.

**How It Works**:
- Docker Compose or test harness starts PostgreSQL container
- Schema is initialized from `finalized-schema.sql` and `init-app-role.sh`
- Tests run
- Container and volume are destroyed after test

**Benefit**: No test pollution or flaky data dependencies

---

## Data Security and Privacy

### Full SSN Storage and Encryption

**Decision**: Full Social Security Number is collected during customer registration and stored only as **reversibly encrypted BYTEA** in `customer_profiles.ssn_encrypted` using pgcrypto PGP symmetric encryption.

**How It Works**:
```sql
-- On INSERT (application provides encryption key)
INSERT INTO customer_profiles (user_id, ..., ssn_encrypted)
VALUES (user_id, ..., pgp_sym_encrypt('111-22-3333', 'my_encryption_key', 'cipher-algo=aes256'));

-- On SELECT (application provides same key)
SELECT pgp_sym_decrypt(ssn_encrypted, 'my_encryption_key') AS ssn FROM customer_profiles;
```

**Why Encrypted SSN, Not Users Table**:
- `users` table is authentication-only (password_hash, email, login security)
- `customer_profiles` stores identity and personal information
- Separation of concerns isolates sensitive data by purpose

**Key Management**:
- **Never** hard-code encryption key in SQL or application code
- **Always** provide key via environment variable (`SSN_ENCRYPTION_KEY`)
- **Never** log the key or plaintext SSN
- Future: integrate with cloud key management (AWS KMS, HashiCorp Vault)

**Compliance**:
- Satisfies PCI DSS § 3.2.1 (strong cryptography for stored sensitive data)
- PII encryption prevents data breach exposure even if database is compromised

---

### Plaintext SSN Prohibition

**Decision**: The `users` table does **not** contain an `ssn` column. SSN is stored only in `customer_profiles.ssn_encrypted`.

**Enforcement**:
- Schema validation test (`db/tests/001_schema_verification.sql`) fails if plaintext `users.ssn` exists
- Application code must never attempt to store unencrypted SSN
- Audit log must never include plaintext SSN in payloads

---

## Age and Residency Compliance

### Minimum Trading Age: 21 Years

**Decision**: Customers must be at least 21 years old, enforced by:
1. **Constraint**: `customer_profiles.chk_age_21_or_older` CHECK (date_of_birth <= CURRENT_DATE - INTERVAL '21 years')
2. **Trigger**: `tg_customer_profiles_age_validation` BEFORE INSERT OR UPDATE OF date_of_birth — rejects under-21 with SQLSTATE 23514 (check_violation)

**Why Two Controls**:
- Constraint: Efficient, always enforced
- Trigger: Provides explicit error message and controlled exception
- **Not** time-dependent: Does not use `AGE()` function (which changes daily); uses fixed calculation

**Rationale**: Trading Rules document specifies 21+ age requirement; common for brokerage platforms

**Future**: May add accredited investor designation (age 21+, net worth, investment experience) for options/margin products

---

### Residency and Citizenship

**Decision**: `customer_profiles.citizenship_status` and `customer_profiles.country` track location for regulatory compliance.

**Values**:
- `citizenship_status`: 'CITIZEN', 'PERMANENT_RESIDENT', 'OTHER'
- `country`: Free-text country name for flexibility

**Future**: May add state/country-level trading restrictions (e.g., exclude certain states/countries per local regulations)

---

## Session Management

### Session Inactivity Timeout

**Decision**: Sessions expire after approximately **10 minutes of inactivity** (configurable at runtime).

**How It Works**:
- Application tracks `sessions.last_active_at` per user action
- Periodic cleanup removes expired sessions (expires_at > CURRENT_TIMESTAMP)
- Configuration: `nexttrade.session.inactivity-minutes` (Spring Boot property or env: `SESSION_INACTIVITY_MINUTES`)

**Database Storage**:
- `sessions.issued_at`: When session was created
- `sessions.last_active_at`: Last user action timestamp
- `sessions.expires_at`: Expiration time (computed by app: issued_at + inactivity_minutes)
- `sessions.revoked_at`: Manual revocation timestamp (logout, password change, etc.)

**Why Application-Configurable**:
- Trading platforms may require different inactivity policies per deployment
- Local dev might use 1 hour; production might use 5 minutes
- No database schema change required to adjust

**Not Time-Dependent**: Expiration is computed once; no daily re-evaluation

---

## Quote Provenance and Synthetic Data

### Quote Source and Synthetic Flags

**Decision**: Every quote record includes:
- `quotes.source`: Identifies the data provider (e.g., 'IEX', 'NASDAQ', 'SYNTHETIC_GBM', 'MANUAL')
- `quotes.is_synthetic`: Boolean flag (TRUE for test/demo quotes, FALSE for live data)

**Why**:
- Audit trail: Know where every price came from
- Test/Demo Isolation: Synthetic quotes don't inflate real trading metrics
- Multi-Provider Support: Can mix live and synthetic quotes for testing
- Compliance: Demonstrate which quotes were real vs. simulated

**Uniqueness Constraint**: 
```sql
UNIQUE (instrument_id, quoted_at, source)
```
Ensures no duplicate quotes from same source at same timestamp.

**Latest-Quote View** (`v_latest_quotes`):
```sql
SELECT instrument_id, bid, ask, ROUND((bid + ask) / 2, 8) as midpoint,
       bid_size, ask_size, quoted_at, source, is_synthetic
FROM quotes
ORDER BY instrument_id, quoted_at DESC
```
Includes midpoint price (bid/ask average) for quick market assessment.

---

## Instrument Universe

### Current Support: US Common Stock

**Decision**: MVP focuses on US common stock (COMMON_STOCK asset_class, USD currency, US market codes like NYSE, NASDAQ).

**Schema Support**: Extensible to other asset classes:
- `instruments.asset_class`: 'COMMON_STOCK', 'FX', 'CRYPTO' (enum in code, VARCHAR for flexibility)
- `instruments.market_code`: Exchange code (NYSE, NASDAQ, XETRA, CME, BINANCE, etc.)
- `instruments.currency`: USD (constraint: currently USD only, but VARCHAR for future)
- `instruments.sector`: Industry classification (Technology, Healthcare, Finance, etc.)

**Future Roadmap**:
- FX (Foreign Exchange pairs: EUR/USD, GBP/JPY, etc.)
- Crypto (Bitcoin, Ethereum, stablecoins)
- International stocks (UK, India, etc.) — requires multi-currency support
- Bonds, Commodities, Options — require additional fields and validation

**Data Provider**: Currently uses generated/synthetic quotes; future integrations to include IEX, Alpaca, or live market feeds

---

## Settlement and Ledger Model

### Dual-Cache + Ledger Architecture

**Decision**: Holdings and cash use an append-only ledger (source of truth) with a cache table (performance):

**Holdings**:
- **Ledger**: `holding_movements` (append-only) — every fill creates one record
- **Cache**: `holdings` — current quantity and average cost per account/instrument
- View: `v_account_holdings` — computed from ledger if cache diverges

**Cash**:
- **Ledger**: `cash_transactions` (append-only) — every cash event creates one record
- **Cache**: `cash_balances` — current balance per account/currency
- View: `v_account_cash` — computed from ledger if cache diverges

**Why**:
- **Auditability**: Ledger captures complete history; can replay to any point in time
- **Correctness**: If cache corrupts, recompute from ledger
- **Performance**: Cache lookup is O(1) for current balance/holdings
- **Ledger Integrity**: No UPDATE/DELETE on ledgers; immutable for compliance

**Constraint**: 
- `holding_movements.uk_movement_fill UNIQUE (fill_id)` — one movement per fill
- `cash_transactions.fk_transaction_fill FOREIGN KEY (fill_id) REFERENCES fills` — only fills create transactions

---

## Order Submission and Idempotency

### Client Reference (Idempotency Key)

**Decision**: Every order has a `client_reference` UUID, unique per account.

**How It Works**:
```sql
CONSTRAINT uk_orders_account_client_reference UNIQUE (account_id, client_reference)
```

**Benefit**: Client can safely retry order submission (network timeout, app crash) with same `client_reference`; database rejects duplicate.

**Example**:
```sql
-- First attempt (succeeds)
INSERT INTO orders (account_id, instrument_id, client_reference, side, quantity, ...)
VALUES (account_123, instr_456, '550e8400-e29b-41d4-a716-446655440000', 'BUY', 100, ...);

-- Retry with same client_reference (fails with unique constraint violation)
-- Application catches error, returns existing order to client
```

---

## Application Role and Least Privilege

### Restricted Application Role

**Decision**: Spring Boot application connects as `app_user` (or `DB_APP_USERNAME`) with least-privilege permissions:

**Permitted Operations**:
- SELECT, INSERT, UPDATE, DELETE on runtime tables (users, orders, quotes, etc.)
- SELECT on helper views
- SELECT, INSERT on audit_log (append-only)

**Prohibited Operations**:
- CREATE/DROP/ALTER schema (migrations reserved for admin role)
- UPDATE, DELETE, TRUNCATE on audit_log
- Any access to PostgreSQL system tables

**Permission Isolation**:
```sql
-- Admin role can do everything
-- Application role can do only SELECT, INSERT, UPDATE, DELETE
-- Future: could add SELECT-only role for read replicas
```

**Benefit**: If application is compromised, attacker cannot:
- Drop tables or schema
- Modify audit log
- Escalate to other databases
- Access credentials of other services

---

## Audit and Compliance

### Append-Only Audit Log

**Decision**: `audit_log` table is append-only; application role cannot UPDATE, DELETE, or TRUNCATE.

**Data Captured**:
- `user_id`: User who triggered the event
- `account_id`: Associated account
- `related_order_id`: Associated order
- `actor_type`: 'USER' or 'SYSTEM'
- `event_type`: 'LOGIN', 'ORDER_SUBMITTED', 'ORDER_FILLED', 'LOGIN_FAILED', etc.
- `payload`: JSONB flexible event details
- `created_at`: Event timestamp

**Access Control**:
- Admin: Can SELECT, INSERT, UPDATE, DELETE (for corrections during investigations)
- Application: Can SELECT, INSERT only
- Never log plaintext SSN, passwords, or encryption keys

**Compliance**: Satisfies SOX § 302 (internal controls audit trail) and FINRA Rule 4530 (books and records)

---

## Deferred Decisions

The following decisions are intentionally deferred pending further business/technical clarity:

### Margin and Options Trading

- `accounts.margin_approved` and `accounts.options_approved` flags exist but are not yet enforced
- Margin calculations, haircuts, and margin call thresholds TBD
- Options Greeks and exercise mechanics TBD
- **Decision**: Deferred to Phase 2 pending compliance and risk management requirements

### Operational Multi-Currency and Multi-Country Support

- Current: USD only, US common stock only
- Future: EUR, GBP, JPY, INR; UK, India market codes
- Requires: Currency conversion, localized compliance, tax handling
- **Decision**: Deferred to Phase 2 pending business justification

### Key Management and TLS Termination

- Current: Encryption key in environment variable
- Future: AWS KMS, HashiCorp Vault, HSM, key rotation policy
- Database TLS: Can be enabled in PostgreSQL and application config
- **Decision**: Deferred to Phase 2 pending security architecture review

### Backups, Recovery Objectives, and Disaster Recovery

- Current: No explicit backup strategy beyond Docker volume persistence
- Future: Point-in-time recovery, cross-region replication, backup testing
- **Decision**: Deferred to Phase 2 pending operational/SLA requirements

### Compliance Staff Identity and KYC Verification

- `financial_profiles.kyc_verified_by_user_id` references admin user (MVP: not enforced)
- Future: Define admin role, audit trail for KYC approvals, segregation of duties
- **Decision**: Deferred to Phase 2 pending governance model

---

## Summary Table

| Component | Decision | Enforcement | Trade-offs |
|-----------|----------|-------------|------------|
| **System of Record** | PostgreSQL | Schema constraints, app code | ACID compliance vs. scaling complexity |
| **SSN Storage** | Encrypted BYTEA | pgcrypto, schema validation | Performance (decrypt on each access) vs. security |
| **Minimum Age** | 21 years | Constraint + trigger | No dynamic age calculation vs. fixed-at-insert |
| **Session Timeout** | ~10 minutes | Application-configurable | Simplicity vs. granular per-user policies |
| **Quote Provenance** | source + is_synthetic | Schema + uniqueness | Extra columns vs. auditability |
| **Instruments** | US stocks MVP | asset_class enum | Simplicity vs. extensibility |
| **Settlement** | Ledger + cache | Append-only + recompute | Storage vs. auditability + correctness |
| **Idempotency** | client_reference UUID | Unique constraint | No partial fills vs. retry safety |
| **Audit** | Append-only, app INSERT-only | Revoke UPDATE/DELETE | Limited app-side log cleanup vs. forensics |
| **Application Role** | Least-privilege DML | Schema GRANT statements | Flexibility vs. security surface |
