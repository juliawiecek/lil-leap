package com.neueda.leap.user.dto;

import jakarta.validation.constraints.Size;

/**
 * Request DTO containing optional address information supplied during user registration.
 *
 * @param addressLine1 the first line of the street address
 * @param addressLine2 the second line of the street address
 * @param city the city or locality
 * @param stateProvince the state, province, or region
 * @param postalCode the postal or ZIP code
 * @param countryCode the country code associated with the address
 */
public record AddressRequest (

        @Size(max = 255)
        String addressLine1,

        @Size(max = 255)
        String addressLine2,

        @Size(max = 255)
        String city,

        @Size(max = 255)
        String stateProvince,

        @Size(max = 255)
        String postalCode,

        @Size(max = 255)
        String countryCode
) {}