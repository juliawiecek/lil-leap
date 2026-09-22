package com.neueda.leap.order.submission.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Saved order returned for both initial submissions and retries; not a trade fill.
 * @param orderId persistent order identifier
 * @param accountId account owning the order
 * @param instrumentId instrument being traded
 * @param symbol instrument symbol
 * @param clientReference account-scoped retry key supplied by the caller
 * @param side BUY or SELL
 * @param quantity requested whole-unit quantity
 * @param orderType submitted order type
 * @param status stored order status; ACCEPTED on initial insertion
 * @param submittedAt original submission time
 * @param bufferPercent optional stored buffer percentage; may be null
 */
public record OrderSubmissionResponse(
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
