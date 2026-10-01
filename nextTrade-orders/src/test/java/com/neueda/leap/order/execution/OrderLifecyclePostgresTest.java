package com.neueda.leap.order.execution;

import com.neueda.leap.order.submission.dto.SubmitOrderRequest;
import com.neueda.leap.order.submission.service.OrderSubmissionService;
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
    @Autowired org.springframework.test.web.servlet.MockMvc mvc;
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
        jdbc.execute("TRUNCATE users, instruments CASCADE");
        user = UUID.randomUUID(); account = UUID.randomUUID(); instrument = UUID.randomUUID();
        jdbc.update("INSERT INTO users(user_id,email,password_hash) VALUES (?, 'trader@example.test', 'test-only')", user);
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

    @Test
    void apiDocumentationExposesOnlyTheCanonicalOrderRoute() throws Exception {
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .get("/api/v1/v3/api-docs").contextPath("/api/v1"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.paths['/orders'].post").exists())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.paths['/clients/{id}/orders']").doesNotExist());
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
        assertThat(jdbc.queryForList("SELECT event_type FROM audit_log ORDER BY event_type", String.class))
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
    void sellPreservesRemainingAverageCostAndCreditsCash() {
        submit("BUY", 10); worker.execute(worker.claimNext());
        UUID sell = submit("SELL", 4); worker.execute(worker.claimNext());
        assertThat(status(sell)).isEqualTo("FILLED");
        assertThat(jdbc.queryForObject("SELECT quantity FROM holdings", Long.class)).isEqualTo(6);
        assertThat(jdbc.queryForObject("SELECT avg_cost FROM holdings", BigDecimal.class)).isEqualByComparingTo("100");
        assertThat(jdbc.queryForObject("SELECT balance FROM cash_balances", BigDecimal.class)).isEqualByComparingTo("9396");
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
        assertThat(jdbc.queryForList("SELECT event_type FROM audit_log ORDER BY event_type", String.class))
                .containsExactly("ORDER_ACCEPTED", "ORDER_REQUEUED");
        assertThat(jdbc.queryForObject("SELECT balance FROM cash_balances", BigDecimal.class)).isEqualByComparingTo("10000");
    }

    @Test
    void legacyUnvalidatedSubmissionIsNotAutomaticallyTraded() {
        UUID id = submit("BUY", 1);
        jdbc.update("DELETE FROM order_status_history WHERE order_id=?", id);
        assertThat(worker.claimNext()).isNull();
        assertThat(status(id)).isEqualTo("SUBMITTED");
        assertThat(count("fills")).isZero();
    }

    @Test
    void absentProjectionIsRejectedBeforeTheWorkerCanTrade() {
        var verifier = new JdbcOrderExecutor(jdbc, null, 1);
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
        assertThat(jdbc.queryForList("SELECT event_type FROM audit_log ORDER BY event_type", String.class))
                .containsExactly("ORDER_ACCEPTED", "ORDER_REJECTED", "ORDER_REQUEUED");
        assertThat(count("fills")).isZero();
    }
}
