package com.neueda.leap.order.execution.quote;

import java.util.UUID;

/**
 * Minimum order data required to select a quote during an execution attempt.
 *
 * @param orderId persistent order identifier
 * @param instrumentId persistent instrument identifier
 * @param executionAttempt persisted attempt count used to choose retry or rejection
 */
public record ExecutionOrderContext(UUID orderId, UUID instrumentId, long executionAttempt) {}
