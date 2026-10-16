package com.neueda.leap.reporting.dto;

/**
 * Placeholder response for report-generation endpoints.
 *
 * @param status implementation status
 * @param message human-readable implementation note
 */
public record ReportGenerationResponseDto(String status, String message) {
}

