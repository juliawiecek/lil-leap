package com.neueda.leap.order.execution;

import com.neueda.leap.order.execution.event.OrderLifecycleEventPublisher;
import com.neueda.leap.order.market.MarketHours;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

/** Database-backed queue: acceptance, claim, and execution commit independently. */
public class OrderExecutionWorker {
    private static final String CLAIM_NEXT_SQL = """
            WITH candidate AS (
                SELECT order_id FROM orders
                WHERE status IN ('ACCEPTED', 'PENDING') AND accepted_at IS NOT NULL
                  AND next_execution_at <= CURRENT_TIMESTAMP
                ORDER BY next_execution_at, order_id
                LIMIT 1 FOR UPDATE SKIP LOCKED
            )
            UPDATE orders o SET status = 'PENDING', execution_attempts = execution_attempts + 1,
                next_execution_at = CURRENT_TIMESTAMP + (? * INTERVAL '1 second'),
                updated_at = CURRENT_TIMESTAMP, last_execution_error = NULL
            FROM candidate c WHERE o.order_id = c.order_id
            RETURNING o.order_id, o.execution_attempts
            """;

    private static final String ACCEPT_NEXT_SQL = """
            WITH candidate AS (
                SELECT order_id FROM orders WHERE status = 'SUBMITTED'
                  AND EXISTS (SELECT 1 FROM order_status_history h
                              WHERE h.order_id = orders.order_id
                                AND h.status = 'SUBMITTED' AND h.reason_code = 'SUBMISSION_VALIDATED')
                ORDER BY submitted_at, order_id LIMIT 1 FOR UPDATE SKIP LOCKED
            ), accepted AS (
                UPDATE orders o SET status = 'ACCEPTED', accepted_at = CURRENT_TIMESTAMP,
                    next_execution_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                FROM candidate c WHERE o.order_id = c.order_id RETURNING o.order_id, o.account_id
            ), audited AS (
                INSERT INTO audit_log(account_id, related_order_id, actor_type, event_type, payload)
                SELECT account_id, order_id, 'SYSTEM', 'ORDER_ACCEPTED',
                       jsonb_build_object('status', 'ACCEPTED') FROM accepted
            )
            INSERT INTO order_status_history(order_id, status, reason_code)
            SELECT order_id, 'ACCEPTED', 'ORDER_ACCEPTED' FROM accepted
            """;

    private static final String DEFER_SQL = """
            WITH deferred AS (
                UPDATE orders SET next_execution_at = CURRENT_TIMESTAMP + (? * INTERVAL '1 second'),
                    last_execution_error = ?, updated_at = CURRENT_TIMESTAMP
                WHERE order_id = ? AND execution_attempts = ? AND status = 'PENDING'
                RETURNING order_id, account_id, execution_attempts, next_execution_at, last_execution_error
            )
            INSERT INTO audit_log(account_id, related_order_id, actor_type, event_type, payload)
            SELECT account_id, order_id, 'SYSTEM', 'ORDER_REQUEUED',
                   jsonb_build_object('attemptNumber', execution_attempts, 'reasonCode', last_execution_error,
                                      'nextExecutionTime', next_execution_at) FROM deferred
            """;

    /** Holds a claimed order until the market opens; it executes on the first claim after that. */
    private static final String HOLD_UNTIL_OPEN_SQL = """
            WITH held AS (
                UPDATE orders SET next_execution_at = ?, last_execution_error = 'MARKET_CLOSED',
                    updated_at = CURRENT_TIMESTAMP
                WHERE order_id = ? AND execution_attempts = ? AND status = 'PENDING'
                RETURNING order_id, account_id, execution_attempts, next_execution_at
            ), history AS (
                INSERT INTO order_status_history(order_id, status, reason_code)
                SELECT order_id, 'PENDING', 'MARKET_CLOSED' FROM held
            )
            INSERT INTO audit_log(account_id, related_order_id, actor_type, event_type, payload)
            SELECT account_id, order_id, 'SYSTEM', 'ORDER_REQUEUED',
                   jsonb_build_object('attemptNumber', execution_attempts, 'reasonCode', 'MARKET_CLOSED',
                                      'nextExecutionTime', next_execution_at) FROM held
            """;

