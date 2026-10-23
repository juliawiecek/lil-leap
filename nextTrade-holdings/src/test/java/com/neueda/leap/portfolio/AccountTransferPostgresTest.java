package com.neueda.leap.portfolio;

import com.neueda.leap.config.SecurityConfig;
import com.neueda.leap.portfolio.controller.AccountController;
import com.neueda.leap.portfolio.controller.ClientFinancialController;
import com.neueda.leap.portfolio.dto.TransferRequest;
import com.neueda.leap.portfolio.service.AccountActionException;
import com.neueda.leap.portfolio.service.AccountService;
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
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.EnableTransactionManagement;

import javax.sql.DataSource;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Opening accounts and moving cash between them against the production schema (PS-05). Opt-in, like the settlement tests. */
@EnabledIfSystemProperty(named = "test.holdings.postgres.url", matches = ".+")
@WebMvcTest({AccountController.class, ClientFinancialController.class})
@Import({SecurityConfig.class, JwtServiceImpl.class, AccountService.class, ClientFinancialQueryService.class,
        AccountTransferPostgresTest.DatabaseConfiguration.class})
class AccountTransferPostgresTest {
    @org.springframework.boot.test.mock.mockito.MockBean
    private com.neueda.leap.security.AuthSessionClient activeSessions;

    @org.junit.jupiter.api.BeforeEach
    void allowTestSessions() {
        org.mockito.Mockito.when(activeSessions.test(org.mockito.ArgumentMatchers.anyString())).thenReturn(true);
    }

    private static final String SCHEMA = "accounts_test_" + UUID.randomUUID().toString().replace("-", "");

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
    @Autowired MockMvc mvc;
    @Autowired JwtService tokens;
    @Autowired AccountService accounts;
    private UUID owner;
    private UUID brokerage;
    private UUID growth;
    private String bearer;

    @BeforeEach
    void seed() {
        owner = user();
        brokerage = account(owner, "Individual Brokerage");
        growth = account(owner, "Growth Portfolio");
        deposit(brokerage, "1000.00");
        bearer = "Bearer " + tokens.issueToken(owner, owner + "@example.test");
    }

    @Test
    void transferMovesExactlyTheAmountInOneLedgerPairWithAnAuditEvent() throws Exception {
        mvc.perform(post("/accounts/transfers").header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON).content(transfer(brokerage, growth, "250.25")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.amount").value(250.25))
                .andExpect(jsonPath("$.fromBalance").value(749.75))
                .andExpect(jsonPath("$.toBalance").value(250.25));

        assertThat(cache(brokerage)).isEqualByComparingTo("749.75");
        assertThat(cache(growth)).isEqualByComparingTo("250.25");
        assertThat(ledger(brokerage)).isEqualByComparingTo("749.75");
        assertThat(ledger(growth)).isEqualByComparingTo("250.25");
        assertThat(jdbc.queryForList("SELECT amount FROM cash_transactions WHERE transaction_type = 'TRANSFER' "
                + "AND account_id IN (?, ?) ORDER BY amount", BigDecimal.class, brokerage, growth))
                .usingElementComparator(BigDecimal::compareTo)
                .containsExactly(new BigDecimal("-250.25"), new BigDecimal("250.25"));
        assertThat(jdbc.queryForObject("SELECT payload->>'amount' FROM audit_log WHERE event_type = 'CASH_TRANSFER' "
                + "AND user_id = ? AND account_id = ?", String.class, owner, brokerage)).isEqualTo("250.25");
    }

    @Test
    void overdrawIsRejectedAndWritesNothing() throws Exception {
        mvc.perform(post("/accounts/transfers").header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON).content(transfer(brokerage, growth, "1000.01")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("INSUFFICIENT_FUNDS"));

        assertThat(cache(brokerage)).isEqualByComparingTo("1000.00");
        assertNoTransferWritten();
    }

    @Test
    void transferToAnotherClientsAccountIsForbiddenAndWritesNothing() throws Exception {
        UUID stranger = account(user(), "Not yours");
        mvc.perform(post("/accounts/transfers").header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON).content(transfer(brokerage, stranger, "10.00")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("ACCOUNT_ACCESS_DENIED"));
        mvc.perform(post("/accounts/transfers").header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON).content(transfer(stranger, brokerage, "10.00")))
                .andExpect(status().isForbidden());

        assertThat(cache(brokerage)).isEqualByComparingTo("1000.00");
        assertNoTransferWritten();
    }

