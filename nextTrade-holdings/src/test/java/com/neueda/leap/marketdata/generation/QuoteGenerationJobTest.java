package com.neueda.leap.marketdata.generation;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.transaction.support.TransactionOperations;

class QuoteGenerationJobTest {
    private static final CatalogInstrument AAPL = new CatalogInstrument("AAPL", "NASDAQ", "USD", 225, 0.08, 0.25);
    private static final CatalogInstrument JPM = new CatalogInstrument("JPM", "NYSE", "USD", 300, 0.07, 0.22);
    private static final CatalogInstrument MISSING = new CatalogInstrument("ZZZZ", "NYSE", "USD", 10, 0, 0.1);
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-10-19T14:30:05.789Z"), ZoneOffset.UTC);

    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final Map<String, String[]> instruments = Map.of(
            "NASDAQ:AAPL", new String[] {"11111111-1111-1111-1111-111111111111", "USD"},
            "NYSE:JPM", new String[] {"22222222-2222-2222-2222-222222222222", "EUR"});

    /** Answers the instrument lookup by running the job's own row mapper over a fake row. */
    @SuppressWarnings("unchecked")
    private void stubInstruments() {
        when(jdbc.query(anyString(), any(RowMapper.class), anyString(), anyString())).thenAnswer(call -> {
            String[] row = instruments.get(call.getArgument(2) + ":" + call.getArgument(3));
            if (row == null) {
                return List.of();
            }
            ResultSet rs = mock(ResultSet.class);
            when(rs.getString("currency")).thenReturn(row[1]);
            when(rs.getObject("instrument_id", UUID.class)).thenReturn(UUID.fromString(row[0]));
            List<Object> mapped = new ArrayList<>();
            mapped.add(((RowMapper<Object>) call.getArgument(1)).mapRow(rs, 0));
            return mapped;
        });
    }

    private QuoteGenerationJob job(List<CatalogInstrument> catalog) {
        return new QuoteGenerationJob(jdbc, TransactionOperations.withoutTransaction(), catalog, 42, CLOCK);
    }

    @Test
    @SuppressWarnings("unchecked")
    void storesOneSyntheticQuotePerTradableStockAtTheCurrentSecond() {
        stubInstruments();
        when(jdbc.batchUpdate(anyString(), anyList())).thenReturn(new int[] {1});
        ArgumentCaptor<List<Object[]>> rows = ArgumentCaptor.forClass(List.class);

        // JPM's instrument is in EUR, so the USD catalog price is skipped; ZZZZ has no instrument.
        assertEquals(1, job(List.of(AAPL, JPM, MISSING)).generate());

        verify(jdbc).batchUpdate(eq(insertSql()), rows.capture());
        assertEquals(1, rows.getValue().size());
        Object[] row = rows.getValue().get(0);
        assertEquals(UUID.fromString("11111111-1111-1111-1111-111111111111"), row[0]);
        assertEquals(Timestamp.from(Instant.parse("2026-10-19T14:30:05Z")), row[3]);
        assertEquals(SyntheticQuoteModel.SOURCE, row[4]);
        assertEquals(SyntheticQuoteModel.tick(List.of(AAPL, JPM, MISSING), 42).get(0).bid(), row[1]);
    }

    @Test
    @SuppressWarnings("unchecked")
    void foundInstrumentsAreLookedUpOnceAndEachTickUsesTheNextSeed() {
        stubInstruments();
        when(jdbc.batchUpdate(anyString(), anyList())).thenReturn(new int[] {1}, new int[] {0});
        ArgumentCaptor<List<Object[]>> rows = ArgumentCaptor.forClass(List.class);
        QuoteGenerationJob job = job(List.of(AAPL, MISSING));

        assertEquals(1, job.generate());
        assertEquals(0, job.generate(), "a repeated quote time is skipped, not counted");

        verify(jdbc).query(anyString(), any(RowMapper.class), eq("NASDAQ"), eq("AAPL"));
        verify(jdbc, times(2)).query(anyString(), any(RowMapper.class), eq("NYSE"), eq("ZZZZ"));
        verify(jdbc, times(2)).batchUpdate(anyString(), rows.capture());
        assertEquals(SyntheticQuoteModel.tick(List.of(AAPL), 42).get(0).bid(), rows.getAllValues().get(0).get(0)[1]);
        assertEquals(SyntheticQuoteModel.tick(List.of(AAPL), 43).get(0).bid(), rows.getAllValues().get(1).get(0)[1]);
    }

    @Test
    @SuppressWarnings("unchecked")
    void aDatabaseOutageIsLoggedAndTheSameSeedIsRetriedNextTick() {
        stubInstruments();
        when(jdbc.batchUpdate(anyString(), anyList()))
                .thenThrow(new DataAccessResourceFailureException("connection refused"))
                .thenReturn(new int[] {1});
        ArgumentCaptor<List<Object[]>> rows = ArgumentCaptor.forClass(List.class);
        QuoteGenerationJob job = job(List.of(AAPL));

        job.run();
        job.run();

        verify(jdbc, times(2)).batchUpdate(anyString(), rows.capture());
        assertEquals(rows.getAllValues().get(0).get(0)[1], rows.getAllValues().get(1).get(0)[1]);
    }

    @Test
    void theBundledCatalogIsUsedByDefault() {
        when(jdbc.batchUpdate(anyString(), anyList())).thenReturn(new int[0]);
        assertEquals(0, new QuoteGenerationJob(jdbc, TransactionOperations.withoutTransaction(), 42).generate());
        verify(jdbc, times(33)).query(anyString(), any(RowMapper.class), anyString(), anyString());
    }

    @Test
    void springWiresTheJobAndCanSwitchItOff() {
        ApplicationContextRunner runner = new ApplicationContextRunner()
                .withBean(JdbcTemplate.class, () -> jdbc)
                .withBean(TransactionOperations.class, TransactionOperations::withoutTransaction)
                // Keep the scheduler from firing at the mock while the context is up.
                .withPropertyValues("marketdata.quotes.generator.initial-delay-seconds=3600")
                .withUserConfiguration(QuoteGenerationConfiguration.class, QuoteGenerationJob.class);
        runner.run(context -> assertEquals(1, context.getBeansOfType(QuoteGenerationJob.class).size()));
        runner.withPropertyValues("marketdata.quotes.generator.enabled=false")
                .run(context -> assertEquals(0, context.getBeansOfType(QuoteGenerationJob.class).size()));
    }

    private static String insertSql() {
        return "INSERT INTO quotes(instrument_id, bid, ask, quoted_at, source, is_synthetic)"
                + " VALUES (?, ?, ?, LEAST(?::timestamptz, CURRENT_TIMESTAMP), ?, TRUE)"
                + " ON CONFLICT (instrument_id, quoted_at, source) DO NOTHING";
    }
}
