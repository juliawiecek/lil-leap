package com.neueda.leap.marketdata;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class QuoteCandlesRepositoryTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final JdbcQuoteRepository repository = new JdbcQuoteRepository(jdbc);
    private final UUID instrument = UUID.randomUUID();

    @ParameterizedTest
    @CsvSource({"120,120", "5000,500", "0,1"})
    @SuppressWarnings("unchecked")
    void bucketsByTheIntervalAndClampsTheWindow(int requested, int used) {
        when(jdbc.query(anyString(), any(RowMapper.class), any(), any(), any(), any())).thenReturn(List.of());

        assertThat(repository.findCandles(instrument, CandleInterval.FIVE_MINUTES, requested)).isEmpty();

        verify(jdbc).query(contains("date_bin"), any(RowMapper.class),
                eq("5 minutes"), eq(instrument), eq("5 minutes"), eq(used));
    }

    @Test
    @SuppressWarnings("unchecked")
    void mapsEachBucketToACandle() throws Exception {
        when(jdbc.query(anyString(), any(RowMapper.class), any(), any(), any(), any())).thenReturn(List.of());
        repository.findCandles(instrument, CandleInterval.ONE_MINUTE, 10);
        ArgumentCaptor<RowMapper<PriceCandle>> mapper = ArgumentCaptor.forClass(RowMapper.class);
        verify(jdbc).query(anyString(), mapper.capture(), any(), any(), any(), any());

        OffsetDateTime bucket = OffsetDateTime.parse("2026-10-14T09:52:00Z");
        ResultSet rs = mock(ResultSet.class);
        when(rs.getObject("bucket", OffsetDateTime.class)).thenReturn(bucket);
        when(rs.getBigDecimal("open")).thenReturn(new BigDecimal("225.12"));
        when(rs.getBigDecimal("high")).thenReturn(new BigDecimal("225.47"));
        when(rs.getBigDecimal("low")).thenReturn(new BigDecimal("224.60"));
        when(rs.getBigDecimal("close")).thenReturn(new BigDecimal("225.28"));
        when(rs.getBigDecimal("bid_close")).thenReturn(new BigDecimal("225.26789123"));
        OffsetDateTime observed = bucket.plusSeconds(47);
        when(rs.getObject("observed_at", OffsetDateTime.class)).thenReturn(observed);

        assertThat(mapper.getValue().mapRow(rs, 0)).isEqualTo(new PriceCandle(bucket,
                new BigDecimal("225.12"), new BigDecimal("225.47"), new BigDecimal("224.60"), new BigDecimal("225.28"),
                new BigDecimal("225.26789123"), observed));
    }

    @Test
    @SuppressWarnings("unchecked")
    void historicalBidAndMidpointUseTheSameFinalObservationAndStableTieBreaks() {
        when(jdbc.query(anyString(), any(RowMapper.class), any(), any(), any(), any())).thenReturn(List.of());
        repository.findCandles(instrument, CandleInterval.ONE_DAY, 7);
        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbc).query(sql.capture(), any(RowMapper.class), any(), any(), any(), any());
        assertThat(sql.getValue()).contains("q.mid ORDER BY q.quoted_at DESC, q.created_at DESC, q.quote_id DESC",
                "q.bid ORDER BY q.quoted_at DESC, q.created_at DESC, q.quote_id DESC",
                "MAX(q.quoted_at) AS observed_at", "quoted_at <= CURRENT_TIMESTAMP");
    }

    @ParameterizedTest
    @CsvSource({"1m,ONE_MINUTE,1 minute", "5m,FIVE_MINUTES,5 minutes", "15m,FIFTEEN_MINUTES,15 minutes",
            "1h,ONE_HOUR,1 hour", "1d,ONE_DAY,1 day"})
    void parsesEverySupportedInterval(String code, CandleInterval expected, String sqlInterval) {
        CandleInterval interval = CandleInterval.fromCode(code);

        assertThat(interval).isEqualTo(expected);
        assertThat(interval.code()).isEqualTo(code);
        assertThat(interval.sqlInterval()).isEqualTo(sqlInterval);
    }

    @Test
    void rejectsAnUnsupportedInterval() {
        assertThatIllegalArgumentException().isThrownBy(() -> CandleInterval.fromCode("2m"))
                .withMessageContaining("1m, 5m, 15m, 1h or 1d");
    }
}
