package com.neueda.leap.order.execution.quote;
import java.util.UUID;
/** Minimum order data required to select a quote during an execution attempt. */
public record ExecutionOrderContext(UUID orderId, UUID instrumentId, long executionAttempt) {}
