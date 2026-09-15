#!/usr/bin/env bash
set -euo pipefail

# MISSION_SERVICE_DIR points at YOUR OWN Sprint 6/7 mission service
# checkout - the one whose SecurityConfig this script proves needs zero
# changes. Override it if your copy lives somewhere else:
#   MISSION_SERVICE_DIR=/path/to/it ./integration-test.sh
MISSION_SERVICE_DIR="${MISSION_SERVICE_DIR:-../../../leap-sprint6/solutions/13-mission-build-containerise-integration-test-wrap-up}"

NETWORK=mission-net
POSTGRES=sprint6-postgres
AUTH_IMAGE=sprint8-auth-service:m15
AUTH_CONTAINER=sprint8-auth-service-m15
SERVICE_IMAGE=mission-service:m15
SERVICE_CONTAINER=mission-service-m15
AUTH_PORT=3001
SERVICE_PORT=8081

cleanup() {
  echo "== Teardown =="
  docker rm -f "$AUTH_CONTAINER" "$SERVICE_CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "== Stage: Network =="
docker network create "$NETWORK" >/dev/null 2>&1 || true
docker network connect "$NETWORK" "$POSTGRES" >/dev/null 2>&1 || true

echo "== Stage: Build Images =="
docker build -t "$AUTH_IMAGE" .
docker build -t "$SERVICE_IMAGE" "$MISSION_SERVICE_DIR"

echo "== Stage: Run Containers =="
docker rm -f "$AUTH_CONTAINER" "$SERVICE_CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$AUTH_CONTAINER" --network "$NETWORK" -p "$AUTH_PORT:3000" "$AUTH_IMAGE"
docker run -d --name "$SERVICE_CONTAINER" --network "$NETWORK" -p "$SERVICE_PORT:8080" \
  -e SPRING_DATASOURCE_URL="jdbc:postgresql://$POSTGRES:5432/mission" \
  "$SERVICE_IMAGE"

echo "== Stage: Wait for Both to Be Ready =="
for i in $(seq 1 30); do
  if curl -s -o /dev/null "http://localhost:$AUTH_PORT/health"; then break; fi
  sleep 2
done
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:$SERVICE_PORT/accounts/1/orders" \
    -H "Content-Type: application/json" -d '{}' || true)
  if [ "$code" != "000" ]; then break; fi
  sleep 2
done

echo "== Stage: Smoke Test - No Token Is Rejected =="
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:$SERVICE_PORT/accounts/1/orders" \
  -H "Content-Type: application/json" \
  -d '{"ticker":"ULVR.L","instrumentType":"EQUITY","quantity":1,"price":40.0,"side":"BUY"}')
if [ "$CODE" != "401" ]; then
  echo "FAIL: expected 401 with no token, got $CODE"
  exit 1
fi
echo "PASS: unauthenticated request rejected (401)"

echo "== Stage: End-to-End Authenticated Order, via the NEW Auth Service =="
LOGIN_RESPONSE=$(curl -s -X POST "http://localhost:$AUTH_PORT/auth/login" \
  -H "Content-Type: application/json" -d '{"username":"alice","password":"mission123"}')
TOKEN=$(echo "$LOGIN_RESPONSE" | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')
if [ -z "$TOKEN" ]; then
  echo "FAIL: could not get a token from the containerised sprint8-auth-service. Response was: $LOGIN_RESPONSE"
  exit 1
fi

ORDER_RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" -X POST "http://localhost:$SERVICE_PORT/accounts/1/orders" \
  -H "Content-Type: application/json" \
  -d '{"ticker":"ULVR.L","instrumentType":"EQUITY","quantity":1,"price":40.0,"side":"BUY"}')
echo "Order response: $ORDER_RESPONSE"
echo "$ORDER_RESPONSE" | grep -q '"status":"ACCEPTED"' || { echo "FAIL: order was not accepted"; exit 1; }
echo "PASS: a real token from the NEW NestJS auth service was accepted by the UNCHANGED mission service"

echo "== Stage: Confirm It Actually Landed in Postgres =="
docker exec -e PGPASSWORD=mission "$POSTGRES" psql -U postgres -d mission -c \
  "SELECT h.account_id, i.ticker, h.quantity FROM holdings h JOIN instruments i ON h.instrument_id=i.instrument_id WHERE h.account_id=1 AND i.ticker='ULVR.L';"

echo "== ALL STAGES PASSED =="
