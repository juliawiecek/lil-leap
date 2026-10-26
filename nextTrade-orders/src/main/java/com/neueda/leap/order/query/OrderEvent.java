package com.neueda.leap.order.query;

import java.time.Instant;
import java.util.Map;

/**
 * One step in an order's audit trail, as shown to the trader who placed it (BR-14, BR-15).
 * Status steps come from {@code order_status_history}; pricing and settlement steps come from
 * {@code audit_log}. Neither carries user or account identifiers.
 *
 * @param type {@code SUBMITTED}, {@code ACCEPTED}, {@code PENDING}, {@code DELAYED}, {@code FILLED},
 *             {@code REJECTED}, {@code CANCELLED}, {@code PRICE_DECISION} or {@code SETTLEMENT_COMPLETED}
 * @param reasonCode reason recorded with a status step, or null
 * @param reasonText optional explanation recorded with a status step
 * @param at when the step happened
 * @param details the audit payload for pricing and settlement steps (prices, cash delta); empty otherwise
 */
public record OrderEvent(
        String type,
        String reasonCode,
        String reasonText,
        Instant at,
        Map<String, Object> details
) {
}
