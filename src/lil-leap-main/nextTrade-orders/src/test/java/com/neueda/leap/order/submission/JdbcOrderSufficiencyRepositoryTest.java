package com.neueda.leap.order.submission;

import com.neueda.leap.order.submission.repository.JdbcOrderSufficiencyRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class JdbcOrderSufficiencyRepositoryTest {
    private final UUID account = UUID.randomUUID();
    private final UUID otherAccount = UUID.randomUUID();
    private final UUID instrument = UUID.randomUUID();
    private final UUID otherInstrument = UUID.randomUUID();
    private JdbcTemplate jdbc;
    private JdbcOrderSufficiencyRepository repository;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource(
                "jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", ""));
        jdbc.execute("CREATE TABLE accounts(account_id UUID PRIMARY KEY, execution_buffer_percent NUMERIC(5,2) NOT NULL)");
        jdbc.execute("CREATE TABLE cash_balances(account_id UUID PRIMARY KEY, currency CHAR(3) NOT NULL, balance NUMERIC(18,2) NOT NULL)");
        jdbc.execute("CREATE TABLE holdings(account_id UUID NOT NULL, instrument_id UUID NOT NULL, quantity BIGINT NOT NULL, PRIMARY KEY(account_id, instrument_id))");
        repository = new JdbcOrderSufficiencyRepository(jdbc);
    }

    @Test
    void cashIsScopedToAccountAndUsd() {
        jdbc.update("INSERT INTO cash_balances VALUES (?, 'USD', 25.37), (?, 'USD', 100000)", account, otherAccount);
        assertThat(repository.cashBalance(account)).isEqualByComparingTo("25.37");
        jdbc.update("UPDATE cash_balances SET currency = 'EUR' WHERE account_id = ?", account);
        assertThat(repository.cashBalance(account)).isZero();
    }

    @Test
    void holdingsAreScopedToAccountAndInstrumentWithoutNarrowingLongQuantity() {
        jdbc.update("INSERT INTO holdings VALUES (?, ?, ?), (?, ?, 100000), (?, ?, 100000)",
                account, instrument, Long.MAX_VALUE, otherAccount, instrument, account, otherInstrument);
        assertThat(repository.holdingQuantity(account, instrument)).isEqualTo(Long.MAX_VALUE);
        jdbc.update("DELETE FROM holdings WHERE account_id = ? AND instrument_id = ?", account, instrument);
        assertThat(repository.holdingQuantity(account, instrument)).isZero();
    }

    @Test
    void missingRowsReturnZero() {
        assertThat(repository.cashBalance(account)).isZero();
        assertThat(repository.holdingQuantity(account, instrument)).isZero();
    }

    @Test
    void readsTheRequestedAccountsConfiguredBuffer() {
        jdbc.update("INSERT INTO accounts VALUES (?, 3.75), (?, 0.00)", account, otherAccount);
        assertThat(repository.executionBufferPercent(account)).isEqualByComparingTo("3.75");
        assertThat(repository.executionBufferPercent(otherAccount)).isZero();
    }
}
