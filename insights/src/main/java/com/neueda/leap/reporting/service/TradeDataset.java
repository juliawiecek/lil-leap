package com.neueda.leap.reporting.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * Every fill, read from the reporting replica (BR-16) so the Reports and Clients pages never compete with live
 * trading for database capacity. Client names and emails come from {@code v_trade_clients}, the only view of
 * user data the reporting role may read.
 */
@Component
@Transactional(readOnly = true)
public class TradeDataset {

    private static final String FILLS = """
            SELECT f.fill_id, o.order_id, f.filled_at, i.instrument_id, i.symbol, i.instrument_name, i.asset_class,
                   i.market_code, a.user_id, c.email, c.first_name, c.last_name, a.account_id, a.account_number,
                   a.account_name, a.account_status, a.trader_level, o.side, f.filled_quantity, f.execution_price
            FROM fills f
            JOIN orders o ON o.order_id = f.order_id
            JOIN instruments i ON i.instrument_id = o.instrument_id
            JOIN accounts a ON a.account_id = o.account_id
            LEFT JOIN v_trade_clients c ON c.user_id = a.user_id
            ORDER BY f.filled_at, f.fill_id
            """;

    private final JdbcTemplate jdbc;

    /**
     * Creates the dataset reader.
     *
     * @param jdbc read-only operations on the reporting replica
     */
    public TradeDataset(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Reads every fill, oldest first.
     *
     * @return the fills
     */
    public List<Trade> trades() {
        return jdbc.query(FILLS, (row, index) -> trade(row));
    }

    private static Trade trade(ResultSet row) throws SQLException {
        return new Trade(
                row.getString("fill_id"),
                row.getString("order_id"),
                row.getObject("filled_at", OffsetDateTime.class).toInstant(),
                row.getString("instrument_id"),
                row.getString("symbol"),
                row.getString("instrument_name"),
                row.getString("asset_class"),
                row.getString("market_code"),
                row.getString("user_id"),
                row.getString("email"),
                clientName(row.getString("first_name"), row.getString("last_name")),
                row.getString("account_id"),
                row.getString("account_number"),
                row.getString("account_name"),
                row.getString("account_status"),
                row.getString("trader_level"),
                row.getString("side"),
                row.getLong("filled_quantity"),
                price(row.getBigDecimal("execution_price")));
    }

    /** Drops the column's padding zeros but keeps at least cents: 225.10000000 becomes 225.10, 49.52500000 49.525. */
    static BigDecimal price(BigDecimal stored) {
        BigDecimal trimmed = stored.stripTrailingZeros();
        return trimmed.scale() < 2 ? trimmed.setScale(2) : trimmed;
    }

    /** Joins a trader's first and last name; empty when the trader has no profile. */
    static String clientName(String first, String last) {
        return String.join(" ", first == null ? "" : first, last == null ? "" : last).trim();
    }

    /**
     * One fill in the dataset.
     *
     * @param fillId fill identifier
     * @param orderId the order it filled
     * @param filledAt execution time
     * @param instrumentId instrument identifier
     * @param instrumentSymbol ticker symbol
     * @param instrumentName company name
     * @param assetClass instrument class
     * @param marketCode listing market
     * @param userId owning user
     * @param clientEmail owner's sign-in email
     * @param clientName owner's first and last name
     * @param accountId trading account identifier
     * @param accountNumber human-readable account number
     * @param accountName account label
     * @param accountStatus account status
     * @param traderLevel NOVICE or ADVANCED
     * @param side BUY or SELL
     * @param filledQuantity shares filled
     * @param executionPrice price per share
     */
    public record Trade(
            String fillId,
            String orderId,
            Instant filledAt,
            String instrumentId,
            String instrumentSymbol,
            String instrumentName,
            String assetClass,
            String marketCode,
            String userId,
            String clientEmail,
            String clientName,
            String accountId,
            String accountNumber,
            String accountName,
            String accountStatus,
            String traderLevel,
            String side,
            long filledQuantity,
            BigDecimal executionPrice) {

        /**
         * Traded value of the fill.
         *
         * @return quantity times execution price
         */
        public BigDecimal notional() {
            return executionPrice.multiply(BigDecimal.valueOf(filledQuantity));
        }
    }
}
