# NextTrade Backend

Spring Boot service for onboarding, authentication, password resets, portfolio queries,
and order submission.

## Package Layout

```text
com.neueda.leap
|- Main.java
|- common.exception      # Cross-cutting exception handlers
|- config                # Application configuration
|- onboarding            # Registration API, DTOs, onboarding entities and service
|- order                 # Order submission and validation
|- passwordreset         # Password reset tokens and email delivery
|- portfolio             # Client-owned holdings, cash, and order history
|- security              # JWT authentication and log masking
`- user                  # Authentication entity, repository, and auth exceptions
```

## Main Domains

- `onboarding`: Handles registration requests and persists profile/financial/account data.
- `user`: Stores authentication-focused user data (email, password hash, lock metadata).
- `order`: Handles authenticated, account-scoped order submission and idempotent retries.
- `passwordreset`: Delivers reset tokens by email and validates password changes.
- `portfolio`: Returns holdings, cash balances, and orders belonging to the caller.

## Local Development

Requirements:

- Java 21
- Maven 3.9+

Run the following commands from `backend`.

Run tests:

```bash
mvn clean test
```

Run the application:

Configure the database environment using [env.example](../env.example).
Set `DB_HOST=localhost` when connecting to the Docker database from the host.
The backend listens at `http://localhost:8080/api/v1`.

```bash
mvn spring-boot:run
```

Build a jar:

```bash
mvn clean package
```

The executable jar is written to `target/nexttrade.jar`.

## API

