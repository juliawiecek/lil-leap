package com.neueda.leap.trades;

import java.util.List;
import java.util.UUID;

/**
 * The raw event list for one trade (TS-16.1b).
 *
 * @param orderId the trade's order id
 * @param auditRecorded false when the trade has no audit rows yet, so the trail is marked incomplete
 *                      rather than silently partial
 * @param events every recorded step, oldest first
 */
public record TradeEventsResponse(UUID orderId, boolean auditRecorded, List<TradeEvent> events) {
}
