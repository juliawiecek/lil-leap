# NextTrade
## Team: Lil Leap

NextTrade is an e-trading platform built for the Fidelity LEAP program. This repo contains a Spring Boot backend, Angular frontend, PostgreSQL schema, a synthetic quote data pipeline, and Docker/Jenkins automation.

## Team

| Team Member | Role                     |
| --- |--------------------------|
| Julia Wiecek | Team Lead                |
| Lalima Karri | Developer, Angular       |
| Ilhan Gelle | Developer, Security      |
| Tanush Kaushik | Developer, Data Engineer |
| Kevin Marin | Developer, Spring Boot   |

## Project Structure

```text
lil-leap/
|- backend/                 # Spring Boot 3.3.4, Java 21, Maven
|- frontend/                # Angular 22 application
|- db/                      # PostgreSQL schema + role/bootstrap scripts
|- data-pipeline/           # Python synthetic quote generator + API
|- docker-compose.yml       # app + db services for local container workflow
|- Jenkinsfile              # CI pipeline (compose validation + image builds)
`- README.md
```

## Architecture

The frontend currently previews the interface; its authentication controls are
not yet connected to the backend. The diagrams below show the intended connection.

```text
Frontend (Angular)
       |
       | HTTP
       v
Backend (Spring Boot + Spring Security + JWT)
       |
       | JDBC
       v
PostgreSQL 16
```

### Architecture Overview

```text
+----------------------------+         HTTP          +-------------------------------------+
| Frontend (Angular 22)      | -------------------> | Backend (Spring Boot 3.3.4)        |
| - UI + client-side state   |                      | - REST controllers                 |
| - Login/Register screens   | <------------------- | - Security (JWT filter + authz)    |
+----------------------------+      JSON responses   | - Services + validation            |
                                                     +-------------------+-----------------+
                                                                         |
                                                                         | JDBC
                                                                         v
                                                     +-------------------------------------+
                                                     | PostgreSQL 16                        |
                                                     | - finalized-schema.sql               |
                                                     | - app_user restricted privileges      |
                                                     | - persistent db_data volume           |
                                                     +-------------------------------------+
```

### Container Topology (Docker Compose)

```text
Host Machine
  |
  |-- Port 5432 exposed
  v
+----------------------------+
| db container               |
| postgres:16-alpine         |
| POSTGRES_DB=nexttrade      |
| POSTGRES_USER=main         |
+----------------------------+

Docker internal network
+----------------------------+        jdbc:postgresql://db:5432/nexttrade
| app container              | -------------------------------------------> db
| built from ./backend       |
| no host ports mapped       |
+----------------------------+
```

### Authentication Flow

```text
1) Client -> POST /api/v1/auth/login (email/password)
2) AuthController -> UserService validates credentials
3) JwtService issues signed token
4) Client stores token and sends: Authorization: Bearer <token>
5) JwtAuthenticationFilter validates token on protected routes
6) /api/v1/users/me returns authenticated user data
```

### CI Build Flow (Jenkins)

```text
Checkout
   -> Detect compose command
   -> Validate compose YAML
   -> Backend tests (Java 21 / Maven container)
   -> Frontend tests and production build (Node 24 container)
   -> docker build backend/ (one multi-stage image, tagged by build and commit)
