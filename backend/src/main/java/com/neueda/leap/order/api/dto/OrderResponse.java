package com.neueda.leap.order.api.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/** Stable response returned for both a new and an idempotently replayed order. */
public record OrderResponse(
        UUID orderId,
        UUID accountId,
        UUID instrumentId,
        String symbol,
        UUID clientReference,
        String side,
        long quantity,
        String orderType,
        String status,
        Instant submittedAt,
        BigDecimal bufferPercent
) {
}
