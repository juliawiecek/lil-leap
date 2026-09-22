package com.neueda.leap.order.submission.repository;

import java.util.Optional;
import java.util.UUID;

/** Read-only access to registered client location and operator-maintained restrictions. */
public interface OrderJurisdictionRepository {
    /**
     * Reads the country from the authenticated client's registration profile.
     * @param userId authenticated user whose account ownership was checked
     * @return persisted country, or empty when the profile/country is absent
     */
    Optional<String> registeredCountry(UUID userId);

    /**
     * Checks for an enabled restriction on a specific instrument and country.
     * @param instrumentId resolved tradable instrument
     * @param countryCode normalized ISO alpha-2 country code
     * @return true if that instrument is restricted for the country
     */
    boolean isRestricted(UUID instrumentId, String countryCode);
}
