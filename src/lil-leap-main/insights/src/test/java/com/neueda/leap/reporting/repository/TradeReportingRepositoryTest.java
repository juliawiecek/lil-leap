package com.neueda.leap.reporting.repository;

import com.neueda.leap.reporting.entity.TradeFillEntity;
import com.neueda.leap.reporting.model.ReportDateRange;
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
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void setUpSchemaAndData() {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS accounts (
                    account_id UUID PRIMARY KEY,
                    user_id UUID NOT NULL
                )
                """);

        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    user_id UUID PRIMARY KEY,
                    email VARCHAR(255)
                )
                """);

        jdbcTemplate.update("DELETE FROM fills");
        jdbcTemplate.update("DELETE FROM orders");
        jdbcTemplate.update("DELETE FROM instruments");
        jdbcTemplate.update("DELETE FROM accounts");
        jdbcTemplate.update("DELETE FROM users");

        UUID aliceUserId = UUID.randomUUID();
        UUID bobUserId = UUID.randomUUID();
        UUID aliceAccountId = UUID.randomUUID();
        UUID bobAccountId = UUID.randomUUID();

        jdbcTemplate.update("INSERT INTO users (user_id, email) VALUES (?, ?)", aliceUserId, "alice@example.test");
        jdbcTemplate.update("INSERT INTO users (user_id, email) VALUES (?, ?)", bobUserId, "bob@example.test");
        jdbcTemplate.update("INSERT INTO accounts (account_id, user_id) VALUES (?, ?)", aliceAccountId, aliceUserId);
        jdbcTemplate.update("INSERT INTO accounts (account_id, user_id) VALUES (?, ?)", bobAccountId, bobUserId);

        UUID aaplId = UUID.randomUUID();
        UUID tslaId = UUID.randomUUID();
        jdbcTemplate.update("INSERT INTO instruments (instrument_id, symbol) VALUES (?, ?)", aaplId, "AAPL");
        jdbcTemplate.update("INSERT INTO instruments (instrument_id, symbol) VALUES (?, ?)", tslaId, "TSLA");

        insertTrade(aliceAccountId, aaplId, 100, "10.00", Instant.parse("2026-10-01T09:15:00Z"));
        insertTrade(bobAccountId, aaplId, 50, "12.00", Instant.parse("2026-10-01T09:45:00Z"));
        insertTrade(bobAccountId, tslaId, 200, "20.00", Instant.parse("2026-10-01T13:00:00Z"));
        insertTrade(aliceAccountId, tslaId, 75, "30.00", Instant.parse("2026-09-30T22:00:00Z"));
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

}