```

## Technology Stack

| Layer | Technology | Notes |
| --- | --- | --- |
| Backend | Spring Boot 3.3.4 | REST APIs, validation, service layer |
| Security | Spring Security + JJWT 0.12.6 | BCrypt password hashing + Bearer JWT auth |
| Database | PostgreSQL 16 + `pgcrypto` | UUID keys generated in DB |
| Frontend | Angular 22 + TypeScript | Standalone Angular app |
| Data | Python + Flask + NumPy + Pandas | Synthetic quote generation pipeline |
| DevOps | Docker, Docker Compose, Jenkins | Container builds and CI automation |

## Backend API (Current)

- `POST /api/v1/users` - Register user (onboarding flow)
- `POST /api/v1/auth/login` - Authenticate and return JWT
- `GET /api/v1/users/me` - Get current user profile (requires `Authorization: Bearer <token>`)

Primary backend packages under `backend/src/main/java/com/neueda/leap`:

- `onboarding/` - Registration controller/service/DTO/entity layers
- `user/` - Authentication and authenticated user endpoints
- `security/` - JWT service and request filter
- `config/` - Security filter chain and password encoder
- `common/` - Cross-cutting exception handling

## Database

- Main schema file: `db/finalized-schema.sql`
- Role/bootstrap script: `db/init-app-role.sh`
- ER diagram: `db/ER_Diagram.pdf`

### Credential and Role Model (Current Dev Setup)

- `main` user owns schema and performs privileged setup
- `app_user` is restricted for app runtime DML

Current hardcoded development credentials:

| Principal | Username | Password |
| --- | --- | --- |
| DB owner/admin | `main` | `main_password` |
| App DB user | `app_user` | `my_app_password` |

`init-app-role.sh` grants `app_user` connect/schema usage plus table-level DML permissions.

## Docker Compose Behavior

`docker-compose.yml` defines:

- `db` service (`postgres:16-alpine`) exposed on host `5432`
- `app` service built from `backend/` with no host `ports:` mapping

Important runtime behavior:

- The backend can reach Postgres internally at `db:5432`
- The backend container is intentionally not reachable from host unless you add a port mapping
- DB initialization scripts run only on first startup of an empty `db_data` volume

## Jenkins Pipeline Behavior

`Jenkinsfile` stages:

1. Checkout
2. Detect compose command (`docker-compose` vs `docker compose`)
3. Validate compose YAML
4. Run backend `mvn clean verify` in a Java 21 / Maven container; publish JUnit results
5. Run frontend `npm ci`, `npm run test:ci`, and `npm run build` in a Node 24 container; publish JUnit results
6. Build the backend multi-stage image once, tagged `nexttrade:ci-<build-number>-<git-commit>`

Notes:

- The Jenkins agent must be Linux with a local Docker daemon, Docker Compose, and permission to run Docker. The standard Jenkins JUnit plugin is required for test reporting; the Docker Pipeline plugin, host Java, Maven and Node installations are not required. The daemon must be able to mount the agent's workspace path.
- This is a test/build pipeline, with no deployment stage. `ci/run-checks.sh` removes its own temporary test containers on completion/failure or a handled interruption. It never calls `compose down -v` or removes runtime volumes. Test files are owned by the Jenkins UID. Agent/daemon crashes may still require orphan-container cleanup.
- Validation uses `config -q` only. Do not print expanded Compose configuration: it includes database and encryption passwords.
- Failed test/build commands stop the pipeline before image creation. Reports are collected even on failure; missing reports do not hide the original command failure. Concurrent runs of this job are disabled, and there is a 45-minute overall timeout.
- The packaging Dockerfile still uses `-DskipTests`; the preceding mandatory backend verification stage runs the tests. `backend/.dockerignore` excludes local output and environment files from the image build context. No image is pushed or deployed by this pipeline.

## Local Development

## Prerequisites

| Tool | Recommended Version |
| --- | --- |
| Java | 21 |
| Maven | 3.9+ |
| Node.js | 24.15.0 or later 24.x (frontend) |
| npm | 10+ |
| Python | 3.11+ |
| Docker | Latest |
| Docker Compose | v2+ |

### 1) Start Database with Docker Compose

```bat
docker compose up -d db
```

### 2) Run Backend Locally

Configure the database environment using [env.example](env.example).
For a backend running outside Docker, set `DB_HOST=localhost`.
The API is available at `http://localhost:8080/api/v1`.

```bat
cd backend
mvn clean test
mvn spring-boot:run
```

### 3) Run Frontend Locally

Run the following from the repository root:

```powershell
cd frontend
npm ci
npm start
```

Open **http://localhost:4200**. On later runs, only `npm start` from
`frontend` is needed unless dependencies have changed. See the
[frontend guide](frontend/README.md#run-locally) for troubleshooting.

### 4) Run Full Compose Build

```bat
docker compose build
docker compose up -d
```

Stop and clean (including DB volume):

```bat
docker compose down -v
```

## Testing

### Backend (JUnit + Spring Boot Test + MockMvc)

```bat
cd backend
mvn clean test
```

### Frontend

Frontend build validation:

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

## JavaDocs

Generated HTML docs are not committed in this repository by default. Generate them locally with Maven:

```bat
cd backend
mvn javadoc:javadoc
```

Open the generated site at:

- `backend/target/site/apidocs/index.html`

## Data Pipeline

The `data-pipeline/` module generates reproducible synthetic US-equity quotes for offline/dev use.

Key files:

- `data-pipeline/src/generate_quotes.py`
- `data-pipeline/src/quote_provider.py`
- `data-pipeline/src/app.py`
- `data-pipeline/tests/`

## ER Diagram

- View the ER diagram screenshot: [`db/er_diagram.png`](db/er_diagram.png)

## Recent Project Changes Reflected in This README

- Docker compose and DB bootstrap now use hardcoded dev credentials instead of `${...}` env substitution for app-user password setup.
- Schema bootstrap file path in compose is `db/finalized-schema.sql`.
- Role grant SQL in `db/init-app-role.sh` was corrected to valid identifier syntax.
- JWT library decision is finalized and implemented with JJWT (`io.jsonwebtoken`).

## Notes for Production Hardening

- Replace hardcoded development DB credentials with secrets/environment variables.
- Set a strong JWT secret via `APP_JWT_SECRET` (default in code is dev-only).
- Consider running tests in CI before image packaging (or remove `-DskipTests` in Docker build stage).
