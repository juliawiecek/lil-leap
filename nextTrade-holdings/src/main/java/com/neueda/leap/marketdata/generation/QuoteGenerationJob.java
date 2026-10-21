package com.neueda.leap.marketdata.generation;

import com.neueda.leap.marketdata.generation.SyntheticQuoteModel.GeneratedQuote;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionOperations;

/**
 * Keeps live prices flowing: every few seconds it writes one synthetic quote per catalog stock to
 * {@code quotes}. Orders only fill against a recent quote, so this must run wherever orders do.
 *
 * <p>This replaces the separate Python quote service. Turn it off with
 * {@code QUOTE_GENERATOR_ENABLED=false}, e.g. in tests that insert their own quotes.</p>
 */
@Component
@ConditionalOnProperty(name = "marketdata.quotes.generator.enabled", havingValue = "true", matchIfMissing = true)
public class QuoteGenerationJob {
    private static final Logger log = LoggerFactory.getLogger(QuoteGenerationJob.class);
    private static final String FIND_INSTRUMENT =
            "SELECT instrument_id, currency FROM instruments WHERE market_code=? AND symbol=? AND enabled AND tradable";
    // A clock running ahead of the database must not create quotes "from the future".
    private static final String INSERT =
            "INSERT INTO quotes(instrument_id, bid, ask, quoted_at, source, is_synthetic)"
                + " VALUES (?, ?, ?, LEAST(?::timestamptz, CURRENT_TIMESTAMP), ?, TRUE)"
                + " ON CONFLICT (instrument_id, quoted_at, source) DO NOTHING";

    private final JdbcTemplate jdbc;
    private final TransactionOperations transactions;
    private final List<CatalogInstrument> catalog;
    private final long seed;
    private final Clock clock;
    private final Map<String, UUID> instrumentIds = new HashMap<>();
    private long tick;

    /**
     * Creates the job over the bundled catalog.
     *
     * @param jdbc JDBC operations participating in Spring transactions
     * @param transactions runs each batch in one transaction
     * @param seed base random seed; tick {@code n} uses {@code seed + n}
     */
    @Autowired
    public QuoteGenerationJob(JdbcTemplate jdbc, TransactionOperations transactions,
            @Value("${marketdata.quotes.generator.seed:42}") long seed) {
        this(jdbc, transactions, CatalogInstrument.load(), seed, Clock.systemUTC());
    }

    QuoteGenerationJob(JdbcTemplate jdbc, TransactionOperations transactions, List<CatalogInstrument> catalog,
            long seed, Clock clock) {
        this.jdbc = jdbc;
        this.transactions = transactions;
        this.catalog = List.copyOf(catalog);
        this.seed = seed;
        this.clock = clock;
    }

    /**
     * Writes one batch of quotes. A failed batch is logged and retried on the next tick, so a
     * database restart pauses prices instead of stopping the service.
     */
    @Scheduled(
            fixedRateString = "${marketdata.quotes.generator.interval-seconds:2}",
            initialDelayString = "${marketdata.quotes.generator.initial-delay-seconds:0}",
            timeUnit = TimeUnit.SECONDS)
    public void run() {
        try {
            int inserted = generate();
            log.debug("quote batch {} inserted={} symbols={}", tick, inserted, catalog.size());
        } catch (DataAccessException e) {
            log.warn("Quote batch {} failed, retrying next tick: {}", tick, e.getMostSpecificCause().getMessage());
        }
    }

    /**
     * Generates and stores one tick's quotes in a single transaction; all are stored or none.
     *
     * @return rows inserted; repeats of an existing quote time are skipped
     */
    public int generate() {
        Integer inserted = transactions.execute(status -> insertTick());
        // Like the Python service, only a stored batch moves on to the next seed.
        tick++;
        return inserted == null ? 0 : inserted;
    }

    private int insertTick() {
        Instant quotedAt = clock.instant().truncatedTo(ChronoUnit.SECONDS);
        List<Object[]> rows = new ArrayList<>(catalog.size());
        for (GeneratedQuote quote : SyntheticQuoteModel.tick(catalog, seed + tick)) {
            UUID instrumentId = instrumentId(quote.instrument());
            if (instrumentId != null) {
                rows.add(new Object[] {instrumentId, quote.bid(), quote.ask(), Timestamp.from(quotedAt), SyntheticQuoteModel.SOURCE});
            }
        }
        int inserted = 0;
        for (int count : jdbc.batchUpdate(INSERT, rows)) {
            inserted += Math.max(count, 0);
        }
        return inserted;
    }

    /** Looks up and caches the tradable instrument for a catalog stock; null when it is missing or disabled. */
    private UUID instrumentId(CatalogInstrument instrument) {
        String key = instrument.marketCode() + ":" + instrument.symbol();
        UUID cached = instrumentIds.get(key);
        if (cached != null) {
            return cached;
        }
        List<UUID> found = jdbc.query(FIND_INSTRUMENT, (rs, n) -> {
            String currency = rs.getString("currency");
            if (!instrument.currency().equalsIgnoreCase(currency.strip())) {
                log.warn("Skipping {}: catalog currency {} does not match instrument currency {}", key, instrument.currency(), currency);
                return null;
            }
            return rs.getObject("instrument_id", UUID.class);
        }, instrument.marketCode(), instrument.symbol());
        UUID id = found.isEmpty() ? null : found.get(0);
        if (id == null) {
            // Not cached, so an instrument enabled later starts getting prices on the next tick.
            log.debug("No tradable instrument {}; no quote generated", key);
            return null;
        }
        instrumentIds.put(key, id);
        return id;
    }
}
