package com.neueda.leap.identity.security;

import java.util.Optional;
import java.util.UUID;

/**
 * Contract for issuing and validating JWT access tokens.
 *
 * <p>Refresh-token issuance and rotation are handled separately (see the
 * refresh-token flow in the {@code auth} package), since refresh tokens are
 * persisted and revocable rather than purely stateless like access tokens.</p>
 */
public interface JwtService {

    /**
     * Issues a signed access token for the authenticated user.
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
