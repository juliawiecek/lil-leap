package com.neueda.leap.identity.user.dto;

/**
 * Response DTO returned after a successful login.
 *
 * @param accessToken a signed, short-lived JWT, to be sent as a
 *                     {@code Authorization: Bearer <token>} header on subsequent requests
 * @param refreshToken a longer-lived, opaque token used to obtain a new access token via
 *                      {@code POST /refresh} once the access token expires
 * @param user the authenticated user's public data
 */
public record LoginResponse(String accessToken, String refreshToken, UserResponse user) {
    @Override
    public String toString() {
        return "LoginResponse[accessToken=[REDACTED], refreshToken=[REDACTED], user=[REDACTED]]";
    }
}
