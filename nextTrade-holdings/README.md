# Holdings & Trade Service

Spring Boot service for client-owned accounts, holdings, cash, order history and instrument-reference queries against the primary database.

## Structure

`portfolio` (accounts and client financials), `instrument` (reference APIs), `marketdata` (stored quote display reads), `security`, `config`, `common.exception`.

See the [architecture guide](../docs/architecture/service-boundaries.md) for service
ownership, gateway routing, database setup, known gaps and verification.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/accounts` | Caller-owned accounts |
| GET | `/api/v1/holdings` | Caller-owned positions |
| GET | `/api/v1/clients/{id}/holdings` | Positions when the ID matches the caller |
| GET | `/api/v1/clients/{id}/cash`, `/api/v1/cash/balance/{id}` | Cash when the ID matches the caller |
| GET | `/api/v1/cash` | Caller-owned cash balances |
| GET | `/api/v1/orders` | Caller-owned order history |
| GET | `/api/v1/instruments` | Instrument catalog |
| GET | `/api/v1/instruments/{id}` | Instrument details |
| GET | `/api/v1/quotes/latest/by-instrument/{id}` | Latest stored quote |
| GET | `/api/v1/quotes/latest/by-market-symbol?market=NASDAQ&symbol=AAPL` | Latest eligible quote |
| GET | `/api/v1/quotes/history/{id}?limit=100` | Quote history (maximum 1000) |

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

Cash aliases return 404 for another or unknown caller and 400 for malformed UUIDs.
Holdings aliases retain their 403 ownership contract. Quote reads require TRADER
or ANALYST authentication. Holdings never generates quotes or executes trades.

To include the five production-schema projection/migration tests, run Maven with
`-Dtest.holdings.postgres.url=jdbc:postgresql://localhost:5432/test_database`,
`-Dtest.holdings.postgres.user=test_user` and `-Dtest.holdings.postgres.password=...`
against a disposable database. Each run creates and removes an isolated schema.
