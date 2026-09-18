# NextTrade Database

## Overview

Every developer runs an isolated PostgreSQL database using the same version-controlled schema and startup process. The database schema is shared through Git, while database connection values (host, port, credentials) are configurable per environment (local dev, Linux VM, CI/CD).

## Architecture

### Schema and Versioning

- **Single Source of Truth**: [db/finalized-schema.sql](finalized-schema.sql) contains the complete 17-table relational model
- **Owner Role**: `main` (or `DB_ADMIN_USERNAME`) creates and owns all schema objects
- **Application Role**: `app_user` (or `DB_APP_USERNAME`) has restricted DML permissions only (SELECT, INSERT, UPDATE, DELETE) on runtime tables
- **Migrations**: Future schema changes must be versioned (e.g., `03-migration-name.sql`) and applied by the `main` role

### Isolation and Persistence

- **Docker Volume**: Postgres data is stored in a named Docker volume (`db_data`)
- **Persistence Across Restarts**: `docker compose down` preserves the volume; data persists across dev sessions
- **Fresh Start**: `docker compose down -v` deletes the volume, forcing a clean schema load on the next `docker compose up`
- **First-Run Only**: Init scripts (`01-schema.sql`, `02-app-role.sh`) run once against an empty volume

## Configuration

All database connection values are environment-based. Set the required credentials in `.env` before starting Compose.

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `DB_HOST` | `localhost` | PostgreSQL server hostname (use `db` inside Docker Compose) |
| `DB_PORT` | `5432` | PostgreSQL server port |
| `DB_NAME` | `nexttrade` | Database name |
| `DB_PUBLISHED_PORT` | `5432` | Port to publish from Docker to host |
| `DB_ADMIN_USERNAME` | `main` | Schema owner role (runs migrations) |
| `DB_ADMIN_PASSWORD` | _(required)_ | Admin role password (not committed to repo) |
| `DB_APP_USERNAME` | `app_user` | Application role (restricted permissions) |
| `DB_APP_PASSWORD` | _(required)_ | Application role password |
| `SSN_ENCRYPTION_KEY` | _(required)_ | PGP symmetric encryption key for customer SSN |
| `SESSION_INACTIVITY_MINUTES` | `10` | Session timeout in minutes (configurable) |

### Loading Environment Variables

Create `.env` from [.env.example](../env.example) at the repository root:

```bash
cp env.example .env
# Edit .env with your local values
source .env
docker compose up
```

Or pass variables directly:

```bash
DB_ADMIN_PASSWORD=mypass DB_APP_PASSWORD=apppass SSN_ENCRYPTION_KEY=key123 docker compose up
```

## Database Schema

### 17 Core Tables

| Table | Purpose |
|-------|---------|
| `users` | Authentication only (email, password_hash, login security) |
| `customer_profiles` | Customer identity (name, address, DOB, encrypted SSN) |
| `financial_profiles` | KYC, risk profile, employment, regulatory disclosures |
| `analyst_profiles` | Internal analyst identity |
| `password_reset_tokens` | Hashed, expiring password-reset tokens |
| `sessions` | Time-limited, revocable user sessions |
| `instruments` | Tradable instruments (stocks, FX, crypto) with sector |
| `quotes` | Market prices (bid/ask, provenance tracking, synthetic flag) |
| `accounts` | User trading accounts with tier and margin/options flags |
| `orders` | Order submission with idempotency key (client_reference) |
| `fills` | Order execution records |
| `order_status_history` | Append-only order lifecycle audit |
| `holdings` | Cache: current securities per account (source of truth: `holding_movements`) |
| `holding_movements` | Append-only ledger: every fill creates a movement |
| `cash_balances` | Cache: current cash per account (source of truth: `cash_transactions`) |
| `cash_transactions` | Append-only ledger: every cash event creates a transaction |
| `audit_log` | Append-only compliance log (application role: SELECT/INSERT only) |

### 5 Helper Views

| View | Purpose |
|------|---------|
| `v_account_cash` | Current cash balance per account (computed from ledger) |
| `v_account_holdings` | Current holdings per account with average cost (computed from ledger) |
| `v_latest_quotes` | Latest bid/ask/midpoint per instrument |
| `v_active_sessions` | Count of active sessions per user |
| `v_trader_tier_eligibility` | Account eligibility vs. trader tier minimum balance requirement |

### Security & Compliance Features

- **Encrypted SSN**: Customer SSN is reversibly encrypted with pgcrypto PGP symmetric encryption, stored as BYTEA in `customer_profiles.ssn_encrypted`
- **Age Validation**: Trigger `tg_customer_profiles_age_validation` rejects customers under 18 (SQLSTATE 23514)
- **Append-Only Audit**: `audit_log` allows application SELECT/INSERT only; UPDATE/DELETE/TRUNCATE are explicitly revoked
- **Quote Provenance**: `quotes.source` and `quotes.is_synthetic` track data lineage and test data
- **Ledger-Based Settlement**: Holdings and cash use dual ledger + cache model; ledger is source of truth
- **Idempotent Orders**: `client_reference` UUID prevents duplicate fills on retry

