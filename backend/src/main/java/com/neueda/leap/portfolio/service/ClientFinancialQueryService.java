package com.neueda.leap.portfolio.service;

import com.neueda.leap.portfolio.dto.CashBalanceResponse;
import com.neueda.leap.portfolio.dto.HoldingResponse;
import com.neueda.leap.portfolio.dto.OrderSummaryResponse;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.util.List;
import java.util.UUID;
import java.time.Instant;

/**
 * Reads holdings, cash, and orders for the authenticated client only.
 *
 * <p>Every query derives ownership by joining through accounts.user_id. The
 * caller never supplies a client id, so an object identifier cannot override
 * the identity established by the validated JWT.</p>
 */
@Service
@Transactional(readOnly = true)
public class ClientFinancialQueryService {

    private static final String HOLDINGS_SQL = """
            SELECT h.account_id, h.instrument_id, i.symbol, i.instrument_name,
                   h.quantity, h.avg_cost, h.updated_at
            FROM holdings h
            JOIN accounts a ON a.account_id = h.account_id
            JOIN instruments i ON i.instrument_id = h.instrument_id
            WHERE a.user_id = ?
            ORDER BY i.symbol, h.account_id
            """;

    private static final String CASH_SQL = """
            SELECT cb.account_id, cb.currency, cb.balance, cb.updated_at
            FROM cash_balances cb
            JOIN accounts a ON a.account_id = cb.account_id
            WHERE a.user_id = ?
            ORDER BY cb.account_id
            """;

    private static final String ORDERS_SQL = """
            SELECT o.order_id, o.account_id, o.instrument_id, i.symbol,
                   o.client_reference, o.side, o.quantity, o.order_type, o.status,
                   o.submitted_at, o.accepted_at, o.updated_at, o.buffer_percent
            FROM orders o
            JOIN accounts a ON a.account_id = o.account_id
            JOIN instruments i ON i.instrument_id = o.instrument_id
            WHERE a.user_id = ?
            ORDER BY o.submitted_at DESC, o.order_id
            """;

    private final JdbcTemplate jdbcTemplate;

    /**
     * Creates the client-scoped query service.
     * @param jdbcTemplate database access for account ownership joins
     */
    public ClientFinancialQueryService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /**
     * Reads holdings across the user's accounts, sorted by symbol and account.
     * @param authenticatedUserId identity from the validated JWT, never a request selector
     * @return owned holdings, or an empty list when none exist
     * @throws IllegalArgumentException if the authenticated identity is null
     */
    public List<HoldingResponse> getHoldings(UUID authenticatedUserId) {
        requireAuthenticatedUser(authenticatedUserId);
        return jdbcTemplate.query(HOLDINGS_SQL, (rs, rowNum) -> new HoldingResponse(
                rs.getObject("account_id", UUID.class),
                rs.getObject("instrument_id", UUID.class),
                rs.getString("symbol"),
                rs.getString("instrument_name"),
                rs.getLong("quantity"),
                rs.getBigDecimal("avg_cost"),
                rs.getTimestamp("updated_at").toInstant()
        ), authenticatedUserId);
    }

    /**
     * Reads cash balances across the user's accounts, sorted by account.
     * @param authenticatedUserId identity from the validated JWT, never a request selector
     * @return owned cash balances, or an empty list when none exist
     * @throws IllegalArgumentException if the authenticated identity is null
     */
    public List<CashBalanceResponse> getCashBalances(UUID authenticatedUserId) {
        requireAuthenticatedUser(authenticatedUserId);
        return jdbcTemplate.query(CASH_SQL, (rs, rowNum) -> new CashBalanceResponse(
                rs.getObject("account_id", UUID.class),
                rs.getString("currency"),
                rs.getBigDecimal("balance"),
                rs.getTimestamp("updated_at").toInstant()
        ), authenticatedUserId);
    }

    /**
     * Reads the user's orders, newest submissions first with order ID as a tie-breaker.
     * @param authenticatedUserId identity from the validated JWT, never a request selector
     * @return owned orders, or an empty list when none exist
     * @throws IllegalArgumentException if the authenticated identity is null
     */
    public List<OrderSummaryResponse> getOrders(UUID authenticatedUserId) {
        requireAuthenticatedUser(authenticatedUserId);
        return jdbcTemplate.query(ORDERS_SQL, (rs, rowNum) -> new OrderSummaryResponse(
                rs.getObject("order_id", UUID.class),
                rs.getObject("account_id", UUID.class),
                rs.getObject("instrument_id", UUID.class),
                rs.getString("symbol"),
                rs.getObject("client_reference", UUID.class),
                rs.getString("side"),
                rs.getLong("quantity"),
                rs.getString("order_type"),
                rs.getString("status"),
                rs.getTimestamp("submitted_at").toInstant(),
                nullableInstant(rs.getTimestamp("accepted_at")),
                rs.getTimestamp("updated_at").toInstant(),
                rs.getBigDecimal("buffer_percent")
        ), authenticatedUserId);
    }

    private static Instant nullableInstant(Timestamp value) {
        return value == null ? null : value.toInstant();
    }

    private static void requireAuthenticatedUser(UUID userId) {
        if (userId == null) {
            throw new IllegalArgumentException("Authenticated user id is required");
        }
    }
}
