package com.neueda.leap.marketdata.generation;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/**
 * Synthetic US-equity prices from Geometric Brownian Motion, ported from the retired Python quote
 * service so prices behave exactly as before.
 *
 * <p>Each tick takes two one-minute GBM steps from every stock's catalog start price and keeps the
 * last one, so prices move around the start price rather than walking away from it:</p>
 *
 * <pre>S_t = S_0 * exp(sum((drift - volatility^2 / 2) * dt + volatility * sqrt(dt) * Z))</pre>
 *
 * <p>where {@code dt} is one trading minute and {@code Z} is standard normal. Prices are rounded to
 * four decimals; bid and ask sit a 0.02% spread (at least 0.0001) either side.</p>
 */
public final class SyntheticQuoteModel {

    /** Source tag stored with every generated quote. */
    public static final String SOURCE = "SYNTHETIC_GBM";

    /** One-minute steps per tick: the Python service generated three prices (two steps) and kept the last. */
    static final int STEPS_PER_TICK = 2;
    private static final double MINUTES_PER_YEAR = 252 * 6.5 * 60;
    private static final double TIME_STEP = 1 / MINUTES_PER_YEAR;
    private static final BigDecimal SPREAD_RATE = new BigDecimal("0.0002");
    private static final BigDecimal MIN_SPREAD = new BigDecimal("0.0001");

    private SyntheticQuoteModel() {
    }

    /**
     * One generated bid/ask pair.
     *
     * @param instrument catalog entry it prices
     * @param price rounded midpoint price
     * @param bid price minus the spread
     * @param ask price plus the spread
     */
    public record GeneratedQuote(CatalogInstrument instrument, BigDecimal price, BigDecimal bid, BigDecimal ask) {
    }

    /**
     * Prices every catalog stock for one tick. The same seed always gives the same prices.
     *
     * @param catalog stocks to price, drawn from the random stream in this order
     * @param seed tick seed; the job adds the tick number to its base seed so each tick differs
     * @return one quote per stock, in catalog order
     */
    public static List<GeneratedQuote> tick(List<CatalogInstrument> catalog, long seed) {
        Random rng = new Random(seed);
        List<GeneratedQuote> quotes = new ArrayList<>(catalog.size());
        for (CatalogInstrument instrument : catalog) {
            double logReturn = 0;
            for (int step = 0; step < STEPS_PER_TICK; step++) {
                logReturn += (instrument.drift() - 0.5 * instrument.volatility() * instrument.volatility()) * TIME_STEP
                        + instrument.volatility() * Math.sqrt(TIME_STEP) * rng.nextGaussian();
            }
            quotes.add(quote(instrument, instrument.startPrice() * Math.exp(logReturn)));
        }
        return quotes;
    }

    /**
     * Rounds a raw price and puts the spread around it.
     *
     * @param instrument catalog entry
     * @param rawPrice unrounded positive price
     * @return the quote as stored
     */
    static GeneratedQuote quote(CatalogInstrument instrument, double rawPrice) {
        BigDecimal price = round(BigDecimal.valueOf(rawPrice));
        BigDecimal spread = round(price.multiply(SPREAD_RATE)).max(MIN_SPREAD);
        return new GeneratedQuote(instrument, price, round(price.subtract(spread)), round(price.add(spread)));
    }

    private static BigDecimal round(BigDecimal value) {
        // numpy.round, which the Python service used, rounds half to even.
        return value.setScale(4, RoundingMode.HALF_EVEN);
    }
}
