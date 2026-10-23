package com.neueda.leap.reporting;

import com.neueda.leap.reporting.model.MarketDay;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Read-only analytics; the configured database role has SELECT privileges only. */
@Service
@Transactional(readOnly = true)
public class ReportingQueryService {
    private final JdbcTemplate jdbc;
    private final Clock clock;

    /**
     * Creates the reporting query service.
     * @param jdbc reporting-replica JDBC operations
     * @param clock source of the current instant, used to find today's trading day
     */
    public ReportingQueryService(JdbcTemplate jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    /**
     * Reads today's totals (Central-time day) in one statement for a consistent replica snapshot.
     * @return the day, accounts that placed an order today, orders submitted, fills and gross executed value
     */
    public Map<String, Object> summary() {
        MarketDay today = MarketDay.today(clock);
        OffsetDateTime start = utc(today.startInclusive());
        OffsetDateTime end = utc(today.endExclusive());
        Map<String, Object> totals = jdbc.queryForMap("""
                SELECT (SELECT COUNT(DISTINCT account_id) FROM orders
                        WHERE submitted_at >= ? AND submitted_at < ?) AS accounts,
                       (SELECT COUNT(*) FROM orders
                        WHERE submitted_at >= ? AND submitted_at < ?) AS orders,
                       COUNT(*) AS fills,
                       COALESCE(SUM(filled_quantity * execution_price), 0) AS gross_executed_value
                FROM fills
                WHERE filled_at >= ? AND filled_at < ?
                """, start, end, start, end, start, end);
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("date", today.date().toString());
        summary.put("time_zone", MarketDay.ZONE.getId());
        summary.putAll(totals);
        return summary;
    }

    /**
     * Lists today's orders (Central-time day) in the order they were placed, so the Insights chart can step at the
     * exact second of each one. Carries no customer identity, only the stock, side, size, status and filled value.
     * @return the day, the instant it began and its orders, oldest first
     */
    public OrdersToday ordersToday() {
        MarketDay today = MarketDay.today(clock);
        List<PlacedOrder> orders = jdbc.query("""
                SELECT o.submitted_at, i.symbol, o.side, o.quantity, o.status,
                       COALESCE(SUM(f.filled_quantity * f.execution_price), 0) AS filled_value
                FROM orders o
                JOIN instruments i ON i.instrument_id = o.instrument_id
                LEFT JOIN fills f ON f.order_id = o.order_id
                WHERE o.submitted_at >= ? AND o.submitted_at < ?
                GROUP BY o.order_id, o.submitted_at, i.symbol, o.side, o.quantity, o.status
                ORDER BY o.submitted_at, o.order_id
                """, (row, index) -> new PlacedOrder(
                        row.getObject("submitted_at", OffsetDateTime.class).toInstant(),
                        row.getString("symbol"),
                        row.getString("side"),
                        row.getLong("quantity"),
                        row.getString("status"),
                        row.getBigDecimal("filled_value")),
                utc(today.startInclusive()), utc(today.endExclusive()));
        return new OrdersToday(today.date().toString(), today.startInclusive(), orders);
    }

    private static OffsetDateTime utc(Instant instant) {
        return instant.atOffset(ZoneOffset.UTC);
    }

    /**
     * Today's orders for the exact-time chart.
     * @param date the Central-time trading day, yyyy-mm-dd
     * @param dayStart the instant that day began (Central midnight)
     * @param orders the day's orders, oldest first
     */
    public record OrdersToday(String date, Instant dayStart, List<PlacedOrder> orders) {
    }

    /**
     * One order, at the exact time it was placed.
     * @param placedAt when the order was submitted
     * @param symbol ticker symbol
     * @param side BUY or SELL
     * @param quantity shares ordered
     * @param status the order's current status
     * @param filledValue value of its fills so far; zero when nothing has filled
     */
    public record PlacedOrder(Instant placedAt, String symbol, String side, long quantity, String status,
                              BigDecimal filledValue) {
    }
}
