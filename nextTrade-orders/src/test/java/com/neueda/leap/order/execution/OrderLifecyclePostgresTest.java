package com.neueda.leap.order.execution;

import com.neueda.leap.order.cancel.OrderCancellationException;
import com.neueda.leap.order.cancel.OrderCancellationService;
import com.neueda.leap.order.query.OrderNotFoundException;
import com.neueda.leap.order.submission.dto.SubmitOrderRequest;
import com.neueda.leap.order.submission.service.OrderSubmissionService;
import com.neueda.leap.order.service.OrderSufficiencyException;
import com.neueda.leap.security.JwtServiceImpl;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import java.util.concurrent.Executors;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import org.springframework.test.web.servlet.result.MockMvcResultMatchers;

/** Real production schema and transaction manager; no mocks of settlement or persistence. */
@SpringBootTest(properties = "orders.execution.enabled=false")
@org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "TEST_POSTGRES_URL", matches = ".+")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class OrderLifecyclePostgresTest {
    private static final String SCHEMA = "lifecycle_" + UUID.randomUUID().toString().replace("-", "");
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager manager;
    @Autowired OrderExecutor executor;
    @Autowired OrderSubmissionService submissions;
    @Autowired OrderCancellationService cancellations;
    @Autowired org.springframework.test.web.servlet.MockMvc mvc;
    @Autowired JwtServiceImpl tokens;
    private UUID user, account, instrument;
    private OrderExecutionWorker worker;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) throws Exception {
        String url = System.getenv("TEST_POSTGRES_URL");
        var admin = new JdbcTemplate(new DriverManagerDataSource(url,
                System.getenv("TEST_POSTGRES_USER"), System.getenv("TEST_POSTGRES_PASSWORD")));
        admin.execute("CREATE SCHEMA " + SCHEMA);
        var schemaDb = new JdbcTemplate(new DriverManagerDataSource(
                url + (url.contains("?") ? "&" : "?") + "currentSchema=" + SCHEMA + ",public",
                System.getenv("TEST_POSTGRES_USER"), System.getenv("TEST_POSTGRES_PASSWORD")));
        schemaDb.execute(Files.readString(Path.of("../db/finalized-schema.sql")));
        properties.add("spring.datasource.url", () -> url + (url.contains("?") ? "&" : "?") + "currentSchema=" + SCHEMA + ",public");
        properties.add("spring.datasource.username", () -> System.getenv("TEST_POSTGRES_USER"));
        properties.add("spring.datasource.password", () -> System.getenv("TEST_POSTGRES_PASSWORD"));
    }

    private JdbcTemplate admin() {
        return new JdbcTemplate(new DriverManagerDataSource(System.getenv("TEST_POSTGRES_URL"),
                System.getenv("TEST_POSTGRES_USER"), System.getenv("TEST_POSTGRES_PASSWORD")));
    }

    @AfterAll
    void cleanup() { admin().execute("DROP SCHEMA IF EXISTS " + SCHEMA + " CASCADE"); }

    @BeforeEach
    void fixtures() {
        com.neueda.leap.order.TradeRecordsForTests.unlocked(jdbc, "TRUNCATE users, instruments CASCADE");
        user = UUID.randomUUID(); account = UUID.randomUUID(); instrument = UUID.randomUUID();
        jdbc.update("INSERT INTO users(user_id,email,password_hash) VALUES (?, 'trader@example.test', 'test-only')", user);
        jdbc.update("INSERT INTO customer_profiles(user_id,first_name,last_name,phone,address,country,date_of_birth,ssn_encrypted) VALUES (?, 'Test', 'Trader', '555-0100', '1 Main St', 'US', DATE '1990-01-01', decode('00','hex'))", user);
        jdbc.update("""
                INSERT INTO accounts(account_id,user_id,account_number,account_name,account_status,trading_enabled,min_balance_requirement)
                VALUES (?, ?, 'TEST', 'Test', 'ACTIVE', TRUE, 1)
                """, account, user);
        jdbc.update("INSERT INTO instruments(instrument_id,symbol,instrument_name,asset_class,market_code,currency) VALUES (?, 'AAPL', 'Apple', 'COMMON_STOCK', 'NASDAQ', 'USD')", instrument);
        jdbc.update("INSERT INTO cash_balances(account_id,balance) VALUES (?,10000)", account);
        jdbc.update("INSERT INTO cash_transactions(account_id,transaction_type,amount) VALUES (?,'DEPOSIT',10000)", account);
        jdbc.update("INSERT INTO quotes(instrument_id,bid,ask,quoted_at,source) VALUES (?,99,100,CURRENT_TIMESTAMP,'TEST')", instrument);
        worker = new OrderExecutionWorker(jdbc, manager, executor, 1);
    }

    private UUID submit(String side, long quantity) {
        return submissions.submit(user, new SubmitOrderRequest(account, "AAPL", UUID.randomUUID(), side, quantity, "MARKET", null)).order().orderId();
    }

    private String status(UUID id) { return jdbc.queryForObject("SELECT status FROM orders WHERE order_id=?", String.class, id); }
    private int count(String table) { return jdbc.queryForObject("SELECT COUNT(*) FROM " + table, Integer.class); }

    private UUID advanced(String side, BigDecimal limit, BigDecimal profit, BigDecimal stop) {
        return submissions.submit(user, new SubmitOrderRequest(account, "AAPL", UUID.randomUUID(), side, 2,
                limit == null ? "MARKET" : "LIMIT", null, null, limit, profit, stop)).order().orderId();
    }

    private void quoteAt(String bid, String ask) {
        jdbc.update("INSERT INTO quotes(instrument_id,bid,ask,quoted_at,source) VALUES (?,?,?,CURRENT_TIMESTAMP,'TEST')",
                instrument, new BigDecimal(bid), new BigDecimal(ask));
    }

    private void due(UUID id) {
        jdbc.update("UPDATE orders SET next_execution_at = CURRENT_TIMESTAMP WHERE order_id = ?", id);
    }

    @Test void limitWaitsWithoutConsumingFailuresAndCreatesExactlyOneExit() {
        UUID entry = advanced("BUY", new BigDecimal("95"), new BigDecimal("110"), new BigDecimal("85"));
        OrderExecutionWorker.Claim stale = worker.claimNext();
        worker.execute(stale);
        for (int n = 0; n < 12; n++) { due(entry); worker.execute(worker.claimNext()); }
        assertThat(status(entry)).isEqualTo("PENDING");
        assertThat(count("fills")).isZero();
        assertThat(jdbc.queryForObject("SELECT price_waits FROM orders WHERE order_id=?", Long.class, entry)).isEqualTo(13L);
        quoteAt("93", "94"); due(entry);
        worker.execute(stale);
        assertThat(count("fills")).isZero();
        worker.execute(worker.claimNext());
        assertThat(status(entry)).isEqualTo("FILLED");
        UUID exit = jdbc.queryForObject("SELECT order_id FROM orders WHERE exit_parent_id=?", UUID.class, entry);
        worker.execute(worker.claimNext());
        assertThat(status(exit)).isEqualTo("PENDING");
        quoteAt("110", "111"); due(exit);
        var claim = worker.claimNext(); worker.execute(claim); worker.execute(claim);
        assertThat(status(exit)).isEqualTo("FILLED");
        assertThat(count("fills")).isEqualTo(2);
        assertThat(count("orders")).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT quantity FROM holdings", Long.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT balance FROM cash_balances", BigDecimal.class)).isEqualByComparingTo("10032");
    }

    @Test void stopLossExecutesThroughAGapAndDoesNotCreateAnotherExit() {
        UUID entry = advanced("BUY", null, null, new BigDecimal("90"));
        worker.execute(worker.claimNext());
        UUID exit = jdbc.queryForObject("SELECT order_id FROM orders WHERE exit_parent_id=?", UUID.class, entry);
        quoteAt("80", "81"); worker.execute(worker.claimNext());
        assertThat(status(exit)).isEqualTo("FILLED");
        assertThat(count("orders")).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT execution_price FROM fills WHERE order_id=?", BigDecimal.class, exit)).isEqualByComparingTo("80");
    }

    @Test void cancellingEntryCreatesNoExitAndCancellingExitPreventsExecution() {
        UUID cancelled = advanced("BUY", new BigDecimal("95"), new BigDecimal("110"), null);
        cancellations.cancel(cancelled, user);
        assertThat(worker.claimNext()).isNull();
        UUID entry = advanced("BUY", null, new BigDecimal("110"), null);
        worker.execute(worker.claimNext());
        UUID exit = jdbc.queryForObject("SELECT order_id FROM orders WHERE exit_parent_id=?", UUID.class, entry);
        var claim = worker.claimNext(); cancellations.cancel(exit, user);
        quoteAt("115", "116"); worker.execute(claim);
        assertThat(status(exit)).isEqualTo("CANCELLED");
        assertThat(count("fills")).isEqualTo(1);
    }

    @Test void sellLimitWaitsThenBuysBackAtProfitTarget() {
        submit("BUY", 2); worker.execute(worker.claimNext());
        UUID entry = advanced("SELL", new BigDecimal("105"), new BigDecimal("95"), new BigDecimal("115"));
        worker.execute(worker.claimNext());
        assertThat(status(entry)).isEqualTo("PENDING");
        quoteAt("106", "107"); due(entry); worker.execute(worker.claimNext());
        assertThat(status(entry)).isEqualTo("FILLED");
        UUID exit = jdbc.queryForObject("SELECT order_id FROM orders WHERE exit_parent_id=?", UUID.class, entry);
        quoteAt("94", "95"); worker.execute(worker.claimNext());
        assertThat(status(exit)).isEqualTo("FILLED");
        assertThat(jdbc.queryForObject("SELECT side FROM orders WHERE order_id=?", String.class, exit)).isEqualTo("BUY");
        assertThat(jdbc.queryForObject("SELECT quantity FROM holdings", Long.class)).isEqualTo(2);
    }

    @Test void changedAdvancedTermsConflictOnRetry() {
        UUID reference = UUID.randomUUID();
        var request = new SubmitOrderRequest(account, "AAPL", reference, "BUY", 2, "LIMIT", null, null,
                new BigDecimal("95"), new BigDecimal("110"), null);
        submissions.submit(user, request);
        assertThat(submissions.submit(user, request).created()).isFalse();
        assertThatThrownBy(() -> submissions.submit(user, new SubmitOrderRequest(account, "AAPL", reference, "BUY", 2, "LIMIT", null, null,
                new BigDecimal("96"), new BigDecimal("110"), null)))
                .isInstanceOf(com.neueda.leap.order.submission.service.IdempotencyConflictException.class);
    }

    @Test
    void apiDocumentationExposesOnlyTheCanonicalOrderRoute() throws Exception {
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .get("/api/v1/v3/api-docs").contextPath("/api/v1"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.paths['/orders'].post").exists())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.paths['/clients/{id}/orders']").doesNotExist())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.paths['/cash/buy']").doesNotExist())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.paths['/cash/sell']").doesNotExist());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .get("/api/v1/swagger-ui/index.html").contextPath("/api/v1"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk());
    }

    @Test
    void submittedOrderIsAcceptedFilledAndSettledExactlyOnce() {
        UUID reference = UUID.randomUUID();
        var request = new SubmitOrderRequest(account, "AAPL", reference, "BUY", 10, "MARKET", null);
        var result = submissions.submit(user, request);
        assertThat(result.order().status()).isEqualTo("SUBMITTED");
        var claim = worker.claimNext();
        assertThat(claim).isNotNull();
        worker.execute(claim);
        worker.execute(claim);
        assertThat(status(result.order().orderId())).isEqualTo("FILLED");
        assertThat(submissions.submit(user, request).created()).isFalse();
        assertThat(count("fills")).isEqualTo(1);
        assertThat(count("holding_movements")).isEqualTo(1);
        assertThat(jdbc.queryForList("SELECT event_type FROM audit_log WHERE event_type <> 'RULE_CHECKED' ORDER BY event_type", String.class))
                .containsExactly("ORDER_ACCEPTED", "ORDER_FILLED", "PRICE_DECISION", "SETTLEMENT_COMPLETED");
        assertThat(jdbc.queryForObject("SELECT payload->>'executionPrice' FROM audit_log WHERE event_type='ORDER_FILLED'", String.class))
                .isEqualTo("100.00000000");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM cash_transactions WHERE settlement_status='SETTLED' AND settled_at IS NOT NULL", Integer.class))
                .isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT balance FROM cash_balances", BigDecimal.class)).isEqualByComparingTo("9000");
        assertThat(jdbc.queryForObject("SELECT SUM(amount) FROM cash_transactions", BigDecimal.class)).isEqualByComparingTo("9000");
        assertThat(jdbc.queryForObject("SELECT quantity FROM holdings", Long.class)).isEqualTo(10);
        assertThat(jdbc.queryForList("SELECT status FROM order_status_history ORDER BY occurred_at", String.class)).contains("ACCEPTED", "FILLED");
    }

    @Test
    void ownerReadsOrderDetailAndStatusThroughTheLifecycle() throws Exception {
        UUID id = submit("BUY", 10);
        String bearer = "Bearer " + tokens.issueToken(user, "trader@example.test");
        mvc.perform(get("/api/v1/orders/{id}/status", id).contextPath("/api/v1").header("Authorization", bearer))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(jsonPath("$.status").value("SUBMITTED"))
                .andExpect(jsonPath("$.reasonCode").value("SUBMISSION_VALIDATED"));

        worker.execute(worker.claimNext());
        mvc.perform(get("/api/v1/orders/{id}", id).contextPath("/api/v1").header("Authorization", bearer))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(jsonPath("$.orderId").value(id.toString()))
                .andExpect(jsonPath("$.symbol").value("AAPL"))
                .andExpect(jsonPath("$.status").value("FILLED"))
                .andExpect(jsonPath("$.filledQuantity").value(10))
                .andExpect(jsonPath("$.executionPrice").value(100.0))
                .andExpect(jsonPath("$.acceptedAt").isNotEmpty());
        mvc.perform(get("/api/v1/orders/{id}/status", id).contextPath("/api/v1").header("Authorization", bearer))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(jsonPath("$.status").value("FILLED"))
                .andExpect(jsonPath("$.reasonCode").value("EXECUTION_SUCCESS"));
    }

    @Test
    void anotherClientsOrderIsIndistinguishableFromAnUnknownOne() throws Exception {
        UUID id = submit("BUY", 1);
        String stranger = "Bearer " + tokens.issueToken(UUID.randomUUID(), "other@example.test");
        for (UUID target : new UUID[]{id, UUID.randomUUID()}) {
            for (String path : new String[]{"/api/v1/orders/{id}", "/api/v1/orders/{id}/status"}) {
                mvc.perform(get(path, target).contextPath("/api/v1").header("Authorization", stranger))
                        .andExpect(MockMvcResultMatchers.status().isNotFound())
                        .andExpect(jsonPath("$.error").value("ORDER_NOT_FOUND"));
            }
        }
    }

    @Test
    void sellPreservesRemainingAverageCostAndCreditsCash() {
        submit("BUY", 10); worker.execute(worker.claimNext());
        UUID sell = submit("SELL", 4); worker.execute(worker.claimNext());
        assertThat(status(sell)).isEqualTo("FILLED");
        assertThat(jdbc.queryForObject("SELECT quantity FROM holdings", Long.class)).isEqualTo(6);
        assertThat(jdbc.queryForObject("SELECT avg_cost FROM holdings", BigDecimal.class)).isEqualByComparingTo("100");
        assertThat(jdbc.queryForObject("SELECT balance FROM cash_balances", BigDecimal.class)).isEqualByComparingTo("9396");
    }

    @Test
    void sellAfterSpendingBelowOpeningMinimumFillsAndKeepsLedgerConsistent() {
        jdbc.update("UPDATE accounts SET min_balance_requirement=5000 WHERE account_id=?", account);
        jdbc.update("UPDATE cash_balances SET balance=5000 WHERE account_id=?", account);
        com.neueda.leap.order.TradeRecordsForTests.unlocked(jdbc,
                "UPDATE cash_transactions SET amount=5000 WHERE account_id='" + account + "' AND transaction_type='DEPOSIT'");
        UUID buy = submit("BUY", 40);
        worker.execute(worker.claimNext());
        assertThat(status(buy)).isEqualTo("FILLED");
        assertThat(jdbc.queryForObject("SELECT balance FROM cash_balances", BigDecimal.class)).isEqualByComparingTo("1000");

        assertThatThrownBy(() -> submit("BUY", 11)).isInstanceOfSatisfying(OrderSufficiencyException.class,
                error -> assertThat(error.reason()).isEqualTo(OrderSufficiencyException.Reason.INSUFFICIENT_CASH));
        assertThatThrownBy(() -> submit("SELL", 41)).isInstanceOfSatisfying(OrderSufficiencyException.class,
                error -> assertThat(error.reason()).isEqualTo(OrderSufficiencyException.Reason.INSUFFICIENT_HOLDINGS));
        assertThat(count("orders")).isEqualTo(1);

        UUID sell = submit("SELL", 10);
        var claim = worker.claimNext();
        worker.execute(claim);
        worker.execute(claim);
        assertThat(status(sell)).isEqualTo("FILLED");
        assertThat(jdbc.queryForObject("SELECT balance FROM cash_balances", BigDecimal.class)).isEqualByComparingTo("1990");
        assertThat(jdbc.queryForObject("SELECT SUM(amount) FROM cash_transactions", BigDecimal.class)).isEqualByComparingTo("1990");
        assertThat(jdbc.queryForObject("SELECT quantity FROM holdings", Long.class)).isEqualTo(30);
        assertThat(count("fills")).isEqualTo(2);
        assertThat(count("holding_movements")).isEqualTo(2);
        assertThat(count("cash_transactions")).isEqualTo(3);
    }

    @Test
    void affordableBuyBelowOpeningMinimumStillFills() {
        jdbc.update("UPDATE accounts SET min_balance_requirement=100000 WHERE account_id=?", account);
        UUID buy = submit("BUY", 1);
        worker.execute(worker.claimNext());
        assertThat(status(buy)).isEqualTo("FILLED");
        assertThat(jdbc.queryForObject("SELECT balance FROM cash_balances", BigDecimal.class)).isEqualByComparingTo("9900");
        assertThat(jdbc.queryForObject("SELECT SUM(amount) FROM cash_transactions", BigDecimal.class)).isEqualByComparingTo("9900");
    }

    @Test
    void sellWithZeroCashStillFills() {
        jdbc.update("UPDATE accounts SET min_balance_requirement=5000 WHERE account_id=?", account);
        submit("BUY", 40);
        worker.execute(worker.claimNext());
        jdbc.update("INSERT INTO cash_transactions(account_id,transaction_type,amount) VALUES (?,'WITHDRAWAL',-6000)", account);
        jdbc.update("UPDATE cash_balances SET balance=0 WHERE account_id=?", account);
        assertThat(jdbc.queryForObject("SELECT balance FROM cash_balances", BigDecimal.class)).isEqualByComparingTo("0");
        UUID sell = submit("SELL", 10);
        worker.execute(worker.claimNext());
        assertThat(status(sell)).isEqualTo("FILLED");
        assertThat(jdbc.queryForObject("SELECT balance FROM cash_balances", BigDecimal.class)).isEqualByComparingTo("990");
        assertThat(jdbc.queryForObject("SELECT SUM(amount) FROM cash_transactions", BigDecimal.class)).isEqualByComparingTo("990");
        assertThat(jdbc.queryForObject("SELECT quantity FROM holdings", Long.class)).isEqualTo(30);
    }

    @Test
    void fractionalCentFillsKeepCashLedgerAndCacheEqualAndClearPreviousError() {
        jdbc.update("UPDATE quotes SET bid=100.004, ask=100.005, quoted_at=CURRENT_TIMESTAMP");
        UUID buy = submit("BUY", 1);
        var claim = worker.claimNext();
        jdbc.update("UPDATE orders SET last_execution_error='EXECUTION_PENDING' WHERE order_id=?", buy);
        worker.execute(claim);
        assertThat(status(buy)).isEqualTo("FILLED");
        assertThat(jdbc.queryForObject("SELECT balance FROM cash_balances", BigDecimal.class)).isEqualByComparingTo("9899.99");
        assertThat(jdbc.queryForObject("SELECT SUM(amount) FROM cash_transactions", BigDecimal.class)).isEqualByComparingTo("9899.99");
        assertThat(jdbc.queryForObject("SELECT last_execution_error FROM orders WHERE order_id=?", String.class, buy)).isNull();
        jdbc.update("UPDATE quotes SET bid=100.005, ask=100.006, quoted_at=CURRENT_TIMESTAMP");
        UUID sell = submit("SELL", 1);
        worker.execute(worker.claimNext());
        assertThat(status(sell)).isEqualTo("FILLED");
        assertThat(jdbc.queryForObject("SELECT balance FROM cash_balances", BigDecimal.class)).isEqualByComparingTo("10000");
        assertThat(jdbc.queryForObject("SELECT SUM(amount) FROM cash_transactions", BigDecimal.class)).isEqualByComparingTo("10000");
    }

    @Test
    void instrumentIdSubmissionUsesTheSameValidatedExactlyOnceSettlement() {
        var request = new SubmitOrderRequest(account, null, UUID.randomUUID(), "BUY", 3, "MARKET", null, instrument);
        var result = submissions.submit(user, request);
        assertThat(result.order().symbol()).isEqualTo("AAPL");
        assertThat(result.order().status()).isEqualTo("SUBMITTED");
        worker.execute(worker.claimNext());
        assertThat(submissions.submit(user, request).created()).isFalse();
        assertThat(count("fills")).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT quantity FROM holdings", Long.class)).isEqualTo(3);
        assertThat(jdbc.queryForObject("SELECT balance FROM cash_balances", BigDecimal.class)).isEqualByComparingTo("9700");
    }

    @Test
    void concurrentOrdersCannotSpendTheSameCashTwice() throws Exception {
        UUID first = submit("BUY", 60), second = submit("BUY", 60);
        var a = worker.claimNext(); var b = worker.claimNext();
        var pool = Executors.newFixedThreadPool(2);
        try {
            var one = pool.submit(() -> worker.execute(a));
            var two = pool.submit(() -> worker.execute(b));
            one.get(); two.get();
        } finally { pool.shutdownNow(); }
        assertThat(java.util.List.of(status(first), status(second))).containsExactlyInAnyOrder("FILLED", "REJECTED");
        assertThat(count("fills")).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT balance FROM cash_balances", BigDecimal.class)).isEqualByComparingTo("4000");
    }

    @Test
    void failureRollsBackFillLedgersBalancesAndStatusTogether() {
        UUID id = submit("BUY", 10);
        var failing = new OrderExecutionWorker(jdbc, manager, orderId -> {
            executor.execute(orderId);
            throw new IllegalStateException("injected failure after settlement");
        }, 1);
        failing.execute(failing.claimNext());
        assertThat(status(id)).isEqualTo("PENDING");
        assertThat(count("fills")).isZero();
        assertThat(count("holding_movements")).isZero();
        assertThat(count("holdings")).isZero();
        assertThat(count("cash_transactions")).isEqualTo(1);
        assertThat(jdbc.queryForList("SELECT event_type FROM audit_log WHERE event_type <> 'RULE_CHECKED' ORDER BY event_type", String.class))
                .containsExactly("ORDER_ACCEPTED", "ORDER_REQUEUED");
        assertThat(jdbc.queryForObject("SELECT balance FROM cash_balances", BigDecimal.class)).isEqualByComparingTo("10000");
    }

    @Test
    void legacyUnvalidatedSubmissionIsNotAutomaticallyTraded() {
        UUID id = submit("BUY", 1);
        com.neueda.leap.order.TradeRecordsForTests.unlocked(jdbc, "DELETE FROM order_status_history WHERE order_id='" + id + "'");
        assertThat(worker.claimNext()).isNull();
        assertThat(status(id)).isEqualTo("SUBMITTED");
        assertThat(count("fills")).isZero();
    }

    @Test
    void absentProjectionIsRejectedBeforeTheWorkerCanTrade() {
        var verifier = new JdbcOrderExecutor(jdbc, null, null, 1);
        verifier.requireHoldingsProjection();
        jdbc.execute("ALTER TABLE holding_movements DISABLE TRIGGER tg_holding_movement_projection");
        try {
            org.assertj.core.api.Assertions.assertThatThrownBy(verifier::requireHoldingsProjection)
                    .isInstanceOf(IllegalStateException.class).hasMessageContaining("008_holdings_projection.sql");
        } finally {
            jdbc.execute("ALTER TABLE holding_movements ENABLE TRIGGER tg_holding_movement_projection");
        }
    }

    @Test
    void staleQuoteDefersThenRejectsWithoutSettlement() {
        UUID id = submit("BUY", 1);
        jdbc.update("UPDATE quotes SET quoted_at=CURRENT_TIMESTAMP - INTERVAL '1 hour'");
        worker.execute(worker.claimNext());
        assertThat(status(id)).isEqualTo("PENDING");
        jdbc.update("UPDATE orders SET execution_attempts=9,next_execution_at=CURRENT_TIMESTAMP WHERE order_id=?", id);
        worker.execute(worker.claimNext());
        assertThat(status(id)).isEqualTo("REJECTED");
        assertThat(jdbc.queryForList("SELECT event_type FROM audit_log WHERE event_type <> 'RULE_CHECKED' ORDER BY event_type", String.class))
                .containsExactly("ORDER_ACCEPTED", "ORDER_REJECTED", "ORDER_REQUEUED");
        assertThat(count("fills")).isZero();
    }

    @Test
    void cancelledOrderIsRecordedAndNeverExecutedWithNoMoneyMoved() {
        UUID id = submit("BUY", 2);
        var result = cancellations.cancel(id, user);
        assertThat(result.status()).isEqualTo("CANCELLED");
        assertThat(status(id)).isEqualTo("CANCELLED");
        assertThat(jdbc.queryForObject("SELECT reason_code FROM order_status_history WHERE order_id=? AND status='CANCELLED'",
                String.class, id)).isEqualTo("CANCELLED_BY_CLIENT");
        assertThat(jdbc.queryForMap("SELECT actor_type, payload->>'previousStatus' AS previous FROM audit_log WHERE event_type='ORDER_CANCELLED'"))
                .containsEntry("actor_type", "USER").containsEntry("previous", "SUBMITTED");
        // The worker neither accepts nor executes it.
        var claim = worker.claimNext();
        if (claim != null) {
            worker.execute(claim);
        }
        assertThat(status(id)).isEqualTo("CANCELLED");
        assertThat(count("fills")).isZero();
        assertThat(jdbc.queryForObject("SELECT balance FROM cash_balances", BigDecimal.class)).isEqualByComparingTo("10000");
    }

    @Test
    void onlyTheOwnerCanCancelAndOnlyWhileTheOrderIsWaiting() {
        UUID id = submit("BUY", 1);
        assertThatThrownBy(() -> cancellations.cancel(id, UUID.randomUUID())).isInstanceOf(OrderNotFoundException.class);
        assertThatThrownBy(() -> cancellations.cancel(UUID.randomUUID(), user)).isInstanceOf(OrderNotFoundException.class);
        worker.execute(worker.claimNext());
        assertThat(status(id)).isEqualTo("FILLED");
        assertThatThrownBy(() -> cancellations.cancel(id, user))
                .isInstanceOfSatisfying(OrderCancellationException.class,
                        e -> assertThat(e.reason()).isEqualTo(OrderCancellationException.Reason.ORDER_NOT_CANCELLABLE));
    }

    @Test
    void cancelRacingTheWorkerLeavesExactlyOneOutcome() throws Exception {
        UUID id = submit("BUY", 1);
        var claim = worker.claimNext();
        assertThat(status(id)).isEqualTo("PENDING");
        // Another connection holds the order's row lock, as the worker does while it executes.
        try (var executing = jdbc.getDataSource().getConnection()) {
            executing.setAutoCommit(false);
            try (var lock = executing.prepareStatement("SELECT order_id FROM orders WHERE order_id = ? FOR UPDATE")) {
                lock.setObject(1, id);
                lock.executeQuery().close();
            }
            assertThatThrownBy(() -> cancellations.cancel(id, user))
                    .isInstanceOfSatisfying(OrderCancellationException.class,
                            e -> assertThat(e.reason()).isEqualTo(OrderCancellationException.Reason.ORDER_EXECUTING));
            executing.rollback();
        }
        assertThat(status(id)).isEqualTo("PENDING");
        worker.execute(claim);
        assertThat(status(id)).isEqualTo("FILLED");
        assertThat(count("fills")).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM audit_log WHERE event_type='ORDER_CANCELLED'", Integer.class)).isZero();
    }

    @Test
    void priceProtectionMeasuresMovesFromTheQuoteSeenAtSubmission() {
        UUID moved = submit("BUY", 1);
        assertThat(jdbc.queryForObject("SELECT reference_price FROM orders WHERE order_id=?", BigDecimal.class, moved))
                .isEqualByComparingTo("100");
        // The market jumps 5% before the worker runs; the account default tolerance is 2%.
        jdbc.update("INSERT INTO quotes(instrument_id,bid,ask,quoted_at,source) VALUES (?,104.9,105,clock_timestamp(),'TEST')", instrument);
        worker.execute(worker.claimNext());
        assertThat(status(moved)).isEqualTo("REJECTED");
        assertThat(jdbc.queryForObject("SELECT reason_text FROM order_status_history WHERE order_id=? AND status='REJECTED'",
                String.class, moved))
                .isEqualTo("The price rose 5.0% before your order filled, more than your 2% limit. Nothing was charged.");
        assertThat(jdbc.queryForMap("""
                SELECT payload->>'referencePrice' AS reference, payload->>'limitPrice' AS lim, payload->>'actualPrice' AS actual
                FROM audit_log WHERE event_type='PRICE_DECISION' AND related_order_id=?
                """, moved)).containsEntry("reference", "100.0000").containsEntry("lim", "102.0000").containsEntry("actual", "105.00000000");
        assertThat(count("fills")).isZero();
        assertThat(jdbc.queryForObject("SELECT balance FROM cash_balances", BigDecimal.class)).isEqualByComparingTo("10000");

        // A new order is measured from the new price, so a small move from there still fills.
        UUID fills = submit("BUY", 1);
        jdbc.update("INSERT INTO quotes(instrument_id,bid,ask,quoted_at,source) VALUES (?,105.9,106,clock_timestamp(),'TEST')", instrument);
        worker.execute(worker.claimNext());
        assertThat(status(fills)).isEqualTo("FILLED");
        assertThat(jdbc.queryForObject("SELECT execution_price FROM fills", BigDecimal.class)).isEqualByComparingTo("106");
    }

    @Test
    void tradeRecordsCannotBeChangedOrRemovedEvenByTheOwner() {
        UUID id = submit("BUY", 1);
        worker.execute(worker.claimNext());
        assertThat(status(id)).isEqualTo("FILLED");
        for (String table : new String[]{"audit_log", "order_status_history", "holding_movements", "cash_transactions"}) {
            String column = table.equals("order_status_history") ? "occurred_at" : "created_at";
            assertThatThrownBy(() -> jdbc.update("UPDATE " + table + " SET " + column + " = " + column))
                    .rootCause().hasMessageContaining("permanent trade record");
            assertThatThrownBy(() -> jdbc.update("DELETE FROM " + table)).rootCause().hasMessageContaining("permanent trade record");
            assertThatThrownBy(() -> jdbc.execute("TRUNCATE " + table + " CASCADE")).rootCause().hasMessageContaining("permanent trade record");
        }
    }

    @Test
    void deletingAUserCannotEraseWhoTheirAuditRecordsBelongTo() {
        UUID other = UUID.randomUUID();
        jdbc.update("INSERT INTO users(user_id,email,password_hash) VALUES (?, 'other@example.test', 'test-only')", other);
        jdbc.update("INSERT INTO audit_log(user_id, actor_type, event_type) VALUES (?, 'USER', 'LOGIN')", other);
        assertThatThrownBy(() -> jdbc.update("DELETE FROM users WHERE user_id=?", other))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }

    @Test
    void aRefusedOrderCanBeLookedUpByItsRequestIdWithEveryRuleChecked() throws Exception {
        String bearer = "Bearer " + tokens.issueToken(user, "trader@example.test");
        String body = """
                {"accountId":"%s","symbol":"AAPL","clientReference":"%s","side":"BUY","quantity":1000,"orderType":"MARKET"}
                """.formatted(account, UUID.randomUUID());
        String requestId = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .post("/api/v1/orders").contextPath("/api/v1").header("Authorization", bearer)
                        .contentType("application/json").content(body))
                .andExpect(MockMvcResultMatchers.status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error").value("INSUFFICIENT_CASH"))
                .andReturn().getResponse().getHeader("X-Request-Id");

        assertThat(requestId).isNotBlank();
        assertThat(jdbc.queryForObject("""
                SELECT payload->>'reasonCode' FROM audit_log
                WHERE event_type='SUBMISSION_REFUSED' AND payload->>'requestId'=? AND related_order_id IS NULL
                """, String.class, requestId)).isEqualTo("INSUFFICIENT_CASH");
        assertThat(jdbc.queryForList("""
                SELECT payload->>'rule' || ':' || (payload->>'result') || COALESCE(':' || (payload->>'reasonCode'), '')
                FROM audit_log WHERE event_type='RULE_CHECKED' AND payload->>'requestId'=? ORDER BY created_at, audit_id
                """, String.class, requestId)).containsExactlyInAnyOrder(
                "ACCOUNT_ACTIVE:PASS", "TRADING_ENABLED:PASS", "INSTRUMENT_SUPPORTED:PASS", "INSTRUMENT_ENABLED:PASS",
                "INSTRUMENT_TRADABLE:PASS", "LOCATION:PASS", "SUFFICIENCY:FAIL:INSUFFICIENT_CASH");
        assertThat(count("orders")).isZero();
    }

    @Test
    void anAcceptedOrderRecordsAPassForEveryRuleWithTheOrder() {
        UUID id = submit("BUY", 1);
        assertThat(jdbc.queryForList("""
                SELECT payload->>'result' FROM audit_log WHERE event_type='RULE_CHECKED' AND related_order_id=?
                """, String.class, id)).hasSize(7).containsOnly("PASS");
    }
}
