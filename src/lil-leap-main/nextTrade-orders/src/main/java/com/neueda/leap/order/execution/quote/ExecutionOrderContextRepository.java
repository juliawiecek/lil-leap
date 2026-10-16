package com.neueda.leap.order.execution.quote;

import java.util.Optional;
import java.util.UUID;

/** Reads order context immediately before execution pricing. */
public interface ExecutionOrderContextRepository {
    /**
     * Reads the context of an accepted order currently in PENDING status.
     *
     * @param orderId persistent order identifier
     * @return eligible order context, or empty if unavailable or ineligible
     */
    Optional<ExecutionOrderContext> findForExecution(UUID orderId);
}
