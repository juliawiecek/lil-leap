package com.neueda.leap.marketdata;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.time.Instant;

/**
 * Read-only access to the latest stored market quotes and bounded history.
 * Retrieval alone does not establish freshness.
 */
public interface QuoteRepository {
    /**
     * Finds the most recently timestamped quote for an instrument.
     *
     * @param instrumentId persistent instrument identifier
     * @return latest quote, or empty when no quote exists
     */
    Optional<MarketQuote> findLatestByInstrumentId(UUID instrumentId);

    /**
     * Finds the latest quote for an enabled, tradable instrument. Market and symbol are trimmed and
     * uppercased using the root locale.
     *
     * @param marketCode market identifier
     * @param symbol instrument trading symbol
     * @return latest matching quote, or empty when no eligible instrument or quote exists
     */
    Optional<MarketQuote> findLatestByMarketAndSymbol(String marketCode, String symbol);

    /**
     * Finds up to {@code limit} most recent quotes for an instrument, ordered newest first.
     *
     * @param instrumentId persistent instrument identifier
     * @param limit maximum number of quotes to return (clamped to safe maximum)
     * @return list of quotes, ordered by timestamp descending, or empty when no quote exists
     */
    List<MarketQuote> findHistoryByInstrumentId(UUID instrumentId, int limit);

    /**
     * Finds the first quote of the current New York regular session, or the previous
     * available close before today's open and on weekends. History page limits do not apply.
     *
     * @param instrumentId persistent instrument identifier
     * @param now current instant, excluding future quotes from the lookup
     * @return baseline quote, or empty if the relevant session has no quote
     */
    Optional<MarketQuote> findDayOpen(UUID instrumentId, Instant now);

    /**
     * Groups an instrument's stored quotes into open/high/low/close midpoint candles.
     *
     * @param instrumentId persistent instrument identifier
     * @param interval candle width
     * @param limit how many of the most recent candles to cover (clamped to a safe maximum)
     * @return candles ordered oldest first; empty when the instrument has no quotes in that window
     */
    List<PriceCandle> findCandles(UUID instrumentId, CandleInterval interval, int limit);
}
