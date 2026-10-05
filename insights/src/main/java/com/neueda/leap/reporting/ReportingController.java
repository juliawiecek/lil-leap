package com.neueda.leap.reporting;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** Analyst reporting API backed exclusively by the reporting datasource. */
@RestController
@RequestMapping("/reports")
public class ReportingController {
    private final ReportingQueryService reports;

    /**
     * Creates the read-only reporting API.
     * @param reports replica queries
     */
    public ReportingController(ReportingQueryService reports) { this.reports = reports; }

    /**
     * Returns aggregate trading activity, without customer identity data.
     * @return counts and gross executed value from the replica snapshot
     */
    @GetMapping("/summary")
    public Map<String, Object> summary() { return reports.summary(); }
}
