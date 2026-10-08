package com.neueda.leap.order.rules;

import java.util.Locale;
import java.util.Set;

/**
 * Jurisdiction policy for order submission (BR-05): only clients located in the United States
 * may trade, and only instruments listed on US markets. A missing country is treated as not
 * permitted.
 */
public final class LocationPolicy {

    /** Accepted spellings of the United States in {@code customer_profiles.country}, after normalizing. */
    private static final Set<String> US_COUNTRIES = Set.of("US", "USA", "UNITED STATES", "UNITED STATES OF AMERICA");

    /** US exchange codes accepted in {@code instruments.market_code}. */
    private static final Set<String> US_MARKETS = Set.of(
            "NASDAQ", "NYSE", "NYSE_AMERICAN", "AMEX", "NYSE_ARCA", "ARCA", "CBOE", "BATS", "IEX");

    private LocationPolicy() {
    }

    /**
     * Decides whether a client in the given country may trade an instrument on the given market.
     *
     * @param clientCountry country from the client's profile; may be null
     * @param marketCode instrument market code; may be null
     * @return true only for a US client trading a US-listed instrument
     */
    public static boolean permits(String clientCountry, String marketCode) {
        return US_COUNTRIES.contains(normalize(clientCountry).replace(".", ""))
                && US_MARKETS.contains(normalize(marketCode));
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim().replaceAll("\\s+", " ").toUpperCase(Locale.ROOT);
    }
}
