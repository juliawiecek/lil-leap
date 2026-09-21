package com.neueda.leap.order.execution;

import com.neueda.leap.order.submission.dto.SubmitOrderRequest;
import com.neueda.leap.order.submission.repository.JdbcOrderSubmissionRepository;
import com.neueda.leap.order.submission.service.OrderSubmissionService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.core.env.MapPropertySource;

import java.util.UUID;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

/** Uses real PostgreSQL locks and commits; initialize with db/finalized-schema.sql. */
@EnabledIfEnvironmentVariable(named = "TEST_POSTGRES_URL", matches = ".+")
class OrderExecutionDurabilityTest {
    private JdbcTemplate jdbc;
    private TransactionTemplate transaction;
    private UUID user;
    private UUID account;
    private UUID instrument;

    private DriverManagerDataSource dataSource() {
        return new DriverManagerDataSource(System.getenv("TEST_POSTGRES_URL"),
                System.getenv("TEST_POSTGRES_USER"), System.getenv("TEST_POSTGRES_PASSWORD"));
    }

    @BeforeEach
    void setup() {
        var source = dataSource();
        jdbc = new JdbcTemplate(source);
        transaction = new TransactionTemplate(new DataSourceTransactionManager(source));
        user = jdbc.queryForObject("INSERT INTO users(email,password_hash) VALUES (?, 'test') RETURNING user_id",
                UUID.class, UUID.randomUUID() + "@example.test");
        account = jdbc.queryForObject("INSERT INTO accounts(user_id,account_number,account_name) VALUES (?,?,'Test') RETURNING account_id",
                UUID.class, user, UUID.randomUUID().toString().substring(0, 20));
        instrument = jdbc.queryForObject("INSERT INTO instruments(symbol,instrument_name,asset_class,market_code) VALUES (?,'Test','COMMON_STOCK','TEST') RETURNING instrument_id",
                UUID.class, "T" + UUID.randomUUID().toString().substring(0, 8));
    }

    @AfterEach
    void cleanup() {
        jdbc.update("DELETE FROM fills WHERE order_id IN (SELECT order_id FROM orders WHERE account_id = ?)", account);
        jdbc.update("DELETE FROM orders WHERE account_id = ?", account);
        jdbc.update("DELETE FROM accounts WHERE account_id = ?", account);
        jdbc.update("DELETE FROM users WHERE user_id = ?", user);
        jdbc.update("DELETE FROM instruments WHERE instrument_id = ?", instrument);
    }

    private UUID accept() {
        String symbol = jdbc.queryForObject("SELECT symbol FROM instruments WHERE instrument_id = ?", String.class, instrument);
        var service = new OrderSubmissionService(new JdbcOrderSubmissionRepository(jdbc));
        return transaction.execute(tx -> service.submit(user,
                new SubmitOrderRequest(account, symbol, UUID.randomUUID(), "BUY", 1, "MARKET", null))
                .order().orderId());
    }

    private OrderExecutionWorker worker(OrderExecutor executor) {
        // Each worker has fresh connections and no knowledge of previous in-memory state.
        var source = dataSource();
        return new OrderExecutionWorker(new JdbcTemplate(source), new DataSourceTransactionManager(source), executor, 30);
    }

    private OrderExecutor.Outcome fill(UUID id) {
        // Must use the worker's thread-bound datasource; configured explicitly in fillingWorker.
        jdbc.update("INSERT INTO fills(order_id,filled_quantity,execution_price,quote_timestamp) VALUES (?,1,10,CURRENT_TIMESTAMP)", id);
        return OrderExecutor.Outcome.FILLED;
    }

    private OrderExecutionWorker fillingWorker(OrderExecutor executor) {
        return new OrderExecutionWorker(jdbc, new DataSourceTransactionManager(jdbc.getDataSource()), executor, 30);
    }

    private String status(UUID id) {
        return jdbc.queryForObject("SELECT status FROM orders WHERE order_id = ?", String.class, id);
    }

    private void makeDue(UUID id) {
        jdbc.update("UPDATE orders SET next_execution_at = CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE order_id = ?", id);
    }

    @Test
    void uncommittedAcceptanceIsInvisibleAndCommittedAcceptanceSurvivesNewConnections() {
        var reader = worker(id -> OrderExecutor.Outcome.PENDING);
        UUID id = transaction.execute(tx -> {
            UUID accepted = accept();
            assertThat(reader.claimNext()).isNull();
            return accepted;
        });
        assertThat(status(id)).isEqualTo("ACCEPTED");
        assertThat(jdbc.queryForObject("SELECT accepted_at IS NOT NULL FROM orders WHERE order_id = ?", Boolean.class, id)).isTrue();
        var restarted = worker(orderId -> {
            assertThat(orderId).isEqualTo(id);
            assertThat(status(id)).isEqualTo("PENDING");
            return OrderExecutor.Outcome.PENDING;
        });
        var claim = restarted.claimNext();
        assertThat(claim.orderId()).isEqualTo(id);
        restarted.execute(claim);
        assertThat(status(id)).isEqualTo("PENDING");
    }

    @Test
    void failureRollsBackFillButPreservesAcceptanceAndCanResumeExactlyOnce() {
        UUID id = accept();
        var failing = fillingWorker(orderId -> {
            fill(orderId);
            throw new IllegalStateException("simulated execution failure");
        });
        failing.execute(failing.claimNext());
        assertThat(status(id)).isEqualTo("PENDING");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM fills WHERE order_id = ?", Integer.class, id)).isZero();
        assertThat(jdbc.queryForObject("SELECT last_execution_error FROM orders WHERE order_id = ?", String.class, id)).isEqualTo("EXECUTION_FAILED");
        makeDue(id);
        var recovered = fillingWorker(this::fill);
        var claim = recovered.claimNext();
        recovered.execute(claim);
        recovered.execute(claim);
        assertThat(status(id)).isEqualTo("FILLED");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM fills WHERE order_id = ?", Integer.class, id)).isEqualTo(1);
        assertThat(recovered.claimNext()).isNull();
    }

