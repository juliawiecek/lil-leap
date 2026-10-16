package com.neueda.leap.order.market;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Set;

/**
 * The regular trading session of one exchange (NYSE by default: 09:30-16:00 America/New_York,
 * Monday to Friday, closed on configured full-day holidays). Times are stored as UTC instants and
 * converted to the exchange zone only to decide open or closed, so daylight-saving changes in other
 * countries never shift the session. Half days are out of scope.
 */
public final class MarketHours {
    /** How far ahead to look for the next session; covers any run of weekends and holidays. */
    private static final int MAX_DAYS_AHEAD = 14;

    private final ZoneId zone;
    private final LocalTime open;
    private final LocalTime close;
    private final Set<LocalDate> holidays;
    private final boolean respectHours;

    /**
     * Creates the session rules.
     *
     * @param zone exchange time zone
     * @param open session start, inclusive
     * @param close session end, exclusive
     * @param holidays full-day closures in the exchange's calendar
     * @param respectHours false treats the market as always open (demo switch)
     * @throws IllegalArgumentException if the session does not end after it starts
     */
    public MarketHours(ZoneId zone, LocalTime open, LocalTime close, Set<LocalDate> holidays, boolean respectHours) {
        if (!close.isAfter(open)) {
            throw new IllegalArgumentException("Market close must be after market open");
        }
        this.zone = zone;
        this.open = open;
        this.close = close;
        this.holidays = Set.copyOf(holidays);
        this.respectHours = respectHours;
    }

    /**
     * Returns the exchange time zone.
     *
     * @return the exchange time zone
     */
    public ZoneId zone() {
        return zone;
    }

    /**
     * Tells whether the market is open.
     *
     * @param now current instant
     * @return true during a regular session, or always when hours are not respected
     */
    public boolean isOpen(Instant now) {
        if (!respectHours) {
            return true;
        }
        ZonedDateTime local = now.atZone(zone);
        LocalTime time = local.toLocalTime();
        return isTradingDay(local.toLocalDate()) && !time.isBefore(open) && time.isBefore(close);
    }

    /**
     * Finds when the market next opens.
     *
     * @param now current instant
     * @return the start of the next session that begins after {@code now}
     */
    public Instant nextOpen(Instant now) {
        return nextSessionBoundary(now, open);
    }

    /**
     * Finds when the market next closes.
     *
     * @param now current instant
     * @return the end of the current session, or of the next one when the market is closed
     */
    public Instant nextClose(Instant now) {
        return nextSessionBoundary(now, close);
    }

    /**
     * Describes the market at a moment in time.
     *
     * @param now current instant
     * @return whether the market is open and when it next opens and closes
     */
    public MarketStatus status(Instant now) {
        return new MarketStatus(isOpen(now), zone.getId(), nextOpen(now), nextClose(now));
    }

    private Instant nextSessionBoundary(Instant now, LocalTime boundary) {
        LocalDate day = now.atZone(zone).toLocalDate();
        for (int i = 0; i <= MAX_DAYS_AHEAD; i++) {
            LocalDate candidate = day.plusDays(i);
            Instant at = candidate.atTime(boundary).atZone(zone).toInstant();
            if (isTradingDay(candidate) && at.isAfter(now)) {
                return at;
            }
        }
        throw new IllegalStateException("No trading session within " + MAX_DAYS_AHEAD + " days");
    }

    private boolean isTradingDay(LocalDate day) {
        DayOfWeek weekday = day.getDayOfWeek();
        return weekday != DayOfWeek.SATURDAY && weekday != DayOfWeek.SUNDAY && !holidays.contains(day);
    }
}
