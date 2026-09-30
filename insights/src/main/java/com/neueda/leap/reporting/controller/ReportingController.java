package com.neueda.leap.reporting.controller;

import com.neueda.leap.reporting.dto.ClientSegmentActivityResponse;
import com.neueda.leap.reporting.dto.DailyTradeActivityResponse;
import com.neueda.leap.reporting.dto.InsightsOverviewResponse;
import com.neueda.leap.reporting.dto.InstrumentActivityResponse;
import com.neueda.leap.reporting.dto.TopInstrumentResponse;
import com.neueda.leap.reporting.model.ReportDateRange;
import com.neueda.leap.reporting.service.ReportingService;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.format.annotation.DateTimeFormat.ISO;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

/**
 * Read-only reporting API over aggregated trading activity.
 *
 * <p>These reports span all clients, so access is limited to internal ANALYST
 * users. Dates use ISO format ({@code yyyy-MM-dd}), are inclusive, are
 * interpreted in UTC, and may span at most {@value ReportDateRange#MAX_DAYS} days.
 * Invalid or missing parameters return HTTP 400.</p>
 */
@RestController
@RequestMapping("/reports")
@PreAuthorize("hasRole('ANALYST')")
public class ReportingController {

    /** Service providing report data. */
    private final ReportingService reportingService;

    /**
     * Creates the reporting endpoints.
     *
     * @param reportingService reporting use cases
     */
    public ReportingController(ReportingService reportingService) {
        this.reportingService = reportingService;
    }

    /**
     * Returns trading activity grouped by instrument.
     *
     * @param startDate first day included in the report
     * @param endDate last day included in the report
     * @return per-instrument trade count, volume, and value
     */
    @GetMapping("/by-instrument")
    public List<InstrumentActivityResponse> getActivityByInstrument(
            @RequestParam @DateTimeFormat(iso = ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = ISO.DATE) LocalDate endDate) {
        return reportingService.getActivityByInstrument(new ReportDateRange(startDate, endDate));
    }

    /**
     * Returns trading activity grouped by client segment.
     *
     * @param startDate first day included in the report
     * @param endDate last day included in the report
     * @return per-segment trade count and value
     */
    @GetMapping("/by-client-segment")
    public List<ClientSegmentActivityResponse> getActivityByClientSegment(
            @RequestParam @DateTimeFormat(iso = ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = ISO.DATE) LocalDate endDate) {
        return reportingService.getActivityByClientSegment(new ReportDateRange(startDate, endDate));
    }

    /**
     * Returns the dashboard summary.
     *
     * @param startDate first day included in the report
     * @param endDate last day included in the report
     * @return total trades, volume, active clients, and value
     */
    @GetMapping("/insights/overview")
    public InsightsOverviewResponse getOverview(
            @RequestParam @DateTimeFormat(iso = ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = ISO.DATE) LocalDate endDate) {
        return reportingService.getOverview(new ReportDateRange(startDate, endDate));
    }

    /**
     * Returns the most actively traded instruments.
     *
     * @param startDate first day included in the report
     * @param endDate last day included in the report
     * @param limit maximum number of instruments to return, 1 to 100 (default 10)
     * @return instruments ordered by trade count descending
     */
    @GetMapping("/insights/top-instruments")
    public List<TopInstrumentResponse> getTopInstruments(
            @RequestParam @DateTimeFormat(iso = ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = ISO.DATE) LocalDate endDate,
            @RequestParam(defaultValue = "" + ReportingService.DEFAULT_TOP_INSTRUMENTS_LIMIT)
            @Min(1) @Max(ReportingService.MAX_TOP_INSTRUMENTS_LIMIT) int limit) {
        return reportingService.getTopInstruments(new ReportDateRange(startDate, endDate), limit);
    }

    /**
     * Returns the daily trade count trend for dashboard charting.
     *
     * @param startDate first day included in the report
     * @param endDate last day included in the report
     * @return one entry per day in the range, including days with zero trades
     */
    @GetMapping("/insights/client-activity-trend")
    public List<DailyTradeActivityResponse> getClientActivityTrend(
            @RequestParam @DateTimeFormat(iso = ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = ISO.DATE) LocalDate endDate) {
        return reportingService.getClientActivityTrend(new ReportDateRange(startDate, endDate));
    }
}
