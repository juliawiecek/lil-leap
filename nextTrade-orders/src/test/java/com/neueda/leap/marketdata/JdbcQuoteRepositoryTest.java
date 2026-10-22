package com.neueda.leap.marketdata;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.*;
class JdbcQuoteRepositoryTest {
 @Test void preciseInstrumentQueryUsesUuid(){JdbcTemplate jdbc=mock(JdbcTemplate.class); when(jdbc.query(anyString(),any(RowMapper.class),any(UUID.class))).thenReturn(List.of()); assertTrue(new JdbcQuoteRepository(jdbc).findLatestByInstrumentId(UUID.randomUUID()).isEmpty());}
 @Test void marketAndSymbolAreNormalized(){JdbcTemplate jdbc=mock(JdbcTemplate.class); when(jdbc.query(anyString(),any(RowMapper.class),eq("NASDAQ"),eq("AAPL"))).thenReturn(List.of()); new JdbcQuoteRepository(jdbc).findLatestByMarketAndSymbol(" nasdaq "," aapl "); verify(jdbc).query(anyString(),any(RowMapper.class),eq("NASDAQ"),eq("AAPL"));}
 @Test void historyClampedToMaximumLimit(){JdbcTemplate jdbc=mock(JdbcTemplate.class); when(jdbc.query(anyString(),any(RowMapper.class),any(UUID.class),anyInt())).thenReturn(List.of()); UUID id=UUID.randomUUID(); new JdbcQuoteRepository(jdbc).findHistoryByInstrumentId(id,5000); verify(jdbc).query(anyString(),any(RowMapper.class),eq(id),eq(1000));}
 @Test void historyRespectsNonzeroLimit(){JdbcTemplate jdbc=mock(JdbcTemplate.class); when(jdbc.query(anyString(),any(RowMapper.class),any(UUID.class),anyInt())).thenReturn(List.of()); UUID id=UUID.randomUUID(); new JdbcQuoteRepository(jdbc).findHistoryByInstrumentId(id,50); verify(jdbc).query(anyString(),any(RowMapper.class),eq(id),eq(50));}

    @Test
    void historyLimitBelowOneIsRaisedToOne() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        UUID id = UUID.randomUUID();
        when(jdbc.query(anyString(), any(RowMapper.class), any(UUID.class), anyInt())).thenReturn(List.of());

        new JdbcQuoteRepository(jdbc).findHistoryByInstrumentId(id, 0);
        new JdbcQuoteRepository(jdbc).findHistoryByInstrumentId(id, -5);

        verify(jdbc, times(2)).query(org.mockito.ArgumentMatchers.contains("LIMIT ?"), any(RowMapper.class), eq(id), eq(1));
    }

    @Test
    @SuppressWarnings("unchecked")
    void latestQuoteIsMappedFromTheRowAndOnlyThePastIsConsidered() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        UUID instrument = UUID.randomUUID();
        UUID quote = UUID.randomUUID();
        java.time.OffsetDateTime quotedAt = java.time.OffsetDateTime.parse("2026-10-01T14:30:00Z");
        java.sql.ResultSet rs = mock(java.sql.ResultSet.class);
        when(rs.getObject("quote_id", UUID.class)).thenReturn(quote);
        when(rs.getObject("instrument_id", UUID.class)).thenReturn(instrument);
        when(rs.getString("symbol")).thenReturn("AAPL");
        when(rs.getString("market_code")).thenReturn("NASDAQ");
        when(rs.getBigDecimal("bid")).thenReturn(new java.math.BigDecimal("187.00"));
        when(rs.getBigDecimal("ask")).thenReturn(new java.math.BigDecimal("187.50"));
        when(rs.getBigDecimal("midpoint")).thenReturn(new java.math.BigDecimal("187.25"));
        when(rs.getObject("quoted_at", java.time.OffsetDateTime.class)).thenReturn(quotedAt);
        when(rs.getString("source")).thenReturn("SIMULATOR");
        when(rs.getBoolean("is_synthetic")).thenReturn(true);
        when(jdbc.query(anyString(), any(RowMapper.class), eq(instrument)))
                .thenAnswer(invocation -> List.of(invocation.<RowMapper<?>>getArgument(1).mapRow(rs, 0)));

        Optional<MarketQuote> latest = new JdbcQuoteRepository(jdbc).findLatestByInstrumentId(instrument);

        assertEquals(Optional.of(new MarketQuote(quote, instrument, "AAPL", "NASDAQ",
                new java.math.BigDecimal("187.00"), new java.math.BigDecimal("187.50"),
                new java.math.BigDecimal("187.25"), quotedAt, "SIMULATOR", true)), latest);
        verify(jdbc).query(org.mockito.ArgumentMatchers.contains("q.quoted_at<=CURRENT_TIMESTAMP"),
                any(RowMapper.class), eq(instrument));
    }

    @Test
    @SuppressWarnings("unchecked")
    void marketAndSymbolLookupOnlyConsidersEnabledTradableInstrumentsAndReturnsTheFirstRow() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        MarketQuote newest = new MarketQuote(UUID.randomUUID(), UUID.randomUUID(), "AAPL", "NASDAQ",
                java.math.BigDecimal.ONE, java.math.BigDecimal.TEN, new java.math.BigDecimal("5.5"),
                java.time.OffsetDateTime.parse("2026-10-01T14:30:00Z"), "FEED", false);
        when(jdbc.query(anyString(), any(RowMapper.class), eq("NASDAQ"), eq("AAPL"))).thenReturn(List.of(newest));

        assertEquals(Optional.of(newest), new JdbcQuoteRepository(jdbc).findLatestByMarketAndSymbol("nasdaq", "aapl"));
        verify(jdbc).query(org.mockito.ArgumentMatchers.contains("i.enabled AND i.tradable"), any(RowMapper.class),
                eq("NASDAQ"), eq("AAPL"));
    }
}
