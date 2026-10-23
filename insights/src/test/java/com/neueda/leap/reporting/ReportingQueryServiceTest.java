package com.neueda.leap.reporting;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ReportingQueryServiceTest {

    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);

    @Test
    void summaryCountsOnlyTodayCentralTime() {
        // 01:00 UTC on October 20 is still October 19 Central time.
        Clock evening = Clock.fixed(Instant.parse("2026-10-20T01:00:00Z"), ZoneOffset.UTC);
        OffsetDateTime start = OffsetDateTime.parse("2026-10-19T05:00:00Z");
        OffsetDateTime end = OffsetDateTime.parse("2026-10-20T05:00:00Z");
        when(jdbc.queryForMap(anyString(), eq(start), eq(end), eq(start), eq(end), eq(start), eq(end)))
                .thenReturn(Map.of("accounts", 3L, "orders", 5L, "fills", 4L, "gross_executed_value", 912.5));

        Map<String, Object> summary = new ReportingQueryService(jdbc, evening).summary();

        assertThat(summary)
                .containsEntry("date", "2026-10-19")
                .containsEntry("time_zone", "America/Chicago")
                .containsEntry("accounts", 3L)
                .containsEntry("orders", 5L)
                .containsEntry("fills", 4L)
                .containsEntry("gross_executed_value", 912.5);
        verify(jdbc).queryForMap(anyString(), eq(start), eq(end), eq(start), eq(end), eq(start), eq(end));
    }

    @Test
    @SuppressWarnings("unchecked")
    void ordersTodayListsEachOrderAtItsExactPlacedTimeForTheCentralDay() throws Exception {
        // 01:00 UTC on October 20 is still October 19 Central time.
        Clock evening = Clock.fixed(Instant.parse("2026-10-20T01:00:00Z"), ZoneOffset.UTC);
        OffsetDateTime start = OffsetDateTime.parse("2026-10-19T05:00:00Z");
        OffsetDateTime end = OffsetDateTime.parse("2026-10-20T05:00:00Z");
        ResultSet row = mock(ResultSet.class);
        when(row.getObject("submitted_at", OffsetDateTime.class)).thenReturn(OffsetDateTime.parse("2026-10-19T13:30:21Z"));
        when(row.getString("symbol")).thenReturn("MSFT");
        when(row.getString("side")).thenReturn("BUY");
        when(row.getLong("quantity")).thenReturn(3L);
        when(row.getString("status")).thenReturn("FILLED");
        when(row.getBigDecimal("filled_value")).thenReturn(new BigDecimal("1524.46"));
        when(jdbc.query(anyString(), any(RowMapper.class), eq(start), eq(end)))
                .thenAnswer(call -> List.of(((RowMapper<?>) call.getArgument(1)).mapRow(row, 0)));

        ReportingQueryService.OrdersToday today = new ReportingQueryService(jdbc, evening).ordersToday();

        assertThat(today.date()).isEqualTo("2026-10-19");
        assertThat(today.dayStart()).isEqualTo(Instant.parse("2026-10-19T05:00:00Z"));
        assertThat(today.orders()).containsExactly(new ReportingQueryService.PlacedOrder(
                Instant.parse("2026-10-19T13:30:21Z"), "MSFT", "BUY", 3L, "FILLED", new BigDecimal("1524.46")));
        verify(jdbc).query(anyString(), any(RowMapper.class), eq(start), eq(end));
    }
}