    @Test
    void concurrentTransfersNeverOverdrawAndKeepCacheEqualToLedger() throws Exception {
        int attempts = 25;
        BigDecimal each = new BigDecimal("50.00");
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(8);
        List<Future<Boolean>> results = new ArrayList<>();
        try {
            for (int i = 0; i < attempts; i++) {
                // Alternate directions so the two account locks are requested from both sides.
                boolean outbound = i % 5 != 0;
                Callable<Boolean> task = () -> {
                    start.await();
                    try {
                        accounts.transfer(owner, new TransferRequest(outbound ? brokerage : growth,
                                outbound ? growth : brokerage, each));
                        return true;
                    } catch (AccountActionException rejected) {
                        return false;
                    }
                };
                results.add(pool.submit(task));
            }
            start.countDown();
            for (Future<Boolean> result : results) {
                result.get();
            }
        } finally {
            pool.shutdownNow();
        }

        assertThat(cache(brokerage)).isEqualByComparingTo(ledger(brokerage)).isNotNegative();
        assertThat(cache(growth)).isEqualByComparingTo(ledger(growth)).isNotNegative();
        assertThat(cache(brokerage).add(cache(growth))).isEqualByComparingTo("1000.00");
        long committed = results.stream().filter(this::succeeded).count();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM cash_transactions WHERE transaction_type = 'TRANSFER' "
                + "AND account_id IN (?, ?)", Long.class, brokerage, growth)).isEqualTo(committed * 2);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM audit_log WHERE event_type = 'CASH_TRANSFER' AND user_id = ?",
                Long.class, owner)).isEqualTo(committed);
    }

    @Test
    void openedAccountIsActiveEmptyAuditedAndListed() throws Exception {
        mvc.perform(post("/accounts").header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"nickname\":\" Long-term investing \"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.nickname").value("Long-term investing"))
                .andExpect(jsonPath("$.accountType").value("INDIVIDUAL_CASH"))
                .andExpect(jsonPath("$.currency").value("USD"))
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.tradingEnabled").value(true))
                .andExpect(jsonPath("$.cashBalance").value(0));

        UUID opened = jdbc.queryForObject("SELECT account_id FROM accounts WHERE user_id = ? AND account_name = ?",
                UUID.class, owner, "Long-term investing");
        assertThat(cache(opened)).isEqualByComparingTo("0");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM holdings WHERE account_id = ?", Long.class, opened)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM orders WHERE account_id = ?", Long.class, opened)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM audit_log WHERE event_type = 'ACCOUNT_OPENED' AND account_id = ?",
                Long.class, opened)).isOne();
        mvc.perform(get("/accounts").header("Authorization", bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[0].available_cash").value(1000.0))
                .andExpect(jsonPath("$[2].account_name").value("Long-term investing"));
    }

    @Test
    void cashReadsFollowTheSelectedAccountAndIgnoreOtherClientsAccounts() throws Exception {
        UUID stranger = account(user(), "Not yours");
        mvc.perform(get("/cash").param("accountId", growth.toString()).header("Authorization", bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].accountId").value(growth.toString()));
        mvc.perform(get("/cash").param("accountId", stranger.toString()).header("Authorization", bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void cashActivityListsDepositsAndTransfersNewestFirstButNotTradesOrOtherClients() throws Exception {
        accounts.transfer(owner, new TransferRequest(brokerage, growth, new BigDecimal("100.00")));
        jdbc.update("INSERT INTO cash_transactions(account_id, transaction_type, amount) VALUES (?, 'BUY', -50.00)", brokerage);
        deposit(account(user(), "Not yours"), "999.00");

        mvc.perform(get("/accounts/cash-activity").header("Authorization", bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[2].type").value("DEPOSIT"))
                .andExpect(jsonPath("$[2].amount").value(1000.0))
                .andExpect(jsonPath("$[2].accountName").value("Individual Brokerage"));
        mvc.perform(get("/accounts/cash-activity").param("accountId", growth.toString()).header("Authorization", bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].type").value("TRANSFER"))
                .andExpect(jsonPath("$[0].amount").value(100.0));
        mvc.perform(get("/accounts/cash-activity").param("from", "2999-01-01").header("Authorization", bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    private boolean succeeded(Future<Boolean> result) {
        try {
            return result.get();
        } catch (Exception failure) {
            throw new IllegalStateException(failure);
        }
    }

    private void assertNoTransferWritten() {
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM cash_transactions WHERE transaction_type = 'TRANSFER' "
                + "AND account_id IN (?, ?)", Long.class, brokerage, growth)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM audit_log WHERE event_type = 'CASH_TRANSFER' AND user_id = ?",
                Long.class, owner)).isZero();
    }

    private UUID user() {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO users(user_id, email, password_hash) VALUES (?, ?, 'test')", id, id + "@example.test");
        return id;
    }

    private UUID account(UUID user, String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO accounts(account_id, user_id, account_number, account_name, account_status, trading_enabled) "
                + "VALUES (?, ?, ?, ?, 'ACTIVE', TRUE)", id, user, id.toString().substring(0, 20), name);
        jdbc.update("INSERT INTO cash_balances(account_id, currency, balance) VALUES (?, 'USD', 0)", id);
        return id;
    }

    private void deposit(UUID account, String amount) {
        jdbc.update("INSERT INTO cash_transactions(account_id, transaction_type, amount) VALUES (?, 'DEPOSIT', ?)",
                account, new BigDecimal(amount));
        jdbc.update("UPDATE cash_balances SET balance = balance + ? WHERE account_id = ?", new BigDecimal(amount), account);
    }

    private BigDecimal cache(UUID account) {
        return jdbc.queryForObject("SELECT balance FROM cash_balances WHERE account_id = ?", BigDecimal.class, account);
    }

    private BigDecimal ledger(UUID account) {
        return jdbc.queryForObject("SELECT COALESCE(SUM(amount), 0) FROM cash_transactions WHERE account_id = ?",
                BigDecimal.class, account);
    }

    private static String transfer(UUID from, UUID to, String amount) {
        return "{\"fromAccountId\":\"%s\",\"toAccountId\":\"%s\",\"amount\":%s}".formatted(from, to, amount);
    }
}
