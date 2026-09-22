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

    public OrderExecutionWorker(JdbcTemplate jdbc, PlatformTransactionManager manager,
                                OrderExecutor executor, int retrySeconds) {
        if (retrySeconds < 1) throw new IllegalArgumentException("Retry delay must be positive");
        this.jdbc = jdbc;
        this.executor = executor;
        this.retrySeconds = retrySeconds;
        transaction = new TransactionTemplate(manager);
        transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    /** Claims one committed order; SKIP LOCKED permits multiple application instances. */
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

    /** A stale claim cannot execute after another worker has reclaimed the order. */
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
                } else if (outcome == OrderExecutor.Outcome.PENDING) {
                    // Roll back any accidental partial effects from an unavailable executor.
                    tx.setRollbackOnly();
                    return true;
                } else {
                    throw new IllegalStateException("Execution outcome is required");
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

    public record Claim(UUID orderId, long attempt) { }
}