    private static final String LOCK_FOR_EXECUTION_SQL = """
            SELECT order_id FROM orders WHERE order_id = ? AND execution_attempts = ?
                AND status = 'PENDING' AND accepted_at IS NOT NULL
            FOR UPDATE SKIP LOCKED
            """;

    private static final String REJECT_SQL = """
            WITH rejected AS (
                UPDATE orders SET status = 'REJECTED', last_execution_error = ?, updated_at = CURRENT_TIMESTAMP
                WHERE order_id = ? AND execution_attempts = ? AND status = 'PENDING'
                RETURNING order_id, account_id, execution_attempts
            ), history AS (
                INSERT INTO order_status_history(order_id, status, reason_code)
                SELECT order_id, 'REJECTED', ? FROM rejected
            )
            INSERT INTO audit_log(account_id, related_order_id, actor_type, event_type, payload)
            SELECT account_id, order_id, 'SYSTEM', 'ORDER_REJECTED',
                   jsonb_build_object('reasonCode', CAST(? AS text), 'attemptNumber', execution_attempts) FROM rejected
            """;

    /** Default attempt limit for unexpected failures, matching the quote and price retry limits. */
    public static final long DEFAULT_MAX_ATTEMPTS = 10;
    static final String EXECUTION_FAILED = "EXECUTION_FAILED";

    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;
    private final OrderExecutor executor;
    private final OrderLifecycleEventPublisher eventPublisher;
    private final int retrySeconds;
    private final long maxAttempts;
    private final MarketHours marketHours;
    private final Clock clock;

    /**
     * Creates a {@code OrderExecutionWorker} with the default attempt limit for unexpected failures.
     *
     * @param jdbc JDBC operations participating in Spring transactions
     * @param manager transaction manager used for independent claim and execution transactions
     * @param executor executor invoked while the order row is locked
     * @param retrySeconds positive delay in seconds before a claimed order is eligible again
     * @throws IllegalArgumentException if the retry delay is less than one second
     */
    public OrderExecutionWorker(JdbcTemplate jdbc, PlatformTransactionManager manager,
                                OrderExecutor executor, int retrySeconds) {
        this(jdbc, manager, executor, orderId -> { }, retrySeconds);
    }

    /**
     * Creates a {@code OrderExecutionWorker} with terminal-event publishing and the default attempt limit.
     *
     * @param jdbc JDBC operations participating in Spring transactions
     * @param manager transaction manager used for independent claim and execution transactions
     * @param executor executor invoked while the order row is locked
     * @param eventPublisher Kafka publisher invoked after terminal commits
     * @param retrySeconds positive delay in seconds before a claimed order is eligible again
     * @throws IllegalArgumentException if the retry delay is less than one second
     */
    public OrderExecutionWorker(JdbcTemplate jdbc, PlatformTransactionManager manager,
                                OrderExecutor executor, OrderLifecycleEventPublisher eventPublisher,
                                int retrySeconds) {
        this(jdbc, manager, executor, eventPublisher, retrySeconds, DEFAULT_MAX_ATTEMPTS, null,
                Clock.systemUTC());
    }

    /**
     * Creates a {@code OrderExecutionWorker} with the supplied attempt limit.
     *
     * @param jdbc JDBC operations participating in Spring transactions
     * @param manager transaction manager used for independent claim and execution transactions
     * @param executor executor invoked while the order row is locked
     * @param retrySeconds positive delay in seconds before a claimed order is eligible again
     * @param maxAttempts attempts after which an unexpected failure rejects the order instead of requeueing it
     * @throws IllegalArgumentException if the retry delay or attempt limit is less than one
     */
    public OrderExecutionWorker(JdbcTemplate jdbc, PlatformTransactionManager manager,
                                OrderExecutor executor, int retrySeconds, long maxAttempts) {
        this(jdbc, manager, executor, orderId -> { }, retrySeconds, maxAttempts, null, Clock.systemUTC());
    }

