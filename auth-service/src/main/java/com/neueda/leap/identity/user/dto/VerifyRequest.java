package com.neueda.leap.identity.user.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * Request DTO used by other backends (NextTrade, Insights) to verify an
 * access token issued by this service.
 *
 * @param token the raw access token, without any bearer prefix
 */
public record VerifyRequest(

        @NotBlank
        String token

) {
    @Override
    public String toString() {
        return "VerifyRequest[token=[REDACTED]]";
    }
}
