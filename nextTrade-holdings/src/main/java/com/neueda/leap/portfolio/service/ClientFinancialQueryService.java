package com.neueda.leap.portfolio.service;

import com.neueda.leap.portfolio.dto.CashBalanceDetailResponse;
import com.neueda.leap.portfolio.dto.CashBalanceResponse;
import com.neueda.leap.portfolio.dto.HoldingResponse;
import com.neueda.leap.portfolio.dto.OrderSummaryResponse;
import com.neueda.leap.portfolio.dto.PortfolioSummaryResponse;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
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

    private static final String ACCOUNT_NOT_FOUND = "Account not found";

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

    private static final String CASH_DETAIL_SQL = """
            SELECT a.account_id, 'USD' AS currency,
                   COALESCE(SUM(CASE WHEN ct.settlement_status = 'SETTLED' THEN ct.amount ELSE 0 END), 0) AS settled_balance,
                   COALESCE(SUM(CASE WHEN ct.settlement_status = 'PENDING' THEN ct.amount ELSE 0 END), 0) AS pending_balance,
                   COALESCE(SUM(CASE WHEN ct.settlement_status = 'SETTLED' THEN ct.amount ELSE 0 END), 0)
                     - COALESCE((SELECT SUM(held_amount) FROM cash_holds
                                 WHERE account_id = a.account_id AND released_at IS NULL), 0) AS available_balance,
                   COALESCE(SUM(ct.amount), 0) AS total_balance, CURRENT_TIMESTAMP AS updated_at
            FROM accounts a LEFT JOIN cash_transactions ct ON ct.account_id = a.account_id
            WHERE a.user_id = ?
            GROUP BY a.account_id ORDER BY a.account_id
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
     * Reads detailed cash balances with settlement distinction.
     * TS-11.3 AC2: Provides settled, pending, and available balance breakdown.
     * @param authenticatedUserId identity from the validated JWT, never a request selector
     * @return owned cash balances with detail, or an empty list when none exist
     * @throws IllegalArgumentException if the authenticated identity is null
     */
    public List<CashBalanceDetailResponse> getCashBalancesDetailed(UUID authenticatedUserId) {
        requireAuthenticatedUser(authenticatedUserId);
        return jdbcTemplate.query(CASH_DETAIL_SQL, (rs, rowNum) -> new CashBalanceDetailResponse(
                rs.getObject("account_id", UUID.class),
                rs.getString("currency"),
                rs.getBigDecimal("settled_balance"),
                rs.getBigDecimal("pending_balance"),
                rs.getBigDecimal("available_balance"),
                rs.getBigDecimal("total_balance"),
                rs.getTimestamp("updated_at").toInstant()
        ), authenticatedUserId);
    }

    /**
     * Selects a stable default account, including accounts with no ledger or positions.
     * @param authenticatedUserId caller identity from the validated JWT
     * @return first account by identifier
     * @throws org.springframework.web.server.ResponseStatusException when no owned account exists
     */
    public UUID getDefaultAccountId(UUID authenticatedUserId) {
        requireAuthenticatedUser(authenticatedUserId);
        return jdbcTemplate.query("SELECT account_id FROM accounts WHERE user_id = ? ORDER BY account_id LIMIT 1",
                (rs, row) -> rs.getObject(1, UUID.class), authenticatedUserId).stream().findFirst()
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.NOT_FOUND, ACCOUNT_NOT_FOUND));
    }

    /**
     * Reads the portfolio summary for a specific account.
     * TS-11.3 AC1: Combines holdings, cash, and calculates total portfolio value.
     *
     * @param authenticatedUserId identity from the validated JWT
     * @param accountId account to retrieve portfolio for (must belong to authenticated user)
     * @return portfolio summary with holdings, cash detail, and total value
     * @throws IllegalArgumentException if the authenticated identity is null
     */
    public PortfolioSummaryResponse getPortfolioSummary(UUID authenticatedUserId, UUID accountId) {
        requireAuthenticatedUser(authenticatedUserId);
        if (accountId == null) {
            throw new IllegalArgumentException("Account id is required");
        }

        // Get holdings for this account
        String holdingsSql = """
                SELECT h.account_id, h.instrument_id, i.symbol, i.instrument_name,
                       h.quantity, h.avg_cost, h.updated_at
                FROM holdings h
                JOIN accounts a ON a.account_id = h.account_id
                JOIN instruments i ON i.instrument_id = h.instrument_id
                WHERE a.user_id = ? AND h.account_id = ?
                ORDER BY i.symbol
                """;

        List<HoldingResponse> holdings = jdbcTemplate.query(holdingsSql, (rs, rowNum) ->
            new HoldingResponse(
                rs.getObject("account_id", UUID.class),
                rs.getObject("instrument_id", UUID.class),
                rs.getString("symbol"),
                rs.getString("instrument_name"),
                rs.getLong("quantity"),
                rs.getBigDecimal("avg_cost"),
                rs.getTimestamp("updated_at").toInstant()
            ), authenticatedUserId, accountId);

        CashBalanceDetailResponse cash = getCashBalancesDetailed(authenticatedUserId).stream()
                .filter(balance -> balance.accountId().equals(accountId)).findFirst()
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.NOT_FOUND, ACCOUNT_NOT_FOUND));

        // Get latest quotes for valuation
        String quotesSql = """
                SELECT
                    instrument_id,
                    ROUND((bid + ask) / 2::NUMERIC, 8) as midpoint
                FROM (
                    SELECT DISTINCT ON (instrument_id)
                        instrument_id, bid, ask
                    FROM quotes
                    ORDER BY instrument_id, quoted_at DESC, created_at DESC, quote_id DESC
                ) latest
                """;

        java.util.Map<UUID, BigDecimal> priceMap = new java.util.HashMap<>();
        jdbcTemplate.query(quotesSql, (rs, rowNum) -> {
            priceMap.put(rs.getObject("instrument_id", UUID.class), rs.getBigDecimal("midpoint"));
            return null;
        });

        // Calculate total portfolio value: sum of (holdings value) + total cash
        BigDecimal holdingsValue = holdings.stream()
            .map(holding -> {
                if (holding.quantity() == 0) return BigDecimal.ZERO;
                BigDecimal price = priceMap.get(holding.instrumentId());
                if (price == null) throw new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE, "Portfolio quote unavailable");
                return price.multiply(BigDecimal.valueOf(holding.quantity()));
            })
            .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal totalPortfolioValue = holdingsValue.add(cash.totalBalance());

        return new PortfolioSummaryResponse(
            accountId,
            holdings,
            cash,
            totalPortfolioValue,
            Instant.now()
        );
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
