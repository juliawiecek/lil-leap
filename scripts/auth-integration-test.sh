#!/usr/bin/env bash
# NEXT-156: Docker-based integration test for the Identity Service (auth).
#
# Brings up the real stack with docker compose, then checks end to end that:
#   AC1  protected NextTrade endpoints reject requests without a valid token (401)
#   AC2  a real token issued by the Identity Service is accepted by those services
#   AC3  the registered user actually landed in Postgres (queried directly)
#   AC4  everything runs against the real containers -- no mocks
#
# Usage (from the repo root):
#   scripts/auth-integration-test.sh             build + start the stack, run the checks
#   scripts/auth-integration-test.sh --no-build  reuse existing images
#   scripts/auth-integration-test.sh --down      also stop the stack afterwards
#
# Needs: bash, curl, docker compose. Test data is deleted afterwards unless KEEP_DATA=1.
# Exit code is 0 only if every check passed.

set -uo pipefail

FRONTEND_URL="${FRONTEND_URL:-http://localhost:4200}"   # nginx: /auth/* and /rules/* -> auth
INSIGHTS_URL="${INSIGHTS_URL:-http://localhost:8081}"
DB_USER="${DB_USER:-main}"
DB_NAME="${DB_NAME:-nexttrade}"
WAIT_SECONDS="${WAIT_SECONDS:-240}"
# orders and holdings have no endpoints yet, so they aren't tested; compose still
# starts them because the frontend's nginx proxies to them.
SERVICES=(db auth insights frontend)

BUILD=--build
STOP_AFTER=false
for arg in "$@"; do
  case "$arg" in
    --no-build) BUILD= ;;
    --down) STOP_AFTER=true ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

cd "$(dirname "$0")/.."

RUN_ID="$(date +%s)$RANDOM"
EMAIL="it-trader-${RUN_ID}@example.com"
PASSWORD="Integration-Test-9!"
SSN="$(printf '%09d' "$(( RUN_ID % 1000000000 ))")"
BODY="$(mktemp)"
FAILURES=0

pass() { printf '  \033[32mPASS\033[0m %s\n' "$1"; }
fail() { printf '  \033[31mFAIL\033[0m %s\n' "$1"; FAILURES=$((FAILURES + 1)); }
check() { # check <description> <actual> <expected>
  if [[ "$2" == "$3" ]]; then pass "$1"; else fail "$1 (expected '$3', got '$2')"; fi
}

# HTTP status of a request; the response body is left in $BODY.
status() { curl -s -o "$BODY" -w '%{http_code}' --max-time 20 "$@"; }

