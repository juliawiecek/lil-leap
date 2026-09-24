# Run NextTrade Database Hardening

This runbook provides exact commands for setting up and testing the database hardening implementation.

---

## 1. Create Feature Branch

```bash
cd ~/lil-leap
git fetch origin --prune
git switch main
git pull --ff-only origin main
git switch -c feature/database-hardening
```

---

## 2. Configure Environment

Create `.env` from the checked-in `.env.example`:

```bash
cp env.example .env
# Edit .env with local values:
# - DB_ADMIN_PASSWORD (required, not committed)
# - DB_APP_PASSWORD (required, not committed)
# - SSN_ENCRYPTION_KEY (required, not committed)
# - Other optional values (DB_HOST, DB_PORT, etc.)
```

Example `.env` for local development:
```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nexttrade
DB_PUBLISHED_PORT=5432
DB_ADMIN_USERNAME=main
DB_ADMIN_PASSWORD=my_admin_pass_123
DB_APP_USERNAME=app_user
DB_APP_PASSWORD=my_app_pass_456
SSN_ENCRYPTION_KEY=my_encryption_key_789
SESSION_INACTIVITY_MINUTES=10
```

Load environment variables (bash):
```bash
source .env
```

Or PowerShell:
```powershell
Get-Content .env | ForEach-Object {
    if ($_ -match '^\s*([^=]+)=(.*)$') {
        [Environment]::SetEnvironmentVariable($matches[1], $matches[2])
    }
}
```

---

## 3. Verify Docker Compose Configuration

Check that all environment variables are properly substituted:

```bash
docker compose config
```

Expected output includes:
```yaml
services:
  db:
    environment:
      POSTGRES_DB: nexttrade
      POSTGRES_USER: main
      POSTGRES_PASSWORD: my_admin_pass_123  # from .env
      DB_APP_USERNAME: app_user
      DB_APP_PASSWORD: my_app_pass_456      # from .env
    volumes:
      - db_data:/var/lib/postgresql/data
      - ./db/finalized-schema.sql:/docker-entrypoint-initdb.d/01-schema.sql:ro
      - ./db/init-app-role.sh:/docker-entrypoint-initdb.d/02-app-role.sh:ro
  app:
    environment:
      SPRING_DATASOURCE_URL: jdbc:postgresql://db:5432/nexttrade
      SPRING_DATASOURCE_USERNAME: app_user
      SPRING_DATASOURCE_PASSWORD: my_app_pass_456
      NEXTTRADE_SECURITY_SSN_ENCRYPTION_KEY: my_encryption_key_789
      NEXTTRADE_SESSION_INACTIVITY_MINUTES: '10'
```

---

## 4. Start Clean Database

**WARNING**: `-v` flag deletes the database volume (destructive).

```bash
# Stop existing containers and remove volume
docker compose down -v

# Start fresh database service only
docker compose up -d db

# Monitor database startup (wait for "ready to accept connections")
docker compose logs -f db

# When the output shows "database system is ready to accept connections", Ctrl+C to exit logs
```

---

## 5. Verify Schema Loaded

List all 15 tables:
```bash
docker compose exec -T db psql -U "$DB_ADMIN_USERNAME" -d "$DB_NAME" -c "\dt"
```

Expected output: 15 tables (accounts, audit_log, cash_balances, etc.)

List all 5 views:
```bash
docker compose exec -T db psql -U "$DB_ADMIN_USERNAME" -d "$DB_NAME" -c "\dv"
```

Expected output: 5 views (v_account_cash, v_account_holdings, v_active_sessions, v_latest_quotes, v_trader_tier_eligibility)

---

## 6. Run Schema Verification Test

Verify that all hardening constraints are in place:

```bash
docker compose exec -T db psql -U "$DB_ADMIN_USERNAME" -d "$DB_NAME" -f db/tests/001_schema_verification.sql
```

Expected output: `PASS: Schema verification successful...`

If failures occur, verify:
- `customer_profiles.ssn_encrypted BYTEA` exists (not TEXT)
- No `users.ssn` column (plaintext SSN removed)
- `quotes.source` and `quotes.is_synthetic` exist
- `instruments.sector` exists
- Trigger `tg_customer_profiles_age_validation` exists

---

## 7. Run Role Integration Tests

Test that the `app_user` role has correct permissions (least-privilege):

```bash
DB_HOST=localhost \
DB_PORT="$DB_PORT" \
DB_NAME="$DB_NAME" \
DB_ADMIN_USERNAME="$DB_ADMIN_USERNAME" \
DB_ADMIN_PASSWORD="$DB_ADMIN_PASSWORD" \
DB_APP_USERNAME="$DB_APP_USERNAME" \
DB_APP_PASSWORD="$DB_APP_PASSWORD" \
bash db/test-init-app-role.sh
```

