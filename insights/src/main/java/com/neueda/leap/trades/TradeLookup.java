package com.neueda.leap.trades;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

/**
 * Finds a filled trade and every step recorded for it in the trading database (BR-15), read through the
 * reporting role: the order, its fill and account, the trader from {@code v_trade_clients}, and the steps from
 * {@code order_status_history}, {@code v_trade_audit_events}, {@code fills}, {@code cash_transactions} and
 * {@code holding_movements}.
 */
@Repository
@Transactional(readOnly = true)
public class TradeLookup {

    private static final String TRADE = """
            SELECT o.order_id, f.filled_at, i.symbol, i.instrument_name, o.side, f.filled_quantity, f.execution_price,
                   a.account_id, a.account_number, a.account_name, a.trader_level, a.account_status,
                   c.first_name, c.last_name, c.email
            FROM orders o
            JOIN fills f ON f.order_id = o.order_id
            JOIN instruments i ON i.instrument_id = o.instrument_id
            JOIN accounts a ON a.account_id = o.account_id
            LEFT JOIN v_trade_clients c ON c.user_id = a.user_id
            WHERE o.order_id = ?
            """;

    // Steps at the same instant keep the order they happen in: status, audit, fill, cash, then holding.
    private static final String STEPS = """
            SELECT source, type, actor, occurred_at, details::text AS details FROM (
                SELECT 1 AS rank, 'STATUS' AS source, status AS type, NULL AS actor, occurred_at,
                       jsonb_strip_nulls(jsonb_build_object('reasonCode', reason_code, 'reasonText', reason_text)) AS details
                FROM order_status_history WHERE order_id = ?
                UNION ALL
                SELECT 2, 'AUDIT', event_type, actor_type, created_at, COALESCE(payload, '{}'::jsonb)
                FROM v_trade_audit_events WHERE order_id = ?
                UNION ALL
                SELECT 3, 'FILL', 'FILLED', NULL, filled_at,
                       jsonb_build_object('quantity', filled_quantity, 'price', trim_scale(execution_price)::text,
                                          'quoteTimestamp', to_char(quote_timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
                FROM fills WHERE order_id = ?
                UNION ALL
                SELECT 4, 'CASH', t.transaction_type, NULL, t.created_at,
                       jsonb_strip_nulls(jsonb_build_object('amount', t.amount::text, 'currency', t.currency,
                                          'settledAt', to_char(t.settled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))
                FROM cash_transactions t JOIN fills f ON f.fill_id = t.fill_id WHERE f.order_id = ?
                UNION ALL
                SELECT 5, 'HOLDING', m.movement_type, NULL, m.created_at,
                       jsonb_build_object('quantityChange', m.quantity_change, 'costBasis', trim_scale(m.cost_basis)::text)
                FROM holding_movements m JOIN fills f ON f.fill_id = m.fill_id WHERE f.order_id = ?
            ) steps
            ORDER BY occurred_at, rank
            """;

    private static final TypeReference<Map<String, Object>> DETAILS = new TypeReference<>() { };

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    /**
     * Creates the lookup.
     *
     * @param jdbc read-only operations on the reporting replica
     * @param json parses each step's recorded fields
     */
    public TradeLookup(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    /**
     * Finds a filled trade by its order id.
     *
     * @param orderId the trade's order id
     * @return the trade with its steps, or empty when no filled order has that id
     */
    public Optional<TradeRecord> find(UUID orderId) {
        List<TradeRecord> trades = jdbc.query(TRADE, (row, index) -> trade(row, orderId), orderId);
        return trades.stream().findFirst();
    }

    private TradeRecord trade(ResultSet row, UUID orderId) throws SQLException {
        long quantity = row.getLong("filled_quantity");
        BigDecimal price = row.getBigDecimal("execution_price").stripTrailingZeros();
        return new TradeRecord(row.getObject("order_id", UUID.class), instant(row, "filled_at"), row.getString("symbol"),
                row.getString("instrument_name"), row.getString("side"), quantity, price,
                price.multiply(BigDecimal.valueOf(quantity)).setScale(2, RoundingMode.HALF_UP),
                new TradeRecord.Account(row.getObject("account_id", UUID.class), row.getString("account_number"),
                        row.getString("account_name"), clientName(row), row.getString("email"),
                        row.getString("trader_level"), row.getString("account_status")),
                steps(orderId));
    }

    private List<TradeRecord.Event> steps(UUID orderId) {
        return jdbc.query(STEPS, (row, index) -> new TradeRecord.Event(row.getString("source"), row.getString("type"),
                row.getString("actor"), instant(row, "occurred_at"), details(row.getString("details"))),
                orderId, orderId, orderId, orderId, orderId);
    }

    private Map<String, Object> details(String recorded) {
        try {
            return json.readValue(recorded, DETAILS);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("A recorded trade step is not valid JSON", e);
        }
    }

    private static String clientName(ResultSet row) throws SQLException {
        String first = row.getString("first_name");
        String last = row.getString("last_name");
        if (first == null && last == null) {
            return null;
        }
        return String.join(" ", Objects.toString(first, ""), Objects.toString(last, "")).trim();
    }

    private static Instant instant(ResultSet row, String column) throws SQLException {
        return row.getObject(column, OffsetDateTime.class).toInstant();
    }
}
