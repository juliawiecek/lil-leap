package com.neueda.leap.order.execution.quote;

import com.neueda.leap.marketdata.MarketQuote;
import com.neueda.leap.marketdata.QuoteRepository;
import org.springframework.stereotype.Service;

import java.util.Optional;
import java.util.UUID;

/**
 * Provides pre-trade indicative prices (TS-14.1, BR-13).
 * Reads from the cached quote without calling a fresh provider, so it's cheap to call
 * on every instrument/quantity change in the UI.
 */
@Service
public class IndicativePriceService {
    private final QuoteRepository quoteRepository;

    /**
     * Creates an IndicativePriceService with the supplied dependencies.
     * @param quoteRepository quote repository (returns cached quotes only)
     */
    public IndicativePriceService(QuoteRepository quoteRepository) {
        this.quoteRepository = quoteRepository;
    }

    /**
     * Returns an indicative (not binding) price for an instrument (AC1, AC3).
     * Reads from cache only; does NOT call a fresh quote provider.
     * If no cached quote exists, returns a "no quote available" result.
     *
     * @param instrumentId persistent instrument identifier
     * @return indicative price response (never guaranteed fill price)
     */
    public IndicativePriceResponse getIndicativePrice(UUID instrumentId) {
        Optional<MarketQuote> quote = quoteRepository.findLatestByInstrumentId(instrumentId);
        
        if (quote.isEmpty()) {
            return IndicativePriceResponse.noQuoteAvailable(instrumentId);
        }

        MarketQuote q = quote.get();
        return IndicativePriceResponse.indicativePrice(
                q.symbol(),
                q.midpoint(),  // Midpoint as indicative price
                q.quotedAt(),
                true
        );
    }

    /**
     * Response object for indicative price queries.
     */
    public record IndicativePriceResponse(
            String symbol,
            java.math.BigDecimal price,
            java.time.OffsetDateTime quotedAt,
            String error,
            boolean indicative
    ) {
        /**
         * Creates a successful indicative price response.
         */
        public static IndicativePriceResponse indicativePrice(
                String symbol,
                java.math.BigDecimal price,
                java.time.OffsetDateTime quotedAt,
                boolean indicative) {
            return new IndicativePriceResponse(symbol, price, quotedAt, null, indicative);
        }

        /**
         * Creates a "no quote available" response (AC3).
         */
        public static IndicativePriceResponse noQuoteAvailable(UUID instrumentId) {
            return new IndicativePriceResponse(
                    null,
                    null,
                    null,
                    "NO_QUOTE_AVAILABLE",
                    false
            );
        }
    }
}
