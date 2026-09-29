package com.neueda.leap.order.dto;

import java.util.UUID;

/**
 * Result of a successful order submission.
 *
 * @param orderId identifier of the created order
 * @param clientReference idempotency key stored with the order
 * @param status lifecycle status the order was persisted with
 */
public record OrderSubmissionResponse(UUID orderId, UUID clientReference, String status) {
}
