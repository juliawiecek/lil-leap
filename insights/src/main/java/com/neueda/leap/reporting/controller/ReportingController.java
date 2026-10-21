package com.neueda.leap.reporting.controller;

import com.neueda.leap.reporting.dto.ClientActivityTrendDto;
import com.neueda.leap.reporting.dto.OverviewDto;
import com.neueda.leap.reporting.dto.TopInstrumentDto;
import com.neueda.leap.reporting.model.ReportDateRange;
import com.neueda.leap.reporting.service.ReportingService;
import org.springframework.core.io.Resource;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

/** Read-only dashboard and report-generation API for internal analyst users. */
@RestController
@RequestMapping("/reports")
@PreAuthorize("hasAnyRole('ANALYST', 'OPERATIONS')")
public class ReportingController {

    private final ReportingService reportingService;

    /**
     * Creates the reporting endpoints.
     *
     * @param reportingService reporting queries and CSV generation
     */
    public ReportingController(ReportingService reportingService) {
        this.reportingService = reportingService;
    }

    /**
     * Returns the current-day dashboard summary.
     *
     * @return today's trade volume, active clients and trade value
     */
    @GetMapping("/insights/overview")
    public OverviewDto getOverview() {
        return reportingService.getOverview();
    }

    /**
     * Returns the most active instruments for the current day.
     *
     * @return instruments ranked by today's trade count
     */
    @GetMapping("/insights/top-instruments")
    public List<TopInstrumentDto> getTopInstruments() {
        return reportingService.getTopInstruments();
    }

    /**
     * Returns the hourly client trading activity trend for the current day.
     *
     * @return one entry per hour of today's client activity
     */
    @GetMapping("/insights/client-activity-trend")
    public List<ClientActivityTrendDto> getClientActivityTrend() {
        return reportingService.getClientActivityTrend();
    }

    /**
     * Returns the downloadable CSV report aggregated by instrument.
     *
     * @param startDate first New York trading day included (ISO date, required)
     * @param endDate last New York trading day included (ISO date, required)
     * @return CSV file response
     */
    @GetMapping(value = "/generate/instrument-report", produces = "text/csv")
    public ResponseEntity<Resource> generateInstrumentReport(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        return reportingService.generateInstrumentReport(new ReportDateRange(startDate, endDate));
    }

    /**
     * Returns the downloadable CSV report aggregated by client segment.
     *
     * @param startDate first New York trading day included (ISO date, required)
     * @param endDate last New York trading day included (ISO date, required)
     * @return CSV file response
     */
    @GetMapping(value = "/generate/client-segment-report", produces = "text/csv")
    public ResponseEntity<Resource> generateClientSegmentReport(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        return reportingService.generateClientSegmentReport(new ReportDateRange(startDate, endDate));
    }

    /**
     * Returns the downloadable CSV report aggregated by trading activity.
     *
     * @param startDate first New York trading day included (ISO date, required)
     * @param endDate last New York trading day included (ISO date, required)
     * @return CSV file response
     */
    @GetMapping(value = "/generate/trading-activity-report", produces = "text/csv")
    public ResponseEntity<Resource> generateTradingActivityReport(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        return reportingService.generateTradingActivityReport(new ReportDateRange(startDate, endDate));
    }

    /**
     * Returns the downloadable CSV report comparing bought and sold quantity and notional per instrument.
     *
     * @param startDate first New York trading day included (ISO date, required)
     * @param endDate last New York trading day included (ISO date, required)
     * @return CSV file response
     */
    @GetMapping(value = "/generate/buy-sell-balance-report", produces = "text/csv")
    public ResponseEntity<Resource> generateBuySellBalanceReport(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        return reportingService.generateBuySellBalanceReport(new ReportDateRange(startDate, endDate));
    }
}
