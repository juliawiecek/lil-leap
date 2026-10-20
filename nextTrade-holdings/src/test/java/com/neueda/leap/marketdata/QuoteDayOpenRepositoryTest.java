package com.neueda.leap.marketdata;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabase;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseBuilder;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseType;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.TimeZone;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class QuoteDayOpenRepositoryTest {
    private EmbeddedDatabase database;
    private JdbcTemplate jdbc;
    private JdbcQuoteRepository repository;
    private final UUID instrument = UUID.randomUUID();
    private static final String INSERT = "INSERT INTO quotes VALUES (?, ?, ?, ?, ?, ?, 'TEST', false)";

    @BeforeEach
    void setUp() {
        database = new EmbeddedDatabaseBuilder().generateUniqueName(true).setType(EmbeddedDatabaseType.H2).build();
        jdbc = new JdbcTemplate(database);
        jdbc.execute("CREATE TABLE instruments(instrument_id UUID PRIMARY KEY, symbol VARCHAR(20), market_code VARCHAR(20))");
        jdbc.execute("CREATE TABLE quotes(quote_id UUID PRIMARY KEY, instrument_id UUID, bid NUMERIC(20,8), ask NUMERIC(20,8),"
                + " quoted_at TIMESTAMP WITH TIME ZONE, created_at TIMESTAMP WITH TIME ZONE, source VARCHAR(20), is_synthetic BOOLEAN)");
        jdbc.update("INSERT INTO instruments VALUES (?, 'AAPL', 'NYSE')", instrument);
        repository = new JdbcQuoteRepository(jdbc);
    }

    @AfterEach
    void close() { database.shutdown(); }

    private void quote(String time, int price) {
        OffsetDateTime at = OffsetDateTime.parse(time);
        jdbc.update(INSERT, UUID.randomUUID(), instrument, price, price, at, at);
    }

    private void baseline(String now, int price) {
        assertThat(repository.findDayOpen(instrument, Instant.parse(now))).get()
                .extracting(MarketQuote::midpoint).isEqualTo(BigDecimal.valueOf(price).setScale(8));
    }

    @Test
    void firstOpeningQuoteIsFoundBeyondOneThousandRecentQuotes() {
        quote("2026-10-14T13:29:59Z", 50);
        Instant first = Instant.parse("2026-10-14T13:30:03Z");
        var rows = new ArrayList<Object[]>();
        for (int i = 0; i < 1500; i++) {
            OffsetDateTime at = first.plusSeconds(i * 5L).atOffset(java.time.ZoneOffset.UTC);
            rows.add(new Object[]{UUID.randomUUID(), instrument, 100 + i, 100 + i, at, at});
        }
        jdbc.batchUpdate(INSERT, rows);
        assertThat(repository.findHistoryByInstrumentId(instrument, 1000)).hasSize(1000)
                .noneMatch(q -> q.quotedAt().toInstant().equals(first));
        baseline("2026-10-14T17:00:00Z", 100);
        baseline("2026-10-14T23:00:00Z", 100);
    }

    @ParameterizedTest
    @CsvSource({
            "UTC,2026-07-08T13:30:00Z", "Asia/Tokyo,2026-07-08T13:30:00Z",
            "Pacific/Honolulu,2026-07-08T13:30:00Z", "Europe/Warsaw,2026-01-14T14:30:00Z",
            "America/Los_Angeles,2026-01-14T14:30:00Z", "UTC,2026-03-09T13:30:00Z",
            "UTC,2026-11-02T14:30:00Z"
    })
    void newYorkOpenIsIndependentOfMachineZoneAndHandlesDst(String zone, String open) {
        TimeZone original = TimeZone.getDefault();
        try {
            TimeZone.setDefault(TimeZone.getTimeZone(zone));
            quote(Instant.parse(open).minusSeconds(1).toString(), 50);
            quote(open, 100);
            quote(Instant.parse(open).plusSeconds(5).toString(), 200);
            baseline(Instant.parse(open).plusSeconds(30).toString(), 100);
        } finally {
            TimeZone.setDefault(original);
        }
    }

    @Test
    void beforeOpenUsesPreviousCloseAndIgnoresAfterHoursAndPremarket() {
        quote("2026-10-13T20:00:00Z", 100);
        quote("2026-10-13T20:00:01Z", 200);
        quote("2026-10-14T12:00:00Z", 300);
        baseline("2026-10-14T13:29:59Z", 100);
    }

    @Test
    void openingQuoteCanArriveLateButFutureAndAfterHoursQuotesNeverBecomeTheOpen() {
        quote("2026-10-13T20:00:00Z", 90);
        quote("2026-10-14T13:30:05Z", 100);
        assertThat(repository.findDayOpen(instrument, Instant.parse("2026-10-14T13:30:00Z"))).isEmpty();
        baseline("2026-10-14T13:30:05Z", 100);
        quote("2026-10-15T20:00:05Z", 200);
        assertThat(repository.findDayOpen(instrument, Instant.parse("2026-10-15T21:00:00Z"))).isEmpty();
        assertThat(repository.findDayOpen(UUID.randomUUID(), Instant.parse("2026-10-14T14:00:00Z"))).isEmpty();
    }

    @Test
    void weekendAndMondayPremarketUseFridayCloseAcrossDstTransition() {
        quote("2026-03-06T21:00:00Z", 100);
        quote("2026-03-07T14:30:00Z", 200);
        quote("2026-03-08T13:30:00Z", 300);
        baseline("2026-03-07T19:00:00Z", 100);
        baseline("2026-03-08T19:00:00Z", 100);
        baseline("2026-03-09T13:29:59Z", 100);
    }
}
