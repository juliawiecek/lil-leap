# Holdings & Trade Service

Spring Boot service for client-owned accounts, holdings, cash, order history and instrument-reference queries against the primary database.

## Structure

`portfolio` (accounts and client financials), `instrument` (reference APIs), `security`, `config`, `common.exception`.

See the [architecture guide](../docs/architecture/service-boundaries.md) for service
ownership, gateway routing, database setup, known gaps and verification.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/accounts` | Caller-owned accounts |
| GET | `/api/v1/holdings` | Caller-owned positions |
| GET | `/api/v1/cash` | Caller-owned cash balances |
| GET | `/api/v1/orders` | Caller-owned order history |
| GET | `/api/v1/instruments` | Instrument catalog |
| GET | `/api/v1/instruments/{id}` | Instrument details |

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
