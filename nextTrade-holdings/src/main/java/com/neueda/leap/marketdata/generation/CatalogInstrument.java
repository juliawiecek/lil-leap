package com.neueda.leap.marketdata.generation;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.StringReader;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * One stock the synthetic quote generator prices, with its Geometric Brownian Motion settings.
 *
 * <p>The list lives in {@code marketdata/instrument-catalog.csv}. It must name the same symbols and
 * markets as {@code db/seeds/001_us_equity_instruments.sql}, and its start prices are also the
 * reference prices of {@code db/seeds/generate_demo_trades.py}, which reads the same file.</p>
 *
 * @param symbol ticker, e.g. {@code AAPL}
 * @param marketCode listing market, e.g. {@code NASDAQ}
 * @param currency three-letter quote currency
 * @param startPrice price every generated path starts from
 * @param drift annualized expected rate of change
 * @param volatility annualized standard deviation of returns
 */
public record CatalogInstrument(
        String symbol, String marketCode, String currency, double startPrice, double drift, double volatility) {

    /** Classpath location of the shared catalog. */
    public static final String RESOURCE = "/marketdata/instrument-catalog.csv";

    /**
     * Normalizes and validates one catalog entry.
     *
     * @param symbol ticker
     * @param marketCode listing market
     * @param currency three-letter quote currency
     * @param startPrice positive start price
     * @param drift annualized drift
     * @param volatility non-negative annualized volatility
     */
    public CatalogInstrument {
        symbol = requireText(symbol, "symbol").toUpperCase(Locale.ROOT);
        marketCode = requireText(marketCode, "market_code").toUpperCase(Locale.ROOT);
        currency = requireText(currency, "currency").toUpperCase(Locale.ROOT);
        if (currency.length() != 3) {
            throw new IllegalArgumentException("currency must be a three-letter code");
        }
        if (!(startPrice > 0)) {
            throw new IllegalArgumentException("start_price must be positive");
        }
        if (volatility < 0) {
            throw new IllegalArgumentException("volatility must be non-negative");
        }
    }

    /**
     * Reads the catalog bundled with the service.
     *
     * @return every catalog entry, in file order
     */
    public static List<CatalogInstrument> load() {
        try (InputStream in = CatalogInstrument.class.getResourceAsStream(RESOURCE)) {
            if (in == null) {
                throw new IllegalStateException("Missing quote catalog " + RESOURCE);
            }
            return parse(new String(in.readAllBytes(), StandardCharsets.UTF_8));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /**
     * Parses catalog CSV with the header
     * {@code symbol,market_code,currency,asset_class,start_price,drift,volatility}.
     *
     * @param csv catalog text
     * @return the entries, in order
     */
    static List<CatalogInstrument> parse(String csv) {
        List<CatalogInstrument> instruments = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(new StringReader(csv))) {
            String header = reader.readLine();
            if (header == null || !header.strip().equals("symbol,market_code,currency,asset_class,start_price,drift,volatility")) {
                throw new IllegalArgumentException("Unexpected quote catalog header: " + header);
            }
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) {
                    continue;
                }
                String[] f = line.split(",", -1);
                if (f.length != 7) {
                    throw new IllegalArgumentException("Malformed quote catalog row: " + line);
                }
                instruments.add(new CatalogInstrument(f[0].strip(), f[1].strip(), f[2].strip(),
                        Double.parseDouble(f[4]), Double.parseDouble(f[5]), Double.parseDouble(f[6])));
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        if (instruments.isEmpty()) {
            throw new IllegalArgumentException("Quote catalog is empty");
        }
        return List.copyOf(instruments);
    }

    private static String requireText(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(name + " must not be blank");
        }
        return value.strip();
    }
}
