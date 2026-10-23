package com.neueda.leap.marketdata;

import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
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
    private static final int MAX_HISTORY_LIMIT = 1000;
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

    /**
     * Finds up to {@code limit} most recent quotes for an instrument, ordered newest first.
     * The limit is clamped to a safe maximum to prevent unbounded database reads.
     *
     * @param instrumentId persistent instrument identifier
     * @param limit maximum number of quotes to return (clamped to MAX_HISTORY_LIMIT)
     * @return list of quotes, ordered by timestamp descending, or empty when no quote exists
     */
    @Override
    public List<MarketQuote> findHistoryByInstrumentId(UUID instrumentId, int limit) {
        int clampedLimit = Math.max(1, Math.min(limit, MAX_HISTORY_LIMIT));
        String query = SELECT
                + "WHERE i.instrument_id=?"
                + " ORDER BY q.quoted_at DESC,q.created_at DESC,q.quote_id DESC"
                + " LIMIT ?";
        return jdbc.query(query, mapper, instrumentId, clampedLimit);
    }

    /**
     * Selects a regular-session baseline using the instrument/time index, not a history page.
     * Before 09:30 New York time (and on weekends), the last quote at or before the
     * previous weekday's 16:00 close is used, excluding overnight and premarket ticks.
     *
     * @param instrumentId persistent instrument identifier
     * @param now current instant
     * @return first session quote or previous available close; empty when none exists
     */
    @Override
    public Optional<MarketQuote> findDayOpen(UUID instrumentId, Instant now) {
        ZoneId exchange = ZoneId.of("America/New_York");
        LocalDate day = now.atZone(exchange).toLocalDate();
        Instant open = day.atTime(9, 30).atZone(exchange).toInstant();
        if (weekday(day) && !now.isBefore(open)) {
            Instant close = day.atTime(16, 0).atZone(exchange).toInstant();
            Instant through = now.isBefore(close) ? now : close;
            return jdbc.query(SELECT + "WHERE i.instrument_id=? AND q.quoted_at>=? AND q.quoted_at<=?"
                            + " ORDER BY q.quoted_at ASC,q.created_at ASC,q.quote_id ASC LIMIT 1",
                    mapper, instrumentId, open.atOffset(java.time.ZoneOffset.UTC),
                    through.atOffset(java.time.ZoneOffset.UTC)).stream().findFirst();
        }
        LocalDate previous = day.minusDays(1);
        while (!weekday(previous)) {
            previous = previous.minusDays(1);
        }
        return jdbc.query(SELECT + "WHERE i.instrument_id=? AND q.quoted_at<=?" + ORDER,
                mapper, instrumentId, previous.atTime(LocalTime.of(16, 0)).atZone(exchange).toOffsetDateTime())
                .stream().findFirst();
    }

    private static boolean weekday(LocalDate day) {
        return day.getDayOfWeek() != DayOfWeek.SATURDAY && day.getDayOfWeek() != DayOfWeek.SUNDAY;
    }

    /** Most candles one request may cover. */
    static final int MAX_CANDLE_LIMIT = 500;
    // Buckets align to a fixed origin so the same quote always lands in the same candle.
    private static final String CANDLES = """
            SELECT date_bin(CAST(? AS interval), q.quoted_at, TIMESTAMPTZ '2000-01-01 00:00:00+00') AS bucket,
                   (array_agg(q.mid ORDER BY q.quoted_at, q.created_at, q.quote_id))[1] AS open,
                   MAX(q.mid) AS high,
                   MIN(q.mid) AS low,
                   (array_agg(q.mid ORDER BY q.quoted_at DESC, q.created_at DESC, q.quote_id DESC))[1] AS close,
                   (array_agg(q.bid ORDER BY q.quoted_at DESC, q.created_at DESC, q.quote_id DESC))[1] AS bid_close,
                   MAX(q.quoted_at) AS observed_at
            FROM (
                SELECT quote_id, quoted_at, created_at, bid, ROUND((bid + ask) / 2, 8) AS mid
                FROM quotes
                WHERE instrument_id = ?
                  AND quoted_at <= CURRENT_TIMESTAMP
                  AND quoted_at > CURRENT_TIMESTAMP - CAST(? AS interval) * ?
            ) q
            GROUP BY bucket
            ORDER BY bucket
            """;

    /**
     * Groups the instrument's quotes from the last {@code limit} intervals into midpoint candles.
     * Future-dated quotes are ignored, matching the latest-quote reads.
     *
     * @param instrumentId persistent instrument identifier
     * @param interval candle width
     * @param limit number of intervals to cover (clamped to MAX_CANDLE_LIMIT)
     * @return candles ordered oldest first
     */
    @Override
    public List<PriceCandle> findCandles(UUID instrumentId, CandleInterval interval, int limit) {
        int clampedLimit = Math.max(1, Math.min(limit, MAX_CANDLE_LIMIT));
        return jdbc.query(CANDLES, (rs, n) -> new PriceCandle(
                        rs.getObject("bucket", java.time.OffsetDateTime.class),
                        rs.getBigDecimal("open"),
                        rs.getBigDecimal("high"),
                        rs.getBigDecimal("low"),
                        rs.getBigDecimal("close"),
                        rs.getBigDecimal("bid_close"),
                        rs.getObject("observed_at", java.time.OffsetDateTime.class)),
                interval.sqlInterval(), instrumentId, interval.sqlInterval(), clampedLimit);
    }
}