## Running the Database

### Start Database

```bash
# Ensure .env is loaded
source .env

# Start database (and app, if configured)
docker compose up -d db

# Wait for health check to pass
docker compose logs -f db
```

### Verify Initialization

```bash
# List all tables (17 expected)
docker compose exec db psql -U "$DB_ADMIN_USERNAME" -d "$DB_NAME" -c "\dt"

# List all views (5 expected)
docker compose exec db psql -U "$DB_ADMIN_USERNAME" -d "$DB_NAME" -c "\dv"
```

### Run Schema Verification

```bash
# Verify schema completeness and hardening constraints
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "$DB_ADMIN_USERNAME" -d "$DB_NAME" < db/tests/001_schema_verification.sql
```

### Run Role Integration Tests

```bash
# Test application role permissions
DB_HOST=localhost DB_PORT=5432 DB_NAME="$DB_NAME" \
  DB_ADMIN_USERNAME="$DB_ADMIN_USERNAME" DB_ADMIN_PASSWORD="$DB_ADMIN_PASSWORD" \
  DB_APP_USERNAME="$DB_APP_USERNAME" DB_APP_PASSWORD="$DB_APP_PASSWORD" \
  bash db/test-init-app-role.sh
```

### Run Positive/Negative Tests

```bash
# Test encryption, age validation, quote constraints
DB_HOST=localhost DB_PORT=5432 DB_NAME="$DB_NAME" \
  DB_ADMIN_USERNAME="$DB_ADMIN_USERNAME" DB_ADMIN_PASSWORD="$DB_ADMIN_PASSWORD" \
  SSN_ENCRYPTION_KEY="$SSN_ENCRYPTION_KEY" \
  bash db/tests/002_positive_negative_tests.sh
```

### Run Atomicity Tests

```bash
# Test transaction rollback and ledger integrity
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "$DB_ADMIN_USERNAME" -d "$DB_NAME" < db/tests/003_atomicity_test.sql
```

## Volume Persistence

### Preserve Database (Normal Case)

```bash
# Stop containers but preserve db_data volume
docker compose down

# Data persists; next `up` reuses it
docker compose up
```

### Destructive Reset

```bash
# Delete volume AND all data (use with caution!)
docker compose down -v

# Next `up` will run init scripts again (fresh database)
docker compose up
```

## Deployment Targets

### Development (Local Docker)

- Host: `db` (Docker bridge DNS) or `localhost` (from host)
- Port: Published via `DB_PUBLISHED_PORT` (default 5432)
- Volume: Named `db_data` (persists across restarts)

### Linux VM or Remote

- Host: VM IP or hostname (e.g., `192.168.1.100`)
- Port: Same as VM PostgreSQL (e.g., 5432)
- Credentials: Managed by VM administrator
- Schema: Can be loaded manually or via init scripts

### CI/CD (Jenkins, GitLab, etc.)

- Disposable PostgreSQL instance (no persistence needed)
- Credentials: Injected via secrets
- Schema: Loaded on every test run (fresh database)

## Database Reset for Development

To reset the database to a clean state:

```bash
docker compose down -v  # Delete volume
docker compose up -d db # Start fresh
```

To reapply only application-role permissions on an existing database (without resetting data):

```bash
docker compose exec -T db bash /docker-entrypoint-initdb.d/02-app-role.sh
```

The role script uses safely quoted identifiers and passwords. It removes public-schema
CREATE permission and does not grant access to future tables automatically; grant new
runtime tables explicitly after review. Schema changes on existing volumes require migrations.

## Important Notes

- **Plaintext SSN**: Never committed, logged, or printed. Always encrypt for storage and transit.
- **Default Credentials**: `env.example` documents required credentials. Supply private values before startup.
- **Volume Semantics**: `docker compose down -v` is **destructive**. Use only when you intend to reset.
- **Init Scripts**: Run once per empty volume. Apply SQL files with `psql -f`; run shell scripts with `bash`. Do not pass shell scripts to `psql`.

## See Also

- [db/DATABASE_DECISIONS.md](DATABASE_DECISIONS.md) — Architecture and design decisions
- [db/finalized-schema.sql](finalized-schema.sql) — Complete schema with comments
- [db/init-app-role.sh](init-app-role.sh) — Application role creation and permissions
- [db/test-init-app-role.sh](test-init-app-role.sh) — Role integration tests
- [db/tests/](tests/) — Schema verification and behavior tests
- [RUN_DATABASE_HARDENING.md](../RUN_DATABASE_HARDENING.md) — Step-by-step runbook
