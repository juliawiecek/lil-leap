# Getting started

NEXT-193 separates Identity, Holdings, Orders, Quotes and reporting-only Insights.
Read [service boundaries](architecture/service-boundaries.md) for the diagram,
route table, migration instructions and remaining product gaps.

## Run the stack

Install Docker with Compose v2. From the repository root, copy `env.example` to
`.env` and set the local credentials and SSN encryption key. Compose reads that
file automatically. For a new database:

```sh
docker compose up --build -d gateway
docker compose ps
```

For an existing database, follow the [migration steps](architecture/service-boundaries.md#deployment-and-existing-databases)
before starting the full stack. Init scripts only run on empty volumes; restarting
does not migrate an existing schema. Preserve the primary data volume.

| Entry point | URL |
| --- | --- |
| Trading client and APIs | http://localhost:4200 |
| Reporting client and APIs | http://localhost:4201 |
| Identity Swagger UI | http://localhost:4200/auth/docs |

Only the gateway publishes ports. Internal ports are Holdings 8080, Identity 8081,
Orders 8082, Quotes 8083, Insights 8084 and PostgreSQL 5432. PostgreSQL has a primary
and an asynchronous reporting replica. See [database setup](DATABASE_SETUP.md).

## Develop locally

For native builds use Java 17 and Maven 3.9+, Node 24.15+ (24.x), and Python 3.12+.
Docker builds supply their own runtimes.

With Compose running, open a terminal in `frontend` or `insights-frontend`:

```sh
npm ci
npm start
```

The trading development server uses 4300; reporting uses 4301. Their proxies send
API requests to gateway ports 4200 and 4201 respectively. Authentication is wired
to Identity; trading and reporting dashboard data still include local fixtures.

## Validate changes

- In each of `nextTrade-orders`, `nextTrade-holdings`, `insights`: `mvn -B clean verify`.
- In `auth`: `npm ci`, `npm test`, `npm run build`.
- In each frontend: `npm ci`, `npm test`, `npm run build`.
- In `data-pipeline`, use a virtual environment, install `requirements.txt`, then `python -m pytest`.
- From the root: `docker compose config -q` and `bash scripts/auth-integration-test.sh`.

The integration script starts the real stack and checks Identity tokens, Holdings
reads, Orders validation, analyst-only reports and gateway isolation. It removes
its generated users unless `KEEP_DATA=1`. It requires Docker, Bash and curl.
Use a disposable environment. See [coverage](COVERAGE_REPORTS.md) and the
[verification details](architecture/service-boundaries.md#verification) for database-dependent tests.

`docker compose down` stops the stack while retaining both database volumes.
