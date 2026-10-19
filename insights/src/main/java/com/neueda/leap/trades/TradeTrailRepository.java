package com.neueda.leap.trades;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Reads every record of one trade's life from the reporting replica: status changes, audit events,
 * the fill and its cash and holding settlement. The lifecycle, timeline and events views all build
 * on this one trail, so they can never disagree.
 */
@Repository
@Transactional(readOnly = true)
public class TradeTrailRepository {
    /** Order within one instant: the status change, then its audit record, then the ledgers it caused. */
    private static final List<String> SOURCE_ORDER = List.of("STATUS", "AUDIT", "FILL", "CASH", "HOLDING");

    private final JdbcTemplate jdbc;

    /**
     * Creates the repository.
     *
     * @param jdbc reporting-replica JDBC operations
     */
    public TradeTrailRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Reads a trade's full trail, oldest first.
     *
     * @param orderId the trade's order id
     * @return the events, or empty when no such order exists
     */
    public Optional<List<TradeEvent>> trail(UUID orderId) {
        Boolean exists = jdbc.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM orders WHERE order_id = ?)", Boolean.class, orderId);
        if (!Boolean.TRUE.equals(exists)) {
            return Optional.empty();
        }
        List<TradeEvent> events = new ArrayList<>();
        events.addAll(jdbc.query("""
                SELECT status, reason_code, reason_text, occurred_at
                FROM order_status_history WHERE order_id = ?
                """, (rs, n) -> event("STATUS", rs.getString("status"), null, rs, "occurred_at",
                details("reasonCode", rs.getString("reason_code"), "reasonText", rs.getString("reason_text"))), orderId));
        events.addAll(jdbc.query("""
                SELECT event_type, actor_type, CAST(payload AS VARCHAR) AS payload, created_at
                FROM v_trade_audit_events WHERE order_id = ?
                """, (rs, n) -> event("AUDIT", rs.getString("event_type"), rs.getString("actor_type"), rs, "created_at",
                details("payload", rs.getString("payload"))), orderId));
        events.addAll(jdbc.query("""
                SELECT filled_quantity, execution_price, quote_timestamp, filled_at
                FROM fills WHERE order_id = ?
                """, (rs, n) -> event("FILL", "FILLED", null, rs, "filled_at",
                details("quantity", rs.getLong("filled_quantity"), "price", rs.getBigDecimal("execution_price"),
                        "quoteTimestamp", instant(rs, "quote_timestamp"))), orderId));
        events.addAll(jdbc.query("""
                SELECT c.transaction_type, c.amount, c.currency, c.settlement_status, c.settled_at, c.created_at
                FROM cash_transactions c JOIN fills f ON f.fill_id = c.fill_id WHERE f.order_id = ?
                """, (rs, n) -> event("CASH", rs.getString("transaction_type"), null, rs, "created_at",
                details("amount", rs.getBigDecimal("amount"), "currency", rs.getString("currency"),
                        "settlementStatus", rs.getString("settlement_status"), "settledAt", instant(rs, "settled_at"))),
                orderId));
        events.addAll(jdbc.query("""
                SELECT m.movement_type, m.quantity_change, m.cost_basis, m.created_at
                FROM holding_movements m JOIN fills f ON f.fill_id = m.fill_id WHERE f.order_id = ?
                """, (rs, n) -> event("HOLDING", rs.getString("movement_type"), null, rs, "created_at",
                details("quantityChange", rs.getLong("quantity_change"), "costBasis", rs.getBigDecimal("cost_basis"))),
                orderId));
        events.sort(Comparator.comparing(TradeEvent::occurredAt)
                .thenComparing(event -> SOURCE_ORDER.indexOf(event.source())));
        return Optional.of(List.copyOf(events));
    }

    private static TradeEvent event(String source, String type, String actor, ResultSet rs, String timeColumn,
                                    Map<String, Object> details) throws SQLException {
        return new TradeEvent(source, type, actor, instant(rs, timeColumn), details);
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp value = rs.getTimestamp(column);
        return value == null ? null : value.toInstant();
    }

    /** Builds a details map from name/value pairs, leaving out nulls and writing amounts without trailing zeros. */
    private static Map<String, Object> details(Object... pairs) {
        Map<String, Object> details = new LinkedHashMap<>();
        for (int i = 0; i < pairs.length; i += 2) {
            Object value = pairs[i + 1];
            if (value instanceof BigDecimal number) {
                value = number.stripTrailingZeros().toPlainString();
            }
            if (value != null) {
                details.put((String) pairs[i], value);
            }
        }
        return details;
    }
}
