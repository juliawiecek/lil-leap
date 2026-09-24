# NextTrade

**Team: Lil Leap**

NextTrade is a trading platform built around two applications: **NextTrade**, the core trading experience, and **NextTrade Insights**, which turns that activity into analytics and reporting. This repository holds the full stack behind both - NextTrade and Insights Spring Boot services, their Angular frontends, a standalone Identity Service, the PostgreSQL schema, a synthetic quote data pipeline, and the Docker/Jenkins automation that ties it all together.

## Team

| Team Member     | Role                              |
| ---------------- | ---------------------------------- |
| Kevin Marin      | Technical Lead                     |
| Lalima Karri     | Developer, Angular (Scrum Master)  |
| Ilhan Gelle      | Developer, Security                |
| Tanush Kaushik   | Developer, Data Engineer           |
| Julia Wiecek     | Developer, Spring Boot             |

## 🚀 Quick Start

**New to the project?** Start here:

1. **[Getting Started](docs/GETTING_STARTED.md)** - Local environment setup
2. **[Database Setup](docs/DATABASE_SETUP.md)** - PostgreSQL + Docker configuration
3. **[Test Coverage Reports](docs/COVERAGE_REPORTS.md)** - View 79.67% Python & 77.79% Java coverage

**All systems running?** Access the apps:
- Frontend: http://localhost:4200
- Backend: http://localhost:8080
- Reporting: http://localhost:4201

## Project Structure

```text
lil-leap/
|- auth/                   # NestJS Identity Service (registration, login, refresh tokens)
|- nextTrade-orders/       # Spring Boot: order & trade flow (Order Service)
|- nextTrade-holdings/     # Spring Boot: holdings & account flow (Holdings Service)
|- insights/               # Spring Boot: reporting service, currently also serving portfolio,
|                          #   order submission, and password-reset endpoints (see Architecture below)
|- frontend/               # Angular app for NextTrade (trading UI)
|- insights-frontend/      # Angular app for Insights (reporting UI)
|- db/                     # PostgreSQL schema, role/bootstrap scripts, seed data
|- data-pipeline/          # Python synthetic quote generator + ingestion service
|- docs/                   # Architecture notes and sprint planning docs
|- docker-compose.yml      # Local container orchestration for all services
|- Jenkinsfile             # CI pipeline (compose validation, tests, coverage, image build)
`- README.md
```

## Architecture

### Current State

```text
Web Applications (Angular)
  frontend/ (Client App)              insights-frontend/ (Reporting App)
        |                                          |
        | HTTP (see note below)                    | HTTP
        v                                          v
Backend Services (Spring Boot)
  nextTrade-orders/    nextTrade-holdings/    insights/
  onboarding, auth,    identical to orders    onboarding, auth, password reset,
  order validation     today, not yet split   portfolio queries, order submission,
                        into holdings logic    instrument lookups
        |                     |                       |
        +---------------------+---- JDBC -------------+
                                v
                       PostgreSQL Database
              (users, accounts, holdings, orders, instruments, ...)

Identity Service (auth/, NestJS)
  registration / login / refresh-token rotation, reachable independently
  on port 3000, sharing the same PostgreSQL database as the services above.
```

The platform is mid-split, so responsibilities currently overlap:

- `nextTrade-orders/` and `nextTrade-holdings/` are identical Spring Boot
  services today (same packages: `onboarding`, `user`, `security`, `order`,
  `config`, `common`) — only the artifact name and compose port differ.
  Neither has been trimmed down to its namesake responsibility yet.
- `frontend/` only calls `nextTrade-orders/` (`API_BASE_URL` in
  `docker-compose.yml`); `nextTrade-holdings/` is built and started by
  Compose but nothing calls it yet.
- `insights/` is the intended home for reporting only, but currently also
  carries the same onboarding/auth/password-reset/portfolio/order-submission
  endpoints as the other two services, plus a newer `instrument` package for
  instrument lookups.

See each service's own README for its exact current package layout:
[nextTrade-orders/README.md](nextTrade-orders/README.md),
[nextTrade-holdings/README.md](nextTrade-holdings/README.md),
[insights/README.md](insights/README.md).

### Request Flow (Spring Boot services)

```text
+----------------------------+         HTTP          +-------------------------------------+
| Frontend (Angular 22)      | -------------------> | Backend service (Spring Boot 3.3.4)  |
| - UI + client-side state   |                      | - REST controllers                   |
| - Login/Register screens   | <------------------- | - Security (JWT filter + authz)      |
+----------------------------+      JSON responses   | - Services + validation              |
                                                     +-------------------+-----------------+
                                                                         |
                                                                         | JDBC
                                                                         v
                                                     +-------------------------------------+
                                                     | PostgreSQL 16                        |
                                                     | - db/finalized-schema.sql            |
                                                     | - app_user restricted privileges      |
                                                     | - persistent db_data volume           |
                                                     +-------------------------------------+
