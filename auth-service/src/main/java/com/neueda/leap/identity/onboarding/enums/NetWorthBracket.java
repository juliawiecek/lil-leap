package com.neueda.leap.identity.onboarding.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Net worth bracket options used during onboarding.
 */
public enum NetWorthBracket {
    ZERO_TO_5K("$0-5k"),
    FIVE_TO_25K("$5k-25k"),
    TWENTY_FIVE_TO_100K("$25k-100k"),
    HUNDRED_TO_500K("$100k-500k"),
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
