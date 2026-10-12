package com.neueda.leap.order.execution.quote;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/**
 * Unit tests for QuotePreviewController (TS-14.3, BR-13).
 * Tests the /orders/quote-preview endpoint.
 */
@ExtendWith(MockitoExtension.class)
class QuotePreviewControllerTest {

    @Mock
    IndicativePriceService indicativePriceService;

    @InjectMocks
    QuotePreviewController controller;

    /**
     * AC1: GET endpoint accepts symbol + side + quantity, returns an estimated price.
     * Note: Current implementation returns NOT_IMPLEMENTED for symbol-based lookup.
     */
    @Test
    void getQuotePreviewBySymbolReturnsNotImplemented() {
        ResponseEntity<QuotePreviewController.QuotePreviewResponse> response = 
                controller.getQuotePreview("AAPL", "BUY", 10L);

        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(response.getBody().error()).isEqualTo("NOT_IMPLEMENTED");
    }

    /**
     * AC1 (Alternative): Accepts instrumentId + side + quantity for preview.
     */
    @Test
    void getQuotePreviewByIdReturnsEstimatedPrice() {
        UUID instrumentId = UUID.randomUUID();
        OffsetDateTime quotedAt = OffsetDateTime.now(ZoneOffset.UTC);
        var indicativeResponse = IndicativePriceService.IndicativePriceResponse.indicativePrice(
                "AAPL",
                new BigDecimal("225.00"),
                quotedAt,
                true
        );

        when(indicativePriceService.getIndicativePrice(instrumentId))
                .thenReturn(indicativeResponse);

        ResponseEntity<QuotePreviewController.QuotePreviewResponse> response = 
                controller.getQuotePreviewById(instrumentId, "BUY", 10L);

        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        QuotePreviewController.QuotePreviewResponse body = response.getBody();
        assertThat(body.symbol()).isEqualTo("AAPL");
        assertThat(body.side()).isEqualTo("BUY");
        assertThat(body.quantity()).isEqualTo(10L);
        assertThat(body.indicativePrice()).isEqualByComparingTo(new BigDecimal("225.00"));
    }

    /**
     * AC2: Response is clearly marked as indicative, not a guaranteed fill price.
     */
    @Test
    void responseIsMarkedAsIndicative() {
        UUID instrumentId = UUID.randomUUID();
        var indicativeResponse = IndicativePriceService.IndicativePriceResponse.indicativePrice(
                "MSFT",
                new BigDecimal("100.50"),
                OffsetDateTime.now(ZoneOffset.UTC),
                true
        );

        when(indicativePriceService.getIndicativePrice(instrumentId))
                .thenReturn(indicativeResponse);

        ResponseEntity<QuotePreviewController.QuotePreviewResponse> response = 
                controller.getQuotePreviewById(instrumentId, "BUY", 5L);

        assertThat(response.getBody().indicative()).isTrue();
    }

    /**
     * AC3: Returns a reasonable error if no cached quote exists for the symbol.
     */
    @Test
    void returnsErrorWhenNoQuoteAvailable() {
        UUID instrumentId = UUID.randomUUID();
        var noQuoteResponse = IndicativePriceService.IndicativePriceResponse.noQuoteAvailable();

        when(indicativePriceService.getIndicativePrice(instrumentId))
                .thenReturn(noQuoteResponse);

        ResponseEntity<QuotePreviewController.QuotePreviewResponse> response = 
                controller.getQuotePreviewById(instrumentId, "BUY", 1L);

        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(response.getBody().error()).isEqualTo("NO_QUOTE_AVAILABLE");
    }

    /**
     * Missing instrumentId returns 400 error.
     */
    @Test
    void missingInstrumentIdReturnsBadRequest() {
        ResponseEntity<QuotePreviewController.QuotePreviewResponse> response = 
                controller.getQuotePreviewById(null, "BUY", 10L);

        assertThat(response.getStatusCode().is4xxClientError()).isTrue();
        assertThat(response.getBody().error()).isEqualTo("MISSING_INSTRUMENT_ID");
    }

    /**
     * Side parameter is optional and preserved in response.
     */
    @Test
    void sideParameterIsOptionalAndPreserved() {
        UUID instrumentId = UUID.randomUUID();
        var indicativeResponse = IndicativePriceService.IndicativePriceResponse.indicativePrice(
                "GOOGL",
                new BigDecimal("200.00"),
                OffsetDateTime.now(ZoneOffset.UTC),
                true
        );

        when(indicativePriceService.getIndicativePrice(instrumentId))
                .thenReturn(indicativeResponse);

        ResponseEntity<QuotePreviewController.QuotePreviewResponse> responseBuy = 
                controller.getQuotePreviewById(instrumentId, "BUY", 5L);
        assertThat(responseBuy.getBody().side()).isEqualTo("BUY");

        ResponseEntity<QuotePreviewController.QuotePreviewResponse> responseSell = 
                controller.getQuotePreviewById(instrumentId, "SELL", 5L);
        assertThat(responseSell.getBody().side()).isEqualTo("SELL");
    }

    /**
     * Quantity parameter is optional.
     */
    @Test
    void quantityParameterIsOptional() {
        UUID instrumentId = UUID.randomUUID();
        var indicativeResponse = IndicativePriceService.IndicativePriceResponse.indicativePrice(
                "AMZN",
                new BigDecimal("180.00"),
                OffsetDateTime.now(ZoneOffset.UTC),
                true
        );

        when(indicativePriceService.getIndicativePrice(instrumentId))
                .thenReturn(indicativeResponse);

        ResponseEntity<QuotePreviewController.QuotePreviewResponse> response = 
                controller.getQuotePreviewById(instrumentId, "BUY", null);

        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(response.getBody().quantity()).isEqualTo(0L);
    }

    /**
     * Response includes quote timestamp from indicative price service.
     */
    @Test
    void responseIncludesQuoteTimestamp() {
        UUID instrumentId = UUID.randomUUID();
        OffsetDateTime timestamp = OffsetDateTime.of(2026, 10, 6, 15, 30, 0, 0, ZoneOffset.UTC);
        var indicativeResponse = IndicativePriceService.IndicativePriceResponse.indicativePrice(
                "TSLA",
                new BigDecimal("250.00"),
                timestamp,
                true
        );

        when(indicativePriceService.getIndicativePrice(instrumentId))
                .thenReturn(indicativeResponse);

        ResponseEntity<QuotePreviewController.QuotePreviewResponse> response = 
                controller.getQuotePreviewById(instrumentId, "SELL", 2L);

        assertThat(response.getBody().quotedAt()).isEqualTo(timestamp);
    }
}
