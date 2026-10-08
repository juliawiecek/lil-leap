package com.neueda.leap.order.submission;

import com.neueda.leap.order.submission.dto.SubmitOrderRequest;
import com.neueda.leap.order.submission.service.IdempotencyConflictException;
import com.neueda.leap.order.submission.service.OrderSubmissionResult;
import com.neueda.leap.order.submission.service.OrderSubmissionService;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import java.util.concurrent.Executors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Verifies account-scoped idempotency key behavior (BR-04, BR-05).
 * Tests that duplicate client references return the same order without duplicating fills.
 * Concurrent submissions with the same key cannot create two orders (database uniqueness enforced).
 */
@SpringBootTest(properties = "orders.execution.enabled=false")
@EnabledIfEnvironmentVariable(named = "TEST_POSTGRES_URL", matches = ".+")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class OrderIdempotencyPostgresTest {
    private static final String SCHEMA = "idempotency_" + UUID.randomUUID().toString().replace("-", "");

    @Autowired JdbcTemplate jdbc;
    @Autowired OrderSubmissionService submissions;

    private UUID user, account, instrument;

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
    void cleanup() {
        admin().execute("DROP SCHEMA IF EXISTS " + SCHEMA + " CASCADE");
    }

    @BeforeEach
    void fixtures() {
        jdbc.execute("TRUNCATE users, instruments, quotes CASCADE");
        user = UUID.randomUUID();
        account = UUID.randomUUID();
        instrument = UUID.randomUUID();
        jdbc.update("INSERT INTO users(user_id,email,password_hash) VALUES (?, 'trader@example.test', 'test-only')", user);
        jdbc.update("""
                INSERT INTO accounts(account_id,user_id,account_number,account_name,account_status,trading_enabled,min_balance_requirement)
                VALUES (?, ?, 'TEST', 'Test', 'ACTIVE', TRUE, 1)
                """, account, user);
        jdbc.update("INSERT INTO instruments(instrument_id,symbol,instrument_name,asset_class,market_code,currency) VALUES (?, 'AAPL', 'Apple', 'COMMON_STOCK', 'NASDAQ', 'USD')", instrument);
        jdbc.update("INSERT INTO quotes(instrument_id,bid,ask,quoted_at,source) VALUES (?,'225.00','225.50',CURRENT_TIMESTAMP,'SYNTHETIC_GBM')", instrument);
        jdbc.update("INSERT INTO cash_balances(account_id,balance) VALUES (?,10000)", account);
        jdbc.update("INSERT INTO cash_transactions(account_id,transaction_type,amount) VALUES (?,'DEPOSIT',10000)", account);
    }

    /**
     * AC1: A client-scoped idempotency key on order submission returns the original order for an identical retry.
     */
    @Test
    void sameClientReferenceReturnsSameOrderWithCreatedFalse() {
        UUID reference = UUID.randomUUID();
        var request = new SubmitOrderRequest(account, "AAPL", reference, "BUY", 10, "MARKET", null);

        // First submission
        OrderSubmissionResult firstResult = submissions.submit(user, request);
        assertThat(firstResult.created()).isTrue();
        assertThat(firstResult.order().orderId()).isNotNull();
        UUID firstOrderId = firstResult.order().orderId();

        // Retry with same client reference
        OrderSubmissionResult retryResult = submissions.submit(user, request);
        assertThat(retryResult.created()).isFalse();
        assertThat(retryResult.order().orderId()).isEqualTo(firstOrderId);
        assertThat(retryResult.order().side()).isEqualTo("BUY");
        assertThat(retryResult.order().quantity()).isEqualTo(10);
        assertThat(retryResult.order().status()).isEqualTo("SUBMITTED");

        // Verify only one order exists
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM orders WHERE account_id = ? AND client_reference = ?",
                Integer.class, account, reference);
        assertThat(count).isEqualTo(1);
    }

    /**
     * AC2: A retry with the same key but a changed payload returns a conflict, not a silent overwrite or a second order.
     * This is implicitly tested: the unique constraint prevents the second insert, and we retry the lookup.
     * Note: The API doesn't explicitly return 409 yet, but the service prevents duplicate creation.
     */
    @Test
    void differentPayloadWithSameReferenceIsAConflict() {
        UUID reference = UUID.randomUUID();
        var request1 = new SubmitOrderRequest(account, "AAPL", reference, "BUY", 10, "MARKET", null);
        var request2 = new SubmitOrderRequest(account, "AAPL", reference, "SELL", 10, "MARKET", null);

        OrderSubmissionResult firstResult = submissions.submit(user, request1);
        assertThat(firstResult.created()).isTrue();

        // AC2: a changed payload must be reported, never silently answered with the original order
        assertThatThrownBy(() -> submissions.submit(user, request2))
                .isInstanceOf(IdempotencyConflictException.class);

        // Verify only one order in database
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM orders WHERE account_id = ?", Integer.class, account);
        assertThat(count).isEqualTo(1);
    }

    /**
     * AC3: Concurrent submissions with the same key cannot create two orders.
     * Database uniqueness constraint prevents the second insert.
     */
    @Test
    void concurrentSubmissionsWithSameReferenceBothReturnSameOrder() throws Exception {
        UUID reference = UUID.randomUUID();
        var request = new SubmitOrderRequest(account, "AAPL", reference, "BUY", 10, "MARKET", null);

        var pool = Executors.newFixedThreadPool(2);
        try {
            var future1 = pool.submit(() -> submissions.submit(user, request));
            var future2 = pool.submit(() -> submissions.submit(user, request));

            OrderSubmissionResult result1 = future1.get();
            OrderSubmissionResult result2 = future2.get();

            // Both should have the same order ID
            assertThat(result1.order().orderId()).isEqualTo(result2.order().orderId());

            // Exactly one should have created=true (the one that won the race)
            assertThat(result1.created() ^ result2.created()).isTrue();

            // Verify only one order in database
            Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM orders WHERE account_id = ? AND client_reference = ?",
                    Integer.class, account, reference);
            assertThat(count).isEqualTo(1);
        } finally {
            pool.shutdownNow();
        }
    }

    /**
     * Different accounts can use the same client reference without conflict.
     * The unique constraint is (account_id, client_reference), not global.
     */
    @Test
    void sameClientReferenceAllowedAcrossDifferentAccounts() {
        UUID account2 = UUID.randomUUID();
        UUID reference = UUID.randomUUID();

        jdbc.update("""
                INSERT INTO accounts(account_id,user_id,account_number,account_name,account_status,trading_enabled,min_balance_requirement)
                VALUES (?, ?, 'TEST2', 'Test2', 'ACTIVE', TRUE, 1)
                """, account2, user);
        jdbc.update("INSERT INTO cash_balances(account_id,balance) VALUES (?,10000)", account2);

        // Submit with account1
        var request1 = new SubmitOrderRequest(account, "AAPL", reference, "BUY", 10, "MARKET", null);
        OrderSubmissionResult result1 = submissions.submit(user, request1);
        assertThat(result1.created()).isTrue();

        // Submit with account2 and same reference
        var request2 = new SubmitOrderRequest(account2, "AAPL", reference, "BUY", 5, "MARKET", null);
        OrderSubmissionResult result2 = submissions.submit(user, request2);
        assertThat(result2.created()).isTrue();

        // Different order IDs
        assertThat(result1.order().orderId()).isNotEqualTo(result2.order().orderId());

        // Verify two orders in database
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM orders", Integer.class);
        assertThat(count).isEqualTo(2);
    }

    /**
     * Idempotency works across different order types (symbol-based vs instrumentId-based).
     * Both use the same clientReference for the idempotency key.
     */
    @Test
    void idempotencyKeyIsIndependentOfInstrumentSubmissionMethod() {
        UUID reference = UUID.randomUUID();

        // First submission by symbol
        var symbolRequest = new SubmitOrderRequest(account, "AAPL", reference, "BUY", 10, "MARKET", null);
        OrderSubmissionResult result1 = submissions.submit(user, symbolRequest);
        assertThat(result1.created()).isTrue();
        UUID orderId = result1.order().orderId();

        // Retry by instrumentId with same reference
        var idRequest = new SubmitOrderRequest(account, null, reference, "BUY", 10, "MARKET", null, instrument);
        OrderSubmissionResult result2 = submissions.submit(user, idRequest);
        assertThat(result2.created()).isFalse();
        assertThat(result2.order().orderId()).isEqualTo(orderId);

        // Only one order
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM orders WHERE account_id = ?", Integer.class, account);
        assertThat(count).isEqualTo(1);
    }

    /**
     * Idempotency respects order status history (existing orders are returned, not modified).
     */
    @Test
    void idempotentRetryPreservesOriginalOrderStatusHistory() {
        UUID reference = UUID.randomUUID();
        var request = new SubmitOrderRequest(account, "AAPL", reference, "BUY", 10, "MARKET", null);

        // First submission
        OrderSubmissionResult result1 = submissions.submit(user, request);
        UUID orderId = result1.order().orderId();

        // Get initial status history count
        Integer initialHistoryCount = jdbc.queryForObject(
                "SELECT COUNT(*) FROM order_status_history WHERE order_id = ?",
                Integer.class, orderId);

        // Retry submission
        OrderSubmissionResult result2 = submissions.submit(user, request);
        assertThat(result2.created()).isFalse();

        // Status history count should not increase (no duplicate status entry)
        Integer finalHistoryCount = jdbc.queryForObject(
                "SELECT COUNT(*) FROM order_status_history WHERE order_id = ?",
                Integer.class, orderId);
        assertThat(finalHistoryCount).isEqualTo(initialHistoryCount);
    }

    /**
     * Idempotency key persistence: Verify clientReference is stored correctly in the database.
     */
    @Test
    void clientReferenceIsPersisstedInOrderTable() {
        UUID reference = UUID.randomUUID();
        var request = new SubmitOrderRequest(account, "AAPL", reference, "BUY", 10, "MARKET", null);

        OrderSubmissionResult result = submissions.submit(user, request);
        UUID storedReference = jdbc.queryForObject(
                "SELECT client_reference FROM orders WHERE order_id = ?",
                java.util.UUID.class, result.order().orderId());

        assertThat(storedReference).isEqualTo(reference);
    }
}
