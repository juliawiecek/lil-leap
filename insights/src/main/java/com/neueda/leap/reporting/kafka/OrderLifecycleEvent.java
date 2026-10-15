package com.neueda.leap.reporting.kafka;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Shared Kafka payload for terminal order lifecycle events consumed by Insights.
 *
 * @param orderId persistent order identifier
 * @param accountId owning account identifier
 * @param instrumentId traded instrument identifier
 * @param symbol instrument symbol
 * @param side BUY or SELL
 * @param quantity ordered quantity
 * @param orderType submitted order type
 * @param status terminal order status (FILLED or REJECTED)
 * @param reasonCode terminal reason for rejected orders, otherwise null
 * @param submittedAt original submission time
 * @param completedAt time the terminal state was recorded
 * @param filledAt fill timestamp, when present
 * @param filledQuantity filled quantity, when present
 * @param executionPrice execution price, when present
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record OrderLifecycleEvent(
        UUID orderId,
        UUID accountId,
        UUID instrumentId,
        String symbol,
        String side,
        long quantity,
        String orderType,
        String status,
        String reasonCode,
        Instant submittedAt,
        Instant completedAt,
        Instant filledAt,
        Long filledQuantity,
        BigDecimal executionPrice
) {
}
