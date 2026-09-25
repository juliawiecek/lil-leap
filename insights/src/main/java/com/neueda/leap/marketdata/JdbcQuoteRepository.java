package com.neueda.leap.marketdata;

import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Reads the latest stored quote, breaking timestamp ties by creation time and quote ID. */
@Repository
public class JdbcQuoteRepository implements QuoteRepository {
    private static final String SELECT =
            "SELECT"
                + " q.quote_id,i.instrument_id,i.symbol,i.market_code,q.bid,q.ask,ROUND((q.bid+q.ask)/2,8)"
                + " midpoint,q.quoted_at,q.source,q.is_synthetic FROM quotes q JOIN instruments i"
                + " ON i.instrument_id=q.instrument_id ";
    private static final String ORDER =
            " ORDER BY q.quoted_at DESC,q.created_at DESC,q.quote_id DESC LIMIT 1";
    private final JdbcTemplate jdbc;

    /**
     * Creates a {@code JdbcQuoteRepository} with the supplied dependencies.
     *
     * @param jdbc JDBC operations participating in Spring transactions
     */
    public JdbcQuoteRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private final org.springframework.jdbc.core.RowMapper<MarketQuote> mapper =
            (rs, n) ->
                    new MarketQuote(
                            rs.getObject("quote_id", UUID.class),
                            rs.getObject("instrument_id", UUID.class),
                            rs.getString("symbol"),
                            rs.getString("market_code"),
                            rs.getBigDecimal("bid"),
                            rs.getBigDecimal("ask"),
                            rs.getBigDecimal("midpoint"),
                            rs.getObject("quoted_at", java.time.OffsetDateTime.class),
                            rs.getString("source"),
                            rs.getBoolean("is_synthetic"));

    /**
     * Finds the most recently timestamped quote for an instrument.
     *
     * @param id persistent instrument identifier
     * @return latest quote, or empty when no quote exists
     */
    public Optional<MarketQuote> findLatestByInstrumentId(UUID id) {
        return jdbc.query(SELECT + "WHERE i.instrument_id=?" + ORDER, mapper, id).stream()
                .findFirst();
    }

    /**
     * Finds the latest quote for an enabled, tradable instrument. Market and symbol are trimmed and
     * uppercased using the root locale.
     *
     * @param market market identifier
     * @param symbol instrument trading symbol
     * @return latest matching quote, or empty when no eligible instrument or quote exists
     */
    public Optional<MarketQuote> findLatestByMarketAndSymbol(String market, String symbol) {
        return jdbc
                .query(
                        SELECT
                                + "WHERE i.market_code=? AND i.symbol=? AND i.enabled AND"
                                + " i.tradable"
                                + ORDER,
                        mapper,
                        market.trim().toUpperCase(Locale.ROOT),
                        symbol.trim().toUpperCase(Locale.ROOT))
                .stream()
                .findFirst();
    }
}
