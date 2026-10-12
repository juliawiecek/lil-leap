package com.neueda.leap.reporting.controller;

import com.neueda.leap.reporting.dto.ClientActivityTrendDto;
import com.neueda.leap.reporting.dto.OverviewDto;
import com.neueda.leap.reporting.dto.TopInstrumentDto;
import com.neueda.leap.reporting.service.ReportingService;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Read-only dashboard and report-generation API for internal analyst users. */
@RestController
@RequestMapping("/reports")
@PreAuthorize("hasRole('ANALYST')")
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
     * @return CSV file response
     */
    @GetMapping(value = "/generate/instrument-report", produces = "text/csv")
    public ResponseEntity<Resource> generateInstrumentReport() {
        return reportingService.generateInstrumentReport();
    }

    /**
     * Returns the downloadable CSV report aggregated by client segment.
     *
     * @return CSV file response
     */
    @GetMapping(value = "/generate/client-segment-report", produces = "text/csv")
    public ResponseEntity<Resource> generateClientSegmentReport() {
        return reportingService.generateClientSegmentReport();
    }

    /**
     * Returns the downloadable CSV report aggregated by trading activity.
     *
     * @return CSV file response
     */
    @GetMapping(value = "/generate/trading-activity-report", produces = "text/csv")
    public ResponseEntity<Resource> generateTradingActivityReport() {
        return reportingService.generateTradingActivityReport();
    }
}
