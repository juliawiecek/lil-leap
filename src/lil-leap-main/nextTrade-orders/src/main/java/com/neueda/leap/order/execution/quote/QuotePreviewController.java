package com.neueda.leap.order.execution.quote;

import com.neueda.leap.instrument.dto.InstrumentResponse;
import com.neueda.leap.instrument.service.InstrumentService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Pre-trade price estimate for the order screen (TS-14.3, BR-13).
 * {@code GET /orders/quote-preview?symbol=AAPL&side=BUY&quantity=10}; {@code instrumentId}
 * may be supplied instead of {@code symbol}.
 */
@RestController
@RequestMapping("/orders")
public class QuotePreviewController {
    private static final Pattern SYMBOL = Pattern.compile("^[A-Za-z0-9.-]{1,20}$");
    private static final Pattern UUID_TEXT =
            Pattern.compile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");
    private static final Pattern QUANTITY = Pattern.compile("^\\d{1,12}$");

    private final IndicativePriceService prices;
    private final InstrumentService instruments;

    /**
     * Creates the controller.
     *
     * @param prices estimate calculation
     * @param instruments symbol and identifier lookup
     */
    public QuotePreviewController(IndicativePriceService prices, InstrumentService instruments) {
        this.prices = prices;
        this.instruments = instruments;
    }

    /**
     * Estimates the price and total for an order the caller is about to place.
     * Parameters arrive as text so that malformed values produce a fixed 400 rather than a
     * framework error.
     *
     * @param symbol instrument symbol; supply exactly one of symbol or instrumentId
     * @param instrumentId instrument identifier
     * @param side {@code BUY} or {@code SELL}, case-insensitive
     * @param quantity positive whole number of shares
     * @return 200 with the estimate, 400 for invalid input, or 404 when the instrument or its quote is unknown
     */
    @GetMapping("/quote-preview")
    public ResponseEntity<Object> preview(@RequestParam(required = false) String symbol,
                                     @RequestParam(required = false) String instrumentId,
                                     @RequestParam(required = false) String side,
                                     @RequestParam(required = false) String quantity) {
        boolean hasSymbol = symbol != null && !symbol.isBlank();
        boolean hasId = instrumentId != null && !instrumentId.isBlank();
        String normalizedSide = side == null ? "" : side.trim().toUpperCase(Locale.ROOT);
        Long shares = parseQuantity(quantity);
        boolean oneTarget = hasSymbol != hasId;
        boolean validTarget = hasSymbol
                ? SYMBOL.matcher(symbol.trim()).matches()
                : hasId && UUID_TEXT.matcher(instrumentId.trim()).matches();
        boolean validSide = "BUY".equals(normalizedSide) || "SELL".equals(normalizedSide);
        if (!oneTarget || !validTarget || !validSide || shares == null) {
            return error(400, "INVALID_REQUEST",
                    "Supply one of symbol or instrumentId, a side of BUY or SELL, and a positive quantity.");
        }

        Optional<InstrumentResponse> instrument = hasSymbol
                ? instruments.findInstrumentBySymbol(symbol.trim().toUpperCase(Locale.ROOT))
                : instruments.findInstrumentById(UUID.fromString(instrumentId.trim()));
        if (instrument.isEmpty()) {
            return error(404, "INSTRUMENT_NOT_FOUND", "The requested instrument is not supported.");
        }
        return prices.estimate(instrument.get().instrumentId(), normalizedSide, shares)
                .<ResponseEntity<Object>>map(ResponseEntity::ok)
                .orElseGet(() -> error(404, "NO_QUOTE_AVAILABLE",
                        "No market quote is available for this instrument yet."));
    }

    private static Long parseQuantity(String quantity) {
        if (quantity == null || !QUANTITY.matcher(quantity.trim()).matches()) {
            return null;
        }
        long value = Long.parseLong(quantity.trim());
        return value > 0 ? value : null;
    }

    private static ResponseEntity<Object> error(int status, String code, String message) {
        return ResponseEntity.status(status).body(Map.of("error", code, "message", message));
    }
}
