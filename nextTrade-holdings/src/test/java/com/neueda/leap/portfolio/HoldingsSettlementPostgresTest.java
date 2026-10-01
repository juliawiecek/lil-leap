package com.neueda.leap.portfolio;

import com.neueda.leap.config.SecurityConfig;
import com.neueda.leap.portfolio.controller.ClientFinancialController;
import com.neueda.leap.portfolio.service.ClientFinancialQueryService;
import com.neueda.leap.security.JwtService;
import com.neueda.leap.security.JwtServiceImpl;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.test.web.servlet.MockMvc;

import javax.sql.DataSource;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Opt-in PostgreSQL tests using an isolated schema in a disposable test database. */
@EnabledIfSystemProperty(named = "test.holdings.postgres.url", matches = ".+")
@WebMvcTest({ClientFinancialController.class, com.neueda.leap.portfolio.controller.OrderHistoryController.class})
@Import({SecurityConfig.class, JwtServiceImpl.class, ClientFinancialQueryService.class,
        com.neueda.leap.portfolio.service.OrderHistoryService.class,
        com.neueda.leap.portfolio.repository.OrderHistoryRepository.class,
        HoldingsSettlementPostgresTest.DatabaseConfiguration.class})
class HoldingsSettlementPostgresTest {
    private static final String SCHEMA = "holdings_test_" + UUID.randomUUID().toString().replace("-", "");

    @TestConfiguration
    @EnableTransactionManagement
    static class DatabaseConfiguration {
        @Bean
        DataSource dataSource() throws Exception {
            DriverManagerDataSource ds = database();
            new JdbcTemplate(ds).execute("CREATE SCHEMA " + SCHEMA);
            ds.setSchema(SCHEMA);
            new JdbcTemplate(ds).execute(Files.readString(Path.of("../db/finalized-schema.sql")));
            return ds;
        }

        @Bean
        JdbcTemplate jdbcTemplate(DataSource ds) { return new JdbcTemplate(ds); }

        @Bean
        DataSourceTransactionManager transactionManager(DataSource ds) {
            return new DataSourceTransactionManager(ds);
        }
    }

    private static DriverManagerDataSource database() {
        return new DriverManagerDataSource(System.getProperty("test.holdings.postgres.url"),
                System.getProperty("test.holdings.postgres.user", "holdings_test"),
                System.getProperty("test.holdings.postgres.password", ""));
    }

    @AfterAll
    static void removeTestSchema() {
        new JdbcTemplate(database()).execute("DROP SCHEMA IF EXISTS " + SCHEMA + " CASCADE");
    }

    @Autowired JdbcTemplate jdbc;
    @Autowired DataSourceTransactionManager transactionManager;
    @Autowired MockMvc mvc;
    @Autowired JwtService tokens;
    private UUID owner;
    private UUID account;
    private UUID instrument;
    private String bearer;

    @BeforeEach
    void seed() {
        owner = UUID.randomUUID();
        account = UUID.randomUUID();
        instrument = UUID.randomUUID();
        jdbc.update("INSERT INTO users(user_id, email, password_hash) VALUES (?, ?, 'test')",
                owner, owner + "@example.test");
        jdbc.update("INSERT INTO accounts(account_id, user_id, account_number, account_name) VALUES (?, ?, ?, 'Test')",
                account, owner, account.toString().substring(0, 20));
        jdbc.update("INSERT INTO instruments(instrument_id, symbol, instrument_name, asset_class, market_code, currency) "
                + "VALUES (?, ?, 'Test', 'COMMON_STOCK', 'TEST', 'USD')", instrument,
                instrument.toString().substring(0, 15));
        bearer = "Bearer " + tokens.issueToken(owner, owner + "@example.test");
    }

