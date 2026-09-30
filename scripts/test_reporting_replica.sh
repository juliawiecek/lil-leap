#!/usr/bin/env bash
# Exercise the real bootstrap with command stubs, without a database or Docker.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p target
work=$(mktemp -d "$PWD/target/replica-bootstrap-test.XXXXXX")
[[ "$work" == "$PWD"/target/replica-bootstrap-test.* ]] || exit 1
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin" "$work/data"
# Isolate only the fixed container passfile path; all bootstrap logic is retained.
sed "s|/tmp/reporting.pgpass|$work/replication.pgpass|g" db/start-reporting-replica.sh > "$work/bootstrap.sh"
cat > "$work/bin/id" <<'SH'
#!/usr/bin/env bash
echo 1000
SH
cat > "$work/bin/pg_basebackup" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
[[ ! ${PGPASSWORD+x} ]] || { echo 'Reporting password leaked into basebackup' >&2; exit 1; }
[[ -s "$PGPASSFILE" ]]
grep -Fxq 'db:5432:replication:replicator:replica\:with\\punctuation' "$PGPASSFILE"
echo 16 > "$PGDATA/PG_VERSION"
touch "$PGDATA/standby.signal" "$TEST_WORK/backup-called"
SH
cat > "$work/bin/postgres" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
[[ ! ${PGPASSWORD+x} ]] || { echo 'Reporting password leaked into WAL receiver environment' >&2; exit 1; }
[[ -s "$PGPASSFILE" && -f "$PGDATA/standby.signal" ]]
touch "$TEST_WORK/postgres-called"
SH
chmod +x "$work/bin/"*
export PATH="$work/bin:$PATH" PGDATA="$work/data" TEST_WORK="$work"
export REPLICATION_PASSWORD='replica:with\punctuation' PGPASSWORD='different-reporting-password'
bash "$work/bootstrap.sh"
[[ -f "$work/backup-called" && -f "$work/postgres-called" ]]
echo 'PASS: first bootstrap uses escaped replication credentials without PGPASSWORD'
rm "$work/backup-called" "$work/postgres-called"
bash "$work/bootstrap.sh"
[[ ! -f "$work/backup-called" && -f "$work/postgres-called" ]]
echo 'PASS: restart preserves the standby and removes inherited PGPASSWORD'
rm "$PGDATA/standby.signal" "$work/postgres-called"
if bash "$work/bootstrap.sh" 2> "$work/error"; then
    echo 'FAIL: accepted non-standby data directory' >&2
    exit 1
fi
[[ ! -f "$work/postgres-called" && ! -f "$work/backup-called" ]]
grep -q 'Refusing to start' "$work/error"
echo 'PASS: existing non-standby data is not overwritten or started'
