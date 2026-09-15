# Lil Leap Backend

Spring Boot service for user onboarding and authentication.

## Package Layout

```text
com.neueda.leap
|- Main.java
|- common.exception      # Cross-cutting exception handlers
|- config                # Application configuration
|- onboarding            # Registration API, DTOs, onboarding entities and service
|- order                 # Example order model and validation service
`- user                  # Authentication entity, repository, and auth exceptions
```

## Main Domains

- `onboarding`: Handles registration requests and persists profile/financial/account data.
- `user`: Stores authentication-focused user data (email, password hash, lock metadata).
- `order`: Contains a simple order model and validation logic.

## Local Development

Requirements:
- Java 21
- Maven 3.9+

Run tests:

```bash
mvn clean test
```

Run the application:

Configure the TLS certificate first as described below. Plain HTTP is not supported.

```bash
mvn spring-boot:run
```

Build a jar:

```bash
mvn clean package
```

## API

Registration endpoint:
- `POST /api/v1/users`

The request body is defined in `com.neueda.leap.onboarding.dto.RegisterUserRequest`.
The response body is defined in `com.neueda.leap.onboarding.dto.UserResponse`.

## TS-02.4: HTTPS and safe logging (BR-02)

### TLS setup

The backend terminates TLS directly on port 8080, with TLS 1.2 and 1.3 only.
No plaintext connector is installed. Missing or invalid certificate configuration
prevents startup. A security filter also rejects insecure requests with a fixed
403 `HTTPS_REQUIRED` response before reading credentials; it does not redirect
credential-bearing requests. `Forwarded` and `X-Forwarded-*` headers are ignored.

Provide a PKCS12 keystore containing the server private key and certificate chain:

| Setting | Local application | Docker Compose |
| --- | --- | --- |
| Keystore | `TLS_KEYSTORE` (default `file:./certs/backend.p12`, relative to working directory) | `TLS_KEYSTORE_PATH` (default `./certs/backend.p12`, relative to repository root), mounted read-only as a Docker secret |
| Keystore password | `TLS_KEYSTORE_PASSWORD` | `TLS_KEYSTORE_PASSWORD` (required) |

For local development, run this from `backend` (keytool prompts for the password):

```powershell
New-Item -ItemType Directory -Force certs
keytool -genkeypair -alias backend -keyalg RSA -keysize 3072 -storetype PKCS12 -keystore certs/backend.p12 -validity 30 -dname "CN=localhost" -ext "SAN=dns:localhost,ip:127.0.0.1"
# Set TLS_KEYSTORE_PASSWORD in your private environment, matching the prompted password.
mvn spring-boot:run
```

Trust the development certificate locally. Production requires a certificate
issued by your trusted CA for the deployed hostname. Keep the keystore and its
password outside version control; inject the password through the deployment's
secret manager. For Compose, set `TLS_KEYSTORE_PATH` to the supplied keystore and
use `docker compose up --build`. The app remains internal to the Docker network.
If publishing it, publish only its TLS port. A load balancer must use TLS
passthrough, or connect to the backend using HTTPS with certificate verification.
Do not enable forwarded-header trust or turn off backend TLS to accommodate a proxy.

With the existing context path and controller mappings, login is
`https://localhost:8080/api/v1/auth/login`; registration and `/me` currently resolve
to `/api/v1/api/v1/users` and `/api/v1/api/v1/users/me`. This task preserves those mappings.

### Headers and logging

HTTPS API responses include HSTS (one year, including subdomains), `nosniff`, frame
denial, an API-only CSP, no-referrer, disabled camera/microphone/geolocation, and
no-store caching. Ensure all subdomains support HTTPS before deploying this HSTS policy.

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

`mvn clean test` generates a temporary localhost certificate using the JDK's keytool;
no database, deployment certificate, or Docker daemon is required. Tests cover:

- Real TLS 1.2/1.3 login and `/me`, the connector's enabled protocols, and plaintext rejection.
- Spoofed forwarding headers and rejection before JWT validation or service calls.
- Security headers, safe validation/parsing/unexpected errors, and DTO masking.
- Real console and rotating-file output, including exceptions and issued tokens.

The frontend has separate security tests (`npm test`) and an HTTPS development server.
This transport/logging control supports BR-02; position, cash and order ownership checks
remain the responsibility of their API/service authorization controls.

Implementation references: [Spring Boot TLS and forwarding](https://docs.spring.io/spring-boot/3.3/how-to/webserver.html),
[Spring Security headers](https://docs.spring.io/spring-security/reference/servlet/exploits/headers.html),
[Logback masking converters](https://logback.qos.ch/manual/layouts.html).