Expected output:
```
Test 1: Application role exists
PASS: Role app_user exists

Test 2: Application role can connect
PASS: Application role can connect to database

Test 3: SELECT, INSERT, UPDATE, DELETE on runtime tables
PASS: SELECT on users
PASS: INSERT on users
...

Test 4: SELECT on all helper views
PASS: SELECT on v_account_cash
...

Test 5: audit_log is append-only (SELECT/INSERT yes, UPDATE/DELETE no)
PASS: SELECT on audit_log granted
PASS: INSERT on audit_log granted
PASS: UPDATE on audit_log correctly denied
PASS: DELETE on audit_log correctly denied
PASS: TRUNCATE on audit_log correctly denied

Test 6: Application role cannot CREATE/DROP/ALTER (no migration rights)
PASS: CREATE TABLE correctly denied to application role

All tests passed
```

---

## 8. Run Positive/Negative Behavior Tests

Test encryption, age validation, quote constraints, and data integrity:

```bash
DB_HOST=localhost \
DB_PORT="$DB_PORT" \
DB_NAME="$DB_NAME" \
DB_ADMIN_USERNAME="$DB_ADMIN_USERNAME" \
DB_ADMIN_PASSWORD="$DB_ADMIN_PASSWORD" \
SSN_ENCRYPTION_KEY="$SSN_ENCRYPTION_KEY" \
bash db/tests/002_positive_negative_tests.sh
```

Expected output:
```
Test 1: Synthetic adult customer and encrypted SSN round-trip
PASS: Synthetic adult customer created, SSN encrypted and decrypted correctly

Test 2: SSN stored as BYTEA (encrypted), not plaintext
PASS: Schema verification confirms BYTEA storage (no plaintext in database)

Test 3: Under-18 customer rejected by age trigger
PASS: Under-18 customer rejected by age trigger

Test 4: Quote with bid >= ask rejected
PASS: Quote with bid >= ask rejected by constraint

Test 5: Valid synthetic quote accepted
PASS: Valid synthetic quote accepted

Test 6: Test fixtures rolled back / cleaned up
PASS: No test fixture data persists after rollback

All behavior tests passed
```

---

## 9. Run Atomicity Tests

Verify transaction rollback and ledger integrity (ACID compliance):

```bash
docker compose exec -T db psql -U "$DB_ADMIN_USERNAME" -d "$DB_NAME" -f db/tests/003_atomicity_test.sql
```

Expected output:
```
PASS: Fill rolled back
PASS: Cash transaction rolled back
PASS: Holding movement rolled back
PASS: Full transaction rollback left no fixture rows
```

---

## 10. Verify Volume Persistence (No Data Loss on Restart)

Test that database data persists across `docker compose down` (without `-v`):

```bash
# Insert a test record
docker compose exec -T db psql -U "$DB_ADMIN_USERNAME" -d "$DB_NAME" -c "
  INSERT INTO instruments (symbol, instrument_name, asset_class, market_code, currency)
  VALUES ('TEST_PERSIST', 'Test Persistence', 'COMMON_STOCK', 'TEST', 'USD');
"

# Verify it exists
docker compose exec -T db psql -U "$DB_ADMIN_USERNAME" -d "$DB_NAME" -c "
  SELECT COUNT(*) FROM instruments WHERE symbol = 'TEST_PERSIST';
"
# Expected: 1

# Stop containers (NO -v flag)
docker compose down

# Restart database
docker compose up -d db
docker compose logs db  # Wait for "ready to accept connections"

# Verify data persists
docker compose exec -T db psql -U "$DB_ADMIN_USERNAME" -d "$DB_NAME" -c "
  SELECT COUNT(*) FROM instruments WHERE symbol = 'TEST_PERSIST';
"
# Expected: 1 (data persisted!)

# Clean up test record
docker compose exec -T db psql -U "$DB_ADMIN_USERNAME" -d "$DB_NAME" -c "
  DELETE FROM instruments WHERE symbol = 'TEST_PERSIST';
"
```

---

## 11. Test Destructive Reset

**WARNING**: This deletes all database data. Use only when a completely fresh database is required.

```bash
# Delete volume (destructive!)
docker compose down -v

# Start fresh (schema is re-loaded from finalized-schema.sql)
docker compose up -d db

# Verify schema is recreated
docker compose exec -T db psql -U "$DB_ADMIN_USERNAME" -d "$DB_NAME" -c "\dt"
# Expected: 15 tables (fresh schema)
```

---

## 12. Stage Files for Commit

Only add files that were created or modified for hardening:

```bash
# Add environment file (already .gitignore'd as .env, so only .env.example)
git add env.example

# Add database files
git add db/finalized-schema.sql
git add db/init-app-role.sh
git add db/test-init-app-role.sh
git add db/DATABASE_DECISIONS.md
git add db/README.md
git add db/tests/001_schema_verification.sql
git add db/tests/002_positive_negative_tests.sh
git add db/tests/003_atomicity_test.sql

# Add backend configuration
git add backend/src/main/resources/application.yml

# Add Docker Compose changes
git add docker-compose.yml

# Add runbook
git add RUN_DATABASE_HARDENING.md

# Review changes
git diff --cached

# Commit
git commit -m "feat(db): implement database hardening with encryption, age validation, role-based access"
```

---

## 13. Verify Changes

