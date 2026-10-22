package com.neueda.leap.reporting;

import com.neueda.leap.reporting.model.MarketDay;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
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

    private static OffsetDateTime utc(Instant instant) {
        return instant.atOffset(ZoneOffset.UTC);
    }
}
