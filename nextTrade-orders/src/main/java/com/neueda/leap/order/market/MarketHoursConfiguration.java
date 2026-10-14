package com.neueda.leap.order.market;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

/** NYSE session rules, overridable with {@code nexttrade.market.*} properties. */
@Configuration
public class MarketHoursConfiguration {
    /** NYSE full-day closures for 2026 and 2027, including observed dates. */
    static final String NYSE_HOLIDAYS = "2026-01-01,2026-01-19,2026-02-16,2026-04-03,2026-05-25,2026-06-19,"
            + "2026-07-03,2026-09-07,2026-11-26,2026-12-25,"
            + "2027-01-01,2027-01-18,2027-02-15,2027-03-26,2027-05-31,2027-06-18,"
            + "2027-07-05,2027-09-06,2027-11-25,2027-12-24";

    /** Creates the configuration; Spring instantiates it. */
    public MarketHoursConfiguration() {
        // No state to initialize.
    }

    @Bean
    MarketHours marketHours(
            @Value("${nexttrade.market.time-zone:America/New_York}") String zone,
            @Value("${nexttrade.market.open:09:30}") String open,
            @Value("${nexttrade.market.close:16:00}") String close,
            @Value("${nexttrade.market.holidays:" + NYSE_HOLIDAYS + "}") String holidays,
            @Value("${nexttrade.market.respect-hours:true}") boolean respectHours) {
        return new MarketHours(ZoneId.of(zone), LocalTime.parse(open), LocalTime.parse(close),
                parseDates(holidays), respectHours);
    }

    /** Parses a comma-separated list of ISO dates, ignoring blanks. */
    static Set<LocalDate> parseDates(String dates) {
        return Arrays.stream(dates.split(","))
                .map(String::trim)
                .filter(date -> !date.isEmpty())
                .map(LocalDate::parse)
                .collect(Collectors.toUnmodifiableSet());
    }
}
