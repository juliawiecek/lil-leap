package com.neueda.leap.marketdata;

import java.util.Arrays;

/** Candle widths the price chart can request, each with its PostgreSQL interval literal. */
public enum CandleInterval {
    /** One-minute candles. */
    ONE_MINUTE("1m", "1 minute"),
    /** Five-minute candles. */
    FIVE_MINUTES("5m", "5 minutes"),
    /** Fifteen-minute candles. */
    FIFTEEN_MINUTES("15m", "15 minutes"),
    /** One-hour candles. */
    ONE_HOUR("1h", "1 hour"),
    /** One-day candles. */
    ONE_DAY("1d", "1 day");

    private final String code;
    private final String sqlInterval;

    CandleInterval(String code, String sqlInterval) {
        this.code = code;
        this.sqlInterval = sqlInterval;
    }

    /**
     * Returns the interval's API code.
     * @return the code used in the API, e.g. {@code 5m}
     */
    public String code() {
        return code;
    }

    /**
     * Returns the interval's SQL representation.
     * @return the PostgreSQL interval literal, e.g. {@code 5 minutes}
     */
    public String sqlInterval() {
        return sqlInterval;
    }

    /**
     * Parses an API code such as {@code 1m} or {@code 1h}.
     *
     * @param code interval code
     * @return the matching interval
     * @throws IllegalArgumentException if the code is not supported
     */
    public static CandleInterval fromCode(String code) {
        return Arrays.stream(values())
                .filter(interval -> interval.code.equals(code))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException(
                        "Interval must be one of 1m, 5m, 15m, 1h or 1d"));
    }
}
