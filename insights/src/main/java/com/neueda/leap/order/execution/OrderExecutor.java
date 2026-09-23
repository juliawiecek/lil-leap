package com.neueda.leap.order.execution;

import java.util.UUID;

/**
 * Execution extension point. Runs with the order row locked in a database transaction.
 * Implementations must write the fill and all settlement effects in that same transaction;
 * no independent commits or external side effects are permitted. Returning PENDING must
 * leave no trade effects. Remote execution requires a separate idempotent outbox protocol.
 * 
 * AC1: Orders complete with a clear outcome—FILLED, PENDING, or REJECTED.
 */
@FunctionalInterface
public interface OrderExecutor {
    Outcome execute(UUID orderId);

    enum Outcome { FILLED, PENDING, REJECTED }
}
