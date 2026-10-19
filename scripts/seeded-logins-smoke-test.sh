#!/usr/bin/env bash
# TS-DB-04: the seeded test logins work on a fresh stack.
#
# Starts db, auth and holdings (which also generates quotes) on an empty volume, then checks that:
#   - novice@, advanced@, analyst@ and ops@nexttrade.local log in with the shared test password (200 + token)
#   - each token carries the expected role and trader tier
#   - the novice and advanced portfolios return 200 with $10,000 and $150,000 cash
#   - a wrong password is still rejected (401)
#
# Usage (from the repo root; the password is in the team's secure chat, never in the repo):
#   SEED_TEST_PASSWORD=... scripts/seeded-logins-smoke-test.sh          build, start, check, tear down
#   KEEP=1 SEED_TEST_PASSWORD=... scripts/seeded-logins-smoke-test.sh   leave the smoke stack running
#   scripts/seeded-logins-smoke-test.sh                                 CI: no shared password needed
#
# Without SEED_TEST_PASSWORD the script generates a random password and re-hashes the three
# seeded users with it inside the throwaway smoke database, so CI needs no stored secret.
# Every other check is the same; only the committed hashes themselves go unchecked.
#
# Uses its own compose project (SMOKE_PROJECT, default nexttrade-smoke), so it never touches
# your own stack or its database. No host ports are published: requests come from a curl
# container on the stack's network. Needs bash and docker. Exit code 0 only if every check passed.

set -uo pipefail

COMPOSE="${COMPOSE_CMD:-docker compose}"
PROJECT="${SMOKE_PROJECT:-nexttrade-smoke}"
WAIT_SECONDS="${WAIT_SECONDS:-240}"
CURL_IMAGE="curlimages/curl:8.10.1"
PASSWORD="${SEED_TEST_PASSWORD:-}"
NOVICE_ID="a0000000-0000-4000-8000-000000000001"
ADVANCED_ID="a0000000-0000-4000-8000-000000000002"
SERVICES=(db auth holdings)
RESET_PASSWORDS=0

if [[ -z "$PASSWORD" ]]; then
  PASSWORD="smoke-$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  RESET_PASSWORDS=1
  echo "SEED_TEST_PASSWORD not set: using a random password for this smoke stack only"
fi

cd "$(dirname "$0")/.."
# shellcheck disable=SC2206
DC=($COMPOSE -p "$PROJECT" -f docker-compose.yml)
FAILURES=0
# Response bodies go to a file: request runs inside $(...), so a variable set there would be lost.
BODY_FILE="$(mktemp)"

pass() { printf '  \033[32mPASS\033[0m %s\n' "$1"; }
fail() { printf '  \033[31mFAIL\033[0m %s\n' "$1"; FAILURES=$((FAILURES + 1)); }
check() { # check <description> <actual> <expected>
  if [[ "$2" == "$3" ]]; then pass "$1"; else fail "$1 (expected '$3', got '$2')"; fi
}

cleanup() {
  rm -f "$BODY_FILE"
  if [[ "${KEEP:-0}" == "1" ]]; then
    echo "Smoke stack left running: ${DC[*]} down -v"
  else
    # The images are built for this project only; remove them with it.
    "${DC[@]}" down -v --remove-orphans --rmi local >/dev/null 2>&1
  fi
}
trap cleanup EXIT

# HTTP status of a request made from inside the stack's network; the body goes to $BODY_FILE.
request() {
  local out
  out="$(docker run --rm --network "$NETWORK" "$CURL_IMAGE" -s --max-time 20 -w '\n%{http_code}' "$@")"
  printf '%s' "${out%$'\n'*}" > "$BODY_FILE"
  printf '%s' "${out##*$'\n'}"
}

login() { # login <email> [password]
  request -X POST http://auth:8081/auth/login -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"${2:-$PASSWORD}\"}"
}

json_field() { # json_field <name>: first string or number value of that key in the last response
  grep -o "\"$1\":\"\?[^\",}]*" "$BODY_FILE" | head -1 | sed -E "s/^\"$1\":\"?//"
}

