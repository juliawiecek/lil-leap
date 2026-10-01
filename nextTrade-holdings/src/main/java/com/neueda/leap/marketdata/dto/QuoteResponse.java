package com.neueda.leap.marketdata.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Stable API representation of a market quote for display purposes.
 *
 * <p>Contains immutable quote evidence with timestamp for staleness detection.
 * The execution service has its own durable quote selection logic independent of this display API.
 *
 * @param quoteId identifier of the source quote
 * @param instrumentId persistent instrument identifier
 * @param symbol instrument trading symbol
 * @param marketCode market identifier
 * @param bid bid price per unit
 * @param ask ask price per unit
 * @param midpoint arithmetic mean of bid and ask
 * @param quotedAt timestamp supplied by the quote source
 * @param currency currency code
 * @param source quote provider name
 * @param synthetic whether the quote was generated synthetically
 */
public record QuoteResponse(
        UUID quoteId,
        UUID instrumentId,
        String symbol,
        String marketCode,
        BigDecimal bid,
        BigDecimal ask,
        BigDecimal midpoint,
        OffsetDateTime quotedAt,
        String currency,
        String source,
        boolean synthetic) {

    /**
     * Creates a QuoteResponse from a MarketQuote.
     *
     * @param quote market quote evidence
     * @return stable API representation
     */
    public static QuoteResponse from(com.neueda.leap.marketdata.MarketQuote quote) {
        return new QuoteResponse(
                quote.quoteId(),
                quote.instrumentId(),
                quote.symbol(),
                quote.marketCode(),
                quote.bid(),
                quote.ask(),
                quote.midpoint(),
                quote.quotedAt(),
                "USD",  // from database via instrument currency
                quote.source(),
                quote.synthetic()
        );
    }
}
