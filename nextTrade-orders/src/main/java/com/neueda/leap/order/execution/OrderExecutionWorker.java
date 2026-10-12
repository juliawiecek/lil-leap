package com.neueda.leap.order.execution;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

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

    private static final String LOCK_FOR_EXECUTION_SQL = """
            SELECT order_id FROM orders WHERE order_id = ? AND execution_attempts = ?
                AND status = 'PENDING' AND accepted_at IS NOT NULL
            FOR UPDATE SKIP LOCKED
            """;

    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;
    private final OrderExecutor executor;
    private final int retrySeconds;

    /**
     * Creates a {@code OrderExecutionWorker} with the supplied dependencies.
     *
     * @param jdbc JDBC operations participating in Spring transactions
     * @param manager transaction manager used for independent claim and execution transactions
     * @param executor executor invoked while the order row is locked
     * @param retrySeconds positive delay in seconds before a claimed order is eligible again
     * @throws IllegalArgumentException if the retry delay is less than one second
     */
    public OrderExecutionWorker(JdbcTemplate jdbc, PlatformTransactionManager manager,
                                OrderExecutor executor, int retrySeconds) {
        if (retrySeconds < 1) throw new IllegalArgumentException("Retry delay must be positive");
        this.jdbc = jdbc;
        this.executor = executor;
        this.retrySeconds = retrySeconds;
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
     * and relies on the executor to set terminal status. PENDING rolls back trade effects.
     * Failures and pending outcomes schedule a later attempt in a separate transaction.
     *
     * @param claim persisted claim and attempt number
     */
    public void execute(Claim claim) {
        try {
            boolean pending = executeClaimTransaction(claim);
            if (pending) defer(claim, "EXECUTION_PENDING");
        } catch (RuntimeException failure) {
            // The committed claim survives even if this diagnostic update also fails.
            defer(claim, "EXECUTION_FAILED");
        }
    }

    private boolean executeClaimTransaction(Claim claim) {
        return Boolean.TRUE.equals(transaction.execute(tx -> {
            var locked = jdbc.query(LOCK_FOR_EXECUTION_SQL,
                    (rs, n) -> rs.getObject(1, UUID.class), claim.orderId(), claim.attempt());
            if (locked.isEmpty()) {
                return false;
            }
            return processOutcome(claim, executor.execute(claim.orderId()), tx);
        }));
    }

    private void defer(Claim claim, String reason) {
        transaction.executeWithoutResult(tx -> jdbc.update(DEFER_SQL, retrySeconds, reason, claim.orderId(), claim.attempt()));
    }

    private boolean processOutcome(Claim claim, OrderExecutor.Outcome outcome,
                                   org.springframework.transaction.TransactionStatus tx) {
        return switch (outcome) {
            case FILLED -> {
                validateFill(claim.orderId());
                jdbc.update("UPDATE orders SET status = 'FILLED', updated_at = CURRENT_TIMESTAMP, last_execution_error = NULL WHERE order_id = ?",
                        claim.orderId());
                yield false;
            }
            case REJECTED -> {
                validateRejection(claim.orderId());
                yield false;
            }
            case PENDING -> {
                // Roll back any accidental partial effects from an unavailable executor.
                tx.setRollbackOnly();
                yield true;
            }
        };
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
