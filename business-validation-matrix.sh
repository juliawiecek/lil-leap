#!/bin/bash

# Business Validation Matrix Test Script
# Tests 16 scenarios against POST /api/v1/orders
# Captures metrics before/after each request

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
ORDERS_URL="http://10.14.141.133:8082/api/v1"
AUTH_URL="http://10.14.141.133:4200/auth"
DB_HOST="10.14.141.133"
DB_USER="app_user"
DB_PASS="app_password"
DB_NAME="nexttrade"

# Color logging
log_info() { echo -e "${GREEN}✓ $1${NC}"; }
log_warn() { echo -e "${YELLOW}⚠ $1${NC}"; }
log_error() { echo -e "${RED}✗ $1${NC}"; }
log_test() { echo -e "${BLUE}Test $1:${NC} $2"; }

echo -e "${BLUE}==============================================="
echo "   BUSINESS VALIDATION MATRIX - 16 SCENARIOS"
echo "===============================================${NC}"
echo ""

# Get auth token
log_info "Retrieving authentication token..."
LOGIN=$(curl -s -X POST "$AUTH_URL/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"trader-test@example.com","password":"pw-123456789"}')

TOKEN=$(echo "$LOGIN" | jq -r '.accessToken // empty')
TRADER_ID=$(echo "$LOGIN" | jq -r '.user.id // empty')

if [ -z "$TOKEN" ] || [ "$TOKEN" == "null" ]; then
  log_error "Failed to retrieve token"
  echo "Login response: $LOGIN"
  exit 1
fi
log_info "Token obtained: ${TOKEN:0:20}..."

# Get trader account
TRADER_ACCOUNT=$(echo "SELECT account_id FROM public.accounts WHERE user_id = '$TRADER_ID' LIMIT 1;" | \
  PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -t 2>/dev/null | tr -d ' ')
log_info "Trader account: $TRADER_ACCOUNT"

# Get sample instrument (AAPL)
GOOD_INSTRUMENT=$(echo "SELECT instrument_id FROM public.instruments WHERE symbol = 'AAPL' LIMIT 1;" | \
  PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -t 2>/dev/null | tr -d ' ')
log_info "Good instrument: $GOOD_INSTRUMENT"

# Get disabled instrument
DISABLED_INSTRUMENT=$(echo "SELECT instrument_id FROM public.instruments WHERE enabled = false LIMIT 1;" | \
  PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -t 2>/dev/null | tr -d ' ')
log_info "Disabled instrument: $DISABLED_INSTRUMENT"

# Get halted instrument
HALTED_INSTRUMENT=$(echo "SELECT instrument_id FROM public.instruments WHERE tradable = false LIMIT 1;" | \
  PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -t 2>/dev/null | tr -d ' ')
log_info "Halted instrument: $HALTED_INSTRUMENT"

# Get inactive account
INACTIVE_ACCOUNT=$(echo "SELECT account_id FROM public.accounts WHERE account_status = 'CLOSED' LIMIT 1;" | \
  PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -t 2>/dev/null | tr -d ' ')
log_info "Inactive account: $INACTIVE_ACCOUNT"

# Get account with trading disabled
NO_TRADING_ACCOUNT=$(echo "SELECT account_id FROM public.accounts WHERE trading_enabled = false LIMIT 1;" | \
  PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -t 2>/dev/null | tr -d ' ')
log_info "No trading account: $NO_TRADING_ACCOUNT"

# Foreign account (different user)
OTHER_USER_ID=$(echo "SELECT user_id FROM public.users WHERE email != 'trader-test@example.com' LIMIT 1;" | \
  PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -t 2>/dev/null | tr -d ' ')
FOREIGN_ACCOUNT=$(echo "SELECT account_id FROM public.accounts WHERE user_id = '$OTHER_USER_ID' LIMIT 1;" | \
  PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -t 2>/dev/null | tr -d ' ')
log_info "Foreign account: $FOREIGN_ACCOUNT"

# Get database metrics function
db_metrics() {
  echo "SELECT 
    (SELECT COUNT(*) FROM orders) as orders,
    (SELECT COUNT(*) FROM order_status_history) as status_history,
    (SELECT COUNT(*) FROM fills) as fills,
    (SELECT COUNT(*) FROM cash_transactions) as cash_transactions,
    (SELECT COUNT(*) FROM holding_movements) as holding_movements;" | \
  PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -t 2>/dev/null | xargs
}

# Test execution function
run_test() {
  local test_num=$1
  local description=$2
  local method=$3
  local request_body=$4
  local expected_status=$5
  local expected_reason=$6
  
  log_test "$test_num" "$description"
  
  # Capture metrics before
  metrics_before=$(db_metrics)
  orders_before=$(echo $metrics_before | awk '{print $1}')
  status_history_before=$(echo $metrics_before | awk '{print $2}')
  fills_before=$(echo $metrics_before | awk '{print $3}')
  cash_txn_before=$(echo $metrics_before | awk '{print $4}')
  holdings_before=$(echo $metrics_before | awk '{print $5}')
  
  # Execute request
  response=$(curl -s -w '\n%{http_code}' -X POST "$ORDERS_URL/orders" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "$request_body")
  
  http_status=$(echo "$response" | tail -1)
  body=$(echo "$response" | sed '$d')
  
  # Capture metrics after
  metrics_after=$(db_metrics)
  orders_after=$(echo $metrics_after | awk '{print $1}')
  status_history_after=$(echo $metrics_after | awk '{print $2}')
  fills_after=$(echo $metrics_after | awk '{print $3}')
  cash_txn_after=$(echo $metrics_after | awk '{print $4}')
  holdings_after=$(echo $metrics_after | awk '{print $5}')
  
  # Extract response data
  reason_code=$(echo "$body" | jq -r '.error // .reasonCode // "null"' 2>/dev/null)
  order_id=$(echo "$body" | jq -r '.orderId // "null"' 2>/dev/null)
  
  # Determine pass/fail
  status_ok="❌"
  if [ "$http_status" == "$expected_status" ]; then
    status_ok="✓"
    if [ -n "$expected_reason" ] && [ "$expected_reason" != "null" ]; then
      if [ "$reason_code" == "$expected_reason" ]; then
        status_ok="✓✓"
      fi
    fi
  fi
  
  echo "  HTTP Status: $http_status (expected: $expected_status) $status_ok"
  echo "  Reason Code: $reason_code (expected: $expected_reason)"
  echo "  Order ID: $order_id"
  echo "  Metrics Changed:"
  echo "    Orders: $orders_before → $orders_after (Δ $(( orders_after - orders_before )))"
  echo "    StatusHistory: $status_history_before → $status_history_after (Δ $(( status_history_after - status_history_before )))"
  echo "    Fills: $fills_before → $fills_after (Δ $(( fills_after - fills_before )))"
  echo "    CashTransactions: $cash_txn_before → $cash_txn_after (Δ $(( cash_txn_after - cash_txn_before )))"
  echo "    HoldingMovements: $holdings_before → $holdings_after (Δ $(( holdings_after - holdings_before )))"
  echo ""
}

# Test 1: Valid BUY order
run_test 1 "Valid BUY with sufficient funds" "POST" \
  "{\"accountId\":\"$TRADER_ACCOUNT\",\"instrumentId\":\"$GOOD_INSTRUMENT\",\"side\":\"BUY\",\"quantity\":10}" \
  "201" "null"

# Test 2: Valid SELL order  
run_test 2 "Valid SELL with sufficient holdings" "POST" \
  "{\"accountId\":\"$TRADER_ACCOUNT\",\"instrumentId\":\"$GOOD_INSTRUMENT\",\"side\":\"SELL\",\"quantity\":5}" \
  "201" "null"

# Test 3: Foreign account (not owner)
run_test 3 "Foreign account access denied" "POST" \
  "{\"accountId\":\"$FOREIGN_ACCOUNT\",\"instrumentId\":\"$GOOD_INSTRUMENT\",\"side\":\"BUY\",\"quantity\":1}" \
  "403" "ACCOUNT_NOT_FOUND"

# Test 4: Inactive account
run_test 4 "Inactive account rejected" "POST" \
  "{\"accountId\":\"$INACTIVE_ACCOUNT\",\"instrumentId\":\"$GOOD_INSTRUMENT\",\"side\":\"BUY\",\"quantity\":1}" \
  "422" "ACCOUNT_NOT_FOUND"

# Test 5: Trading disabled
run_test 5 "Account with trading disabled" "POST" \
  "{\"accountId\":\"$NO_TRADING_ACCOUNT\",\"instrumentId\":\"$GOOD_INSTRUMENT\",\"side\":\"BUY\",\"quantity\":1}" \
  "422" "TRADING_DISABLED"

# Test 6: Unknown instrument
run_test 6 "Unknown instrument not found" "POST" \
  "{\"accountId\":\"$TRADER_ACCOUNT\",\"instrumentId\":\"00000000-0000-0000-0000-000000000000\",\"side\":\"BUY\",\"quantity\":1}" \
  "422" "INSTRUMENT_NOT_FOUND"

# Test 7: Disabled instrument (enabled=false)
run_test 7 "Disabled instrument (enabled=false)" "POST" \
  "{\"accountId\":\"$TRADER_ACCOUNT\",\"instrumentId\":\"$DISABLED_INSTRUMENT\",\"side\":\"BUY\",\"quantity\":1}" \
  "422" "INSTRUMENT_DISABLED"

# Test 8: Not tradable instrument (tradable=false)
run_test 8 "Not tradable instrument (tradable=false)" "POST" \
  "{\"accountId\":\"$TRADER_ACCOUNT\",\"instrumentId\":\"$HALTED_INSTRUMENT\",\"side\":\"BUY\",\"quantity\":1}" \
  "422" "INSTRUMENT_NOT_TRADABLE"

# Test 9: Insufficient cash for BUY
run_test 9 "Insufficient cash balance" "POST" \
  "{\"accountId\":\"$TRADER_ACCOUNT\",\"instrumentId\":\"$GOOD_INSTRUMENT\",\"side\":\"BUY\",\"quantity\":10000}" \
  "422" "INSUFFICIENT_CASH"

# Test 10: Insufficient holdings for SELL
run_test 10 "Insufficient holdings for SELL" "POST" \
  "{\"accountId\":\"$TRADER_ACCOUNT\",\"instrumentId\":\"$GOOD_INSTRUMENT\",\"side\":\"SELL\",\"quantity\":10000}" \
  "422" "INSUFFICIENT_HOLDINGS"

# Test 11: Missing quote
# This would require removing quotes from the database, skipping for now

# Test 12: Zero quantity
run_test 12 "Zero quantity rejected" "POST" \
  "{\"accountId\":\"$TRADER_ACCOUNT\",\"instrumentId\":\"$GOOD_INSTRUMENT\",\"side\":\"BUY\",\"quantity\":0}" \
  "400" "null"

# Test 13: Negative quantity
run_test 13 "Negative quantity rejected" "POST" \
  "{\"accountId\":\"$TRADER_ACCOUNT\",\"instrumentId\":\"$GOOD_INSTRUMENT\",\"side\":\"BUY\",\"quantity\":-5}" \
  "400" "null"

# Test 14: Idempotent retry (same clientReference)
IDEMPOTENT_KEY=$(uuidgen)
run_test 14 "Idempotent retry - first request" "POST" \
  "{\"accountId\":\"$TRADER_ACCOUNT\",\"instrumentId\":\"$GOOD_INSTRUMENT\",\"side\":\"BUY\",\"quantity\":1,\"clientReference\":\"$IDEMPOTENT_KEY\"}" \
  "201" "null"

run_test 14 "Idempotent retry - second request (same key)" "POST" \
  "{\"accountId\":\"$TRADER_ACCOUNT\",\"instrumentId\":\"$GOOD_INSTRUMENT\",\"side\":\"BUY\",\"quantity\":1,\"clientReference\":\"$IDEMPOTENT_KEY\"}" \
  "201" "null"

# Test 15: Changed payload with same clientReference
run_test 15 "Changed payload, same clientReference" "POST" \
  "{\"accountId\":\"$TRADER_ACCOUNT\",\"instrumentId\":\"$GOOD_INSTRUMENT\",\"side\":\"SELL\",\"quantity\":2,\"clientReference\":\"$IDEMPOTENT_KEY\"}" \
  "409" "IDEMPOTENCY_CONFLICT"

# Test 16: Concurrent identical retry (would need async execution, skipping for now)

echo -e "${BLUE}==============================================="
echo "   VALIDATION MATRIX COMPLETE"
echo "===============================================${NC}"
