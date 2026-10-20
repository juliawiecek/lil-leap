package com.neueda.leap.reporting;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ReportingQueryServiceTest {

    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);

    @Test
    void summaryCountsOnlyTodaysNewYorkTradingDay() {
        // 01:00 UTC on October 20 is still October 19 in New York.
        Clock evening = Clock.fixed(Instant.parse("2026-10-20T01:00:00Z"), ZoneOffset.UTC);
        OffsetDateTime start = OffsetDateTime.parse("2026-10-19T04:00:00Z");
        OffsetDateTime end = OffsetDateTime.parse("2026-10-20T04:00:00Z");
        when(jdbc.queryForMap(anyString(), eq(start), eq(end), eq(start), eq(end), eq(start), eq(end)))
                .thenReturn(Map.of("accounts", 3L, "orders", 5L, "fills", 4L, "gross_executed_value", 912.5));

        Map<String, Object> summary = new ReportingQueryService(jdbc, evening).summary();

        assertThat(summary)
                .containsEntry("date", "2026-10-19")
                .containsEntry("time_zone", "America/New_York")
                .containsEntry("accounts", 3L)
                .containsEntry("orders", 5L)
                .containsEntry("fills", 4L)
                .containsEntry("gross_executed_value", 912.5);
        verify(jdbc).queryForMap(anyString(), eq(start), eq(end), eq(start), eq(end), eq(start), eq(end));
    }
}
