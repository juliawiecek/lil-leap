# NextTrade database

## Deployment and roles

Compose runs PostgreSQL 16 as primary `db` (volume `db_data`) and asynchronous
physical standby `reporting-db` (volume `reporting_data`). Neither publishes a host
port. Identity, Holdings, Orders and Quotes use the primary. Insights uses the
standby with a separate reporting role.

| Role | Responsibility |
| --- | --- |
| `main` | Schema owner, initialization and migrations |
| `app_user` | Primary application DML; append-only audit restrictions |
| `reporting_user` | SELECT on an explicit financial-table allowlist; no identity/session data |
| `replicator` | Physical replication only |

The primary services still share `app_user`; per-service roles and row-level
security remain future work. Application queries enforce client ownership.

## Configuration and initialization

Copy [env.example](../env.example) to the repository root `.env`. Compose uses
`POSTGRES_PASSWORD`, `DB_APP_PASSWORD`, `REPORTING_DB_PASSWORD` and
`REPLICATION_PASSWORD` for the four roles above. The database and owner are fixed
as `nexttrade` and `main` in Compose. `DB_ADMIN_USERNAME`/`DB_ADMIN_PASSWORD` are
settings for standalone test scripts, not Compose owner overrides.

On an empty primary volume, initialization runs in this order:

1. [finalized-schema.sql](finalized-schema.sql)
2. [init-app-role.sh](init-app-role.sh)
3. [US-equity seed](seeds/001_us_equity_instruments.sql)
4. [init-reporting.sh](init-reporting.sh)

The [replica entrypoint](start-reporting-replica.sh) runs `pg_basebackup`, writes
standby configuration and starts recovery. Its private passfile holds replication
credentials. The health check supplies the reporting password only to its `psql`
process, so it cannot override replication authentication.

For an existing primary, follow the [migration guide](../docs/architecture/service-boundaries.md#deployment-and-existing-databases).
Init scripts do not rerun on restart. The reporting setup creates roles, grants,
replication authentication and a physical slot. The slot retains at most 1 GB of
WAL; a prolonged outage can require a replica rebuild.

## Schema

### 17 Core Tables

| Table | Purpose |
|-------|---------|
| `users` | Authentication only (email, password_hash, login security) |
| `customer_profiles` | Customer identity (name, address, DOB, encrypted SSN) |
| `financial_profiles` | KYC, risk profile, employment, regulatory disclosures |
| `analyst_profiles` | Internal analyst identity |
| `password_reset_tokens` | Hashed, expiring password-reset tokens |
| `sessions` | Time-limited, revocable user sessions |
| `instruments` | Instrument catalog with sector (current product: five US equities) |
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
| `v_account_holdings` | Ledger-derived holdings; average cost after sells is a known limitation |
| `v_latest_quotes` | Latest bid/ask/midpoint per instrument |
| `v_active_sessions` | Count of active sessions per user |
| `v_trader_tier_eligibility` | Account eligibility vs. trader tier minimum balance requirement |

## Integrity and known limitations

- Customer SSNs are encrypted with pgcrypto; Identity owns encryption.
- Customer age validation requires at least **21**.
- Migration 008 installs the transactional holdings projection trigger and rebuilds
  ledger-backed positions. Stop settlement writers and review complete ledger
  history before upgrading. Orders checks for the trigger at startup.
- Orders records idempotent submissions and settles fills, ledger entries, caches,
  status and audit data atomically under account-level locking.
- `audit_log` is append-only for `app_user`.
- Quote rows preserve timestamp, source and synthetic provenance.
- `v_account_holdings` average cost is incorrect after sells at a different price.
  The live Holdings API uses the maintained `holdings` cache. Ledger cost-basis
  reporting requires a separate accounting migration.
- Password-reset tables exist, but the Identity reset API is not implemented.

## Operations and tests

```sh
docker compose up -d db reporting-db
docker compose exec db psql -U main -d nexttrade
docker compose down
```

The last command preserves both volumes. `docker compose down -v` deletes both
and is only for an intentional disposable reset. Use migrations for schema changes.
There is no supported `DB_PUBLISHED_PORT` setting in the current Compose file.

See [database setup](../docs/DATABASE_SETUP.md) for connection commands, replica
checks, SQL test invocation and host-run test configuration. Tests live in
[tests](tests/), including [reporting permissions](tests/008_reporting_read_only.sql).
Run them against a disposable database. Standalone shell tests accept `DB_HOST`,
`DB_PORT`, `DB_NAME`, `DB_ADMIN_USERNAME` and `DB_ADMIN_PASSWORD`; application-role
tests also need the corresponding app credentials.

See [design decisions](DATABASE_DECISIONS.md) for ledger rationale and
[service boundaries](../docs/architecture/service-boundaries.md) for current ownership.
