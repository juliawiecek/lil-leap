package com.neueda.leap.onboarding.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Net worth bracket options used during onboarding.
 */
public enum NetWorthBracket {
    /** Bracket represented by the payload/database token {@code $0-5k}. */
    ZERO_TO_5K("$0-5k"),
    /** Bracket represented by the payload/database token {@code $5k-25k}. */
    FIVE_TO_25K("$5k-25k"),
    /** Bracket represented by the payload/database token {@code $25k-100k}. */
    TWENTY_FIVE_TO_100K("$25k-100k"),
    /** Bracket represented by the payload/database token {@code $100k-500k}. */
    HUNDRED_TO_500K("$100k-500k"),
    /** Bracket represented by the payload/database token {@code $500k+}. */
    OVER_500K("$500k+");

    private final String value;

    NetWorthBracket(String value) {
        this.value = value;
    }

    /**
     * Returns the canonical string stored in payloads and persistence.
     *
     * @return bracket value
     */
    @JsonValue
    public String value() {
        return value;
    }

    /**
     * Resolves an enum from the frontend bracket token.
     *
     * @param raw bracket string
     * @return matching enum
     * @throws IllegalArgumentException if the token is null or unsupported
     */
    @JsonCreator
    public static NetWorthBracket fromValue(String raw) {
        for (NetWorthBracket bracket : values()) {
            if (bracket.value.equals(raw)) {
                return bracket;
            }
        }
        throw new IllegalArgumentException("Unsupported net worth bracket: " + raw);
    }
}



