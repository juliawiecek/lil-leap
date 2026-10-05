package com.neueda.leap.portfolio.repository;

import com.neueda.leap.portfolio.dto.OrderHistoryResponse;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.stereotype.Repository;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

/** Reads owner-scoped order history and optional fill details from the primary. */
@Repository
public class OrderHistoryRepository {
    private final NamedParameterJdbcTemplate jdbc;

    /**
     * Creates the history reader.
     * @param jdbc database access participating in the read transaction
     */
    public OrderHistoryRepository(JdbcTemplate jdbc) {
        this.jdbc = new NamedParameterJdbcTemplate(jdbc);
    }

    /**
     * Returns the caller's matching orders, newest first, with nullable fill details.
     * @param userId authenticated owner
     * @param statuses allowed statuses to include
     * @param from inclusive lower submission timestamp
     * @param to exclusive upper submission timestamp
     * @return matching history rows
     */
    public List<OrderHistoryResponse> findHistory(UUID userId, Collection<String> statuses,
            Instant from, Instant to) {
        var parameters = new MapSqlParameterSource().addValue("user", userId)
                .addValue("statuses", statuses).addValue("from", Timestamp.from(from))
                .addValue("to", Timestamp.from(to));
        return jdbc.query("""
                SELECT o.order_id, i.symbol, o.side, o.quantity, o.status, o.submitted_at,
                       f.execution_price, f.filled_quantity, f.filled_at
                FROM orders o JOIN accounts a ON a.account_id = o.account_id
                JOIN instruments i ON i.instrument_id = o.instrument_id
                LEFT JOIN fills f ON f.order_id = o.order_id
                WHERE a.user_id = :user AND o.status IN (:statuses)
                  AND o.submitted_at >= :from AND o.submitted_at < :to
                ORDER BY o.submitted_at DESC, o.order_id
                """, parameters, (rs, row) -> {
                    Timestamp filledAt = rs.getTimestamp("filled_at");
                    return new OrderHistoryResponse(rs.getObject("order_id", UUID.class),
                            rs.getString("symbol"), rs.getString("side"), rs.getLong("quantity"),
                            rs.getString("status"), rs.getTimestamp("submitted_at").toInstant(),
                            rs.getBigDecimal("execution_price"), rs.getObject("filled_quantity", Long.class),
                            filledAt == null ? null : filledAt.toInstant());
                });
    }
}
