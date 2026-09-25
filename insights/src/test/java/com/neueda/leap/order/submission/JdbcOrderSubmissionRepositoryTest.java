package com.neueda.leap.order.submission;

import com.neueda.leap.order.submission.repository.JdbcOrderSubmissionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class JdbcOrderSubmissionRepositoryTest {
    private JdbcTemplate jdbc;
    private JdbcOrderSubmissionRepository repository;
    private final UUID accountId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource(
                "jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", ""));
        jdbc.execute("CREATE TABLE accounts(account_id UUID PRIMARY KEY, account_status VARCHAR(20), "
                + "trading_enabled BOOLEAN, trader_level VARCHAR(20), min_balance_requirement NUMERIC(18,2))");
        jdbc.execute("CREATE TABLE cash_balances(account_id UUID, currency CHAR(3), balance NUMERIC(18,2))");
        jdbc.execute("CREATE TABLE instruments(instrument_id UUID PRIMARY KEY, symbol VARCHAR(20), "
                + "market_code VARCHAR(20), enabled BOOLEAN, tradable BOOLEAN)");
        repository = new JdbcOrderSubmissionRepository(jdbc);
    }

    @Test
    void accountProfileUsesOnlyTheRequestedAccountsUsdBalance() {
        jdbc.update("INSERT INTO accounts VALUES (?, 'ACTIVE', TRUE, 'NOVICE', 5000)", accountId);
        jdbc.update("INSERT INTO cash_balances VALUES (?, 'USD', 6000), (?, 'EUR', 9000), (?, 'USD', 8000)",
                accountId, accountId, UUID.randomUUID());

        var profile = repository.findAccountTradingProfile(accountId).orElseThrow();
        assertThat(profile.accountStatus()).isEqualTo("ACTIVE");
        assertThat(profile.tradingEnabled()).isTrue();
        assertThat(profile.traderLevel()).isEqualTo("NOVICE");
        assertThat(profile.minimumBalanceRequirement()).isEqualByComparingTo("5000");
        assertThat(profile.currentBalance()).isEqualByComparingTo("6000");
    }

    @Test
    void missingCashReturnsZeroButMissingAccountReturnsEmpty() {
        jdbc.update("INSERT INTO accounts VALUES (?, 'ACTIVE', TRUE, 'NOVICE', 5000)", accountId);
        assertThat(repository.findAccountTradingProfile(accountId).orElseThrow().currentBalance()).isZero();
        assertThat(repository.findAccountTradingProfile(UUID.randomUUID())).isEmpty();
    }

    @Test
    void instrumentLookupPreservesDisabledAndNonTradableFlags() {
        UUID instrumentId = UUID.randomUUID();
        jdbc.update("INSERT INTO instruments VALUES (?, 'aapl', 'NASDAQ', FALSE, FALSE)", instrumentId);

        var profile = repository.findInstrumentTradingProfileBySymbol("AAPL").orElseThrow();
        assertThat(profile.instrumentId()).isEqualTo(instrumentId);
        assertThat(profile.enabled()).isFalse();
        assertThat(profile.tradable()).isFalse();
        assertThat(repository.findInstrumentTradingProfileBySymbol("NOPE")).isEmpty();
    }
}