    /**
     * Creates a {@code OrderExecutionWorker} that only executes during market hours (NEXT-212).
     *
     * @param jdbc JDBC operations participating in Spring transactions
     * @param manager transaction manager used for independent claim and execution transactions
     * @param executor executor invoked while the order row is locked
     * @param retrySeconds positive delay in seconds before a claimed order is eligible again
     * @param maxAttempts attempts after which an unexpected failure rejects the order instead of requeueing it
     * @param marketHours session rules; null executes at any time
     * @param clock source of the current time
     * @throws IllegalArgumentException if the retry delay or attempt limit is less than one
     */
    public OrderExecutionWorker(JdbcTemplate jdbc, PlatformTransactionManager manager,
                                OrderExecutor executor, int retrySeconds, long maxAttempts,
                                MarketHours marketHours, Clock clock) {
        this(jdbc, manager, executor, orderId -> { }, retrySeconds, maxAttempts, marketHours, clock);
    }

    /**
     * Creates a {@code OrderExecutionWorker} with the supplied dependencies.
     *
     * @param jdbc JDBC operations participating in Spring transactions
     * @param manager transaction manager used for independent claim and execution transactions
     * @param executor executor invoked while the order row is locked
     * @param eventPublisher Kafka publisher invoked after terminal commits
     * @param retrySeconds positive delay in seconds before a claimed order is eligible again
     * @param maxAttempts attempts after which an unexpected failure rejects the order instead of requeueing it
     * @param marketHours session rules; null executes at any time
     * @param clock source of the current time
     * @throws IllegalArgumentException if the retry delay or attempt limit is less than one
     */
    public OrderExecutionWorker(JdbcTemplate jdbc, PlatformTransactionManager manager,
                                OrderExecutor executor, OrderLifecycleEventPublisher eventPublisher,
                                int retrySeconds, long maxAttempts, MarketHours marketHours, Clock clock) {
        if (retrySeconds < 1) {
            throw new IllegalArgumentException("Retry delay must be positive");
        }
        if (maxAttempts < 1) {
            throw new IllegalArgumentException("Attempt limit must be positive");
        }
        this.jdbc = jdbc;
        this.executor = executor;
        this.eventPublisher = eventPublisher;
        this.retrySeconds = retrySeconds;
        this.maxAttempts = maxAttempts;
        this.marketHours = marketHours;
        this.clock = clock;
        transaction = new TransactionTemplate(manager);
        transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    /**
     * Claims one committed order; SKIP LOCKED permits multiple application instances.
     *
     * @return persisted claim, or null when no due unlocked order exists
     */
    public Claim claimNext() {
        acceptNext();
        return transaction.execute(tx -> jdbc.query(CLAIM_NEXT_SQL, (rs, n) -> new Claim(rs.getObject("order_id", UUID.class),
                rs.getLong("execution_attempts")), retrySeconds).stream().findFirst().orElse(null));
    }

    private void acceptNext() {
        // Acceptance is durable before execution. Resource availability is checked
        // again under the account lock at settlement; acceptance is not a reservation.
        transaction.executeWithoutResult(tx -> jdbc.update(ACCEPT_NEXT_SQL));
    }

    /**
     * Executes a matching, locked claim in a new transaction; stale or locked claims are skipped.
     * FILLED requires exactly one persisted fill. REJECTED requires a rejection audit entry
     * and relies on the executor to set terminal status. PENDING rolls back trade effects and
     * requeues with the executor's {@code RETRY_} reason. An unexpected failure is requeued as
     * {@code RETRY_EXECUTION_FAILED} until the attempt limit, then rejected as {@code EXECUTION_FAILED}.
     * Requeues and failure rejections are written in a separate transaction.
     *
     * @param claim persisted claim and attempt number
     */
    public void execute(Claim claim) {
        Instant now = clock.instant();
        if (marketHours != null && !marketHours.isOpen(now)) {
            holdUntilOpen(claim, marketHours.nextOpen(now));
            return;
        }
        try {
            OrderExecutor.Result result = executeClaimTransaction(claim);
            if (result == null) {
                return;
            }
            if (result.outcome() == OrderExecutor.Outcome.PENDING) {
                defer(claim, result.reason());
                return;
            }
            publishTerminalEvent(claim.orderId());
        } catch (RuntimeException failure) {
            // The committed claim survives even if this diagnostic update also fails.
            if (claim.attempt() >= maxAttempts) {
                reject(claim, EXECUTION_FAILED);
            } else {
                defer(claim, OrderExecutor.Result.RETRY_PREFIX + EXECUTION_FAILED);
            }
            return;
        }
    }

    private OrderExecutor.Result executeClaimTransaction(Claim claim) {
        return transaction.execute(tx -> {
            var locked = jdbc.query(LOCK_FOR_EXECUTION_SQL,
                    (rs, n) -> rs.getObject(1, UUID.class), claim.orderId(), claim.attempt());
            if (locked.isEmpty()) {
                return null;
            }
            return processResult(claim, executor.execute(claim.orderId()), tx);
        });
    }

    private void defer(Claim claim, String reason) {
        transaction.executeWithoutResult(tx -> jdbc.update(DEFER_SQL, retrySeconds, reason, claim.orderId(), claim.attempt()));
    }

    /** Keeps the order PENDING until the next session; fenced by attempt like a requeue. */
    private void holdUntilOpen(Claim claim, Instant open) {
        transaction.executeWithoutResult(tx -> jdbc.update(HOLD_UNTIL_OPEN_SQL, Timestamp.from(open),
                claim.orderId(), claim.attempt()));
    }

    /** Ends retries for an order that keeps failing unexpectedly; fenced by attempt like a requeue. */
    private void reject(Claim claim, String reason) {
        transaction.executeWithoutResult(tx -> jdbc.update(REJECT_SQL, reason, claim.orderId(), claim.attempt(), reason, reason));
    }

    /** Processes the executor result inside the worker transaction and returns it for post-commit handling. */
    private OrderExecutor.Result processResult(Claim claim, OrderExecutor.Result result,
                                              org.springframework.transaction.TransactionStatus tx) {
        if (result == null) {
            throw new IllegalStateException("Execution result is required");
        }
        return switch (result.outcome()) {
            case FILLED -> {
                validateFill(claim.orderId());
                jdbc.update("UPDATE orders SET status = 'FILLED', updated_at = CURRENT_TIMESTAMP, last_execution_error = NULL WHERE order_id = ?",
                        claim.orderId());
                yield result;
            }
            case REJECTED -> {
                validateRejection(claim.orderId());
                yield result;
            }
            case PENDING -> {
                // Roll back any accidental partial effects from an unavailable executor.
                tx.setRollbackOnly();
                yield result;
            }
        };
    }

    private void publishTerminalEvent(UUID orderId) {
        try {
            eventPublisher.publishTerminalEvent(orderId);
        } catch (RuntimeException failure) {
            // Kafka is best-effort for the demo flow; order completion still stands.
        }
    }

    private void validateFill(UUID orderId) {
        Integer fills = jdbc.queryForObject("SELECT count(*) FROM fills WHERE order_id = ?", Integer.class, orderId);
        if (fills == null || fills != 1) {
            throw new IllegalStateException("Execution must persist a fill");
        }
    }

    private void validateRejection(UUID orderId) {
        Integer rejections = jdbc.queryForObject(
                "SELECT count(*) FROM order_status_history WHERE order_id = ? AND status = 'REJECTED'",
                Integer.class,
                orderId);
        if (rejections == null || rejections == 0) {
            throw new IllegalStateException("Rejection must record reason in order_status_history");
        }
    }

    /**
     * Persisted order claim whose attempt number prevents execution by a stale worker.
     *
     * @param orderId persistent order identifier
     * @param attempt attempt number used to fence stale worker claims
     */
    public record Claim(UUID orderId, long attempt) { }
}
