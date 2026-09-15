package com.neueda.leap.identity.user.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * Request DTO used to exchange a refresh token for a new access token.
 *
 * @param refreshToken the opaque refresh token issued at login or by a previous refresh
 */
public record RefreshRequest(

        @NotBlank
        String refreshToken

) {
    @Override
    public String toString() {
        return "RefreshRequest[refreshToken=[REDACTED]]";
    }
}
