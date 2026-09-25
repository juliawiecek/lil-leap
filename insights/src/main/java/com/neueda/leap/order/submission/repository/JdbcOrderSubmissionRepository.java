package com.neueda.leap.order.submission.repository;

import com.neueda.leap.order.submission.dto.OrderSubmissionResponse;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * PostgreSQL implementation of account ownership checks and idempotent order submission.
 */
@Repository
public class JdbcOrderSubmissionRepository implements OrderSubmissionRepository {
    private final JdbcTemplate jdbcTemplate;
    /**
     * Creates a {@code JdbcOrderSubmissionRepository} with the supplied dependencies.
     *
     * @param jdbcTemplate JDBC operations participating in Spring transactions
     */
    public JdbcOrderSubmissionRepository(JdbcTemplate jdbcTemplate) { this.jdbcTemplate = jdbcTemplate; }

    @Override
    public boolean accountBelongsToUser(UUID accountId, UUID userId) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM accounts WHERE account_id = ? AND user_id = ?",
                Integer.class, accountId, userId);
        return count != null && count == 1;
    }

    @Override
    public Optional<AccountTradingProfile> findAccountTradingProfile(UUID accountId) {
        return jdbcTemplate.query("""
                SELECT a.account_status, a.trading_enabled, a.trader_level,
                       a.min_balance_requirement, COALESCE(cb.balance, 0) AS current_balance
                FROM accounts a
                LEFT JOIN cash_balances cb ON cb.account_id = a.account_id AND cb.currency = 'USD'
                WHERE a.account_id = ?
                """, (rs, row) -> new AccountTradingProfile(
                rs.getString("account_status"), rs.getBoolean("trading_enabled"),
                rs.getString("trader_level"), rs.getBigDecimal("min_balance_requirement"),
                rs.getBigDecimal("current_balance")), accountId).stream().findFirst();
    }

    @Override
    public Optional<InstrumentTradingProfile> findInstrumentTradingProfileBySymbol(String symbol) {
        List<InstrumentTradingProfile> rows = jdbcTemplate.query("""
                SELECT instrument_id, enabled, tradable
                FROM instruments
                WHERE UPPER(symbol) = ?
                ORDER BY market_code, instrument_id
                LIMIT 1
                """, (rs, row) -> new InstrumentTradingProfile(
                rs.getObject("instrument_id", UUID.class), rs.getBoolean("enabled"),
                rs.getBoolean("tradable")), symbol);
        return rows.stream().findFirst();
    }

    @Override
    public Optional<OrderSubmissionResponse> findByAccountAndClientReference(UUID accountId, UUID clientReference) {
        return jdbcTemplate.query("""
                SELECT o.order_id, o.account_id, o.instrument_id, i.symbol,
                       o.client_reference, o.side, o.quantity, o.order_type,
                       o.status, o.submitted_at, o.buffer_percent
                FROM orders o JOIN instruments i ON i.instrument_id = o.instrument_id
                WHERE o.account_id = ? AND o.client_reference = ?
                """, this::mapOrder, accountId, clientReference).stream().findFirst();
    }

    @Override
    public Optional<OrderSubmissionResponse> insert(UUID accountId, UUID instrumentId, String symbol,
            UUID clientReference, String side, long quantity, String orderType, BigDecimal bufferPercent) {
        return jdbcTemplate.query("""
                INSERT INTO orders(account_id, instrument_id, client_reference, side,
                                   quantity, order_type, status, buffer_percent)
                VALUES (?, ?, ?, ?, ?, ?, 'SUBMITTED', ?)
                ON CONFLICT (account_id, client_reference) DO NOTHING
                RETURNING order_id, account_id, instrument_id, client_reference, side,
                          quantity, order_type, status, submitted_at, buffer_percent
                """, (rs, row) -> new OrderSubmissionResponse(
                rs.getObject("order_id", UUID.class), rs.getObject("account_id", UUID.class),
                rs.getObject("instrument_id", UUID.class), symbol,
                rs.getObject("client_reference", UUID.class), rs.getString("side"),
                rs.getLong("quantity"), rs.getString("order_type"), rs.getString("status"),
                rs.getTimestamp("submitted_at").toInstant(), rs.getBigDecimal("buffer_percent")),
                accountId, instrumentId, clientReference, side, quantity, orderType, bufferPercent)
                .stream().findFirst();
    }

    private OrderSubmissionResponse mapOrder(ResultSet rs, int rowNum) throws SQLException {
        return new OrderSubmissionResponse(rs.getObject("order_id", UUID.class),
                rs.getObject("account_id", UUID.class), rs.getObject("instrument_id", UUID.class),
                rs.getString("symbol"), rs.getObject("client_reference", UUID.class),
                rs.getString("side"), rs.getLong("quantity"), rs.getString("order_type"),
                rs.getString("status"), rs.getTimestamp("submitted_at").toInstant(),
                rs.getBigDecimal("buffer_percent"));
    }
}