```

### Container Topology (Docker Compose)

```text
Host Machine
  |-- 3000 -> auth                (built from ./auth)
  |-- 4200 -> frontend            (built from ./frontend)
  |-- 4201 -> insights-frontend   (built from ./insights-frontend)
  |-- 5432 -> db                  (postgres:16-alpine, healthcheck-gated)
  |-- 8081 -> insights            (built from ./insights)
  |-- 8082 -> orders              (built from ./nextTrade-orders)
  |-- 8083 -> holdings            (built from ./nextTrade-holdings)
  |-- 8084 -> quote-service       (built from ./data-pipeline, override with QUOTE_SERVICE_PORT)
  `-- 1025/8025 -> mailpit        (axllent/mailpit, SMTP capture + web inbox)

Docker internal network
  orders, holdings, insights, auth, quote-service --jdbc/psql--> db (nexttrade database, app_user role)
  frontend --HTTP--> orders            (holdings has no caller yet)
  insights-frontend --HTTP--> insights
```

`orders`, `holdings`, `insights`, and `auth` all publish a host port, so all
four are reachable directly from the host as well as from other containers.

### Authentication Flow (nextTrade-orders / nextTrade-holdings / insights)

```text
1) Client -> POST /auth/login (email/password)
2) AuthController -> UserService validates credentials
3) JwtService issues signed token
4) Client stores token and sends: Authorization: Bearer <token>
5) JwtAuthenticationFilter validates token on protected routes
6) GET /api/v1/users/me returns authenticated user data
```

