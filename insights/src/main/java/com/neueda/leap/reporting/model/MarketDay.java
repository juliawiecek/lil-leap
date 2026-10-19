package com.neueda.leap.reporting.model;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

/**
 * One US trading day: midnight to midnight in New York, where NYSE and Nasdaq trade.
 *
 * <p>The Insights page shows today's figures for this day, so trades placed in the
 * afternoon stay on the page all evening instead of moving to the next UTC day.
 * Daylight-saving days are 23 or 25 hours long, which {@link ZoneId} handles.</p>
 *
 * @param date the New York calendar date
 */
public record MarketDay(LocalDate date) {

    /** Time zone of the US equity markets. */
    public static final ZoneId ZONE = ZoneId.of("America/New_York");

    private static final DateTimeFormatter HOUR_FORMATTER = DateTimeFormatter.ofPattern("HH:00");

    /**
     * Returns the trading day the clock is currently in.
     *
     * @param clock source of the current instant
     * @return today's New York date
     */
    public static MarketDay today(Clock clock) {
        return new MarketDay(LocalDate.now(clock.withZone(ZONE)));
    }

    /**
     * Returns the first instant of the day (midnight in New York).
     *
     * @return inclusive lower bound
     */
    public Instant startInclusive() {
        return date.atStartOfDay(ZONE).toInstant();
    }

    /**
     * Returns the first instant of the next day (the following midnight in New York).
     *
     * @return exclusive upper bound
     */
    public Instant endExclusive() {
        return date.plusDays(1).atStartOfDay(ZONE).toInstant();
    }

    /**
     * Labels the New York hour an instant falls in, e.g. {@code "14:00"}.
     *
     * @param at the instant to label
     * @return the hour as {@code HH:00}
     */
    public static String hourLabel(Instant at) {
        return at.atZone(ZONE).format(HOUR_FORMATTER);
    }
}
