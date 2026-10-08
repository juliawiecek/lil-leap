package com.neueda.leap.order.query;

import java.time.Instant;
import java.util.UUID;

/**
 * Current status of one order and the most recent entry in its status history.
 * @param orderId persistent order identifier
 * @param status current order status
 * @param reasonCode reason code of the most recent status-history entry
 * @param reasonText optional description of the most recent status-history entry
 * @param statusChangedAt time of the most recent status-history entry
 */
public record OrderStatusResponse(
        UUID orderId,
        String status,
        String reasonCode,
        String reasonText,
        Instant statusChangedAt
) {
}
