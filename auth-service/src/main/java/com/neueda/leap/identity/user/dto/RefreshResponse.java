package com.neueda.leap.identity.user.dto;

/**
 * Response DTO returned after a successful token refresh.
 *
 * <p>The refresh token is rotated on every use: the token in this response
 * replaces the one the caller sent, which is invalidated immediately. A
 * caller presenting an already-rotated (reused) refresh token is treated as
 * a compromise signal, not a valid request — see {@code RefreshService}.</p>
 *
 * @param accessToken a new signed, short-lived JWT
 * @param refreshToken the new refresh token, replacing the one just consumed
 */
public record RefreshResponse(String accessToken, String refreshToken) {
    @Override
    public String toString() {
        return "RefreshResponse[accessToken=[REDACTED], refreshToken=[REDACTED]]";
    }
}