# Runs SQL as the schema owner inside the db container; prints the bare result.
sql() { docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" -tAc "$1" | tr -d '\r'; }

# Decodes a JWT's payload (base64url) to JSON.
jwt_payload() {
  local p
  p="$(printf '%s' "$1" | cut -d. -f2 | tr '_-' '/+')"
  while (( ${#p} % 4 )); do p="$p="; done
  printf '%s' "$p" | base64 -d 2>/dev/null
}

wait_for() { # wait_for <name> <url> <expected status>
  local deadline=$((SECONDS + WAIT_SECONDS))
  until [[ "$(status "$2")" == "$3" ]]; do
    if (( SECONDS > deadline )); then
      echo "  $1 did not become ready at $2 within ${WAIT_SECONDS}s" >&2
      docker compose ps >&2
      return 1
    fi
    sleep 3
  done
  echo "  $1 ready"
}

cleanup() {
  if [[ "${KEEP_DATA:-0}" != 1 ]]; then
    local users="(SELECT user_id FROM users WHERE email = '$EMAIL')"
    for table in sessions accounts financial_profiles customer_profiles; do
      sql "DELETE FROM $table WHERE user_id IN $users" >/dev/null 2>&1
    done
    sql "DELETE FROM users WHERE email = '$EMAIL'" >/dev/null 2>&1
  fi
  rm -f "$BODY"
  if $STOP_AFTER; then docker compose down >/dev/null 2>&1; fi
}
trap cleanup EXIT

echo "== Starting the stack (AC4): ${SERVICES[*]}"
docker compose up -d $BUILD "${SERVICES[@]}" || { echo "docker compose up failed" >&2; exit 1; }

echo "== Waiting for services"
wait_for "auth (via nginx)" "$FRONTEND_URL/auth/docs-json" 200 || exit 1
wait_for insights "$INSIGHTS_URL/api/v1/holdings" 401 || exit 1

echo "== Register a trader through the Identity Service"
REGISTER='{
  "user_role": "TRADER", "email": "'"$EMAIL"'", "password": "'"$PASSWORD"'",
  "first_name": "Integration", "last_name": "Test", "date_of_birth": "1990-12-10",
  "phone": "555-0100", "street_address": "1 Main St", "city": "Springfield",
  "state_province": "IL", "postal_code": "62701", "country": "US",
  "citizenship_status": "CITIZEN", "ssn": "'"$SSN"'",
  "employment_status": "RETIRED", "annual_income": "50000", "net_worth_bracket": "$25k-100k",
  "risk_profile": "MODERATE", "liquidity_position": "10000",
  "accredited_investor": false, "is_politically_exposed_person": false,
  "account_name": "Integration", "account_type": "INDIVIDUAL_CASH",
  "trader_level": "ADVANCED"
}'
check "POST /auth/register returns 201" \
  "$(status -X POST -H 'Content-Type: application/json' -d "$REGISTER" "$FRONTEND_URL/auth/register")" 201

echo "== AC3: the user landed in Postgres"
check "users row exists with role TRADER" \
  "$(sql "SELECT user_role FROM users WHERE email = '$EMAIL'")" TRADER
check "password is stored hashed, not in plain text" \
  "$(sql "SELECT password_hash <> '$PASSWORD' AND length(password_hash) > 20 FROM users WHERE email = '$EMAIL'")" t
check "customer, financial profile and account rows exist" \
  "$(sql "SELECT count(*) FROM users u JOIN customer_profiles USING (user_id) JOIN financial_profiles USING (user_id) JOIN accounts USING (user_id) WHERE u.email = '$EMAIL'")" 1
check "server assigned NOVICE (client-sent ADVANCED ignored)" \
  "$(sql "SELECT a.trader_level || '/' || a.min_balance_requirement FROM accounts a JOIN users u USING (user_id) WHERE u.email = '$EMAIL'")" "NOVICE/5000.00"

echo "== Log in and inspect the token"
check "POST /auth/login returns 200" \
  "$(status -X POST -H 'Content-Type: application/json' \
      -d '{"email":"'"$EMAIL"'","password":"'"$PASSWORD"'"}' "$FRONTEND_URL/auth/login")" 200
TOKEN="$(sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p' "$BODY")"
CLAIMS="$(jwt_payload "$TOKEN")"
check "token carries user_role TRADER" "$(grep -o '"user_role":"[A-Z]*"' <<<"$CLAIMS")" '"user_role":"TRADER"'
check "token carries trader_level NOVICE" "$(grep -o '"trader_level":"[A-Z]*"' <<<"$CLAIMS")" '"trader_level":"NOVICE"'

echo "== AC1: protected endpoints reject missing or invalid tokens"
check "insights GET /api/v1/holdings without a token -> 401" "$(status "$INSIGHTS_URL/api/v1/holdings")" 401
check "insights with a tampered token -> 401" \
  "$(status -H "Authorization: Bearer ${TOKEN}x" "$INSIGHTS_URL/api/v1/holdings")" 401
check "auth GET /rules/tier-eligibility without a token -> 401" "$(status "$FRONTEND_URL/rules/tier-eligibility")" 401

echo "== AC2: the real token is accepted"
check "insights GET /api/v1/holdings with the token -> 200" \
  "$(status -H "Authorization: Bearer $TOKEN" "$INSIGHTS_URL/api/v1/holdings")" 200
check "insights returns the (empty) holdings list for the new trader" "$(tr -d ' \r\n' < "$BODY")" "[]"
check "auth GET /rules/tier-eligibility with the token -> 200" \
  "$(status -H "Authorization: Bearer $TOKEN" "$FRONTEND_URL/rules/tier-eligibility")" 200

echo
if (( FAILURES == 0 )); then
  echo "All auth integration checks passed."
else
  echo "$FAILURES check(s) failed."
fi
exit $(( FAILURES > 0 ))
