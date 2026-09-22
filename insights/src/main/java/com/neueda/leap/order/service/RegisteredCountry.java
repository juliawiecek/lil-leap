package com.neueda.leap.order.service;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/** Resolves registration country names and ISO codes to rule keys without guessing unknown locations. */
public final class RegisteredCountry {
    private static final Map<String, String> CODES = countryCodes();

    private RegisteredCountry() {
    }

    /**
     * Resolves an ISO alpha-2/alpha-3 code or English country name, ignoring case
     * and surrounding/repeated whitespace. Common US and UK aliases are supported.
     * @param country persisted registration country; may be null or blank
     * @return uppercase ISO alpha-2 code, or empty for an unknown country
     */
    public static Optional<String> code(String country) {
        return country == null ? Optional.empty() : Optional.ofNullable(CODES.get(normalize(country)));
    }

    private static Map<String, String> countryCodes() {
        Map<String, String> codes = new HashMap<>();
        for (String code : Locale.getISOCountries()) {
            Locale country = new Locale("", code);
            codes.put(code, code);
            codes.put(country.getISO3Country(), code);
            codes.put(normalize(country.getDisplayCountry(Locale.ENGLISH)), code);
        }
        codes.put("UNITED STATES OF AMERICA", "US");
        codes.put("U.S.", "US");
        codes.put("U.S.A.", "US");
        codes.put("UK", "GB");
        codes.put("U.K.", "GB");
        codes.put("GREAT BRITAIN", "GB");
        return Map.copyOf(codes);
    }

    private static String normalize(String value) {
        return value.strip().replaceAll("\\s+", " ").toUpperCase(Locale.ROOT);
    }
}