The standalone `auth/` Identity Service implements this same flow
independently (with refresh-token rotation) and is the direction the
platform is moving in — see the [auth service's class diagram](auth/README.md#class-diagram)
and [sequence diagram](auth/README.md#flow) for its current registration,
login, and refresh behavior.

## Technology Stack

| Layer          | Technology                              | Notes                                          |
| -------------- | ---------------------------------------- | ----------------------------------------------- |
| Backend        | Spring Boot 3.3.4 (Java 21)             | REST APIs, validation, service layer            |
| Identity Service | NestJS 10 + TypeORM                   | Standalone auth service, shares the Postgres DB |
| Security       | Spring Security + JJWT / bcryptjs + JWT | Password hashing + Bearer JWT auth              |
| Database       | PostgreSQL 16 + `pgcrypto`              | UUID keys and SSN encryption in DB              |
| Frontend       | Angular 22 + TypeScript                 | Two standalone Angular apps                     |
| Data           | Python 3.12 + Flask + NumPy + Pandas    | Synthetic quote generation pipeline             |
| DevOps         | Docker, Docker Compose, Jenkins         | Container builds and CI automation              |

## Backend API (nextTrade-orders / nextTrade-holdings, current)

Identical in both services today, since neither has diverged from the
original monolith yet:

- `POST /api/v1/users` - Register user (onboarding flow)
- `POST /auth/login` - Authenticate and return JWT
- `GET /api/v1/users/me` - Get current user profile (requires `Authorization: Bearer <token>`)

Primary packages under `nextTrade-orders/src/main/java/com/neueda/leap` and
`nextTrade-holdings/src/main/java/com/neueda/leap`:

- `onboarding/` - Registration controller/service/DTO/entity layers
- `user/` - Authentication and authenticated user endpoints
- `security/` - JWT service and request filter
- `config/` - Security filter chain and password encoder
- `order/` - Order model and validation service (no controller yet)
- `common/` - Cross-cutting exception handling

`insights/` currently exposes an overlapping set of endpoints plus
portfolio, order-submission, password-reset, and instrument-lookup routes —
see [insights/README.md](insights/README.md) for its current package layout.

## Database

- Schema: `db/finalized-schema.sql`
- Role/bootstrap script: `db/init-app-role.sh`
- Seed data: `db/seeds/001_us_equity_instruments.sql`
- ER diagram: [`db/ER_Diagram.pdf`](db/ER_Diagram.pdf) / [`db/er_diagram.png`](db/er_diagram.png)

### Credential and Role Model (Current Dev Setup)

- `main` owns the schema and performs privileged setup
- `app_user` is restricted to DML for application runtime use

Current hardcoded development credentials (set in `docker-compose.yml`):

| Principal      | Username   | Password         |
| --------------- | ----------- | ----------------- |
| DB owner/admin  | `main`     | `main_password`   |
| App DB user     | `app_user` | `my_app_password` |

`init-app-role.sh` grants `app_user` connect/schema usage plus table-level
DML permissions. These are development-only credentials — see
[Notes for Production Hardening](#notes-for-production-hardening).

## Docker Compose

`docker-compose.yml` defines eight services:

| Service             | Built from        | Host port(s)                | Notes                                    |
| -------------------- | ------------------ | ----------------------------- | ------------------------------------------ |
| `db`                 | `postgres:16-alpine`| `5432`                        | Runs schema/seed scripts once, on an empty volume; has a `pg_isready` healthcheck |
| `orders`             | `./nextTrade-orders`| `8082` -> `8080`             | Order service; the only backend `frontend/` currently calls |
| `holdings`           | `./nextTrade-holdings`| `8083` -> `8080`           | Holdings service; identical code to `orders` today, no caller yet |
| `insights`           | `./insights`       | `8081` -> `8080`              | Reporting service (see [Architecture](#architecture)) |
| `auth`               | `./auth`           | `3000`                        | Identity Service                         |
| `frontend`           | `./frontend`       | `4200` -> `80`                | Talks to `orders` over the Docker network |
| `insights-frontend`  | `./insights-frontend` | `4201` -> `80`              | Talks to `insights` over the Docker network |
| `quote-service`      | `./data-pipeline`  | `${QUOTE_SERVICE_PORT:-8084}` -> `8080` | Waits for `db`'s healthcheck before starting |
| `mailpit`            | `axllent/mailpit`  | `1025` (SMTP), `8025` (web UI)| Captures password-reset emails in dev    |

Important runtime behavior:

- Services reach Postgres internally at `db:5432`; `orders`, `holdings`,
  `insights`, `auth`, and `quote-service` all connect over the Docker network.
- DB initialization scripts (`db/finalized-schema.sql`, `db/init-app-role.sh`,
  the seed file) only run on the **first** startup of an empty `db_data`
  volume — re-run them by clearing that volume (`docker compose down -v`).
- `quote-service` waits for `db`'s healthcheck to pass before starting; the
  other services only wait for `db` to start, not for it to be ready.

## Jenkins Pipeline (CI)

`Jenkinsfile` stages, in order:

1. **Checkout**
2. **Detect Compose Command** - picks `docker-compose` or `docker compose`, whichever is available on the agent
3. **Validate Compose YAML** - `compose config -q` and `compose config`, using synthetic `TLS_KEYSTORE_PASSWORD`, `TLS_KEYSTORE_PATH`, `AUTH_SERVICE_TLS_KEYSTORE_PATH`, and `APP_JWT_SECRET` values scoped only to this stage
4. **Unit Tests - nextTrade-orders** - `mvn clean verify` in `nextTrade-orders/`
5. **Unit Tests - nextTrade-holdings** - `mvn clean verify` in `nextTrade-holdings/`
6. **Unit Tests - insights-service** - `mvn clean verify` against `insights/pom.xml`
7. **Publish Coverage - nextTrade-orders** - archives the JaCoCo report from `nextTrade-orders/target/site/jacoco/`
8. **Publish Coverage - nextTrade-holdings** - archives the JaCoCo report from `nextTrade-holdings/target/site/jacoco/`
9. **Run Python Tests With Coverage** - runs `pytest` with coverage for `data-pipeline/` inside a `python:3.12-slim` container
10. **Archive Python Coverage** - archives `data-pipeline/htmlcov/` and `coverage.xml`
11. **Build Compose Services** - `docker compose build`

Notes:

- The Jenkins agent needs a local Docker daemon with Compose, permission to
  run Docker, and the `maven` and `JDK21` tools configured. No host Maven or
  Node install is required.
- Compose validation never prints the fully-resolved config, since that
  would include the database and TLS passwords; only `config -q` runs, and
  only with placeholder secrets scoped to that stage.
- There is currently no frontend (Angular) test or build stage in CI.
- Concurrent runs of this job are disabled (`disableConcurrentBuilds()`).

## Local Development

### Prerequisites

| Tool           | Recommended Version         |
| --------------- | ----------------------------- |
| Java            | 21                            |
| Maven           | 3.9+                          |
| Node.js         | 24.x                          |
| npm             | 10+                           |
| Python          | 3.12                          |
| Docker          | Latest                        |
| Docker Compose  | v2+                           |

### 1) Start the Database

```bat
docker compose up -d db
```

### 2) Run a Trading Service (nextTrade-orders or nextTrade-holdings) Locally

Configure the database environment using [env.example](env.example) (copy
it to `.env` and set real values). For a service running outside Docker,
set `DB_HOST=localhost`.

```bat
cd nextTrade-orders
mvn clean test
mvn spring-boot:run
```

Swap `nextTrade-orders` for `nextTrade-holdings` to run the other service —
they're identical today, so either one works. Both default to
`http://localhost:8080` when run this way, so **don't run them side by side
outside Docker** without overriding `server.port` on one of them; Docker
Compose keeps them apart on host ports `8082` and `8083`.

### 3) Run the Identity Service (auth) Locally

```bat
cd auth
npm ci
npm run start:dev
```

See [auth/README.md](auth/README.md#environment-variables) for the required
environment variables.

### 4) Run a Frontend Locally

```powershell
cd frontend
npm ci
npm start
```

Open **http://localhost:4200**. On later runs, `npm start` from `frontend`
is enough unless dependencies have changed. See the
[frontend guide](frontend/README.md) for troubleshooting. Swap `frontend`
for `insights-frontend` (served on port `4201`) to run the reporting UI
instead.

### 5) Run the Full Stack via Compose

```bat
docker compose build
docker compose up -d
```

Stop and clean up (including the DB volume):

```bat
docker compose down -v
```

## Testing

### nextTrade-orders / nextTrade-holdings (JUnit + Spring Boot Test + MockMvc)

```bat
cd nextTrade-orders
mvn clean test
```

Same command from `nextTrade-holdings` runs its (currently identical) test suite.

### insights

```bat
cd insights
mvn test
```

### auth (Jest)

```bat
cd auth
npm test
```

### Frontend build validation

```bat
cd frontend
npm run build
```

### Data Pipeline (Pytest)

```bat
cd data-pipeline
python -m pip install -r requirements.txt
pytest
```

### Code Coverage

| Service              | Generate                                  | Report                                              |
| --------------------- | ------------------------------------------ | ----------------------------------------------------- |
| `nextTrade-orders`    | `cd nextTrade-orders && mvn clean verify` | `nextTrade-orders/target/site/jacoco/index.html`    |
| `nextTrade-holdings`  | `cd nextTrade-holdings && mvn clean verify` | `nextTrade-holdings/target/site/jacoco/index.html` |
| `insights`            | see [insights/JACOCO_COVERAGE.md](insights/JACOCO_COVERAGE.md) | `insights/target/site/jacoco/index.html` |
| `auth`                | `cd auth && npm run test:cov`             | `auth/coverage/lcov-report/index.html`              |
| `data-pipeline`       | see [data-pipeline/PYTEST_COVERAGE.md](data-pipeline/PYTEST_COVERAGE.md) | `data-pipeline/htmlcov/index.html` |

JaCoCo's `report` goal is bound to Maven's `verify` phase, not `test` — plain
`mvn clean test` (as used elsewhere in this README for quick feedback) does
not produce a coverage report; use `mvn clean verify` when you need one.
Jenkins archives the `nextTrade-orders` and `nextTrade-holdings` JaCoCo
reports and the `data-pipeline` coverage output as build artifacts (see
[Jenkins Pipeline (CI)](#jenkins-pipeline-ci)); `insights` and `auth`
coverage are local-only today.

## JavaDocs

Generated HTML docs are not committed to this repository. Generate them locally:

```bat
cd nextTrade-orders
mvn javadoc:javadoc
```

Then open `nextTrade-orders/target/site/apidocs/index.html` (same command
from `nextTrade-holdings` generates that service's docs).

## Data Pipeline

`data-pipeline/` generates reproducible synthetic US-equity quotes for
offline/dev use and can run as a continuous ingestion service
(`quote-service` in Docker Compose).

Key files:

- `data-pipeline/src/generate_quotes.py`
- `data-pipeline/src/quote_provider.py`
- `data-pipeline/src/service_runner.py`
- `data-pipeline/src/app.py`
- `data-pipeline/tests/`

## Notes for Production Hardening

- Replace hardcoded development DB credentials (`docker-compose.yml`,
  `db/init-app-role.sh`) with secrets or environment variables.
- Set a strong JWT secret via `APP_JWT_SECRET` (the in-code default, and the
  value hardcoded in `docker-compose.yml`, are dev-only).
- Actually split `nextTrade-orders` and `nextTrade-holdings` apart — they're
  identical services today and both still own the full onboarding/auth
  surface; trim each down to its namesake responsibility.
- Add a CI stage for frontend tests and a deploy stage that binds a real TLS
  keystore from Jenkins credentials, per the placeholders already wired into
  the Compose validation stage.
