#!/bin/bash
# Run the shared PostgreSQL behavior checks against an initialized test database.
set -euo pipefail

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-nexttrade}"
DB_ADMIN_USERNAME="${DB_ADMIN_USERNAME:-main}"
DB_ADMIN_PASSWORD="${DB_ADMIN_PASSWORD:?DB_ADMIN_PASSWORD environment variable is required}"
export SSN_ENCRYPTION_KEY="${SSN_ENCRYPTION_KEY:?SSN_ENCRYPTION_KEY environment variable is required}"
TEST_SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

# The SQL uses quoted psql literals, catches only expected constraint violations,
# fails on every other error, and rolls back all fixtures.
PGPASSWORD="$DB_ADMIN_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" \
    -v ON_ERROR_STOP=1 -U "$DB_ADMIN_USERNAME" -d "$DB_NAME" \
    -f "$TEST_SCRIPT_DIR/002_behavior_tests.sql"