Show a summary of what was changed:

```bash
# Show all staged files
git diff --cached --name-only

# Show detailed diff for database schema
git diff --cached -- db/finalized-schema.sql | head -100

# Show detailed diff for docker-compose
git diff --cached -- docker-compose.yml
```

---

## 14. Push to Remote (When Ready)

Once you've tested locally and everything passes:

```bash
git push origin feature/database-hardening
```

Then create a pull request on GitHub/GitLab for code review.

---

## Troubleshooting

### Database won't start
```bash
docker compose logs db  # Check error messages
docker compose down -v  # Reset volume
docker compose up -d db  # Start fresh
```

### Connection refused
```bash
# Check if PostgreSQL is listening
docker compose exec -T db pg_isready -U "$DB_ADMIN_USERNAME" -d "$DB_NAME"

# If false, wait a bit longer for startup
sleep 5
docker compose exec -T db pg_isready -U "$DB_ADMIN_USERNAME" -d "$DB_NAME"
```

### Application role tests fail
```bash
# Verify application role exists
docker compose exec -T db psql -U "$DB_ADMIN_USERNAME" -d "$DB_NAME" -c "SELECT * FROM pg_roles WHERE rolname='app_user';"

# Check privileges
docker compose exec -T db psql -U "$DB_ADMIN_USERNAME" -d "$DB_NAME" -c "SELECT * FROM role_table_grants WHERE role_name='app_user';"
```

### Schema verification fails
```bash
# List actual tables
docker compose exec -T db psql -U "$DB_ADMIN_USERNAME" -d "$DB_NAME" -c "\dt"

# Check for plaintext SSN (should be empty)
docker compose exec -T db psql -U "$DB_ADMIN_USERNAME" -d "$DB_NAME" -c "SELECT column_name FROM information_schema.columns WHERE table_name='users';"

# Check for encrypted SSN (should exist)
docker compose exec -T db psql -U "$DB_ADMIN_USERNAME" -d "$DB_NAME" -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='customer_profiles' AND column_name='ssn_encrypted';"
```

### Encryption test fails
```bash
# Verify pgcrypto extension is installed
docker compose exec -T db psql -U "$DB_ADMIN_USERNAME" -d "$DB_NAME" -c "SELECT * FROM pg_extension WHERE extname='pgcrypto';"

# Test encryption manually
docker compose exec -T db psql -U "$DB_ADMIN_USERNAME" -d "$DB_NAME" -c "
  SELECT pgp_sym_decrypt(pgp_sym_encrypt('test', 'key'), 'key') AS decrypted;
"
# Expected: test
```

---

## Important Notes

1. **Do not commit `.env`**: It contains real passwords. Only commit `.env.example`.
2. **Do not run `docker compose down -v` when database preservation is needed**: It deletes the database volume.
3. **Environment variables are required**: Must set `DB_ADMIN_PASSWORD`, `DB_APP_PASSWORD`, `SSN_ENCRYPTION_KEY` before running.
4. **Database initialization is one-time**: Init scripts run only on empty volumes. To re-apply manually:
   ```bash
   docker compose exec -T db psql -U "$DB_ADMIN_USERNAME" -d "$DB_NAME" -f db/finalized-schema.sql
   docker compose exec -T db psql -U "$DB_ADMIN_USERNAME" -d "$DB_NAME" -f db/init-app-role.sh
   ```
5. **Plaintext SSN is prohibited**: Schema validation will fail if `users.ssn` exists or if application attempts to insert unencrypted SSN.

---

## Next Steps

- [ ] Branch created: `feature/database-hardening`
- [ ] `.env` configured with actual passwords
- [ ] Database started and schema verified
- [ ] All tests passing (schema, role, behavior, atomicity)
- [ ] Files staged and committed
- [ ] PR created for review
- [ ] PR merged to main (when approved)

## 6. Test encrypted SSN and constraints

```bash
export DB_PASSWORD='<local-admin-password>'
export SSN_ENCRYPTION_KEY='test-only-key'
chmod +x db/tests/002_positive_negative_tests.sh
./db/tests/002_positive_negative_tests.sh
```

## 7. Test atomic rollback

```bash
docker compose exec -T db psql -U main -d nexttrade < db/tests/003_atomicity_test.sql
```

## 8. Test role permissions from host

```bash
export DB_PASSWORD='<local-admin-password>'
export DB_APP_PASSWORD='<local-app-password>'
chmod +x db/test-init-app-role.sh
./db/test-init-app-role.sh
```

## 9. Verify persistence

```bash
docker compose down
docker compose up -d db
docker compose exec -T db psql -U main -d nexttrade -c '\dt'
```

The tables must remain because the named volume was not deleted.

## 10. Git

```bash
git status
git add db/finalized-schema.sql db/init-app-role.sh db/test-init-app-role.sh db/DATABASE_DECISIONS.md db/tests .env.example RUN_DATABASE_HARDENING.md
git diff --staged --name-only
git commit -m "feat: harden finalized PostgreSQL schema and roles"
git push -u origin feature/database-hardening
```
