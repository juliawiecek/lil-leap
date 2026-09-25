package com.neueda.leap.marketdata;

import java.util.Optional;
import java.util.UUID;

/**
 * Read-only access to the latest stored market quotes. Retrieval alone does not establish
 * freshness.
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
}