All paths below include the `/api/v1` context prefix and use `http://localhost:8080` for local development.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/v1/users` | Register a user |
| POST | `/api/v1/auth/login` | Authenticate and issue a JWT |
| POST | `/api/v1/auth/password-reset/request` | Request a reset email |
| POST | `/api/v1/auth/password-reset/confirm` | Set a new password using a reset token |
| GET | `/api/v1/users/me` | Read the authenticated user |
| GET | `/api/v1/holdings` | Read the caller's holdings |
| GET | `/api/v1/cash` | Read the caller's cash balances |
| GET | `/api/v1/orders` | Read the caller's order history |
| POST | `/api/v1/orders` | Submit an order for an owned account |

The user-profile, portfolio, and order endpoints require a Bearer JWT.

The registration request body is defined in `com.neueda.leap.onboarding.dto.RegisterUserRequest`.
The response body is defined in `com.neueda.leap.onboarding.dto.UserResponse`.

## Javadocs

Generate and validate the production Java API documentation from `backend`:

```powershell
mvn javadoc:javadoc
```

Open `target/site/apidocs/index.html`. The command checks public/protected API
documentation (including inherited docs) and fails on Javadoc warnings or errors.
Document parameters, return values, relevant exceptions, ownership rules, and
retry behavior when changing an API. Private helpers and test methods are outside
this documentation check. This check is separate from `mvn test` and is not yet
part of the Jenkins pipeline.

## Safe logging and API security (BR-02)

### Headers and logging

API responses include `nosniff`, frame denial, an API-only CSP, no-referrer,
disabled camera/microphone/geolocation, and no-store caching.

- Request-detail, access, SQL statement, bind/extract, and SQL error-detail logging
  are disabled. Do not enable HTTP/security DEBUG/TRACE or request/response body logging.
- Login and registration records mask credentials and personal data in `toString()`;
  API serialization still supplies the login token to the client.
- Validation/parsing errors return a fixed response without logging rejected values.
  Unexpected controller errors log only the exception type; exception messages and
  causes may contain unlabelled secrets and are deliberately omitted.
- `logback-spring.xml` masks labelled passwords, tokens, SSNs, authorization and cookie
  headers, and Basic/Bearer credentials in messages and exception output. Unquoted
  sensitive values mask the rest of that line conservatively. This is defense in depth;
  never log raw payloads, unlabelled secrets, or credential-bearing URLs.
- Console logging is the default. To enable the same masking in rotating files, set
  `SPRING_PROFILES_ACTIVE=file-logging` and optionally `LOGGING_FILE_NAME` (default
  `logs/application.log`; 14 days of archives). Keep log sink configuration under review.
- Any external proxy, APM, browser telemetry, or log collector must also exclude bodies,
  query strings, Authorization/Cookie headers, and credentials. The repository has no
  such external services configured.

### Verification

`mvn clean test` runs without a database or Docker daemon. Tests cover:

- HTTP login and authenticated `/me` requests against the embedded server.
- Security headers, safe validation/parsing/unexpected errors, and DTO masking.
- Real console and rotating-file output, including exceptions and issued tokens.

The frontend has separate security tests (`npm test`) and an HTTP development server.
Position, cash and order ownership checks remain the responsibility of their
API/service authorization controls.

Implementation references: [Spring Security headers](https://docs.spring.io/spring-security/reference/servlet/exploits/headers.html),
[Logback masking converters](https://logback.qos.ch/manual/layouts.html).

## TS-03.3: Automated cross-client isolation tests (BR-02)

Run the suite with Java 21:

```bash
mvn -B test -Dtest=CrossClientAccessIntegrationTest
# All backend regression tests (also run by Jenkins):
mvn -B clean verify
```

`CrossClientAccessIntegrationTest` uses the production security configuration, real
signed JWTs, financial controller, query service and JDBC queries against an isolated
H2 database. It does not mock authorization or financial data. Each case creates Alice,
Bob and an accountless client; Alice and Bob each have two accounts with different
balances, quantities and orders but the same instrument. Transactions roll fixtures
back between cases. Tokens are issued by the real JWT service for these fixture users;
login/password verification has its own tests.

| Coverage | Expected result |
| --- | --- |
| Each client's holdings, cash and orders | 200; all and only that client's accounts/data |
| Accountless client | 200; empty collections |
| User/client/account/order query selectors, including duplicate values | 403 `ACCESS_DENIED` |
| Guessed object paths, including nonexistent IDs | Same generic 403 |
| Unsupported financial writes and object-ID paths | 403; financial data unchanged |
| Another client's order cancellation attempt | 403; stored data unchanged |
| Spoofed identity headers | Cannot override the signed JWT identity |
| Missing/invalid token or an edited JWT subject | 401; never treated as an authorized client |

### Current API boundary

`GET /holdings`, `GET /cash`, and `GET /orders` return only the signed-in client's data.
`POST /orders` submits an order for an account owned by that client; unknown and other
clients' accounts both return 404. Query selectors remain forbidden. Other financial
writes, object-ID routes and cancellation are denied by security configuration.
All routes use the `/api/v1` context prefix.

An initial submission returns 201 with `ACCEPTED` status after persisting its acceptance timestamp. Retrying the same account
and `clientReference` returns the existing order with 200, including concurrent retries.
Submission creates no fill. PostgreSQL `ON CONFLICT DO NOTHING` handles the race without
aborting the transaction; a subsequent read retrieves the winning order.

The database-backed execution worker resumes accepted and pending orders on startup.
Execution failures preserve acceptance and are retried without creating another order.
Until an `OrderExecutor` implementation is supplied, orders remain pending. Existing
databases must apply `db/migrations/007_durable_order_execution.sql` before deploying.
See the [execution handler contract](src/main/java/com/neueda/leap/order/execution/OrderExecutor.java)
for transaction requirements and the [PostgreSQL recovery tests](src/test/java/com/neueda/leap/order/execution/OrderExecutionDurabilityTest.java)
for failure, retry, concurrency, and startup recovery coverage.

### PostgreSQL contract tests

The ordinary test suite uses H2 and does not validate PostgreSQL-specific persistence.
`PostgresContractTest` additionally covers all net-worth bracket values, JSONB objects,
registration through the real security chain, owned/foreign order submissions, and
concurrent idempotent retries using real PostgreSQL transactions.

Initialize a **disposable test database** with `db/finalized-schema.sql` and
`db/init-app-role.sh`, then run from `backend` with the restricted application role:

```powershell
$env:TEST_POSTGRES_URL = 'jdbc:postgresql://localhost:5432/nexttrade_test'
$env:TEST_POSTGRES_USER = 'app_user'
# Set TEST_POSTGRES_PASSWORD to the test application role's password.
mvn -B test
```

These tests are skipped when `TEST_POSTGRES_URL` is absent. Most fixtures roll back;
the concurrency case commits its fixtures and deletes them afterward. Use a disposable
database so an interrupted run cannot leave fixtures in application data.

The separate SQL checks in `db/tests` cover schema, ledger atomicity and client scoping.
