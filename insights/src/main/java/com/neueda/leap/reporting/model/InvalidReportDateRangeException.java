package com.neueda.leap.reporting.model;

/** Raised when a report is requested with an invalid date range. */
public class InvalidReportDateRangeException extends RuntimeException {
    /**
     * Creates an {@code InvalidReportDateRangeException}.
     *
     * @param message safe, caller-facing description of the problem
     */
    public InvalidReportDateRangeException(String message) {
        super(message);
    }
}
