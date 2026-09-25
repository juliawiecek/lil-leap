package com.neueda.leap.order.execution;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.UUID;

/** Database-backed queue: acceptance, claim, and execution commit independently. */
public class OrderExecutionWorker {
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

    /**
     * Executes a matching, locked claim in a new transaction; stale or locked claims are skipped.
     * FILLED requires exactly one persisted fill. REJECTED requires a rejection audit entry
     * and relies on the executor to set terminal status. PENDING rolls back trade effects.
     * Failures and pending outcomes schedule a later attempt in a separate transaction.
     *
     * @param claim persisted claim and attempt number
     */
    public void execute(Claim claim) {
        boolean pending;
        try {
            pending = Boolean.TRUE.equals(transaction.execute(tx -> {
                var locked = jdbc.query("""
                        SELECT order_id FROM orders WHERE order_id = ? AND execution_attempts = ?
                            AND status = 'PENDING' AND accepted_at IS NOT NULL
                        FOR UPDATE SKIP LOCKED
                        """, (rs, n) -> rs.getObject(1, UUID.class), claim.orderId(), claim.attempt());
                if (locked.isEmpty()) return false;
                OrderExecutor.Outcome outcome = executor.execute(claim.orderId());
                if (outcome == OrderExecutor.Outcome.FILLED) {
                    Integer fills = jdbc.queryForObject("SELECT count(*) FROM fills WHERE order_id = ?",
                            Integer.class, claim.orderId());
                    if (fills == null || fills != 1) throw new IllegalStateException("Execution must persist a fill");
                    jdbc.update("UPDATE orders SET status = 'FILLED', updated_at = CURRENT_TIMESTAMP, last_execution_error = NULL WHERE order_id = ?",
                            claim.orderId());
                    return false;
                } else if (outcome == OrderExecutor.Outcome.REJECTED) {
                    // AC1: Terminal rejection. Order status already set to REJECTED by executor.
                    // No retry, no deferral. Order execution is complete.
                    Integer rejections = jdbc.queryForObject("SELECT count(*) FROM order_status_history WHERE order_id = ? AND status = 'REJECTED'",
                            Integer.class, claim.orderId());
                    if (rejections == null || rejections == 0) throw new IllegalStateException("Rejection must record reason in order_status_history");
                    return false;
                } else if (outcome == OrderExecutor.Outcome.PENDING) {
                    // Roll back any accidental partial effects from an unavailable executor.
                    tx.setRollbackOnly();
                    return true;
                } else {
                    throw new IllegalStateException("Execution outcome is required: " + outcome);
                }
            }));
        } catch (RuntimeException failure) {
            // The committed claim survives even if this diagnostic update also fails.
            defer(claim, "EXECUTION_FAILED");
            return;
        }
        if (pending) defer(claim, "EXECUTION_PENDING");
    }

    private void defer(Claim claim, String reason) {
        transaction.executeWithoutResult(tx -> jdbc.update("""
                UPDATE orders SET next_execution_at = CURRENT_TIMESTAMP + (? * INTERVAL '1 second'),
                    last_execution_error = ?, updated_at = CURRENT_TIMESTAMP
                WHERE order_id = ? AND execution_attempts = ? AND status = 'PENDING'
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
