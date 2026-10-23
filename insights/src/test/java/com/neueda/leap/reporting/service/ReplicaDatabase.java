package com.neueda.leap.reporting.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Test fixture: an in-memory database with the reporting replica's tables and the {@code v_trade_clients} view,
 * so tests run {@link TradeDataset}'s real SQL. Each instance is a separate, empty database.
 */
public final class ReplicaDatabase {

    private final JdbcTemplate jdbc;
    private final Map<String, UUID> instruments = new HashMap<>();

    /** Creates an empty replica database. */
    public ReplicaDatabase() {
        DriverManagerDataSource source = new DriverManagerDataSource(
                "jdbc:h2:mem:replica-" + UUID.randomUUID() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", "");
        jdbc = new JdbcTemplate(source);
        jdbc.execute("""
                CREATE TABLE instruments (instrument_id UUID PRIMARY KEY, symbol VARCHAR(20), instrument_name VARCHAR(200),
                    asset_class VARCHAR(30), market_code VARCHAR(20));
                CREATE TABLE users (user_id UUID PRIMARY KEY, email VARCHAR(255), user_role VARCHAR(20));
                CREATE TABLE customer_profiles (user_id UUID PRIMARY KEY, first_name VARCHAR(100), last_name VARCHAR(100));
                CREATE TABLE accounts (account_id UUID PRIMARY KEY, user_id UUID, account_number VARCHAR(30),
                    account_name VARCHAR(100), account_status VARCHAR(20), trader_level VARCHAR(20));
                CREATE TABLE orders (order_id UUID PRIMARY KEY, account_id UUID, instrument_id UUID, side VARCHAR(10));
                CREATE TABLE fills (fill_id UUID PRIMARY KEY, order_id UUID, filled_at TIMESTAMP WITH TIME ZONE,
                    filled_quantity BIGINT, execution_price NUMERIC(18,8));
                CREATE VIEW v_trade_clients AS
                    SELECT u.user_id, p.first_name, p.last_name, u.email
                    FROM users u LEFT JOIN customer_profiles p ON p.user_id = u.user_id
                    WHERE u.user_role = 'TRADER';
                """);
    }

    /**
     * The dataset reading this database.
     *
     * @return a dataset over this database
     */
    public TradeDataset dataset() {
        return new TradeDataset(jdbc);
    }

    /**
     * Lists a stock.
     *
     * @param symbol ticker
     * @param name company name
     * @param assetClass instrument class
     * @param market listing market
     */
    public void instrument(String symbol, String name, String assetClass, String market) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO instruments VALUES (?, ?, ?, ?, ?)", id, symbol, name, assetClass, market);
        instruments.put(symbol, id);
    }

    /**
     * Opens a trading account for a new trader.
     *
     * @param account account id
     * @param first trader's first name, or null without a profile
     * @param last trader's last name, or null without a profile
     * @param email trader's email
     * @param number account number
     * @param name account name
     * @param status account status
     * @param level NOVICE or ADVANCED
     */
    public void account(UUID account, String first, String last, String email, String number, String name,
                        String status, String level) {
        UUID user = UUID.randomUUID();
        jdbc.update("INSERT INTO users VALUES (?, ?, 'TRADER')", user, email);
        if (first != null || last != null) {
            jdbc.update("INSERT INTO customer_profiles VALUES (?, ?, ?)", user, first, last);
        }
        jdbc.update("INSERT INTO accounts VALUES (?, ?, ?, ?, ?, ?)", account, user, number, name, status, level);
    }

    /**
     * Records a filled order.
     *
     * @param order order id
     * @param account account that placed it
     * @param symbol a stock listed with {@link #instrument}
     * @param side BUY or SELL
     * @param quantity shares filled
     * @param price price per share
     * @param filledAt execution time, ISO-8601 UTC
     */
    public void fill(UUID order, UUID account, String symbol, String side, long quantity, String price, String filledAt) {
        jdbc.update("INSERT INTO orders VALUES (?, ?, ?, ?)", order, account, instruments.get(symbol), side);
        jdbc.update("INSERT INTO fills VALUES (?, ?, ?, ?, ?)", UUID.randomUUID(), order,
                OffsetDateTime.ofInstant(Instant.parse(filledAt), ZoneOffset.UTC), quantity, new BigDecimal(price));
    }

    /**
     * Records a filled order with a new order id.
     *
     * @param account account that placed it
     * @param symbol a stock listed with {@link #instrument}
     * @param side BUY or SELL
     * @param quantity shares filled
     * @param price price per share
     * @param filledAt execution time, ISO-8601 UTC
     */
    public void fill(UUID account, String symbol, String side, long quantity, String price, String filledAt) {
        fill(UUID.randomUUID(), account, symbol, side, quantity, price, filledAt);
    }
}
