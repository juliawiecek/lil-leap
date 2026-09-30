package com.neueda.leap.reporting.service;

import com.neueda.leap.reporting.dto.DailyTradeActivityResponse;
import com.neueda.leap.reporting.model.InvalidReportDateRangeException;
import com.neueda.leap.reporting.model.ReportDateRange;
import com.neueda.leap.reporting.repository.TradeReportingRepository;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ReportingServiceImplTest {

    private final TradeReportingRepository repository = mock(TradeReportingRepository.class);
    private final ReportingServiceImpl service = new ReportingServiceImpl(repository);

    @Test
    void trendFillsDaysWithoutTradesWithZero() {
        ReportDateRange range = new ReportDateRange(LocalDate.of(2026, 9, 1), LocalDate.of(2026, 9, 3));
        when(repository.countTradesByDay(range)).thenReturn(List.of(
                new DailyTradeActivityResponse(LocalDate.of(2026, 9, 2), 7)));

        assertThat(service.getClientActivityTrend(range)).containsExactly(
                new DailyTradeActivityResponse(LocalDate.of(2026, 9, 1), 0),
                new DailyTradeActivityResponse(LocalDate.of(2026, 9, 2), 7),
                new DailyTradeActivityResponse(LocalDate.of(2026, 9, 3), 0));
    }

    @Test
    void topInstrumentsRejectsOutOfBoundsLimit() {
        ReportDateRange range = new ReportDateRange(LocalDate.of(2026, 9, 1), LocalDate.of(2026, 9, 1));

        assertThatThrownBy(() -> service.getTopInstruments(range, 0)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.getTopInstruments(range, 101)).isInstanceOf(IllegalArgumentException.class);
        verify(repository, never()).findTopInstrumentsByTradeCount(any(), anyInt());
    }

    @Test
    void dateRangeIsInclusiveAndUtcBounded() {
        ReportDateRange range = new ReportDateRange(LocalDate.of(2026, 9, 1), LocalDate.of(2026, 9, 30));

        assertThat(range.startInclusive()).isEqualTo(Instant.parse("2026-09-01T00:00:00Z"));
        assertThat(range.endExclusive()).isEqualTo(Instant.parse("2026-10-01T00:00:00Z"));
    }

    @Test
    void dateRangeRejectsInvalidBounds() {
        LocalDate start = LocalDate.of(2026, 1, 1);

        assertThatThrownBy(() -> new ReportDateRange(start, start.minusDays(1)))
                .isInstanceOf(InvalidReportDateRangeException.class);
        assertThatThrownBy(() -> new ReportDateRange(start, start.plusDays(ReportDateRange.MAX_DAYS)))
                .isInstanceOf(InvalidReportDateRangeException.class);
        assertThatThrownBy(() -> new ReportDateRange(null, start))
                .isInstanceOf(InvalidReportDateRangeException.class);
        assertThat(new ReportDateRange(start, start.plusDays(ReportDateRange.MAX_DAYS - 1))).isNotNull();
    }
}
