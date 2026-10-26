package com.neueda.leap.order.query;

import java.util.List;
import java.util.UUID;

/**
 * The audit trail of one of the caller's orders, oldest step first.
 *
 * @param orderId persistent order identifier
 * @param status the order's current status
 * @param events every recorded step, in the order it happened
 */
public record OrderEventsResponse(
        UUID orderId,
        String status,
        List<OrderEvent> events
) {
}
