# Order & Execution Service

Spring Boot service for authenticated, ownership-checked, idempotent order submission and durable execution. One JDBC worker performs acceptance, claiming and atomic settlement. It is the only trading writer among the Java services.

## Structure

`order.submission`, `order.rules`, `order.service` (sufficiency), `order.execution`, `marketdata` (quote read contract), `instrument` (internal validation reads), `security`, `config`, `common.exception`.

See the [architecture guide](../docs/architecture/service-boundaries.md) for service
ownership, gateway routing, database setup, known gaps and verification.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/v1/orders` | Submit an order for a caller-owned account (TRADER only) |

All endpoints require a Bearer JWT. The service denies other routes and does not
implement registration, login or password reset; Identity owns those operations.

## Development

Use Java 17+ and Maven 3.9+. From this directory:

```sh
mvn clean verify
mvn javadoc:javadoc
mvn spring-boot:run
```

Database and JWT settings are environment-driven in `src/main/resources/application.yml`.
See `../env.example`. Javadoc is generated at `target/site/apidocs/index.html` and
JaCoCo at `target/site/jacoco/index.html`.

Submission returns 201/SUBMITTED; an idempotent retry returns the existing order
with 200. Execution accepts in a separate committed transaction, then claims and
fills/rejects with database locks. Failed attempts roll back settlement and remain
retryable. Quote and price-tolerance limits default to ten attempts.

Set `TEST_POSTGRES_URL`, `TEST_POSTGRES_USER`, and `TEST_POSTGRES_PASSWORD` for a
disposable database to include `OrderLifecyclePostgresTest` and PostgreSQL submission
contracts. Run Maven from this directory so the production schema can be loaded.
Without these variables, PostgreSQL-only tests are explicitly skipped.
