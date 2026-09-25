package com.neueda.leap.order.execution;

import java.util.UUID;

/**
 * Execution extension point. Runs with the order row locked in a database transaction.
 * Implementations must write the fill and all settlement effects in that same transaction; no
 * independent commits or external side effects are permitted. Returning PENDING must leave no trade
 * effects. Remote execution requires a separate idempotent outbox protocol.
 *
 * <p>AC1: Orders complete with a clear outcome—FILLED, PENDING, or REJECTED.
 */
@FunctionalInterface
public interface OrderExecutor {
    /**
     * Executes the locked order within the caller's transaction. FILLED requires a persisted fill
     * and settlement effects; REJECTED requires a terminal status and audit reason. PENDING causes
     * the worker to roll back trade effects and defer the order.
     *
     * @param orderId persistent order identifier
     * @return execution outcome; never null
     */
    Outcome execute(UUID orderId);

    /** Result of a transactional execution attempt. */
    enum Outcome {
        /** A fill and its settlement effects have been persisted. */
        FILLED,
        /** Execution is deferred; no trade effects may be committed. */
        PENDING,
        /** Execution ended in rejection with an audit reason. */
        REJECTED
    }
}
