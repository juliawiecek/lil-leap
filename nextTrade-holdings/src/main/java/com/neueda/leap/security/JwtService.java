package com.neueda.leap.security;

import java.util.Optional;
import java.util.UUID;

/**
 * Contract for issuing and validating JWT session tokens.
 */
public interface JwtService {

    /**
     * Issues a signed session token for the authenticated user.
     *
     * @param userId the authenticated user's unique identifier
     * @param email the authenticated user's email address
     * @return a compact JWT string
     */
    String issueToken(UUID userId, String email);

    /**
     * Validates a token and extracts the caller identity.
     *
     * @param token the raw JWT string, without any bearer prefix
     * @return the extracted principal when valid, otherwise an empty optional
     */
    Optional<JwtPrincipal> validate(String token);
}
