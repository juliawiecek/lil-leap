# NextTrade

NextTrade has two Angular clients and five application services behind one NGINX
gateway. The primary PostgreSQL database records trading activity; Insights queries
a separate read-only reporting replica.

The [service-boundary guide](docs/architecture/service-boundaries.md) describes the
architecture diagram, API routes, migration steps, fixes and remaining feature gaps.

## Team

| Team Member     | Role                              |
| ---------------- | ---------------------------------- |
| Kevin Marin      | Technical Lead                     |
| Lalima Karri     | Developer, Angular (Scrum Master)  |
| Ilhan Gelle      | Developer, Security                |
| Tanush Kaushik   | Developer, Data Engineer           |
| Julia Wiecek     | Developer, Spring Boot             |

## Architecture

| Directory | Responsibility | Internal port |
| --- | --- | --- |
| `auth/` | Identity: registration, login and JWT/session lifecycle | 8081 |
| `nextTrade-holdings/` | Accounts, portfolio, cash, order history and instrument reference | 8080 |
| `nextTrade-orders/` | Order submission, validation, acceptance, execution and settlement | 8082 |
| `data-pipeline/` | Synthetic quotes, persistence and latest-quote API | 8083 |
| `insights/` | Analyst reporting against the replica | 8084 |
| `gateway/` | API routing, client forwarding and optional TLS termination | 4200 / 4201 |
| `frontend/` | NextTrade Angular client | internal static server |
| `insights-frontend/` | Insights Angular client | internal static server |
| `db/` | Primary schema, migrations, reporting-role and standby bootstrap | 5432 internal |

Insights contains no order-processing or onboarding code. Order history is a
Holdings API; order submission and settlement belong to Orders. Reporting reads
replicated financial data directly, as shown in the architecture diagram.

## Run locally

Copy `env.example` to `.env` and set the development credentials, then:

```sh
docker compose up --build
```

- NextTrade: http://localhost:4200
- Insights: http://localhost:4201

Only the gateway publishes application ports. For existing databases, follow the
[non-destructive migration instructions](docs/architecture/service-boundaries.md#deployment-and-existing-databases)
before starting the reporting replica. Do not remove the primary volume to apply a migration.

For TLS, configure certificate paths and add `-f docker-compose.tls.yml` alongside
`-f docker-compose.yml`. The base configuration uses HTTP for local development.

### Optional Kafka

Kafka is optional scaffolding for local architecture experiments and is not required
for core trading/reporting flows. To run it alongside the base stack:

```sh
docker compose -f docker-compose.yml -f docker-compose.kafka.yml up --build -d kafka kafka-topics
docker compose -f docker-compose.yml -f docker-compose.kafka.yml logs kafka-topics
docker compose -f docker-compose.yml -f docker-compose.kafka.yml exec kafka kafka-topics --list --bootstrap-server kafka:9092
```

See [kafka/README.md](kafka/README.md) for details and cautions.

For Angular hot reload with the Compose APIs running, `npm ci && npm start` in
`frontend` serves port 4300; the same command in `insights-frontend` serves 4301.
Their API requests pass through the gateway.

## Verification

Java 17 or newer and Maven 3.9+ are required; Docker and Jenkins use Java 21.

```sh
mvn -B -f nextTrade-orders/pom.xml clean verify
mvn -B -f nextTrade-holdings/pom.xml clean verify
mvn -B -f insights/pom.xml clean verify
```

For the real-schema order lifecycle tests, run Maven from `nextTrade-orders` with
`TEST_POSTGRES_URL`, `TEST_POSTGRES_USER` and `TEST_POSTGRES_PASSWORD` pointing at a
disposable PostgreSQL database. These tests are skipped without that configuration.

Run `npm ci && npm test` in each Angular client and `auth`. Quote tests use
`python -m pytest` from `data-pipeline`, with its requirements installed.
`python scripts/test_gateway.py --nginx /path/to/nginx` checks gateway routing
against local stubs. `docker compose config -q` validates deployment configuration.

Jenkins builds/tests the Java services and quote pipeline, runs isolated PostgreSQL
order-lifecycle tests, and builds Compose images.
JaCoCo reports are written under each Java module's `target/site/jacoco`.

## Javadocs

Generate current API docs with `mvn javadoc:javadoc` inside each service, or publish
all sites using `python scripts/generate_javadocs.py`.

Published HTML is under [docs/javadoc/index.html](docs/javadoc/index.html) with
service-specific pages for Orders, Holdings and Insights. Regenerate these docs
after Java API changes so checked-in HTML stays aligned with source.

## Known gaps

The Insights dashboard uses sample data, and NextTrade trading screens still simulate
trades locally; both need integration with the real APIs. Password reset, scheduled report
delivery, account activation/funding, and an independently deployed HTTP market-data
provider remain product work. The existing ledger-derived average-cost view also
needs correction before use for cost-basis reporting. Details and ownership are in
the [service-boundary guide](docs/architecture/service-boundaries.md#remaining-feature-gaps-and-limitations).

Earlier story documents under `docs/` are historical and may name the old backend
or pre-refactor service owners.

## API, coverage and diagram guides

See [Swagger/OpenAPI access](docs/api/README.md) for service-specific documentation and remote gateway access, [coverage generation](docs/coverage/README.md) for report commands, [service UML](docs/architecture/uml.md), optional [Kafka development setup](kafka/README.md), and the schema ERD in [PDF](db/ER_Diagram.pdf), [PNG](db/er_diagram.png), and [Mermaid](db/er-diagram.md) forms.