jwt_claim() { # jwt_claim <token> <claim>
  local p
  p="$(printf '%s' "$1" | cut -d. -f2 | tr '_-' '/+')"
  while (( ${#p} % 4 )); do p="$p="; done
  printf '%s' "$p" | base64 -d 2>/dev/null | grep -o "\"$2\":\"[^\"]*\"" | cut -d'"' -f4
}

wait_until() { # wait_until <description> <command...>: retries until the command succeeds
  local deadline=$((SECONDS + WAIT_SECONDS))
  until "${@:2}"; do
    if (( SECONDS > deadline )); then
      echo "  $1 not ready within ${WAIT_SECONDS}s" >&2
      "${DC[@]}" ps >&2
      "${DC[@]}" logs --tail 40 "${SERVICES[@]}" >&2
      return 1
    fi
    sleep 3
  done
}

echo "Starting ${SERVICES[*]} on an empty volume (project $PROJECT)"
"${DC[@]}" down -v --remove-orphans >/dev/null 2>&1
"${DC[@]}" up -d --build "${SERVICES[@]}" || { echo "compose up failed" >&2; exit 1; }
NETWORK="$(docker inspect -f '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{end}}' \
  "$("${DC[@]}" ps -q auth)")"
docker pull -q "$CURL_IMAGE" >/dev/null

if (( RESET_PASSWORDS )); then
  # Same '{bcrypt}' format and cost as auth. up -d returns once db is healthy, i.e. after the seeds ran.
  "${DC[@]}" exec -T db psql -q -U main -d nexttrade -v ON_ERROR_STOP=1 -v pw="$PASSWORD" <<'SQL' \
    || { echo "could not set the smoke password on the seeded users" >&2; exit 1; }
UPDATE users SET password_hash = '{bcrypt}' || crypt(:'pw', gen_salt('bf', 10))
WHERE user_id IN ('a0000000-0000-4000-8000-000000000001',
                  'a0000000-0000-4000-8000-000000000002',
                  'a0000000-0000-4000-8000-000000000003',
                  'a0000000-0000-4000-8000-000000000004');
SQL
fi

novice_login_ok() { [[ "$(login novice@nexttrade.local)" == 200 ]]; }
wait_until "auth" novice_login_ok || exit 1

echo "Logins"
for user in novice:TRADER:NOVICE advanced:TRADER:ADVANCED analyst:ANALYST: ops:OPERATIONS:; do
  IFS=: read -r name role tier <<< "$user"
  check "$name@nexttrade.local logs in" "$(login "$name@nexttrade.local")" 200
  token="$(json_field accessToken)"
  check "$name token has role $role" "$(jwt_claim "$token" user_role)" "$role"
  check "$name token has tier '${tier}'" "$(jwt_claim "$token" trader_level)" "$tier"
  printf -v "TOKEN_${name}" '%s' "$token"
done
check "wrong password is rejected" "$(login novice@nexttrade.local wrong-password)" 401

echo "Portfolios (waits for the first quotes from holdings)"
portfolio() { # portfolio <user id> <token>
  request -H "Authorization: Bearer $2" "http://holdings:8080/api/v1/clients/$1/portfolio-summary"
}
novice_portfolio_ok() { [[ "$(portfolio "$NOVICE_ID" "$TOKEN_novice")" == 200 ]]; }
wait_until "novice portfolio" novice_portfolio_ok || fail "novice portfolio returns 200"

check "novice portfolio returns 200" "$(portfolio "$NOVICE_ID" "$TOKEN_novice")" 200
check "novice has \$10,000 available" "$(json_field availableBalance | sed -E 's/\.0+$//')" 10000
check "novice has 2 holdings" "$(grep -o '"symbol"' "$BODY_FILE" | wc -l | tr -d ' ')" 2

check "advanced portfolio returns 200" "$(portfolio "$ADVANCED_ID" "$TOKEN_advanced")" 200
check "advanced has \$150,000 available" "$(json_field availableBalance | sed -E 's/\.0+$//')" 150000
check "advanced has 5 holdings" "$(grep -o '"symbol"' "$BODY_FILE" | wc -l | tr -d ' ')" 5

if (( FAILURES > 0 )); then
  echo "$FAILURES check(s) failed"
  exit 1
fi
echo "All seeded-login checks passed"
