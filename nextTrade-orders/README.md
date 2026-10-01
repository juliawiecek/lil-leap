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

Supply `accountId`, `clientReference`, `side`, `quantity` and exactly one of
`symbol` or `instrumentId`. Reuse `clientReference` for retries.

All business endpoints require a Bearer JWT. The service denies other routes and does not
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

Apply migrations 007, 008 and 009 before starting Orders on an existing database.
The holdings projection trigger updates positions within the settlement transaction;
Orders refuses startup if that trigger is missing or disabled. See the
[upgrade instructions](../docs/architecture/service-boundaries.md#deployment-and-existing-databases).

Swagger UI is available at `/api/v1/swagger-ui.html` and the specification at `/api/v1/v3/api-docs` on the native service port. These documentation routes are public; base Compose does not publish Java ports. See [API access](../docs/api/README.md).

The worker records ORDER_ACCEPTED, PRICE_DECISION, ORDER_FILLED, ORDER_REJECTED, ORDER_REQUEUED and SETTLEMENT_COMPLETED events. Acceptance commits before execution; fill/settlement audit records roll back with their transaction, and requeue diagnostics commit after a rollback. Immediate cash settlement supplies both SETTLED status and a settlement timestamp.
