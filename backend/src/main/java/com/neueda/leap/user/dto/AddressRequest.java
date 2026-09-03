package com.neueda.leap.user.dto;

import jakarta.validation.constraints.Size;

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
