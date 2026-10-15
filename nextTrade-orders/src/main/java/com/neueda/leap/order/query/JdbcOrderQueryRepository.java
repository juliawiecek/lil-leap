package com.neueda.leap.order.query;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/**
 * PostgreSQL implementation of caller-scoped order reads. Ownership is part of each query
 * (the NEXT-89 pattern): an order on another user's account returns no row, exactly like an
 * unknown order id.
 */
@Repository
public class JdbcOrderQueryRepository implements OrderQueryRepository {
    private final JdbcTemplate jdbcTemplate;

    /**
     * Creates a {@code JdbcOrderQueryRepository} with the supplied dependencies.
     *
     * @param jdbcTemplate JDBC operations participating in Spring transactions
     */
    public JdbcOrderQueryRepository(JdbcTemplate jdbcTemplate) { this.jdbcTemplate = jdbcTemplate; }

    @Override
    public Optional<OrderDetailResponse> findDetail(UUID orderId, UUID userId) {
        return jdbcTemplate.query("""
                SELECT o.order_id, o.account_id, o.instrument_id, i.symbol, o.client_reference,
                       o.side, o.quantity, o.order_type, o.status, o.submitted_at, o.accepted_at,
                       o.updated_at, o.buffer_percent, f.filled_quantity, f.execution_price, f.filled_at
                FROM orders o
                JOIN accounts a ON a.account_id = o.account_id
                JOIN instruments i ON i.instrument_id = o.instrument_id
                LEFT JOIN fills f ON f.order_id = o.order_id
                WHERE o.order_id = ? AND a.user_id = ?
                """, this::mapDetail, orderId, userId).stream().findFirst();
    }

    @Override
    public Optional<OrderStatusResponse> findStatus(UUID orderId, UUID userId) {
        // Rows written in one transaction share a timestamp; prefer the one matching the order's status.
        return jdbcTemplate.query("""
                SELECT o.order_id, o.status, h.reason_code, h.reason_text, h.occurred_at
                FROM orders o
                JOIN accounts a ON a.account_id = o.account_id
                LEFT JOIN LATERAL (
                    SELECT sh.reason_code, sh.reason_text, sh.occurred_at
                    FROM order_status_history sh
                    WHERE sh.order_id = o.order_id
                    ORDER BY sh.occurred_at DESC, (sh.status = o.status) DESC, sh.status_history_id DESC
                    LIMIT 1
                ) h ON TRUE
                WHERE o.order_id = ? AND a.user_id = ?
                """, (rs, row) -> new OrderStatusResponse(
                rs.getObject("order_id", UUID.class), rs.getString("status"),
                rs.getString("reason_code"), rs.getString("reason_text"),
                instant(rs.getTimestamp("occurred_at"))), orderId, userId).stream().findFirst();
    }

    private OrderDetailResponse mapDetail(ResultSet rs, int rowNum) throws SQLException {
        return new OrderDetailResponse(rs.getObject("order_id", UUID.class),
                rs.getObject("account_id", UUID.class), rs.getObject("instrument_id", UUID.class),
                rs.getString("symbol"), rs.getObject("client_reference", UUID.class),
                rs.getString("side"), rs.getLong("quantity"), rs.getString("order_type"),
                rs.getString("status"), instant(rs.getTimestamp("submitted_at")),
                instant(rs.getTimestamp("accepted_at")), instant(rs.getTimestamp("updated_at")),
                rs.getBigDecimal("buffer_percent"), rs.getObject("filled_quantity", Long.class),
                rs.getBigDecimal("execution_price"), instant(rs.getTimestamp("filled_at")));
    }

    private static Instant instant(Timestamp timestamp) {
        return timestamp == null ? null : timestamp.toInstant();
    }
}
