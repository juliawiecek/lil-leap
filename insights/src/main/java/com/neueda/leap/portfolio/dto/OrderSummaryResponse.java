package com.neueda.leap.portfolio.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/** Client-owned order summary returned by the order-history API. */
public record OrderSummaryResponse(
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
        Instant acceptedAt,
        Instant updatedAt,
        BigDecimal bufferPercent
) {
}
