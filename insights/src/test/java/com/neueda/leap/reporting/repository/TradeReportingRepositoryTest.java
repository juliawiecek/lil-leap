package com.neueda.leap.reporting.repository;

import com.neueda.leap.onboarding.entity.Account;
import com.neueda.leap.onboarding.enums.AccountType;
import com.neueda.leap.onboarding.enums.TraderLevel;
import com.neueda.leap.onboarding.repository.AccountRepository;
import com.neueda.leap.reporting.entity.TradeFillEntity;
import com.neueda.leap.reporting.model.ReportDateRange;
import com.neueda.leap.user.entity.User;
import com.neueda.leap.user.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.ANY)
@ActiveProfiles("test")
class TradeReportingRepositoryTest {

    private static final ReportDateRange TODAY_RANGE =
            new ReportDateRange(LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 1));

    @Autowired
    private TradeReportingRepository repository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private AccountRepository accountRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void setUpSchemaAndData() {
        jdbcTemplate.update("DELETE FROM fills");
        jdbcTemplate.update("DELETE FROM orders");
        jdbcTemplate.update("DELETE FROM instruments");
        accountRepository.deleteAll();
        userRepository.deleteAll();

        User alice = userRepository.saveAndFlush(user("alice@example.test"));
        User bob = userRepository.saveAndFlush(user("bob@example.test"));
        Account aliceAccount = accountRepository.saveAndFlush(account(alice, "ACC-001"));
        Account bobAccount = accountRepository.saveAndFlush(account(bob, "ACC-002"));

        UUID aaplId = UUID.randomUUID();
        UUID tslaId = UUID.randomUUID();
        jdbcTemplate.update("INSERT INTO instruments (instrument_id, symbol) VALUES (?, ?)", aaplId, "AAPL");
        jdbcTemplate.update("INSERT INTO instruments (instrument_id, symbol) VALUES (?, ?)", tslaId, "TSLA");

        insertTrade(aliceAccount.getAccountId(), aaplId, 100, "10.00", Instant.parse("2026-10-01T09:15:00Z"));
        insertTrade(bobAccount.getAccountId(), aaplId, 50, "12.00", Instant.parse("2026-10-01T09:45:00Z"));
        insertTrade(bobAccount.getAccountId(), tslaId, 200, "20.00", Instant.parse("2026-10-01T13:00:00Z"));
        insertTrade(aliceAccount.getAccountId(), tslaId, 75, "30.00", Instant.parse("2026-09-30T22:00:00Z"));
    }

    @Test
    void summarizeReturnsCurrentDayOverview() {
        TradeReportingRepository.OverviewProjection overview =
                repository.summarize(TODAY_RANGE.startInclusive(), TODAY_RANGE.endExclusive());

        assertThat(overview.getTradeVolumeToday()).isEqualTo(350);
        assertThat(overview.getActiveClientsToday()).isEqualTo(2);
        assertThat(overview.getTradeValueToday()).isEqualByComparingTo("5600.00");
    }

    @Test
    void topInstrumentsAreRankedForCurrentDay() {
        assertThat(repository.findTopInstrumentsByTradeCount(
                TODAY_RANGE.startInclusive(),
                TODAY_RANGE.endExclusive(),
                PageRequest.of(0, 10)))
                .extracting(TradeReportingRepository.TopInstrumentProjection::getInstrument,
                        TradeReportingRepository.TopInstrumentProjection::getTradeCount)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple("AAPL", 2L),
                        org.assertj.core.groups.Tuple.tuple("TSLA", 1L));
    }

    @Test
    void executionTimesReturnOnlyRowsInsideTheRequestedDay() {
        assertThat(repository.findByFilledAtGreaterThanEqualAndFilledAtLessThanOrderByFilledAtAsc(
                TODAY_RANGE.startInclusive(),
                TODAY_RANGE.endExclusive()))
                .extracting(TradeFillEntity::getFilledAt)
                .containsExactly(
                        Instant.parse("2026-10-01T09:15:00Z"),
                        Instant.parse("2026-10-01T09:45:00Z"),
                        Instant.parse("2026-10-01T13:00:00Z"));
    }

    private void insertTrade(UUID accountId, UUID instrumentId, long quantity, String executionPrice, Instant filledAt) {
        UUID orderId = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO orders (order_id, account_id, instrument_id) VALUES (?, ?, ?)",
                orderId,
                accountId,
                instrumentId);
        jdbcTemplate.update(
                "INSERT INTO fills (fill_id, order_id, filled_quantity, execution_price, filled_at) VALUES (?, ?, ?, ?, ?)",
                UUID.randomUUID(),
                orderId,
                quantity,
                new BigDecimal(executionPrice),
                filledAt);
    }

    private static User user(String email) {
        User user = new User();
        user.setEmail(email);
        user.setPasswordHash("hash");
        user.setUserRole("TRADER");
        return user;
    }

    private static Account account(User user, String accountNumber) {
        Account account = new Account();
        account.setUser(user);
        account.setAccountNumber(accountNumber);
        account.setAccountName(accountNumber + " Name");
        account.setAccountType(AccountType.INDIVIDUAL_CASH);
        account.setAccountStatus("ACTIVE");
        account.setTraderLevel(TraderLevel.NOVICE);
        account.setMinBalanceRequirement(new BigDecimal("5000.00"));
        account.setTradingEnabled(true);
        return account;
    }
}