    @Test
    void committedBuysSellsAndReopeningAreImmediatelyVisibleOnBothRoutes() throws Exception {
        assertRoutesEmpty();
        settle(10, "10");
        assertRoutes(10, "10");
        settle(10, "20");
        assertRoutes(20, "15");
        settle(-5, "30");
        assertRoutes(15, "15");
        settle(-15, "40");
        assertRoutes(0, "0");
        settle(2, "25");
        assertRoutes(2, "25");
    }

    @Test
    void orderHistoryFiltersAndFillDetailsUseTheProductionSchema() throws Exception {
        settle(2, "12.34");
        jdbc.update("UPDATE orders SET submitted_at='2026-09-30T23:59:59Z' WHERE account_id=?", account);
        mvc.perform(get("/clients/{id}/orders", owner).header("Authorization", bearer)
                        .param("from", "2026-09-30").param("to", "2026-09-30").param("status", "filled"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].fillPrice").value(12.34))
                .andExpect(jsonPath("$[0].filledQuantity").value(2));
        mvc.perform(get("/clients/{id}/orders", owner).header("Authorization", bearer).param("to", "2026-09-29"))
                .andExpect(status().isOk()).andExpect(content().json("[]"));
        mvc.perform(get("/clients/{id}/orders", owner).header("Authorization", bearer).param("status", "PENDING"))
                .andExpect(status().isOk()).andExpect(content().json("[]"));
        mvc.perform(get("/clients/{id}/orders", UUID.randomUUID()).header("Authorization", bearer))
                .andExpect(status().isNotFound());
    }

    @Test
    void uncommittedAndRolledBackSettlementNeverLeaksThroughEitherRoute() throws Exception {
        settle(10, "10");
        var entered = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var pool = Executors.newSingleThreadExecutor();
        try {
            var writer = pool.submit(() -> new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
                insertSettlement(5, "20");
                entered.countDown();
                await(release);
                status.setRollbackOnly();
            }));
            assertThat(entered.await(10, TimeUnit.SECONDS)).isTrue();
            assertRoutes(10, "10");
            release.countDown();
            writer.get(10, TimeUnit.SECONDS);
            assertRoutes(10, "10");
            assertThat(jdbc.queryForObject("SELECT count(*) FROM holding_movements WHERE account_id = ?", Long.class, account))
                    .isEqualTo(1L);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM fills f JOIN orders o USING(order_id) WHERE o.account_id = ?",
                    Long.class, account)).isEqualTo(1L);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM cash_transactions WHERE account_id = ?", Long.class, account))
                    .isEqualTo(1L);
        } finally {
            release.countDown();
            pool.shutdownNow();
        }
    }

    @Test
    void concurrentFirstBuysDoNotLoseQuantityOrCost() throws Exception {
        var pool = Executors.newFixedThreadPool(2);
        var ready = new CountDownLatch(2);
        var start = new CountDownLatch(1);
        try {
            var first = pool.submit(() -> { ready.countDown(); await(start); settle(10, "10"); });
            var second = pool.submit(() -> { ready.countDown(); await(start); settle(10, "20"); });
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            first.get(10, TimeUnit.SECONDS);
            second.get(10, TimeUnit.SECONDS);
            assertRoutes(20, "15");
        } finally {
            start.countDown();
            pool.shutdownNow();
        }
    }

    @Test
    void duplicateMovementAndOversellCannotChangeHoldings() throws Exception {
        UUID fill = new TransactionTemplate(transactionManager).execute(status -> insertSettlement(10, "10"));
        assertThatThrownBy(() -> new TransactionTemplate(transactionManager).executeWithoutResult(status ->
                jdbc.update("INSERT INTO holding_movements(account_id, instrument_id, fill_id, quantity_change, cost_basis, movement_type) "
                        + "VALUES (?, ?, ?, 10, 10, 'BUY')", account, instrument, fill)))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThatThrownBy(() -> settle(-11, "20"))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertRoutes(10, "10");
    }

    @Test
    void migrationRebuildsHistoricalSettlementsAndCanBeReapplied() throws Exception {
        // Emulate the old schema: ledger committed without a holdings projection.
        jdbc.execute("ALTER TABLE holding_movements DISABLE TRIGGER tg_holding_movement_projection");
        try {
            settle(10, "10");
            settle(10, "20");
            settle(-5, "30");
        } finally {
            jdbc.execute("ALTER TABLE holding_movements ENABLE TRIGGER tg_holding_movement_projection");
        }
        assertRoutesEmpty();
        String migration = Files.readString(Path.of("../db/migrations/008_holdings_projection.sql"));
        jdbc.execute(migration);
        assertRoutes(15, "15");
        jdbc.execute(migration);
        assertRoutes(15, "15");
        settle(5, "25");
        assertRoutes(20, "17.5");
    }

    @Test
    void portfolioSummaryIncludesEmptyAccountsAndEnforcesOwnership() throws Exception {
        String route = "/clients/" + owner + "/portfolio-summary";
        mvc.perform(get(route).header("Authorization", bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accountId").value(account.toString()))
                .andExpect(jsonPath("$.cash.totalBalance").value(0));
        mvc.perform(get("/clients/" + UUID.randomUUID() + "/portfolio-summary").header("Authorization", bearer))
                .andExpect(status().isForbidden());
        assertThatThrownBy(() -> new ClientFinancialQueryService(jdbc).getPortfolioSummary(UUID.randomUUID(), account))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    }

    @Test
    void portfolioSummaryUsesSettledPendingAndHeldCashAndLatestPrices() throws Exception {
        jdbc.update("INSERT INTO cash_transactions(account_id,transaction_type,amount) VALUES (?,'DEPOSIT',1000)", account);
        settle(10, "10");
        jdbc.update("INSERT INTO cash_transactions(account_id,transaction_type,amount,settlement_status,settled_at) VALUES (?,'DEPOSIT',50,'PENDING',NULL)", account);
        UUID order = jdbc.queryForObject("SELECT order_id FROM orders WHERE account_id=? LIMIT 1", UUID.class, account);
        jdbc.update("INSERT INTO cash_holds(account_id,order_id,held_amount,hold_reason) VALUES (?,?,100,'ORDER_PENDING')", account, order);
        jdbc.update("INSERT INTO quotes(instrument_id,bid,ask,quoted_at,source) VALUES (?,19,21,CURRENT_TIMESTAMP,'TEST')", instrument);
        mvc.perform(get("/clients/" + owner + "/portfolio-summary").header("Authorization", bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cash.settledBalance").value(900))
                .andExpect(jsonPath("$.cash.pendingBalance").value(50))
                .andExpect(jsonPath("$.cash.availableBalance").value(800))
                .andExpect(jsonPath("$.cash.totalBalance").value(950))
                .andExpect(jsonPath("$.totalPortfolioValue").value(1150));
    }

    @Test
    void cashMigrationUpgradesHistoricalLedgerAndCanBeReapplied() throws Exception {
        jdbc.execute("DROP VIEW v_account_cash");
        jdbc.execute("DROP TABLE cash_holds");
        jdbc.execute("ALTER TABLE cash_transactions DROP COLUMN settlement_status, DROP COLUMN settled_at");
        jdbc.execute("CREATE VIEW v_account_cash AS SELECT account_id, 'USD' AS currency, COALESCE(SUM(amount),0) AS balance FROM cash_transactions GROUP BY account_id");
        jdbc.update("INSERT INTO cash_transactions(account_id,transaction_type,amount) VALUES (?,'DEPOSIT',1000)", account);
        String migration = Files.readString(Path.of("../db/migrations/009_cash_settlement_detail.sql"));
        String reader = "cash_reader_" + UUID.randomUUID().toString().replace("-", "");
        jdbc.execute("CREATE ROLE " + reader);
        try {
            jdbc.execute("GRANT SELECT ON cash_transactions TO " + reader);
            jdbc.execute(migration);
            jdbc.execute(migration);
            assertThat(jdbc.queryForObject("SELECT has_table_privilege(?, 'cash_holds', 'SELECT')", Boolean.class, reader)).isTrue();
            assertThat(jdbc.queryForObject("SELECT has_table_privilege(?, 'cash_holds', 'INSERT')", Boolean.class, reader)).isFalse();
        } finally {
            jdbc.execute("REVOKE ALL ON ALL TABLES IN SCHEMA " + SCHEMA + " FROM " + reader);
            jdbc.execute("DROP ROLE " + reader);
        }
        assertThat(jdbc.queryForObject("SELECT settled_at=created_at FROM cash_transactions WHERE account_id=?", Boolean.class, account)).isTrue();
        settle(1, "10");
        assertThat(jdbc.queryForObject("SELECT balance FROM v_account_cash WHERE account_id=?", BigDecimal.class, account)).isEqualByComparingTo("990");
        assertThat(jdbc.queryForObject("SELECT available_balance FROM v_account_cash WHERE account_id=?", BigDecimal.class, account)).isEqualByComparingTo("990");
    }

    @Test
    void portfolioDoesNotSilentlyValueUnquotedPositionsAtZero() throws Exception {
        settle(1, "10");
        mvc.perform(get("/clients/" + owner + "/portfolio-summary").header("Authorization", bearer))
                .andExpect(status().isServiceUnavailable());
    }

    private void settle(long quantity, String price) {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> insertSettlement(quantity, price));
    }

    private UUID insertSettlement(long quantity, String price) {
        UUID order = UUID.randomUUID();
        UUID fill = UUID.randomUUID();
        String side = quantity > 0 ? "BUY" : "SELL";
        jdbc.update("INSERT INTO orders(order_id, account_id, instrument_id, client_reference, side, quantity, status, accepted_at) "
                        + "VALUES (?, ?, ?, ?, ?, ?, 'ACCEPTED', CURRENT_TIMESTAMP)",
                order, account, instrument, UUID.randomUUID(), side, Math.abs(quantity));
        jdbc.update("INSERT INTO fills(fill_id, order_id, filled_quantity, execution_price, quote_timestamp) "
                + "VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)", fill, order, Math.abs(quantity), new BigDecimal(price));
        jdbc.update("INSERT INTO holding_movements(account_id, instrument_id, fill_id, quantity_change, cost_basis, movement_type) "
                + "VALUES (?, ?, ?, ?, ?, ?)", account, instrument, fill, quantity, new BigDecimal(price), side);
        jdbc.update("INSERT INTO cash_transactions(account_id, fill_id, transaction_type, amount) VALUES (?, ?, ?, ?)",
                account, fill, side, new BigDecimal(price).multiply(BigDecimal.valueOf(-quantity)));
        jdbc.update("UPDATE orders SET status = 'FILLED' WHERE order_id = ?", order);
        return fill;
    }

    private void assertRoutes(long quantity, String cost) throws Exception {
        for (String route : routes()) {
            mvc.perform(get(route).header("Authorization", bearer))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(1))
                    .andExpect(jsonPath("$[0].accountId").value(account.toString()))
                    .andExpect(jsonPath("$[0].quantity").value(quantity))
                    .andExpect(jsonPath("$[0].averageCost").value(new BigDecimal(cost).doubleValue()))
                    .andExpect(jsonPath("$[0].updatedAt").isNotEmpty());
        }
    }

    private void assertRoutesEmpty() throws Exception {
        for (String route : routes()) {
            mvc.perform(get(route).header("Authorization", bearer))
                    .andExpect(status().isOk()).andExpect(content().json("[]"));
        }
    }

    private String[] routes() { return new String[]{"/holdings", "/clients/" + owner + "/holdings"}; }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(10, TimeUnit.SECONDS)) throw new AssertionError("Writer synchronization timed out");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new AssertionError(e);
        }
    }
}
