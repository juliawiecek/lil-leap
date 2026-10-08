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
     * the worker to roll back trade effects and requeue the order with the result's reason.
     *
     * @param orderId persistent order identifier
     * @return execution result; never null
     */
    Result execute(UUID orderId);

    /** Result of a transactional execution attempt. */
    enum Outcome {
        /** A fill and its settlement effects have been persisted. */
        FILLED,
        /** Execution is deferred; no trade effects may be committed. */
        PENDING,
        /** Execution ended in rejection with an audit reason. */
        REJECTED
    }

    /**
     * Outcome of one attempt and its reason code.
     *
     * @param outcome what happened to the order
     * @param reason requeue reason ({@code RETRY_} prefix) or rejection reason; null for a fill
     */
    record Result(Outcome outcome, String reason) {
        /** Prefix that marks a reason as transient (requeued) rather than terminal (rejected). */
        public static final String RETRY_PREFIX = "RETRY_";

        /** @return a fill with its settlement */
        public static Result filled() {
            return new Result(Outcome.FILLED, null);
        }

        /**
         * @param reason terminal reason code, e.g. {@code STALE_QUOTE}
         * @return a terminal rejection
         */
        public static Result rejected(String reason) {
            return new Result(Outcome.REJECTED, reason);
        }

        /**
         * @param cause transient cause, e.g. {@code STALE_QUOTE}
         * @return a requeue whose reason is the cause with the {@code RETRY_} prefix
         */
        public static Result requeue(String cause) {
            return new Result(Outcome.PENDING, RETRY_PREFIX + cause);
        }
    }
}
