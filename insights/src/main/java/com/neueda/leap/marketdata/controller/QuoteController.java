package com.neueda.leap.marketdata.controller;

import com.neueda.leap.marketdata.MarketQuote;
import com.neueda.leap.marketdata.QuoteRepository;
import com.neueda.leap.marketdata.dto.QuoteResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Read-only REST API for market quotes.
 *
 * <p>Provides endpoints for retrieving latest quotes and bounded history for display purposes.
 * The execution service has its own durable quote selection logic independent of this API.
 *
 * <p>All endpoints require JWT authentication (consistent with portfolio data endpoints).
 * Security decision: Quotes are treated as protected financial data, similar to holdings and orders.
 * This can be changed to public (permitAll) in SecurityConfig if market data should be freely accessible.
 */
@RestController
@RequestMapping("/quotes")
public class QuoteController {
    private final QuoteRepository repository;
    private static final int DEFAULT_HISTORY_LIMIT = 100;

    /**
     * Creates a {@code QuoteController} with the supplied dependencies.
     *
     * @param repository quote query repository
     */
    public QuoteController(QuoteRepository repository) {
        this.repository = repository;
    }

    /**
     * Retrieves the latest quote for a specific instrument.
     *
     * @param instrumentId persistent instrument identifier
     * @return latest quote for the instrument
     * @throws QuoteNotFoundException if the instrument or quote does not exist
     */
    @GetMapping("/latest/by-instrument/{instrumentId}")
    public QuoteResponse getLatestByInstrument(@PathVariable UUID instrumentId) {
        MarketQuote quote = repository
                .findLatestByInstrumentId(instrumentId)
                .orElseThrow(() -> new QuoteNotFoundException("No quote found for instrument " + instrumentId));
        return QuoteResponse.from(quote);
    }

    /**
     * Retrieves the latest quote for an enabled, tradable instrument identified by market and symbol.
     * Both parameters are trimmed and uppercased.
     *
     * @param market market identifier (e.g., "NASDAQ")
     * @param symbol instrument trading symbol (e.g., "AAPL")
     * @return latest quote matching the market and symbol
     * @throws QuoteNotFoundException if no eligible instrument or quote exists
     */
    @GetMapping("/latest/by-market-symbol")
    public QuoteResponse getLatestByMarketSymbol(
            @RequestParam("market") String market,
            @RequestParam("symbol") String symbol) {
        if (market == null || market.trim().isEmpty()) {
            throw new IllegalArgumentException("Market parameter is required and must not be empty");
        }
        if (symbol == null || symbol.trim().isEmpty()) {
            throw new IllegalArgumentException("Symbol parameter is required and must not be empty");
        }
        String normalizedMarket = market.trim().toUpperCase(java.util.Locale.ROOT);
        String normalizedSymbol = symbol.trim().toUpperCase(java.util.Locale.ROOT);
        MarketQuote quote = repository
                .findLatestByMarketAndSymbol(normalizedMarket, normalizedSymbol)
                .orElseThrow(() -> new QuoteNotFoundException(
                        String.format("No quote found for market %s and symbol %s", market, symbol)));
        return QuoteResponse.from(quote);
    }

    /**
     * Retrieves bounded historical quotes for an instrument, ordered newest first.
     * The limit is clamped to a safe maximum to prevent unbounded database reads.
     *
     * @param instrumentId persistent instrument identifier
     * @param limit maximum number of quotes to return (default 100, clamped to 1000)
     * @return list of quotes, or empty when no quote exists
     * @throws QuoteNotFoundException if the instrument does not exist
     * @throws IllegalArgumentException if limit is invalid
     */
    @GetMapping("/history/{instrumentId}")
    public List<QuoteResponse> getHistory(
            @PathVariable UUID instrumentId,
            @RequestParam(value = "limit", defaultValue = DEFAULT_HISTORY_LIMIT + "", required = false) int limit) {
        if (limit < 1) {
            throw new IllegalArgumentException("Limit must be at least 1");
        }
        List<MarketQuote> quotes = repository.findHistoryByInstrumentId(instrumentId, limit);
        if (quotes.isEmpty()) {
            throw new QuoteNotFoundException("No quotes found for instrument " + instrumentId);
        }
        return quotes.stream().map(QuoteResponse::from).toList();
    }

    /**
     * Maps a missing quote to an HTTP 404 response.
     *
     * @param exception exception
     * @return response containing QUOTE_NOT_FOUND and the exception message
     */
    @ExceptionHandler(QuoteNotFoundException.class)
    public ResponseEntity<Map<String, String>> quoteNotFound(QuoteNotFoundException exception) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of(
                "code", "QUOTE_NOT_FOUND",
                "message", exception.getMessage()
        ));
    }

    /**
     * Maps invalid parameters to an HTTP 400 response.
     *
     * @param exception exception
     * @return response containing INVALID_REQUEST and the exception message
     */
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> invalidRequest(IllegalArgumentException exception) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of(
                "code", "INVALID_REQUEST",
                "message", exception.getMessage()
        ));
    }

    /**
     * Exception thrown when a requested quote does not exist.
     */
    public static class QuoteNotFoundException extends RuntimeException {
        public QuoteNotFoundException(String message) {
            super(message);
        }
    }
}
