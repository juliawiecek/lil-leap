package com.neueda.leap.order.market;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class MarketHoursTest {
    private static final ZoneId NEW_YORK = ZoneId.of("America/New_York");
    private static final Set<LocalDate> HOLIDAYS = MarketHoursConfiguration.parseDates(MarketHoursConfiguration.NYSE_HOLIDAYS);
    private final MarketHours nyse = new MarketHours(NEW_YORK, LocalTime.of(9, 30), LocalTime.of(16, 0), HOLIDAYS, true);

    @ParameterizedTest(name = "{0} -> open={1}")
    @CsvSource({
            "2026-10-14T14:00:00Z, true",   // Wednesday 10:00 New York
            "2026-10-14T20:00:00Z, false",  // 16:00 New York: closed at exactly the close
            "2026-10-14T13:29:59Z, false",  // one second before the open
            "2026-10-14T13:30:00Z, true",   // the open itself
            "2026-03-16T13:45:00Z, true",   // US clocks changed on 8 March, Ireland's not until 29 March
            "2026-10-17T15:00:00Z, false",  // Saturday
            "2026-11-26T15:00:00Z, false",  // Thanksgiving
    })
    void decidesOpenOrClosedInNewYorkTime(String now, boolean open) {
        assertThat(nyse.isOpen(Instant.parse(now))).isEqualTo(open);
    }

    @Test
    void theDemoSwitchTreatsTheMarketAsAlwaysOpen() {
        MarketHours anyTime = new MarketHours(NEW_YORK, LocalTime.of(9, 30), LocalTime.of(16, 0), HOLIDAYS, false);
        assertThat(anyTime.isOpen(Instant.parse("2026-10-17T03:00:00Z"))).isTrue();
    }

    @ParameterizedTest(name = "{0} -> opens {1}, closes {2}")
    @CsvSource({
            "2026-10-14T14:00:00Z, 2026-10-15T13:30:00Z, 2026-10-14T20:00:00Z", // open: next open is tomorrow
            "2026-10-14T12:00:00Z, 2026-10-14T13:30:00Z, 2026-10-14T20:00:00Z", // before today's open
            "2026-10-16T21:00:00Z, 2026-10-19T13:30:00Z, 2026-10-19T20:00:00Z", // Friday evening: Monday
            "2026-11-25T21:00:00Z, 2026-11-27T14:30:00Z, 2026-11-27T21:00:00Z", // skips Thanksgiving; winter time
    })
    void findsTheNextSessionBoundaries(String now, String nextOpen, String nextClose) {
        MarketStatus status = nyse.status(Instant.parse(now));
        assertThat(status.nextOpen()).isEqualTo(Instant.parse(nextOpen));
        assertThat(status.nextClose()).isEqualTo(Instant.parse(nextClose));
        assertThat(status.exchangeTimeZone()).isEqualTo("America/New_York");
        assertThat(nyse.zone()).isEqualTo(NEW_YORK);
    }

    @Test
    void rejectsASessionThatDoesNotEndAfterItStarts() {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new MarketHours(NEW_YORK, LocalTime.NOON, LocalTime.NOON, Set.of(), true));
    }

    @Test
    void failsLoudlyWhenNoSessionExistsInTheNextTwoWeeks() {
        LocalDate start = LocalDate.of(2026, 10, 14);
        Set<LocalDate> closedForWeeks = start.datesUntil(start.plusDays(20)).collect(java.util.stream.Collectors.toSet());
        MarketHours shut = new MarketHours(NEW_YORK, LocalTime.of(9, 30), LocalTime.of(16, 0), closedForWeeks, true);
        org.assertj.core.api.Assertions.assertThatIllegalStateException()
                .isThrownBy(() -> shut.nextOpen(Instant.parse("2026-10-14T14:00:00Z")));
    }

    @Test
    void configurationParsesHolidaysAndBuildsTheNyseSession() {
        assertThat(MarketHoursConfiguration.parseDates(" 2026-11-26, ,2026-12-25 "))
                .containsExactlyInAnyOrder(LocalDate.of(2026, 11, 26), LocalDate.of(2026, 12, 25));
        MarketHours configured = new MarketHoursConfiguration().marketHours(
                "America/New_York", "09:30", "16:00", "2026-11-26", true);
        assertThat(configured.isOpen(Instant.parse("2026-11-26T15:00:00Z"))).isFalse();
        assertThat(configured.isOpen(Instant.parse("2026-11-27T15:00:00Z"))).isTrue();
    }
}
