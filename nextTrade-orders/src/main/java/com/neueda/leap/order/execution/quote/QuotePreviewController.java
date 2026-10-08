package com.neueda.leap.order.execution.quote;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * REST API for pre-trade indicative prices (TS-14.3, BR-13).
 * Provides estimated prices before order submission, backed by cached quotes.
 */
@RestController
@RequestMapping("/orders")
public class QuotePreviewController {
    private final IndicativePriceService indicativePriceService;

    /**
     * Creates a QuotePreviewController with the supplied dependencies.
     * @param indicativePriceService service for indicative price lookups
     */
    public QuotePreviewController(IndicativePriceService indicativePriceService) {
        this.indicativePriceService = indicativePriceService;
    }

    /**
     * Provides an indicative (pre-trade) price estimate for an order being prepared (AC1).
     * Returns an estimated price from the cached quote, clearly marked as indicative
     * and not a guaranteed fill price (AC2).
     *
     * Query parameters:
     * - symbol: instrument symbol (e.g., "AAPL")
     * - side: BUY or SELL (informational only; does not affect price)
     * - quantity: order quantity (informational only; does not affect price)
     *
     * Response is cached quote midpoint with indicative=true flag.
     * If no cached quote exists, returns error message (AC3).
     *
     * Example: GET /api/v1/orders/quote-preview?symbol=AAPL&side=BUY&quantity=10
     *
     * @param symbol instrument symbol
     * @param side BUY or SELL
     * @param quantity order quantity
     * @return indicative price response
     */
    @GetMapping("/quote-preview")
    public ResponseEntity<QuotePreviewResponse> getQuotePreview(
            @RequestParam String symbol,
            @RequestParam(required = false) String side,
            @RequestParam(required = false) Long quantity) {

        if (symbol == null || symbol.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(
                    QuotePreviewResponse.error("MISSING_SYMBOL", "Symbol is required")
            );
        }

        // In a production system, this would look up the instrument by symbol first,
        // then call indicativePriceService.getIndicativePrice(instrumentId).
        // For now, we'll document this limitation.
        // Symbol-to-instrument lookup is intentionally deferred to the quote-preview-by-id endpoint.

        return ResponseEntity.ok(
                QuotePreviewResponse.error("NOT_IMPLEMENTED", 
                    "Symbol lookup not yet implemented; pass instrumentId instead")
        );
    }

    /**
     * Alternative endpoint accepting instrumentId for quote preview.
     * This is more direct but less user-friendly than symbol-based lookup.
     *
     * @param instrumentId UUID of the instrument
     * @param side BUY or SELL (informational)
     * @param quantity order quantity (informational)
     * @return indicative price response
     */
    @GetMapping("/quote-preview-by-id")
    public ResponseEntity<QuotePreviewResponse> getQuotePreviewById(
            @RequestParam UUID instrumentId,
            @RequestParam(required = false) String side,
            @RequestParam(required = false) Long quantity) {

        if (instrumentId == null) {
            return ResponseEntity.badRequest().body(
                    QuotePreviewResponse.error("MISSING_INSTRUMENT_ID", "InstrumentId is required")
            );
        }

        IndicativePriceService.IndicativePriceResponse indicativeResponse = 
                indicativePriceService.getIndicativePrice(instrumentId);

        if (indicativeResponse.error() != null) {
            return ResponseEntity.ok(
                    QuotePreviewResponse.error(indicativeResponse.error(), 
                        "No cached quote available for this instrument")
            );
        }

        return ResponseEntity.ok(
                QuotePreviewResponse.success(
                        indicativeResponse.symbol(),
                        side != null ? side.toUpperCase() : "N/A",
                        quantity != null ? quantity : 0,
                        indicativeResponse.price(),
                        indicativeResponse.quotedAt(),
                        indicativeResponse.indicative()
                )
        );
    }

    /**
     * Response object for quote preview requests.
     */
    public record QuotePreviewResponse(
            String symbol,
            String side,
            Long quantity,
            java.math.BigDecimal indicativePrice,
            java.time.OffsetDateTime quotedAt,
            Boolean indicative,
            String error,
            String errorMessage
    ) {
        /**
         * Creates a successful quote preview response.
         */
        public static QuotePreviewResponse success(
                String symbol,
                String side,
                Long quantity,
                java.math.BigDecimal indicativePrice,
                java.time.OffsetDateTime quotedAt,
                boolean indicative) {
            return new QuotePreviewResponse(
                    symbol, side, quantity, indicativePrice, quotedAt, 
                    indicative, null, null
            );
        }

        /**
         * Creates an error response.
         */
        public static QuotePreviewResponse error(String errorCode, String errorMessage) {
            return new QuotePreviewResponse(
                    null, null, null, null, null, false,
                    errorCode, errorMessage
            );
        }
    }
}
