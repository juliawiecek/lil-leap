# NextTrade Must MVP Golden Path Audit

**Date:** October 1, 2026  
**Scope:** Barebones Must MVP - Ages 21+, US Residents, AAPL/MSFT/NVDA/AMZN/GOOGL, USD Cash, Whole Shares, MARKET BUY/SELL, Synthetic Quotes  
**Audit Focus:** Complete order lifecycle from login to audit trail reconstruction  

---

## Executive Summary

**Status:** ❌ **BROKEN AT CRITICAL INTEGRATION BOUNDARY**

The golden path flow **STOPS at frontend order submission**. The frontend never sends orders to the backend; instead, it performs mock order updates entirely in-memory. Consequently, no execution, settlement, holdings/cash updates, audit trail, or order history persistence occurs.

**First Broken Boundary:** Frontend order submission component → Backend OrderController  
**Impact:** Order lifecycle is incomplete; most post-submission steps (execution, settlement, audit) are unreachable in current deployed state.

**Working Components:**
- ✅ Login/authentication (JWT issuance and refresh)
- ✅ Quote display (polling from synthetic quote service)
- ✅ Order history retrieval (queries persisted data)
- ✅ Audit event schema and writers (code exists, not reached)
- ✅ Order execution service (code exists, scheduler not triggered by frontend orders)
- ✅ Settlement atomicity (code exists, fill creation never called)
- ✅ Holdings/cash ledger (triggers exist, never populated by fills)

**Broken Components:**
- ❌ Order submission (frontend never calls backend)
- ❌ Holdings display (frontend shows hardcoded data)
- ❌ Cash balance display (frontend shows hardcoded data)

---

## Step-by-Step Audit: Golden Path Trace

### Step 1: LOGIN ✅ COMPLETE

