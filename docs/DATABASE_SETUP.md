# Database setup

Compose uses PostgreSQL 16 with a primary named `db` and a physical standby named
`reporting-db`. Both are internal: there is no default localhost database port.
See [database reference](../db/README.md) for roles, tables and configuration.

## Initialize and connect

Set credentials in the root `.env` using [env.example](../env.example). For empty volumes:

```sh
docker compose up -d db reporting-db
docker compose ps
docker compose exec db psql -U main -d nexttrade
```

First startup loads the schema, application role, equity seed and reporting roles.
The replica copies the primary and follows its WAL using a replication slot.
Existing databases need the [NEXT-193 migration steps](architecture/service-boundaries.md#deployment-and-existing-databases);
restarting does not rerun initialization. Do not reset volumes to apply a migration.

To verify reporting credentials and standby state (Bash):

```sh
docker compose exec reporting-db sh -c 'PGPASSWORD="$REPORTING_DB_PASSWORD" psql -h 127.0.0.1 -U reporting_user -d nexttrade -c "SELECT pg_is_in_recovery()"'
```

The result must be `t`. Reporting and replication passwords are independent. The
health check scopes the reporting password to `psql`; replication uses its private
passfile. Reporting can lag writes because replication is asynchronous.

## Database checks

Run on a disposable test database. SQL test files are not mounted in the container;
pipe or redirect them from the repository root. For example, in PowerShell:

```powershell
Get-Content db/tests/001_schema_verification.sql | docker compose exec -T db psql -U main -d nexttrade -v ON_ERROR_STOP=1
Get-Content db/tests/008_reporting_read_only.sql | docker compose exec -T db psql -U main -d nexttrade -v ON_ERROR_STOP=1
```

In Bash use `docker compose exec -T db psql -U main -d nexttrade -v ON_ERROR_STOP=1 < path/to/test.sql`.
Shell tests and host-run application integration tests need a reachable disposable
PostgreSQL instance. Use a separate native/test database or an explicit local
Compose override binding `127.0.0.1:55432:5432` on `db`; set test `DB_PORT=55432`.
`DB_PUBLISHED_PORT` does not configure this Compose file.

## Troubleshooting

- Inspect `docker compose logs db reporting-db` for initialization or authentication failures.
- Apply reporting role setup on an existing primary before starting the replica.
- Update role passwords as well as environment values when rotating credentials.
- A partial replica volume or invalid replication slot needs operator recovery;
  bootstrap refuses to overwrite existing data. Preserve the primary volume.
- `docker compose down` preserves data. `docker compose down -v` deletes both
  database volumes and is only appropriate for an intentional disposable reset.
