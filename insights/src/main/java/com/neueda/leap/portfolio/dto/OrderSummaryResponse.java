package com.neueda.leap.portfolio.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Client-owned order summary returned by the order-history API.
 * @param orderId persistent order identifier
 * @param accountId account owning the order
 * @param instrumentId traded instrument identifier
 * @param symbol instrument symbol
 * @param clientReference caller-supplied account-scoped retry key
 * @param side stored BUY or SELL direction
 * @param quantity requested whole-unit quantity
 * @param orderType stored order type
 * @param status current stored order status
 * @param submittedAt original submission time
 * @param acceptedAt acceptance time, or null if not yet accepted
 * @param updatedAt last order update time
 * @param bufferPercent optional stored buffer percentage; may be null
 */
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
