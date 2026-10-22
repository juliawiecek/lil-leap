package com.neueda.leap.reporting.model;

import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;

class MarketDayTest {

    private static Clock at(String instant) {
        return Clock.fixed(Instant.parse(instant), ZoneOffset.UTC);
    }

    @Test
    void todayRunsFromMidnightToMidnightCentralTime() {
        MarketDay today = MarketDay.today(at("2026-10-01T15:30:00Z"));

        assertThat(today.date()).isEqualTo(LocalDate.of(2026, 10, 1));
        assertThat(today.startInclusive()).isEqualTo(Instant.parse("2026-10-01T05:00:00Z"));
        assertThat(today.endExclusive()).isEqualTo(Instant.parse("2026-10-02T05:00:00Z"));
    }

    @Test
    void aCentralEveningIsStillTheSameDayAfterUtcMidnight() {
        // 01:00 UTC on October 20 is 20:00 on October 19 Central time.
        assertThat(MarketDay.today(at("2026-10-20T01:00:00Z")).date()).isEqualTo(LocalDate.of(2026, 10, 19));
    }

    @Test
    void daylightSavingDaysAreTwentyThreeOrTwentyFiveHoursLong() {
        MarketDay springForward = new MarketDay(LocalDate.of(2026, 3, 8));
        MarketDay fallBack = new MarketDay(LocalDate.of(2026, 11, 1));

        assertThat(Duration.between(springForward.startInclusive(), springForward.endExclusive())).hasHours(23);
        assertThat(Duration.between(fallBack.startInclusive(), fallBack.endExclusive())).hasHours(25);
    }

    @Test
    void hourLabelsUseCentralTime() {
        assertThat(MarketDay.hourLabel(Instant.parse("2026-10-01T13:59:59Z"))).isEqualTo("08:00");
        assertThat(MarketDay.hourLabel(Instant.parse("2026-12-01T14:30:00Z"))).isEqualTo("08:00");
    }
}
