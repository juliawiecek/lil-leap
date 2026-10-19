package com.neueda.leap.trades;

import java.time.Instant;
import java.util.Map;

/**
 * One recorded step in a trade's life, as stored.
 *
 * @param source where the record lives: {@code STATUS} (order_status_history), {@code AUDIT}
 *               (audit_log), {@code FILL}, {@code CASH} or {@code HOLDING} (settlement ledgers)
 * @param type the status, audit event type, or ledger movement type
 * @param actor who caused it ({@code USER} or {@code SYSTEM}) where recorded, else null
 * @param occurredAt when it was recorded
 * @param details the record's own fields, e.g. reason code, price or amount
 */
public record TradeEvent(String source, String type, String actor, Instant occurredAt, Map<String, Object> details) {
}
