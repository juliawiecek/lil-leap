package com.neueda.leap.order.execution;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.UUID;

/** Database-backed queue: acceptance, claim, and execution commit independently. */
public class OrderExecutionWorker {
    /** Default attempt limit for unexpected failures, matching the quote and price retry limits. */
    public static final long DEFAULT_MAX_ATTEMPTS = 10;
    static final String EXECUTION_FAILED = "EXECUTION_FAILED";

    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;
    private final OrderExecutor executor;
    private final int retrySeconds;
    private final long maxAttempts;

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
        this(jdbc, manager, executor, retrySeconds, DEFAULT_MAX_ATTEMPTS);
    }

    /**
     * Creates a {@code OrderExecutionWorker} with the supplied dependencies.
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
        if (retrySeconds < 1) {
            throw new IllegalArgumentException("Retry delay must be positive");
        }
        if (maxAttempts < 1) {
            throw new IllegalArgumentException("Attempt limit must be positive");
        }
        this.jdbc = jdbc;
        this.executor = executor;
        this.retrySeconds = retrySeconds;
        this.maxAttempts = maxAttempts;
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
        return transaction.execute(tx -> jdbc.query("""
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
                """, (rs, n) -> new Claim(rs.getObject("order_id", UUID.class),
                rs.getLong("execution_attempts")), retrySeconds).stream().findFirst().orElse(null));
    }

    private void acceptNext() {
        // Acceptance is durable before execution. Resource availability is checked
        // again under the account lock at settlement; acceptance is not a reservation.
        transaction.executeWithoutResult(tx -> jdbc.update("""
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
                """));
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
        String requeueReason;
        try {
            requeueReason = transaction.execute(tx -> {
                var locked = jdbc.query("""
                        SELECT order_id FROM orders WHERE order_id = ? AND execution_attempts = ?
                            AND status = 'PENDING' AND accepted_at IS NOT NULL
                        FOR UPDATE SKIP LOCKED
                        """, (rs, n) -> rs.getObject(1, UUID.class), claim.orderId(), claim.attempt());
                if (locked.isEmpty()) {
                    return null;
                }
                OrderExecutor.Result result = executor.execute(claim.orderId());
                if (result == null) {
                    throw new IllegalStateException("Execution result is required");
                }
                return switch (result.outcome()) {
                    case FILLED -> {
                        markFilled(claim);
                        yield null;
                    }
                    case REJECTED -> {
                        requireRejectionRecorded(claim);
                        yield null;
                    }
                    case PENDING -> {
                        // Roll back any accidental partial effects from an unavailable executor.
                        tx.setRollbackOnly();
                        yield result.reason();
                    }
                };
            });
        } catch (RuntimeException failure) {
            // The committed claim survives even if this diagnostic update also fails.
            if (claim.attempt() >= maxAttempts) {
                reject(claim, EXECUTION_FAILED);
            } else {
                defer(claim, OrderExecutor.Result.RETRY_PREFIX + EXECUTION_FAILED);
            }
            return;
        }
        if (requeueReason != null) {
            defer(claim, requeueReason);
        }
    }

    private void markFilled(Claim claim) {
        Integer fills = jdbc.queryForObject("SELECT count(*) FROM fills WHERE order_id = ?",
                Integer.class, claim.orderId());
        if (fills == null || fills != 1) {
            throw new IllegalStateException("Execution must persist a fill");
        }
        jdbc.update("UPDATE orders SET status = 'FILLED', updated_at = CURRENT_TIMESTAMP, last_execution_error = NULL WHERE order_id = ?",
                claim.orderId());
    }

    /** Terminal rejection: the executor already set REJECTED status; no retry or deferral follows. */
    private void requireRejectionRecorded(Claim claim) {
        Integer rejections = jdbc.queryForObject("SELECT count(*) FROM order_status_history WHERE order_id = ? AND status = 'REJECTED'",
                Integer.class, claim.orderId());
        if (rejections == null || rejections == 0) {
            throw new IllegalStateException("Rejection must record reason in order_status_history");
        }
    }

    /** Ends retries for an order that keeps failing unexpectedly; fenced by attempt like a requeue. */
    private void reject(Claim claim, String reason) {
        transaction.executeWithoutResult(tx -> jdbc.update("""
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
                """, reason, claim.orderId(), claim.attempt(), reason, reason));
    }

    private void defer(Claim claim, String reason) {
        transaction.executeWithoutResult(tx -> jdbc.update("""
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
                """, retrySeconds, reason, claim.orderId(), claim.attempt()));
    }

    /**
     * Persisted order claim whose attempt number prevents execution by a stale worker.
     *
     * @param orderId persistent order identifier
     * @param attempt attempt number used to fence stale worker claims
     */
    public record Claim(UUID orderId, long attempt) { }
}
