package com.neueda.leap.order.query;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * One order as stored, with its fill when it has been executed.
 * @param orderId persistent order identifier
 * @param accountId account owning the order
 * @param instrumentId instrument being traded
 * @param symbol instrument symbol
 * @param clientReference account-scoped retry key supplied at submission
 * @param side BUY or SELL
 * @param quantity requested whole-unit quantity
 * @param orderType submitted order type
 * @param status current order status
 * @param submittedAt original submission time
 * @param acceptedAt acceptance time; null until accepted
 * @param updatedAt time of the last change to the order
 * @param bufferPercent optional stored buffer percentage; may be null
 * @param filledQuantity executed quantity; null until filled
 * @param executionPrice executed price per unit; null until filled
 * @param filledAt execution time; null until filled
 */
public record OrderDetailResponse(
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
        BigDecimal bufferPercent,
        Long filledQuantity,
        BigDecimal executionPrice,
        Instant filledAt
) {
}
