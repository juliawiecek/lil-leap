package com.neueda.leap.reporting.model;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;

/**
 * Inclusive calendar-date range for a report, interpreted in UTC.
 *
 * <p>Construction validates the range, so any instance is safe to pass to a
 * repository. The range is capped at {@value #MAX_DAYS} days to keep reporting
 * queries and chart payloads bounded.</p>
 *
 * @param startDate first day included in the report
 * @param endDate last day included in the report
 */
public record ReportDateRange(LocalDate startDate, LocalDate endDate) {

    /** Maximum number of days a single report may span. */
    public static final int MAX_DAYS = 366;

    /**
     * Validates the range.
     *
     * @param startDate first day included in the report
     * @param endDate last day included in the report
     * @throws InvalidReportDateRangeException if either date is missing, the end
     *         precedes the start, or the range exceeds {@value #MAX_DAYS} days
     */
    public ReportDateRange {
        if (startDate == null || endDate == null) {
            throw new InvalidReportDateRangeException("startDate and endDate are required.");
        }
        if (endDate.isBefore(startDate)) {
            throw new InvalidReportDateRangeException("endDate must not be before startDate.");
        }
        if (ChronoUnit.DAYS.between(startDate, endDate) + 1 > MAX_DAYS) {
            throw new InvalidReportDateRangeException(
                    "Date range must not exceed " + MAX_DAYS + " days.");
        }
    }

    /**
     * Returns the first instant included in the range (start of {@code startDate}, UTC).
     *
     * @return inclusive lower bound
     */
    public Instant startInclusive() {
        return startDate.atStartOfDay().toInstant(ZoneOffset.UTC);
    }

    /**
     * Returns the first instant after the range (start of the day after {@code endDate}, UTC).
     *
     * @return exclusive upper bound
     */
    public Instant endExclusive() {
        return endDate.plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC);
    }
}
