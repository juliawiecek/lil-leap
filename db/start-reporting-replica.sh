#!/bin/bash
set -euo pipefail
: "${PGDATA:?PGDATA is required}"
: "${REPLICATION_PASSWORD:?REPLICATION_PASSWORD is required}"

# libpq gives PGPASSWORD precedence over the replication passfile. The reporting
# health check supplies its own password only to psql, never to replication.
unset PGPASSWORD

if [ "$(id -u)" = 0 ]; then
    mkdir -p "$PGDATA"
    chown postgres:postgres "$PGDATA"
    chmod 700 "$PGDATA"
    exec gosu postgres bash "$0"
fi

# A private passfile supports punctuation in passwords and avoids writing them
# into primary_conninfo. Rebuild it on restart when credentials are rotated.
umask 077
escaped=${REPLICATION_PASSWORD//\\/\\\\}
escaped=${escaped//:/\\:}
printf '%s:5432:replication:replicator:%s\n' "${PRIMARY_DB_HOST:-db}" "$escaped" > /tmp/reporting.pgpass
export PGPASSFILE=/tmp/reporting.pgpass
if [ ! -s "$PGDATA/PG_VERSION" ]; then
    # Never delete an existing or partially initialized volume automatically.
    pg_basebackup -d "host=${PRIMARY_DB_HOST:-db} user=replicator passfile=/tmp/reporting.pgpass" \
        -D "$PGDATA" -R -X stream -S reporting_replica --checkpoint=fast
fi
if [ ! -f "$PGDATA/standby.signal" ]; then
    echo 'Refusing to start a reporting database without standby.signal' >&2
    exit 1
fi
exec postgres -D "$PGDATA" -c hot_standby=on
