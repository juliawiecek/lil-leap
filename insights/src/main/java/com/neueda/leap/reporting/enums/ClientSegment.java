package com.neueda.leap.reporting.enums;

import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Client segments used to group trading activity in reports.
 *
 * <p>Serialized using its display label (for example {@code "Retail"}) so
 * dashboards can render the value directly.</p>
 */
public enum ClientSegment {
    /** Individual retail clients. */
    RETAIL("Retail"),
    /** Experienced individual clients trading at the advanced tier. */
    PROFESSIONAL("Professional"),
    /** Institutional clients such as funds and corporates. */
    INSTITUTIONAL("Institutional");

    /** Human-readable label exposed in API responses. */
    private final String label;

    ClientSegment(String label) {
        this.label = label;
    }

    /**
     * Returns the human-readable label exposed in API responses.
     *
     * @return display label for this segment
     */
    @JsonValue
    public String label() {
        return label;
    }
}