**Flow:**
1. **Frontend:** [frontend/src/app/auth-api.ts#L75-L81](frontend/src/app/auth-api.ts#L75-L81)
   - `AuthClient.login(email, password)` POSTs to `POST /auth/login`
   - No nginx route needed (direct to auth:3000)

2. **Nginx Route:** [frontend/nginx.conf#L50-57](frontend/nginx.conf#L50-57)
   - `/auth/` → `http://auth:3000`
   - ✅ Correct

3. **Backend Endpoint:** [auth/src/user/auth.controller.ts#L74-90](auth/src/user/auth.controller.ts#L74-90)
   - NestJS `AuthController.login(LoginRequestDto)`
   - Returns: `{accessToken, refreshToken, user: {id, email, userRole}}`

4. **Database Read:**
   - `users` table (password_hash lookup)
   - `financial_profiles` table (trader_level for token claim)
   - `accounts` table (account count for tier assignment)

5. **JWT Claims:**
   - `sub`: user_id (UUID)
   - `email`: email address
   - `trader_level`: NOVICE or ADVANCED
   - `user_role`: TRADER or ANALYST

6. **Token Storage:** [frontend/src/app/auth-api.ts#L130](frontend/src/app/auth-api.ts#L130)
   - Memory only (never localStorage)
   - Session survives page refresh via `session-keeper.ts`

7. **Tests:** [auth/test/auth.e2e-spec.ts#L63-L78](auth/test/auth.e2e-spec.ts#L63-L78)
   - ✅ Login tests pass

**Status:** ✅ **COMPLETE** - User authenticated with JWT containing user_id, email, trader_level, user_role

---

### Step 2: BROWSE INSTRUMENTS & DISPLAY CURRENT QUOTE ✅ COMPLETE

**Flow:**
1. **Frontend Component:** [frontend/src/app/quote-display.component.ts#L283-L330](frontend/src/app/quote-display.component.ts#L283-L330)
   - Polls quote-service every N milliseconds
   - Displays bid, ask, midpoint, last trade

2. **Frontend Service:** [frontend/src/app/quote.service.ts#L40-L50](frontend/src/app/quote.service.ts#L40-L50)
   - `QuoteService.getLatestByInstrument(instrumentId)` → `GET /api/quotes/latest/by-instrument/{instrumentId}`
   - Returns: `{bid, ask, midpoint, source, synthetic, quotedAt}`

3. **Nginx Route:** [frontend/nginx.conf#L9-L17](frontend/nginx.conf#L9-L17)
   - `/api/quotes/` → rewrite to `/api/v1/quotes/` → `http://insights:8080`
   - ✅ Correct

4. **Backend Endpoint:** insights service `QuoteController.getLatestByInstrument(instrumentId)`
   - Path: `/api/v1/quotes/latest/by-instrument/{instrumentId}`
   - Returns latest quote per instrument from `quotes` table

5. **Database Read:**
   - `quotes` table with index `idx_quotes_instrument_latest` (instrument_id, quoted_at DESC)
   - Ensures fresh data from synthetic quote pipeline

6. **Quote Properties:**
   - `bid`, `ask` (NUMERIC 18,8)
   - `bid_size`, `ask_size` (BIGINT, number of shares)
   - `quoted_at` (TIMESTAMPTZ, non-stale check for execution)
   - `source` VARCHAR (e.g., 'SYNTHETIC_GBM')
   - `is_synthetic` BOOLEAN TRUE for MVP

7. **Display:** [frontend/src/app/quote-display.component.ts#L29-L95](frontend/src/app/quote-display.component.ts#L29-L95)
   - Shows AAPL, MSFT, NVDA, AMZN, GOOGL
   - Indicates whether quote is synthetic
   - Polls every 5-10 seconds (configurable)

8. **Tests:**
   - [frontend/tests/quote.service.test.mjs](frontend/tests/quote.service.test.mjs)
   - ✅ Quote polling tests pass

**Status:** ✅ **COMPLETE** - Displays current synthetic quotes; execution service fetches fresh quotes independently

---

### Step 3: FRONTEND SUBMITS ORDER ❌ BROKEN

**Flow:**
1. **Frontend Component:** [frontend/src/app/advanced-dashboard.ts#L339-L416](frontend/src/app/advanced-dashboard.ts#L339-L416)
   - Order submission form: [frontend/src/app/advanced-ticket.html](frontend/src/app/advanced-ticket.html)
   - Inputs: Side (BUY/SELL), Symbol, Quantity, Order Type (MARKET), Limit Price (if limit)
   - Form submit calls: `desk().reviewOrder()` → `desk().confirmOrder()`

2. **Frontend Service:** ❌ **DOES NOT EXIST**
   - No `OrderSubmissionClient` class
   - No `order-submission-api.ts` file
   - No HTTP POST call to backend

3. **Current Implementation:** [frontend/src/app/advanced-dashboard.ts#L346-L416](frontend/src/app/advanced-dashboard.ts#L346-L416)
   ```typescript
   confirmOrder(): void {
     // Creates Order object locally only
     const order = {
       id: Date.now(),
       symbol: this.selected().symbol,
       side: this.side(),
       quantity: this.qty(),
       price: this.price(),
       orderType: 'MARKET',
       status: 'SUBMITTED'
     };
     
     // Updates local signals only - NO fetch() call
     this.buyingPower.update((v) => v - cost);
     this.portfolio.update((v) => v - cost);
     this.positions.update((list) => [...list, newPosition]);
     this.orders.update((list) => [order, ...list]);
   }
   ```
   - ❌ No HTTP request
   - ❌ No backend persistence
   - ❌ No account validation
   - ❌ No instrument eligibility check
   - ❌ No cash/holdings sufficiency check
   - ❌ No audit event creation

4. **Expected Backend Endpoint:** [nextTrade-orders/src/main/java/com/neueda/leap/order/controller/OrderController.java#L48](nextTrade-orders/src/main/java/com/neueda/leap/order/controller/OrderController.java#L48)
   - `POST /orders` (or `/api/orders` through nginx)
   - Request body: `SubmitOrderRequest { accountId, instrumentId, side, quantity, clientReference }`
   - Response: `OrderSubmissionResponse { orderId, clientReference, status }`
   - Authorization: `@PreAuthorize("hasRole('TRADER')")`

5. **Nginx Route:** [frontend/nginx.conf#L19-L27](frontend/nginx.conf#L19-L27)
   - `/api/orders/` → rewrite to `/api/v1/` → `http://orders:8080`
   - ✅ Route exists but never called by frontend

6. **Backend Service:** [nextTrade-orders/src/main/java/com/neueda/leap/order/service/OrderSubmissionService.java#L97-L150](nextTrade-orders/src/main/java/com/neueda/leap/order/service/OrderSubmissionService.java#L97-L150)
   - ✅ Full validation pipeline implemented:
     1. Account ownership check
     2. Account status validation (must be ACTIVE)
     3. Instrument lookup and tradability check
     4. Cash/holdings sufficiency check
     5. Idempotent persistence via `clientReference` UUID
   - ✅ Audit event `ORDER_ACCEPTED` written in same transaction
   - But: **Never called from frontend**

7. **Database Write (Not Reached):**
   - `orders` table INSERT with status='PENDING', accepted_at=NOW
   - `order_status_history` table INSERT (ORDER_ACCEPTED status)
   - `audit_log` table INSERT (ORDER_ACCEPTED event)

8. **Tests:** [nextTrade-orders/src/test/java/com/neueda/leap/order/service/OrderSubmissionServiceTest.java](nextTrade-orders/src/test/java/com/neueda/leap/order/service/OrderSubmissionServiceTest.java)
   - ✅ Tests pass (tests call service directly, not via frontend)

**Status:** ❌ **BROKEN AT CRITICAL BOUNDARY**
- **Location:** Between [frontend/src/app/advanced-dashboard.ts](frontend/src/app/advanced-dashboard.ts) and [nextTrade-orders/src/main/java/com/neueda/leap/order/controller/OrderController.java](nextTrade-orders/src/main/java/com/neueda/leap/order/controller/OrderController.java)
- **Issue:** Frontend never sends HTTP POST to backend
- **Impact:** No orders persisted, no execution, no settlement, no audit trail

**Fix Required:** Add `OrderSubmissionClient` class in frontend that POSTs to `/api/orders` with request body

---

### Step 4: ORDER EXECUTION (WORKER) ❌ UNREACHABLE

**Flow:** (Diagram assumes Step 3 completes, but it doesn't)

1. **Scheduler:** [nextTrade-orders/src/main/java/com/neueda/leap/order/service/OrderExecutionScheduler.java](nextTrade-orders/src/main/java/com/neueda/leap/order/service/OrderExecutionScheduler.java)
   - Periodic job (cron configured in `application.yml`)
   - Runs: `executeAllDueOrders()` every N seconds
   - Finds orders with `status IN ('ACCEPTED', 'PENDING') AND next_execution_at <= NOW`

2. **Per-Order Execution:** [nextTrade-orders/src/main/java/com/neueda/leap/order/service/OrderExecutionService.java#L92-L150](nextTrade-orders/src/main/java/com/neueda/leap/order/service/OrderExecutionService.java#L92-L150)
   - Called through Spring proxy (`this.self.executeOrder(order)` to ensure @Transactional applies)
   - Fetches FRESH quote from PostgreSQL: `quoteRepository.findLatestByInstrumentId(instrumentId)`
   - ❌ **NOT cache** - reads latest quote from `quotes` table directly

3. **Fresh Quote Fetch:** [nextTrade-orders/src/main/java/com/neueda/leap/order/service/OrderExecutionService.java#L113-L120](nextTrade-orders/src/main/java/com/neueda/leap/order/service/OrderExecutionService.java#L113-L120)
   - `quoteRepository.findLatestByInstrumentId(instrumentId)`
   - Reads: `SELECT * FROM quotes WHERE instrument_id = ? ORDER BY quoted_at DESC LIMIT 1`
   - Index: `idx_quotes_instrument_latest` (instrument_id, quoted_at DESC) ensures O(1) access
   - **Time-stamped evidence:** Proves quote is fresh at execution time

4. **Quote Staleness Check:** [nextTrade-orders/src/main/java/com/neueda/leap/order/service/OrderExecutionService.java#L121-L125](nextTrade-orders/src/main/java/com/neueda/leap/order/service/OrderExecutionService.java#L121-L125)
   - `clock.instant()` vs quote `quotedAt`
   - If older than `orders.execution.max-quote-age-seconds` (default 60s, configured in `application.yml`):
     - Defer execution 5 seconds without incrementing tolerance failure count
     - Retry on next scheduler run

5. **Price Selection Logic (CRITICAL):** [nextTrade-orders/src/main/java/com/neueda/leap/order/service/OrderExecutionService.java#L127-L140](nextTrade-orders/src/main/java/com/neueda/leap/order/service/OrderExecutionService.java#L127-L140)
   - **BUY orders:** Use `quote.ask` (customer pays the ask)
   - **SELL orders:** Use `quote.bid` (customer receives the bid)
   - **Tolerance check:** Price must be within buffer (order.bufferPercent or account.executionBufferPercent, default 2%)
     - Midpoint formula: `(bid + ask) / 2`
     - Buy tolerance: `ask <= midpoint * (1 + buffer%)`
     - Sell tolerance: `bid >= midpoint * (1 - buffer%)`

6. **Price Out-of-Tolerance Handling:** [nextTrade-orders/src/main/java/com/neueda/leap/order/service/OrderExecutionService.java#L142-L144](nextTrade-orders/src/main/java/com/neueda/leap/order/service/OrderExecutionService.java#L142-L144)
   - Capped exponential backoff: retry after 1s, 2s, 4s, 8s, ... (max 10 attempts)
   - After 10 tolerance failures: Set status=REJECTED, reason="PRICE_OUT_OF_TOLERANCE"

7. **Audit: Price Decision:** [nextTrade-orders/src/main/java/com/neueda/leap/order/service/AuditEventWriter.java#L91-L100](nextTrade-orders/src/main/java/com/neueda/leap/order/service/AuditEventWriter.java#L91-L100)
   - Event type: `PRICE_DECISION`
   - Payload: `{ quoteId, bid, ask, selectedPrice, freshness, synthetic }`
   - Multiple events allowed (one per retry)
   - Written in same transaction as fill (if filled)

8. **Database Read:**
   - `orders` table (find due)
   - `quotes` table (latest quote, NOT cache)
   - `accounts` table (buffer percent override)

9. **Status:** ❌ **UNREACHABLE**
   - No orders in database to execute
   - Frontend Step 3 failure prevents any orders reaching the scheduler
   - Code is complete and tested, but has no work to do

**Tests:** [nextTrade-orders/src/test/java/com/neueda/leap/order/service/OrderExecutionServiceTest.java](nextTrade-orders/src/test/java/com/neueda/leap/order/service/OrderExecutionServiceTest.java)
- ✅ Tests pass (tests create mock orders directly)
- Quote freshness, tolerance logic, BUY/SELL pricing, retry logic all verified

---

### Step 5: FILL & ATOMIC SETTLEMENT ❌ UNREACHABLE

**Flow:** (Assumes Step 4 completes, which it doesn't)

1. **Fill Execution:** [nextTrade-orders/src/main/java/com/neueda/leap/order/service/OrderExecutionService.java#L150-L170](nextTrade-orders/src/main/java/com/neueda/leap/order/service/OrderExecutionService.java#L150-L170)
   - `executeFill(order, currentQuote, executionPrice)` [L150]
   - Idempotency: Check if fill already exists (UNIQUE constraint on order_id)
   - If exists, skip (prevents duplicate settlement on retry)

2. **Fill Entity Creation:**
   - `Fill { fillId, orderId, filledQuantity, executionPrice, quoteTimestamp }`
   - `quoteTimestamp` proves quote was current at execution time (non-stale evidence)

3. **Holdings Ledger Entry:** [nextTrade-orders/src/main/java/com/neueda/leap/order/service/OrderExecutionService.java#L165-L170](nextTrade-orders/src/main/java/com/neueda/leap/order/service/OrderExecutionService.java#L165-L170)
   - `HoldingMovement { movementId, accountId, instrumentId, fillId, quantity_change, cost_basis, movement_type }`
   - `quantity_change`: +100 for BUY, -50 for SELL (signed)
   - `cost_basis`: execution price (used for average cost calculation)
   - `movement_type`: 'BUY' or 'SELL'

4. **Cash Ledger Entry:** [nextTrade-orders/src/main/java/com/neueda/leap/order/service/OrderExecutionService.java#L171-L176](nextTrade-orders/src/main/java/com/neueda/leap/order/service/OrderExecutionService.java#L171-L176)
   - `CashTransaction { transactionId, accountId, fillId, transaction_type, amount, settlement_status }`
   - `amount`: Signed negative for BUY (cost), positive for SELL (proceeds)
   - `settlement_status`: 'SETTLED' or 'PENDING'
   - Calculation: `amount = executionPrice * quantity * (transaction_type == 'BUY' ? -1 : 1)`

5. **Holdings Cache Update:** [db/finalized-schema.sql#L604-L610](db/finalized-schema.sql#L604-L610)
   - **PostgreSQL TRIGGER** `project_holding_movement()` fires AFTER INSERT on `holding_movements`
   - Calls function `apply_holding_change(p_account, p_instrument, p_quantity, p_cost)`
   - **Upsert with atomic lock:** `INSERT INTO holdings ... ON CONFLICT DO UPDATE`
   - Serializes concurrent writers on same (account_id, instrument_id)
   - Recalculates average cost: `(old_qty * old_cost + new_qty * new_cost) / total_qty`
   - Negative balance fails entire transaction (constraint violation)

6. **Cash Balance Cache Update:** [db/finalized-schema.sql](db/finalized-schema.sql) (similar pattern)
   - **PostgreSQL TRIGGER** on `cash_transactions` INSERT
   - Upserts `cash_balances` table with sum of all settled transactions
   - Negative balance constraint: `CONSTRAINT chk_cash_balance CHECK (balance >= 0)`
   - Fails entire transaction if cash would go negative

7. **Order Status Update:**
   - Update `orders.status = 'FILLED'`
   - Update `orders.updated_at = NOW()`

8. **Order Status History:**
   - Insert row into `order_status_history` with status='FILLED', occurred_at=NOW

9. **Atomic Consistency:**
   - All writes in single `@Transactional` block
   - Either: fills table, holding_movements, cash_transactions, holdings cache, cash_balances cache, orders status, order_status_history, audit_log
   - OR: All roll back together on any constraint violation or service error
   - No partial fills

10. **Audit: Order Filled:** [nextTrade-orders/src/main/java/com/neueda/leap/order/service/AuditEventWriter.java#L108-L117](nextTrade-orders/src/main/java/com/neueda/leap/order/service/AuditEventWriter.java#L108-L117)
    - Event type: `ORDER_FILLED`
    - Payload: `{ fillId, executionPrice, quantity, quoteTimestamp, transactionId }`
    - Idempotency check: `hasTerminalEventForOrder()` prevents duplicates on retry
    - Written in same transaction as fill

11. **Database Write:**
    - `fills` table INSERT
    - `holding_movements` table INSERT
    - `cash_transactions` table INSERT
    - `holdings` table UPSERT (via trigger)
    - `cash_balances` table UPDATE (via trigger)
    - `orders` table UPDATE (status, updated_at)
    - `order_status_history` table INSERT
    - `audit_log` table INSERT (ORDER_FILLED event)

12. **Status:** ❌ **UNREACHABLE**
    - No orders reach execution service
    - Code complete and tested, but no work to do

**Tests:** [nextTrade-orders/src/test/java/com/neueda/leap/order/service/OrderExecutionServiceTest.java](nextTrade-orders/src/test/java/com/neueda/leap/order/service/OrderExecutionServiceTest.java)
- ✅ Settlement atomicity, ledger consistency, idempotent fill, audit event creation all tested

---

### Step 6: HOLDINGS UPDATE ❌ UNREACHABLE

**Flow:** (Assumes Step 5 completes)

1. **Trigger Function:** [db/finalized-schema.sql#L604-L610](db/finalized-schema.sql#L604-L610)
   - **PostgreSQL TRIGGER** `project_holding_movement()` AFTER INSERT on `holding_movements`
   - Atomic upsert: `INSERT INTO holdings (account_id, instrument_id, quantity, avg_cost, updated_at) VALUES (...) ON CONFLICT (account_id, instrument_id) DO UPDATE SET ...`
   - Row-level lock serializes concurrent writers
   - Recalculates average cost basis

2. **Holdings Table Schema:**
   - `holdings (account_id UUID, instrument_id UUID, quantity BIGINT, avg_cost NUMERIC(18,8), updated_at TIMESTAMPTZ)`
   - PK: (account_id, instrument_id)
   - No negative quantities: `CONSTRAINT chk_holding_quantity CHECK (quantity >= 0)`

3. **Average Cost Calculation:** [db/finalized-schema.sql#L565-L569](db/finalized-schema.sql#L565-L569)
   - Formula: `(old_qty * old_cost + new_qty * new_cost) / (old_qty + new_qty)`
   - For BUY: Update cost basis to new weighted average
   - For SELL: Retain current average cost (FIFO/average-cost method)

4. **Cache vs. Ledger:**
   - **Source of truth:** `holding_movements` ledger (append-only)
   - **Cache:** `holdings` table (computed projection)
   - Can reconstruct from ledger anytime (BR-15: Full lifecycle replay)

5. **Status:** ❌ **UNREACHABLE**
   - No fills created (Step 5 never reached)
   - Trigger exists and tested, but no INSERT events

**Tests:**
- Schema trigger tests verify holdings update behavior
- OrderExecutionServiceTest validates holdings consistency post-fill

---

### Step 7: CASH UPDATE ❌ UNREACHABLE

**Flow:** (Assumes Step 5 completes)

1. **Cash Ledger:** `cash_transactions` table
   - Schema: `{ transactionId, accountId, fillId, transactionType, amount, settlementStatus, createdAt }`
   - One INSERT per fill in Step 5
   - Amount signed: negative for BUY (cost debit), positive for SELL (proceeds credit)

2. **Cash Cache:** `cash_balances` table
   - Schema: `{ accountId, currency (CHAR(3)), balance NUMERIC(18,2), updatedAt }`
   - Computed as SUM of all `cash_transactions WHERE settlementStatus='SETTLED'` per account

3. **Trigger Update:** Similar to holdings
   - AFTER INSERT trigger on `cash_transactions` → updates `cash_balances`
   - Negative balance constraint fails transaction: `CONSTRAINT chk_cash_balance CHECK (balance >= 0)`

4. **View Alternative:** [db/finalized-schema.sql#L730](db/finalized-schema.sql#L730)
   - View `v_account_cash` computes settled_balance, pending_balance, available_balance on-demand from ledger

5. **Settlement Status:**
   - `TS-11.3 AC2`: Distinguishes settled vs. pending cash
   - MVP: All fills settle immediately (settlement_status='SETTLED')

6. **Status:** ❌ **UNREACHABLE**
   - No fills created (Step 5 never reached)
   - Code complete, schema ready, trigger exists

---

### Step 8: HOLDINGS RETURNED TO FRONTEND ❌ BROKEN

**Flow:** (Assumes order is filled and holdings updated in database)

1. **Frontend Component:** [frontend/src/app/novice-dashboard.ts#L55-L95](frontend/src/app/novice-dashboard.ts#L55-L95) & [advanced-dashboard.ts#L150-L166](frontend/src/app/advanced-dashboard.ts#L150-L166)
   - Displays holdings array in UI
   - Current implementation: **Hardcoded signal**
   - ```typescript
     holdings = signal<Holding[]>([
       { symbol: 'AAPL', shares: 100, price: 228.50, value: 22_850 },
       { symbol: 'MSFT', shares: 50, price: 416.31, value: 20_815.50 },
       // ... more hardcoded holdings
     ]);
     ```
   - ❌ Never fetches from backend

2. **Expected Frontend Service:** ❌ **DOES NOT EXIST**
   - No `HoldingsClient` class
   - No `holdings-api.ts` file
   - Should call: `GET /api/holdings/clients/{userId}/holdings`

3. **Backend Endpoint:** [insights/src/main/java/com/neueda/leap/portfolio/controller/ClientFinancialController.java#L51-L65](insights/src/main/java/com/neueda/leap/portfolio/controller/ClientFinancialController.java#L51-L65)
   - ✅ Implemented at `/api/v1/holdings` (or `/api/v1/clients/{id}/holdings`)
   - Returns: `List<HoldingResponse> { symbol, quantity, avgCost, currentPrice, totalValue }`
   - Reads from `holdings` cache table
   - Requires JWT Bearer token

4. **Nginx Route Issue:** ⚠️ **ROUTING MISMATCH**
   - Current: [frontend/nginx.conf#L29-L37](frontend/nginx.conf#L29-L37)
     ```
     location /api/holdings/ {
         rewrite ^/api/holdings/(.*)$ /$1 break;
         proxy_pass http://holdings:8080;  // ← WRONG SERVICE
     }
     ```
   - Problem: Routes to `holdings:8080` (nextTrade-holdings, the registration/onboarding service)
   - Correct: Should route to `insights:8080` (which has ClientFinancialController)
   - Current routing would send `/api/holdings/clients/{id}/holdings` to the wrong service
   - Fix: Change to route to `insights:8080` like quotes do

5. **Database Read:**
   - `holdings` table (account_id, instrument_id, quantity, avg_cost, updated_at)
   - `instruments` table (symbol, enabled)

6. **Status:** ❌ **BROKEN** (two issues)
   - **Issue 1:** Frontend never calls holdings API
   - **Issue 2:** Nginx routing to wrong service (if frontend did call it)

**Fix Required:**
1. Create `HoldingsClient` in frontend to fetch `/api/holdings`
2. Fix nginx to route `/api/holdings/` to insights service, not holdings service
3. Update dashboard components to fetch and display actual holdings

---

### Step 9: CASH RETURNED TO FRONTEND ❌ BROKEN

**Flow:** (Assumes cash is updated in database)

1. **Frontend Component:** [frontend/src/app/novice-dashboard.ts#L52-L56](frontend/src/app/novice-dashboard.ts#L52-L56) & [advanced-dashboard.ts#L150](frontend/src/app/advanced-dashboard.ts#L150)
   - Displays cash balance, buying power, portfolio value
   - Current implementation: **Hardcoded signals**
   - ```typescript
     buyingPower = signal(6_420.18);
     portfolioValue = signal(24_680.42);
     invested = signal(18_260.24);
     ```
   - ❌ Never fetches from backend

2. **Expected Frontend Service:** ❌ **DOES NOT EXIST**
   - No `CashClient` class
   - No `cash-api.ts` file
   - Should call: `GET /api/clients/{userId}/cash` or `/api/orders/clients/{userId}/cash`

3. **Backend Endpoints (Two Options):**
   - **Option A - Orders Service:** [nextTrade-orders/src/main/java/com/neueda/leap/order/controller/CashController.java#L48-L60](nextTrade-orders/src/main/java/com/neueda/leap/order/controller/CashController.java#L48-L60)
     - `GET /clients/{id}/cash`
     - Returns: `List<CashBalanceResponse>`
   - **Option B - Insights Service:** [insights/src/main/java/com/neueda/leap/portfolio/controller/ClientFinancialController.java#L89-L102](insights/src/main/java/com/neueda/leap/portfolio/controller/ClientFinancialController.java#L89-L102)
     - `GET /api/v1/cash` or `/api/v1/clients/{id}/cash-balance` (TS-11.3 AC1)
     - Returns: `List<CashBalanceResponse> { currency, balance, available, pending }`

4. **Nginx Route:** [frontend/nginx.conf#L43-L47](frontend/nginx.conf#L43-L47)
   - `/api/` (fallback) → `http://orders:8080`
   - Route exists for orders service endpoint
   - ✅ Could work if frontend calls `/api/clients/{id}/cash`
   - But frontend doesn't call any endpoint

5. **Database Read:**
   - `cash_balances` table (account_id, currency, balance, updated_at)
   - Or view `v_account_cash` for breakdown (settled, pending, available)

6. **Status:** ❌ **BROKEN**
   - Frontend never calls cash API
   - No service/client in frontend to fetch cash

**Fix Required:**
1. Create `CashClient` in frontend to fetch `/api/clients/{id}/cash` from orders service
2. Update dashboard components to fetch and display actual cash balance
3. Alternatively, use portfolio summary endpoint from insights service (TS-11.3 AC1)

---

### Step 10: ORDER HISTORY RETURNED ✅ COMPLETE

**Flow:**

1. **Frontend Component:** [frontend/src/app/order-history.ts#L1-L70](frontend/src/app/order-history.ts#L1-L70)
   - Shows completed orders in order history view
   - Fetches on component load

2. **Frontend Service:** [frontend/src/app/order-history-api.ts#L38-L70](frontend/src/app/order-history-api.ts#L38-L70)
   - `OrderHistoryClient.list(filters)` → `GET /api/orders/clients/{userId}/orders?from=...&to=...&status=...`
   - Extracts user ID from JWT `sub` claim
   - Filters: from (ISO date), to (ISO date), status (PENDING/FILLED/REJECTED)

3. **Nginx Route:** [frontend/nginx.conf#L19-L27](frontend/nginx.conf#L19-L27)
   - `/api/orders/` → rewrite to `/api/v1/` → `http://orders:8080`
   - ✅ Correct

4. **Backend Endpoint:** [nextTrade-orders/src/main/java/com/neueda/leap/order/controller/OrderHistoryController.java#L55](nextTrade-orders/src/main/java/com/neueda/leap/order/controller/OrderHistoryController.java#L55)
   - `GET /clients/{id}/orders?from=2026-09-01&to=2026-10-01&status=FILLED`
   - Authorization: `@PreAuthorize("hasRole('TRADER')")`
   - Returns: `List<OrderHistoryResponse> { orderId, symbol, side, quantity, status, submittedAt, fillPrice, filledQuantity, filledAt }`

5. **Database Read:**
   - `orders` table (account_id, status, submitted_at, quantity, side)
   - `fills` table LEFT JOIN (execution_price, filled_at) - null until filled
   - `instruments` table (symbol)
   - Filters: account ownership (via user_id FK), date range (submitted_at), status

6. **Tests:** [frontend/tests/order-history.test.mjs](frontend/tests/order-history.test.mjs)
   - ✅ Order history tests pass

**Status:** ✅ **COMPLETE** - Order history retrieval works end-to-end

---

### Step 11: AUDIT TRAIL - LIFECYCLE RECONSTRUCTION ❌ UNREACHABLE

**Flow:** (Assumes order flows through all steps)

1. **Audit Log Schema:** [db/finalized-schema.sql#L663-L710](db/finalized-schema.sql#L663-L710)
   - Table: `audit_log { audit_id, user_id, account_id, related_order_id, actor_type, event_type, payload JSONB, created_at }`
   - Indexes: user_id, account_id, related_order_id, event_type, created_at DESC
   - Append-only (immutable history)

2. **Audit Writer Service:** [nextTrade-orders/src/main/java/com/neueda/leap/order/service/AuditEventWriter.java](nextTrade-orders/src/main/java/com/neueda/leap/order/service/AuditEventWriter.java)
   - Centralized event logging

3. **Event Types Implemented:**
   - **ORDER_ACCEPTED:** [L74-L83](AuditEventWriter.java#L74-L83)
     - Payload: `{ orderId, accountId, instrumentId, side, quantity, clientReference, acceptedTimestamp }`
     - Written in Step 3 (order submission) in same transaction as order INSERT
     - ✅ Code ready but unreachable (Step 3 broken)

   - **PRICE_DECISION:** [L91-L100](AuditEventWriter.java#L91-L100)
     - Payload: `{ quoteId, bid, ask, selectedPrice, freshness, synthetic }`
     - Multiple events allowed (one per retry)
     - Written in Step 4 (execution attempt) in same transaction as order status update
     - ✅ Code ready but unreachable

   - **ORDER_FILLED:** [L108-L117](AuditEventWriter.java#L108-L117)
     - Payload: `{ fillId, executionPrice, quantity, quoteTimestamp, transactionId }`
     - Written in Step 5 (settlement) in same transaction as fill INSERT
     - Idempotency: `hasTerminalEventForOrder()` check prevents duplicates on retry
     - ✅ Code ready but unreachable

   - **ORDER_REJECTED:** [L125-L134](AuditEventWriter.java#L125-L134)
     - Payload: `{ reason, attempts, lastExecutionError }`
     - Written when order max attempts exceeded
     - ✅ Code ready but unreachable

   - **ORDER_REQUEUED:** [L142-L149](AuditEventWriter.java#L142-L149)
     - Payload: `{ reason, nextRetryAt }`
     - Multiple events allowed (one per retry)
     - ✅ Code ready but unreachable

   - **SETTLEMENT_COMPLETED:** [L157-L167](AuditEventWriter.java#L157-L167)
     - Payload: `{ holdingMovementId, cashTransactionId }`
     - Written after all ledger entries committed
     - ✅ Code ready but unreachable

   - **SETTLEMENT_FAILED:** [L149-L156](AuditEventWriter.java#L149-L156)
     - ❌ **NOT IMPLEMENTED** - Deferred to future sprint
     - No mechanism to record audit events after transaction rollback
     - Future work: NEXT-123+

4. **Idempotency Concerns:**
   - Application-level check: `hasTerminalEventForOrder()` [L196-L200]
   - ⚠️ **Race condition exists** under high concurrency: Two threads could both call `hasTerminalEventForOrder()` before either commits, creating duplicate events
   - Future fix: Add unique index `(related_order_id, event_type)` for terminal events

5. **Transactional Consistency:**
   - All audit writes in same transaction as business writes
   - All commit or all roll back together
   - No silent audit skips

6. **Query Audit Events:**
   - No read endpoint in MVP
   - Could query `audit_log` table directly via database tools
   - Query example: `SELECT * FROM audit_log WHERE related_order_id = ? ORDER BY created_at ASC`
   - Reconsts full lifecycle: ORDER_ACCEPTED → PRICE_DECISION (retries) → ORDER_FILLED → SETTLEMENT_COMPLETED

7. **Status:** ❌ **UNREACHABLE**
   - No orders reach any step that writes audit events
   - Code complete, schema ready, but no work to do
   - SETTLEMENT_FAILED unimplemented (post-rollback event recording)

**Tests:** [nextTrade-orders/src/test/java/com/neueda/leap/order/service/OrderSubmissionServiceTest.java](nextTrade-orders/src/test/java/com/neueda/leap/order/service/OrderSubmissionServiceTest.java)
- ✅ ORDER_ACCEPTED event creation tested
- ✅ Idempotency of event creation tested

---

## Summary Table: Golden Path Implementation Status

| Step | Component | File Location | Endpoint | Status |
|------|-----------|---------------|----------|--------|
| **1** | LOGIN | auth/src/user/auth.controller.ts#L74 | `POST /auth/login` | ✅ COMPLETE |
| **2** | BROWSE QUOTES | frontend/src/app/quote.service.ts#L40 | `GET /api/quotes/latest/{instrumentId}` | ✅ COMPLETE |
| **3** | SUBMIT ORDER | ❌ MISSING | `POST /api/orders` | ❌ BROKEN |
| **4** | EXECUTE ORDER | order/service/OrderExecutionService.java#L92 | Worker (scheduler) | ❌ UNREACHABLE |
| **5** | FILL & SETTLEMENT | order/service/OrderExecutionService.java#L150 | Worker (transaction) | ❌ UNREACHABLE |
| **6** | UPDATE HOLDINGS | db/finalized-schema.sql#L604 | PostgreSQL trigger | ❌ UNREACHABLE |
| **7** | UPDATE CASH | db/finalized-schema.sql | PostgreSQL trigger | ❌ UNREACHABLE |
| **8** | RETURN HOLDINGS | insights/src/main/java/.../ClientFinancialController.java#L51 | `GET /api/v1/holdings` | ❌ BROKEN (2 issues) |
| **9** | RETURN CASH | order/controller/CashController.java#L48 | `GET /api/clients/{id}/cash` | ❌ BROKEN |
| **10** | ORDER HISTORY | order/controller/OrderHistoryController.java#L55 | `GET /api/orders/clients/{id}/orders` | ✅ COMPLETE |
| **11** | AUDIT TRAIL | order/service/AuditEventWriter.java#L74+ | `audit_log` table | ❌ UNREACHABLE |

---

## Critical Gaps Summary

### 1. BROKEN INTEGRATION BOUNDARY: Frontend → Order Submission

**Location:** Between [frontend/src/app/advanced-dashboard.ts#L346-L416](frontend/src/app/advanced-dashboard.ts#L346-L416) and [nextTrade-orders/src/main/java/com/neueda/leap/order/controller/OrderController.java#L48](nextTrade-orders/src/main/java/com/neueda/leap/order/controller/OrderController.java#L48)

**Problem:**
- Frontend `confirmOrder()` updates local signals only
- No HTTP POST to backend
- No order persistence
- Entire post-submission flow unreachable

**Impact:** MVP golden path stops immediately after order form submission

**Fix:**
```typescript
// Add frontend/src/app/order-submission-api.ts
export class OrderSubmissionClient {
  async submit(accountId: UUID, instrumentId: UUID, side: 'BUY'|'SELL', quantity: number, clientReference?: UUID): Promise<OrderSubmissionResponse> {
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ accountId, instrumentId, side, quantity, clientReference })
    });
    return response.json();
  }
}
```

### 2. MISSING FRONTEND SERVICE: Holdings Display

**Location:** [frontend/src/app/novice-dashboard.ts#L55-L95](frontend/src/app/novice-dashboard.ts#L55-L95)

**Problem:**
- Hardcoded holdings signal
- No API call to fetch actual holdings
- Frontend never displays updated positions after fill

**Backend Ready:**
- insights service: [ClientFinancialController#L51-L65](insights/src/main/java/.../ClientFinancialController.java#L51-L65)
- Endpoint: `GET /api/v1/holdings`

**Nginx Issue:** Routes `/api/holdings/` to wrong service (holdings:8080 registration service, not insights:8080)

**Fix:**
1. Create `HoldingsClient` class in frontend
2. Update nginx: `/api/holdings/` → `http://insights:8080`
3. Update components to fetch and display actual holdings

### 3. MISSING FRONTEND SERVICE: Cash Balance Display

**Location:** [frontend/src/app/novice-dashboard.ts#L52-L56](frontend/src/app/novice-dashboard.ts#L52-L56)

**Problem:**
- Hardcoded buyingPower, portfolioValue, invested signals
- No API call to fetch actual cash
- Frontend never displays updated balance after fill

**Backend Ready:**
- CashController: [nextTrade-orders/.../CashController.java#L48-L60](nextTrade-orders/src/main/java/.../CashController.java#L48-L60)
- Endpoint: `GET /api/clients/{id}/cash`
- Alternative: insights portfolio summary endpoint

**Fix:**
1. Create `CashClient` class in frontend
2. Update components to fetch and display actual cash balance

### 4. NGINX ROUTING: `/api/holdings/` to Wrong Service

**Location:** [frontend/nginx.conf#L29-L37](frontend/nginx.conf#L29-L37)

**Problem:**
```nginx
location /api/holdings/ {
    rewrite ^/api/holdings/(.*)$ /$1 break;
    proxy_pass http://holdings:8080;  // ← WRONG
}
```

- Routes to nextTrade-holdings (registration/onboarding service)
- Should route to insights (which has ClientFinancialController)
- Even if frontend called `/api/holdings`, would hit wrong service

**Fix:**
```nginx
location /api/holdings/ {
    rewrite ^/api/holdings/(.*)$ /api/v1/holdings/$1 break;
    proxy_pass http://insights:8080;  // ← CORRECT
}
```

---

## Database Readiness Assessment

### Schema Ready ✅
- All tables created with proper constraints
- Ledger tables (holding_movements, cash_transactions) ready
- Cache tables (holdings, cash_balances) ready with triggers
- Audit table with proper indexes

### Triggers Ready ✅
- `project_holding_movement()` on holding_movements INSERT
- Cash update trigger on cash_transactions INSERT
- Both implement atomic upsert with constraint checks

### Ledger Logic Ready ✅
- Append-only holding_movements and cash_transactions
- Source of truth vs. cache pattern
- Negative balance/quantity prevention
- Average cost recalculation for holdings

### Idempotency Ready ✅
- Unique constraint on (order_id) for fills (one fill per order)
- Unique constraint on (account_id, client_reference) for orders

---

## Service Readiness Assessment

### Auth Service ✅
- JWT issuance: Complete
- Token refresh: Complete  
- User role and trader tier assignment: Complete

### Quote Service ✅
- Synthetic quote generation: Complete
- Quote fetch endpoints: Complete

### Orders Service ✅
- Order submission (controller, validation, persistence): Complete
- Order execution (scheduler, quote fetch, price logic): Complete
- Settlement (fill creation, ledger writes, cache updates): Complete
- Order history retrieval: Complete
- Cash balance retrieval: Complete
- Audit event writing: Complete (except SETTLEMENT_FAILED)

### Insights Service ✅
- Portfolio summary retrieval: Complete
- Holdings retrieval: Complete
- Cash balance retrieval: Complete

---

## Test Coverage Assessment

### Tests Existing and Passing ✅
- [auth/test/auth.e2e-spec.ts](auth/test/auth.e2e-spec.ts) - Login, refresh token, logout
- [nextTrade-orders/src/test/.../OrderSubmissionServiceTest.java](nextTrade-orders/src/test/java/com/neueda/leap/order/service/OrderSubmissionServiceTest.java) - Validation pipeline, audit events
- [nextTrade-orders/src/test/.../OrderExecutionServiceTest.java](nextTrade-orders/src/test/java/com/neueda/leap/order/service/OrderExecutionServiceTest.java) - Quote freshness, price logic, settlement atomicity
- [frontend/tests/quote.service.test.mjs](frontend/tests/quote.service.test.mjs) - Quote polling
- [frontend/tests/order-history.test.mjs](frontend/tests/order-history.test.mjs) - Order history retrieval

### Integration Tests Needed ❌
- End-to-end test: Login → Submit Order → Execute → Fill → Retrieve Holdings
- Frontend integration test for order submission HTTP call
- Nginx routing tests for all `/api/*` paths

---

## Deployment Verification Commands

### Verify Order Submission Flow

```bash
# 1. Ensure orders service is running
curl http://localhost:8080/health

# 2. Authenticate (get JWT)
curl -X POST http://localhost:4200/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"trader@example.com","password":"password123"}'
# Save accessToken from response

# 3. Create order (should work if frontend fixed)
curl -X POST http://localhost:4200/api/orders \
  -H "Authorization: Bearer {accessToken}" \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "{accountId}",
    "instrumentId": "{instrumentId}",
    "side": "BUY",
    "quantity": 10
  }'

# 4. Check order persisted
psql -h localhost -U app_user -d nexttrade -c \
  "SELECT order_id, status, accepted_at FROM orders WHERE account_id = '{accountId}' ORDER BY submitted_at DESC LIMIT 1;"

# 5. Wait for scheduler (default: every 5 seconds) and check execution
sleep 6
psql -h localhost -U app_user -d nexttrade -c \
  "SELECT fill_id, execution_price, filled_at FROM fills WHERE order_id = '{orderId}';"

# 6. Check audit trail
psql -h localhost -U app_user -d nexttrade -c \
  "SELECT event_type, payload FROM audit_log WHERE related_order_id = '{orderId}' ORDER BY created_at ASC;"

# 7. Check holdings updated
psql -h localhost -U app_user -d nexttrade -c \
  "SELECT quantity, avg_cost FROM holdings WHERE account_id = '{accountId}' AND instrument_id = '{instrumentId}';"

# 8. Check cash updated
psql -h localhost -U app_user -d nexttrade -c \
  "SELECT balance FROM cash_balances WHERE account_id = '{accountId}';"
```

### Verify Holdings Retrieval

```bash
# Get JWT from Step 2 above, then:
curl http://localhost:4200/api/holdings/clients/{userId}/holdings \
  -H "Authorization: Bearer {accessToken}"

# Should return actual holdings from database, not mock data
```

### Verify Cash Retrieval

```bash
curl http://localhost:4200/api/clients/{userId}/cash \
  -H "Authorization: Bearer {accessToken}"

# Should return actual cash from database
```

---

## Smallest Files That Need Changes

### For Functional MVP (Order Submission → Settlement):

1. **Create:** `frontend/src/app/order-submission-api.ts` (new file, ~50 LOC)
   - `OrderSubmissionClient` class
   - `SubmitOrderRequest` and `OrderSubmissionResponse` types
   - `submit()` method: POST to `/api/orders`

2. **Modify:** `frontend/src/app/advanced-dashboard.ts`
   - Inject `OrderSubmissionClient`
   - Change `confirmOrder()` to call `submissionClient.submit(...)`
   - Remove mock order updates from `confirmOrder()`

### For Full Frontend Display (Holding + Cash):

3. **Create:** `frontend/src/app/holdings-api.ts` (new file, ~40 LOC)
   - `HoldingsClient` class
   - `GET /api/holdings/clients/{id}/holdings`

4. **Create:** `frontend/src/app/cash-api.ts` (new file, ~40 LOC)
   - `CashClient` class
   - `GET /api/clients/{id}/cash`

5. **Modify:** `frontend/src/app/novice-dashboard.ts`
   - Inject `HoldingsClient` and `CashClient`
   - Replace hardcoded signals with service calls in `ngOnInit()`

6. **Modify:** `frontend/src/app/advanced-dashboard.ts`
   - Same as novice-dashboard

7. **Fix:** `frontend/nginx.conf`
   - Change `/api/holdings/` location to route to insights:8080

---

## Exact Lines of Code to Add/Change

### 1. frontend/src/app/order-submission-api.ts (NEW FILE)

```typescript
export interface SubmitOrderRequest {
  accountId: string;
  instrumentId: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  clientReference?: string;
}

export interface OrderSubmissionResponse {
  orderId: string;
  clientReference: string;
  status: string;
}

export class OrderSubmissionClient {
  constructor(
    private tokens: { accessToken: string | null },
    private fetch: typeof fetch = globalThis.fetch,
    private baseUrl = '/api/orders'
  ) {}

  async submit(request: SubmitOrderRequest): Promise<OrderSubmissionResponse> {
    const response = await this.fetch(`${this.baseUrl}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.tokens.accessToken}`
      },
      body: JSON.stringify(request)
    });
    if (!response.ok) throw new Error(`Order submission failed: ${response.statusText}`);
    return response.json();
  }
}
```

### 2. frontend/src/app/advanced-dashboard.ts - Change confirmOrder()

**Old (lines 346-416):**
```typescript
confirmOrder(): void {
  const order: Order = { /* ... */ };
  this.buyingPower.update((v) => v - (price * quantity));
  // ... mock updates
}
```

**New:**
```typescript
async confirmOrder(): Promise<void> {
  try {
    const response = await this.submissionClient.submit({
      accountId: this.accountId(),
      instrumentId: this.selected().instrumentId,
      side: this.side() as 'BUY' | 'SELL',
      quantity: this.qty()
    });
    // Order submitted; wait for scheduler to execute
    // Optionally refresh order history via OrderHistoryClient
  } catch (error) {
    this.error.set(`Order submission failed: ${error.message}`);
  }
}
```

### 3. frontend/nginx.conf - Fix routing (Line 29-37)

**Old:**
```nginx
location /api/holdings/ {
    rewrite ^/api/holdings/(.*)$ /$1 break;
    proxy_pass http://holdings:8080;
}
```

**New:**
```nginx
location /api/holdings/ {
    rewrite ^/api/holdings/(.*)$ /api/v1/holdings/$1 break;
    proxy_pass http://insights:8080;
}
```

---

## Summary

### Current State
- ✅ Backend services fully implemented and tested in isolation
- ✅ Database schema complete with ledgers, triggers, audit log
- ✅ Quote service working (polling display)
- ✅ Order history retrieval working
- ✅ Authentication working
- ❌ Frontend order submission never calls backend
- ❌ Frontend never displays updated holdings/cash after fill
- ❌ Order execution unreachable (no orders in database)
- ❌ Settlement unreachable
- ❌ Audit trail unreachable

### First Broken Boundary
**Frontend order submission** → Cannot reach **backend OrderController**

### Minimum Fixes for MVP Golden Path
1. Add `OrderSubmissionClient` to frontend
2. Change `confirmOrder()` to call backend
3. Fix nginx `/api/holdings/` routing
4. Add `HoldingsClient` and `CashClient` to frontend
5. Update dashboard components to fetch actual data

### Verification Commands
See "Deployment Verification Commands" section above for curl-based testing of each step.

