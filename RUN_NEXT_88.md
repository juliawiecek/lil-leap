# NEXT-88 Runbook

## Branch

```bash
git switch main
git pull --ff-only origin main
git switch -c feature/NEXT-88-client-query-scoping
```

Extract this bundle at the repository root so `backend/` and `db/` merge into the existing folders.

## Windows backend tests

```bash
cd backend
mvn clean test
```

## Linux database isolation test

```bash
cd ~/lil-leap
set -a
source .env
set +a
docker-compose up -d db
docker-compose exec -T db psql -U "$DB_ADMIN_USERNAME" -d "$DB_NAME" < db/tests/004_client_data_isolation.sql
```

Expected: `PASS: authenticated user scoping isolates holdings, cash, and orders`.

## Full application check

```bash
docker-compose up --build -d
docker-compose ps
docker-compose logs orders --tail=80
```

Expected: database healthy, orders running, and logs contain `Started Main`.

## Endpoint paths

The application has context path `/api/v1`, so the protected routes are:

- `GET /api/v1/holdings`
- `GET /api/v1/cash`
- `GET /api/v1/orders`

A valid bearer token is required. No endpoint accepts a client/user id parameter.

## Git review

```bash
git status --short
git diff --stat
git diff --check
```

Stage only the NEXT-88 files after all tests pass.
