package com.neueda.leap.order.execution.cash;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionTemplate;

import javax.sql.DataSource;
import java.math.BigDecimal;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Cash movements through the real Spring transaction proxy, on an in-memory database. */
@SpringJUnitConfig(JdbcCashMovementAdapterTest.Database.class)
class JdbcCashMovementAdapterTest {
    @Autowired CashMovementAdapter cash;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager manager;
    private TransactionTemplate settlement;
    private final UUID account = UUID.randomUUID();

    @BeforeEach
    void fixtures() {
        settlement = new TransactionTemplate(manager);
        jdbc.update("DELETE FROM cash_transactions");
        jdbc.update("DELETE FROM cash_balances");
        jdbc.update("DELETE FROM accounts");
        jdbc.update("INSERT INTO accounts(account_id) VALUES (?)", account);
        jdbc.update("INSERT INTO cash_balances(account_id, currency, balance) VALUES (?, 'USD', 1000)", account);
    }

    @Test
    void movementOutsideASettlementTransactionIsRefused() {
        assertThatThrownBy(() -> cash.buy(account, UUID.randomUUID(), new BigDecimal("10.00")))
                .isInstanceOf(IllegalTransactionStateException.class);
        assertThatThrownBy(() -> cash.sell(account, UUID.randomUUID(), new BigDecimal("10.00")))
                .isInstanceOf(IllegalTransactionStateException.class);
        assertThat(ledgerRows()).isZero();
        assertThat(balance()).isEqualByComparingTo("1000");
    }

    @Test
    void buyDebitsTheLedgerAndBalanceTogether() {
        UUID fill = UUID.randomUUID();
        BigDecimal after = settlement.execute(tx -> cash.buy(account, fill, new BigDecimal("250.50")));
        assertThat(after).isEqualByComparingTo("749.50");
        assertThat(balance()).isEqualByComparingTo("749.50");
        assertThat(jdbc.queryForObject("SELECT amount FROM cash_transactions WHERE fill_id = ? AND transaction_type = 'BUY'",
                BigDecimal.class, fill)).isEqualByComparingTo("-250.50");
    }

    @Test
    void sellCreditsAndCreatesAMissingBalanceRow() {
        jdbc.update("DELETE FROM cash_balances");
        BigDecimal after = settlement.execute(tx -> cash.sell(account, UUID.randomUUID(), new BigDecimal("40.25")));
        assertThat(after).isEqualByComparingTo("40.25");
        assertThat(balance()).isEqualByComparingTo("40.25");
        assertThat(jdbc.queryForObject("SELECT SUM(amount) FROM cash_transactions WHERE transaction_type = 'SELL'",
                BigDecimal.class)).isEqualByComparingTo("40.25");
    }

    @Test
    void rolledBackSettlementLeavesNoCashChange() {
        settlement.executeWithoutResult(tx -> {
            cash.buy(account, UUID.randomUUID(), new BigDecimal("100.00"));
            cash.sell(account, UUID.randomUUID(), new BigDecimal("5.00"));
            tx.setRollbackOnly();
        });
        assertThat(ledgerRows()).isZero();
        assertThat(balance()).isEqualByComparingTo("1000");
    }

    @Test
    void overdraftIsRefusedWithoutWritingAnything() {
        assertThatThrownBy(() -> settlement.execute(tx -> cash.buy(account, UUID.randomUUID(), new BigDecimal("1000.01"))))
                .isInstanceOf(IllegalStateException.class);
        assertThat(ledgerRows()).isZero();
        assertThat(balance()).isEqualByComparingTo("1000");
    }

    @ParameterizedTest
    @ValueSource(strings = {"0", "0.00", "-1.00", "1.005"})
    void nonPositiveOrSubCentAmountsAreRefused(String amount) {
        assertThatThrownBy(() -> settlement.execute(tx -> cash.sell(account, UUID.randomUUID(), new BigDecimal(amount))))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(ledgerRows()).isZero();
    }

    @Test
    void unknownAccountIsRefused() {
        assertThatThrownBy(() -> settlement.execute(tx -> cash.lockBalance(UUID.randomUUID())))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private int ledgerRows() {
        return jdbc.queryForObject("SELECT COUNT(*) FROM cash_transactions", Integer.class);
    }

    private BigDecimal balance() {
        return jdbc.queryForObject("SELECT balance FROM cash_balances WHERE account_id = ?", BigDecimal.class, account);
    }

    @Configuration
    @EnableTransactionManagement
    @Import(JdbcCashMovementAdapter.class)
    static class Database {
        @Bean
        DataSource dataSource() {
            var source = new DriverManagerDataSource(
                    "jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", "");
            var jdbc = new JdbcTemplate(source);
            // Minimal projection of finalized-schema.sql: the columns and constraints cash settlement touches.
            jdbc.execute("CREATE TABLE accounts (account_id UUID PRIMARY KEY)");
            jdbc.execute("""
                    CREATE TABLE cash_balances (
                        account_id UUID PRIMARY KEY REFERENCES accounts, currency CHAR(3) NOT NULL,
                        balance NUMERIC(18,2) NOT NULL CHECK (balance >= 0),
                        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL)
                    """);
            jdbc.execute("""
                    CREATE TABLE cash_transactions (
                        transaction_id UUID DEFAULT RANDOM_UUID() PRIMARY KEY, account_id UUID NOT NULL REFERENCES accounts,
                        fill_id UUID, transaction_type VARCHAR(20) NOT NULL, amount NUMERIC(18,2) NOT NULL,
                        currency CHAR(3) NOT NULL, settlement_status VARCHAR(20) NOT NULL,
                        settled_at TIMESTAMP WITH TIME ZONE)
                    """);
            return source;
        }

        @Bean JdbcTemplate jdbcTemplate(DataSource source) { return new JdbcTemplate(source); }
        @Bean DataSourceTransactionManager transactionManager(DataSource source) {
            return new DataSourceTransactionManager(source);
        }
    }
}
