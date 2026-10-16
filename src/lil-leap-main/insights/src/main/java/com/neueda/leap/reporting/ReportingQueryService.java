package com.neueda.leap.reporting;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.Map;

/** Read-only analytics; the configured database role has SELECT privileges only. */
@Service
@Transactional(readOnly = true)
public class ReportingQueryService {
    private final JdbcTemplate jdbc;

    /**
     * Creates the reporting query service.
     * @param jdbc reporting-replica JDBC operations
     */
    public ReportingQueryService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    /**
     * Reads all metrics in one statement for a consistent replica snapshot.
     * @return aggregate account, order, fill and gross execution metrics
     */
    public Map<String, Object> summary() {
        return jdbc.queryForMap("""
                SELECT (SELECT COUNT(*) FROM accounts) AS accounts,
                       (SELECT COUNT(*) FROM orders) AS orders,
                       COUNT(*) AS fills,
                       COALESCE(SUM(filled_quantity * execution_price), 0) AS gross_executed_value
                FROM fills
                """);
    }
}
