package com.neueda.leap.identity.security;

import com.neueda.leap.identity.user.entity.User;

/**
 * Contract for issuing and rotating refresh-token sessions.
 */
public interface RefreshTokenService {

    /**
     * Issues a new refresh token for the given user, persisting its hash as a session.
     *
     * @param user the user to issue a refresh token for
     * @return the raw refresh token — returned to the caller once, never persisted
     */
    String issue(User user);

    /**
     * Validates a raw refresh token and rotates it: the matching session is
     * revoked and a new one is issued in its place.
     *
     * @param rawRefreshToken the raw refresh token presented by the caller
     * @return the user the (now-revoked) session belonged to, and the new raw refresh token
     */
    RotationResult rotate(String rawRefreshToken);

    /**
     * The result of a successful refresh-token rotation.
     *
     * @param user the session owner
     * @param newRawRefreshToken the newly issued raw refresh token
     */
    record RotationResult(User user, String newRawRefreshToken) {
    }
}
