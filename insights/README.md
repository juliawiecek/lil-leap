# Insights Reporting Service

Read-only Spring Boot reporting service. It queries the PostgreSQL reporting replica with a SELECT-only role and accepts ANALYST JWTs issued by Identity.

## Structure

`reporting` (analytics), `security`, `config`, `common.exception`.

See the [architecture guide](../docs/architecture/service-boundaries.md) for service
ownership, gateway routing, database setup, known gaps and verification.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/reports/summary` | Aggregate accounts, orders, fills and gross executed value |

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

Swagger UI is available at `/api/v1/swagger-ui.html` and the specification at `/api/v1/v3/api-docs` on the native service port. These documentation routes are public; base Compose does not publish Java ports. See [API access](../docs/api/README.md).
