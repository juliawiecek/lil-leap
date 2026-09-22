# NEXT-97 Order Submission Runbook

## 1. Branch

```bash
cd ~/lil-leap
git switch main
git pull --ff-only origin main
git switch -c feature/NEXT-97-order-submission
```

Extract this ZIP at the repository root. Merge the included `backend` and `db` folders. Do not replace the project README.

## 2. Windows tests

```bash
cd ~/lil-leap/backend
mvn clean test
```

## 3. Review and push

```bash
cd ~/lil-leap
git status --short
git diff --check
git add backend/src/main/java/com/neueda/leap/order/submission
git add backend/src/test/java/com/neueda/leap/order/submission
git add db/tests/005_order_submission_idempotency.sql
git add RUN_NEXT_97.md
git commit -m "feat(NEXT-97): add idempotent order submission endpoint"
git push -u origin feature/NEXT-97-order-submission
```

## 4. Linux database test

```bash
cd ~/lil-leap
git fetch origin
git switch feature/NEXT-97-order-submission
git pull --ff-only origin feature/NEXT-97-order-submission
set -a
source .env
set +a
docker-compose up -d db
docker-compose exec -T db psql -U "$DB_ADMIN_USERNAME" -d "$DB_NAME" < db/tests/005_order_submission_idempotency.sql
```

## 5. Full stack

```bash
docker-compose up --build -d
docker-compose ps
docker-compose logs orders --tail=80
```

Expected: PostgreSQL healthy, orders running, logs contain `Started Main`.

## Endpoint

Because the application context path is `/api/v1`, the endpoint is:

`POST /api/v1/orders`

Example request body:

```json
{
  "accountId": "ACCOUNT_UUID",
  "symbol": "AAPL",
  "clientReference": "CLIENT_GENERATED_UUID",
  "side": "BUY",
  "quantity": 10,
  "orderType": "MARKET",
  "bufferPercent": 2.0
}
```

A valid bearer JWT is required.

- New order: HTTP 201 and status `SUBMITTED`
- Same account plus same clientReference: HTTP 200 with the existing order
- Malformed body: HTTP 400
- Account not owned by caller: HTTP 404
- Unsupported/non-tradable symbol: HTTP 400

This story does not fetch a quote, create a fill, or change cash/holdings. Those are execution-phase stories.
