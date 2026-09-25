package com.neueda.leap.marketdata;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Immutable quote evidence used for market display and execution pricing.
 *
 * @param quoteId identifier of the source quote
 * @param instrumentId persistent instrument identifier
 * @param symbol instrument trading symbol
 * @param marketCode market identifier
 * @param bid bid price per unit
 * @param ask ask price per unit
 * @param midpoint arithmetic mean of bid and ask, rounded to eight decimal places
 * @param quotedAt timestamp supplied by the quote source
 * @param source quote provider name
 * @param synthetic whether the quote was generated synthetically
 */
public record MarketQuote(
        UUID quoteId,
        UUID instrumentId,
        String symbol,
        String marketCode,
        BigDecimal bid,
        BigDecimal ask,
        BigDecimal midpoint,
        OffsetDateTime quotedAt,
        String source,
        boolean synthetic) {}
