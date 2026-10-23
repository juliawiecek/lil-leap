package com.neueda.leap.reporting.model;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

/**
 * One business day: midnight to midnight US Central time, where the NextTrade desk works.
 *
 * <p>The Insights page and the reports count days this way, so a day matches the Central
 * clock analysts see, and evening trades stay on their day instead of moving to the next UTC day.
 * Daylight-saving days are 23 or 25 hours long, which {@link ZoneId} handles.</p>
 *
 * @param date the Central calendar date
 */
public record MarketDay(LocalDate date) {

    /** US Central time, the zone every Insights day and hour is counted in. */
    public static final ZoneId ZONE = ZoneId.of("America/Chicago");

    private static final DateTimeFormatter HOUR_FORMATTER = DateTimeFormatter.ofPattern("HH:00");

    /**
     * Returns the trading day the clock is currently in.
     *
     * @param clock source of the current instant
     * @return today's Central date
     */
    public static MarketDay today(Clock clock) {
        return new MarketDay(LocalDate.now(clock.withZone(ZONE)));
    }

    /**
     * Returns the first instant of the day (midnight Central time).
     *
     * @return inclusive lower bound
     */
    public Instant startInclusive() {
        return date.atStartOfDay(ZONE).toInstant();
    }

    /**
     * Returns the first instant of the next day (the following midnight Central time).
     *
     * @return exclusive upper bound
     */
    public Instant endExclusive() {
        return date.plusDays(1).atStartOfDay(ZONE).toInstant();
    }

    /**
     * Labels the Central hour an instant falls in, e.g. {@code "14:00"}.
     *
     * @param at the instant to label
     * @return the hour as {@code HH:00}
     */
    public static String hourLabel(Instant at) {
        return at.atZone(ZONE).format(HOUR_FORMATTER);
    }
}
