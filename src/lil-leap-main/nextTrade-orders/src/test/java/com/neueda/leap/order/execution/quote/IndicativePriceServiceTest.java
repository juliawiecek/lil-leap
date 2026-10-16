package com.neueda.leap.order.execution.quote;

import com.neueda.leap.marketdata.MarketQuote;
import com.neueda.leap.marketdata.QuoteRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Pre-trade estimate (TS-14.1, BR-13): side-correct price, total and staleness from the stored quote. */
class IndicativePriceServiceTest {
    private static final Instant NOW = Instant.parse("2026-10-08T15:00:00Z");

    private final QuoteRepository quotes = mock(QuoteRepository.class);
    private final UUID instrumentId = UUID.randomUUID();
    private IndicativePriceService service;

    @BeforeEach
    void setUp() {
        service = new IndicativePriceService(quotes,
                new QuoteFreshnessPolicy(Duration.ofSeconds(60), Duration.ofSeconds(2)),
                Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    void buyIsPricedAtTheAskTimesQuantity() {
        when(quotes.findLatestByInstrumentId(instrumentId)).thenReturn(Optional.of(quote(10)));

        var estimate = service.estimate(instrumentId, "BUY", 10).orElseThrow();

        assertThat(estimate.indicativePrice()).isEqualByComparingTo("225.50");
        assertThat(estimate.estimatedTotal()).isEqualByComparingTo("2255.00");
        assertThat(estimate.indicative()).isTrue();
        assertThat(estimate.stale()).isFalse();
        assertThat(estimate.symbol()).isEqualTo("AAPL");
    }

    @Test
    void sellIsPricedAtTheBid() {
        when(quotes.findLatestByInstrumentId(instrumentId)).thenReturn(Optional.of(quote(10)));

        var estimate = service.estimate(instrumentId, "SELL", 3).orElseThrow();

        assertThat(estimate.indicativePrice()).isEqualByComparingTo("224.50");
        assertThat(estimate.estimatedTotal()).isEqualByComparingTo("673.50");
    }

    @Test
    void totalIsRoundedToCents() {
        var odd = new MarketQuote(UUID.randomUUID(), instrumentId, "AAPL", "NASDAQ",
                new BigDecimal("1.00"), new BigDecimal("1.333333"), new BigDecimal("1.1666665"),
                OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC), "TEST", false);
        when(quotes.findLatestByInstrumentId(instrumentId)).thenReturn(Optional.of(odd));

        assertThat(service.estimate(instrumentId, "BUY", 2).orElseThrow().estimatedTotal())
                .isEqualByComparingTo("2.67");
    }

    @Test
    void quoteOlderThanTheExecutionLimitIsFlaggedStale() {
        when(quotes.findLatestByInstrumentId(instrumentId)).thenReturn(Optional.of(quote(61)));

        assertThat(service.estimate(instrumentId, "BUY", 1).orElseThrow().stale()).isTrue();
    }

    @Test
    void missingQuoteGivesNoEstimate() {
        when(quotes.findLatestByInstrumentId(instrumentId)).thenReturn(Optional.empty());

        assertThat(service.estimate(instrumentId, "BUY", 1)).isEmpty();
    }

    private MarketQuote quote(long ageSeconds) {
        return new MarketQuote(UUID.randomUUID(), instrumentId, "AAPL", "NASDAQ",
                new BigDecimal("224.50"), new BigDecimal("225.50"), new BigDecimal("225.00"),
                OffsetDateTime.ofInstant(NOW.minusSeconds(ageSeconds), ZoneOffset.UTC), "TEST", false);
    }
}
