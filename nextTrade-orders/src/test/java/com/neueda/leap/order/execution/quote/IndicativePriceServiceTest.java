package com.neueda.leap.order.execution.quote;

import com.neueda.leap.marketdata.MarketQuote;
import com.neueda.leap.marketdata.QuoteRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for IndicativePriceService (TS-14.1, BR-13).
 * Verifies that indicative prices are read from cache, not fresh provider.
 */
@ExtendWith(MockitoExtension.class)
class IndicativePriceServiceTest {

    @Mock
    QuoteRepository quoteRepository;

    @InjectMocks
    IndicativePriceService service;

    /**
     * AC1: The calculation reads from the quote cache (NEXT-94), not a fresh provider call.
     */
    @Test
    void returnsIndicativePriceFromCache() {
        UUID instrumentId = UUID.randomUUID();
        OffsetDateTime quotedAt = OffsetDateTime.now(ZoneOffset.UTC);
        var quote = new MarketQuote(
                UUID.randomUUID(),
                instrumentId,
                "AAPL",
                "NASDAQ",
                new BigDecimal("224.50"),
                new BigDecimal("225.50"),
                new BigDecimal("225.00"),
                quotedAt,
                "CACHED",
                false
        );

        when(quoteRepository.findLatestByInstrumentId(instrumentId)).thenReturn(Optional.of(quote));

        IndicativePriceService.IndicativePriceResponse response = service.getIndicativePrice(instrumentId);

        assertThat(response.symbol()).isEqualTo("AAPL");
        assertThat(response.price()).isEqualByComparingTo(new BigDecimal("225.00")); // midpoint
        assertThat(response.quotedAt()).isEqualTo(quotedAt);
        assertThat(response.indicative()).isTrue();
        assertThat(response.error()).isNull();
    }

    /**
     * AC2: The result is tagged as indicative (indicative: true) so the frontend can never mistake
     * it for a guaranteed fill price.
     */
    @Test
    void resultIsTaggedAsIndicative() {
        UUID instrumentId = UUID.randomUUID();
        var quote = new MarketQuote(
                UUID.randomUUID(),
                instrumentId,
                "MSFT",
                "NASDAQ",
                new BigDecimal("100.00"),
                new BigDecimal("101.00"),
                new BigDecimal("100.50"),
                OffsetDateTime.now(ZoneOffset.UTC),
                "TEST",
                false
        );

        when(quoteRepository.findLatestByInstrumentId(instrumentId)).thenReturn(Optional.of(quote));

        IndicativePriceService.IndicativePriceResponse response = service.getIndicativePrice(instrumentId);

        assertThat(response.indicative()).isTrue();
    }

    /**
     * AC3: If no cached quote exists for the instrument, the calculation returns a specific
     * "no quote available" result rather than a stale or zero price.
     */
    @Test
    void returnsNoQuoteAvailableWhenMissing() {
        UUID instrumentId = UUID.randomUUID();

        when(quoteRepository.findLatestByInstrumentId(instrumentId)).thenReturn(Optional.empty());

        IndicativePriceService.IndicativePriceResponse response = service.getIndicativePrice(instrumentId);

        assertThat(response.error()).isEqualTo("NO_QUOTE_AVAILABLE");
        assertThat(response.price()).isNull();
        assertThat(response.quotedAt()).isNull();
        assertThat(response.indicative()).isFalse();
    }

    /**
     * Midpoint is calculated as (bid + ask) / 2 for the indicative price.
     */
    @Test
    void usesQuoteMidpointAsIndicativePrice() {
        UUID instrumentId = UUID.randomUUID();
        var quote = new MarketQuote(
                UUID.randomUUID(),
                instrumentId,
                "GOOGL",
                "NASDAQ",
                new BigDecimal("200.00"),
                new BigDecimal("210.00"),
                new BigDecimal("205.00"),
                OffsetDateTime.now(ZoneOffset.UTC),
                "TEST",
                false
        );

        when(quoteRepository.findLatestByInstrumentId(instrumentId)).thenReturn(Optional.of(quote));

        IndicativePriceService.IndicativePriceResponse response = service.getIndicativePrice(instrumentId);

        assertThat(response.price()).isEqualByComparingTo(new BigDecimal("205.00"));
    }

    /**
     * Repository is called with correct instrument ID.
     */
    @Test
    void queriesRepositoryWithCorrectInstrumentId() {
        UUID instrumentId = UUID.randomUUID();

        when(quoteRepository.findLatestByInstrumentId(instrumentId)).thenReturn(Optional.empty());

        service.getIndicativePrice(instrumentId);

        verify(quoteRepository).findLatestByInstrumentId(instrumentId);
    }

    /**
     * Response includes symbol from quote.
     */
    @Test
    void responseIncludesSymbolFromQuote() {
        UUID instrumentId = UUID.randomUUID();
        var quote = new MarketQuote(
                UUID.randomUUID(),
                instrumentId,
                "TSLA",
                "NASDAQ",
                new BigDecimal("250.00"),
                new BigDecimal("260.00"),
                new BigDecimal("255.00"),
                OffsetDateTime.now(ZoneOffset.UTC),
                "TEST",
                false
        );

        when(quoteRepository.findLatestByInstrumentId(instrumentId)).thenReturn(Optional.of(quote));

        IndicativePriceService.IndicativePriceResponse response = service.getIndicativePrice(instrumentId);

        assertThat(response.symbol()).isEqualTo("TSLA");
    }

    /**
     * Response includes quote timestamp.
     */
    @Test
    void responseIncludesQuoteTimestamp() {
        UUID instrumentId = UUID.randomUUID();
        OffsetDateTime timestamp = OffsetDateTime.of(2026, 10, 6, 12, 30, 0, 0, ZoneOffset.UTC);
        var quote = new MarketQuote(
                UUID.randomUUID(),
                instrumentId,
                "AAPL",
                "NASDAQ",
                new BigDecimal("224.00"),
                new BigDecimal("226.00"),
                new BigDecimal("225.00"),
                timestamp,
                "TEST",
                false
        );

        when(quoteRepository.findLatestByInstrumentId(instrumentId)).thenReturn(Optional.of(quote));

        IndicativePriceService.IndicativePriceResponse response = service.getIndicativePrice(instrumentId);

        assertThat(response.quotedAt()).isEqualTo(timestamp);
    }
}