    @Test
    void abandonedClaimIsRecoveredAndOldAttemptCannotExecute() {
        UUID id = accept();
        var first = fillingWorker(this::fill);
        var abandoned = first.claimNext();
        assertThat(first.claimNext()).isNull();
        makeDue(id);
        var restarted = fillingWorker(this::fill);
        var current = restarted.claimNext();
        assertThat(current.attempt()).isEqualTo(abandoned.attempt() + 1);
        first.execute(abandoned);
        assertThat(status(id)).isEqualTo("PENDING");
        restarted.execute(current);
        assertThat(status(id)).isEqualTo("FILLED");
    }

    @Test
    void pendingOutcomeDiscardsPartialEffectsAndRetriesReuseOrder() {
        UUID id = accept();
        var pending = fillingWorker(orderId -> {
            fill(orderId);
            return OrderExecutor.Outcome.PENDING;
        });
        pending.execute(pending.claimNext());
        assertThat(pending.claimNext()).isNull();
        makeDue(id);
        pending.execute(pending.claimNext());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM orders WHERE account_id = ?", Integer.class, account)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM fills WHERE order_id = ?", Integer.class, id)).isZero();
        assertThat(status(id)).isEqualTo("PENDING");
    }

    @Test
    void concurrentWorkersCannotExecuteOrReclaimLockedOrder() throws Exception {
        UUID id = accept();
        var calls = new AtomicInteger();
        var entered = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var first = fillingWorker(orderId -> {
            calls.incrementAndGet();
            entered.countDown();
            try {
                if (!release.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Test timed out");
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException(e);
            }
            return fill(orderId);
        });
        var claim = first.claimNext();
        makeDue(id);
        var pool = Executors.newFixedThreadPool(2);
        try {
            var running = pool.submit(() -> first.execute(claim));
            assertThat(entered.await(10, TimeUnit.SECONDS)).isTrue();
            var second = fillingWorker(this::fill);
            assertThat(second.claimNext()).isNull();
            var duplicate = pool.submit(() -> second.execute(claim));
            duplicate.get(5, TimeUnit.SECONDS);
            release.countDown();
            running.get(10, TimeUnit.SECONDS);
            duplicate.get(10, TimeUnit.SECONDS);
            assertThat(calls.get()).isEqualTo(1);
            assertThat(status(id)).isEqualTo("FILLED");
        } finally {
            release.countDown();
            pool.shutdownNow();
        }
    }

    @Test
    void rolledBackAcceptanceAndLegacySubmissionsAreNotExecuted() {
        transaction.executeWithoutResult(tx -> {
            accept();
            tx.setRollbackOnly();
        });
        assertThat(worker(id -> OrderExecutor.Outcome.PENDING).claimNext()).isNull();
        UUID id = accept();
        jdbc.update("UPDATE orders SET status = 'SUBMITTED', accepted_at = NULL WHERE order_id = ?", id);
        assertThat(worker(orderId -> OrderExecutor.Outcome.PENDING).claimNext()).isNull();
    }

    @Test
    void executorCannotMarkFilledWithoutPersistingFill() {
        UUID id = accept();
        var invalid = worker(orderId -> OrderExecutor.Outcome.FILLED);
        invalid.execute(invalid.claimNext());
        assertThat(status(id)).isEqualTo("PENDING");
    }

    @Test
    void applicationContextRestartReloadsPendingWorkAutomatically() throws Exception {
        UUID id = accept();
        var unavailable = worker(orderId -> OrderExecutor.Outcome.PENDING);
        unavailable.execute(unavailable.claimNext());
        makeDue(id);
        try (var restarted = new AnnotationConfigApplicationContext()) {
            restarted.getEnvironment().getPropertySources().addFirst(new MapPropertySource("test",
                    Map.of("orders.execution.poll-ms", "50")));
            restarted.registerBean(JdbcTemplate.class, () -> jdbc);
            restarted.registerBean(DataSourceTransactionManager.class,
                    () -> new DataSourceTransactionManager(jdbc.getDataSource()));
            restarted.registerBean(OrderExecutor.class, () -> this::fill);
            restarted.register(OrderExecutionConfiguration.class);
            restarted.refresh();
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
            while (!status(id).equals("FILLED") && System.nanoTime() < deadline) {
                Thread.sleep(25);
            }
            assertThat(status(id)).isEqualTo("FILLED");
        }
    }

    @Test
    void clientRetryOfPendingOrderReusesCommittedAcceptance() {
        String symbol = jdbc.queryForObject("SELECT symbol FROM instruments WHERE instrument_id = ?", String.class, instrument);
        var request = new SubmitOrderRequest(account, symbol, UUID.randomUUID(), "BUY", 1, "MARKET", null);
        var service = new OrderSubmissionService(new JdbcOrderSubmissionRepository(jdbc));
        var first = transaction.execute(tx -> service.submit(user, request));
        var unavailable = worker(orderId -> OrderExecutor.Outcome.PENDING);
        unavailable.execute(unavailable.claimNext());
        var retry = transaction.execute(tx -> service.submit(user, request));
        assertThat(retry.created()).isFalse();
        assertThat(retry.order().orderId()).isEqualTo(first.order().orderId());
        assertThat(retry.order().status()).isEqualTo("PENDING");
    }
}
