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

    public ReportingController(ReportingService reportingService) {
        this.reportingService = reportingService;
    }

    /** Returns the current-day dashboard summary. */
    @GetMapping("/insights/overview")
    public OverviewDto getOverview() {
        return reportingService.getOverview();
    }

    /** Returns the most active instruments for the current day. */
    @GetMapping("/insights/top-instruments")
    public List<TopInstrumentDto> getTopInstruments() {
        return reportingService.getTopInstruments();
    }

    /** Returns the hourly client trading activity trend for the current day. */
    @GetMapping("/insights/client-activity-trend")
    public List<ClientActivityTrendDto> getClientActivityTrend() {
        return reportingService.getClientActivityTrend();
    }

    /** Returns the downloadable CSV report aggregated by instrument. */
    @GetMapping(value = "/generate/instrument-report", produces = "text/csv")
    public ResponseEntity<Resource> generateInstrumentReport() {
        return reportingService.generateInstrumentReport();
    }

    /** Returns the downloadable CSV report aggregated by client segment. */
    @GetMapping(value = "/generate/client-segment-report", produces = "text/csv")
    public ResponseEntity<Resource> generateClientSegmentReport() {
        return reportingService.generateClientSegmentReport();
    }

    /** Returns the downloadable CSV report aggregated by trading activity. */
    @GetMapping(value = "/generate/trading-activity-report", produces = "text/csv")
    public ResponseEntity<Resource> generateTradingActivityReport() {
        return reportingService.generateTradingActivityReport();
    }
}
