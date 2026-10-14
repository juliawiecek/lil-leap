package com.neueda.leap.order.execution.event;

import java.util.UUID;

/** Publishes terminal order lifecycle events after the worker transaction commits. */
public interface OrderLifecycleEventPublisher {

    /**
     * Publishes the order's terminal state after the database changes are committed.
     *
     * @param orderId persistent order identifier
     */
    void publishTerminalEvent(UUID orderId);
}

