package com.neueda.leap.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.Optional;
import java.util.UUID;

/**
 * Service responsible for issuing and validating JWT session tokens.
 *
 * <p>Tokens are signed with HMAC-SHA using a shared secret. The subject claim
 * carries the user's ID, with the user's email and a {@code client_id} claim
 * included for downstream consumers.</p>
 */
@Service
public class JwtServiceImpl implements JwtService {

    /**
     * Claim name identifying which client application requested the token.
     */
    private static final String CLIENT_ID_CLAIM = "client_id";

    /**
     * Claim name carrying the authenticated user's email address.
     */
    private static final String EMAIL_CLAIM = "email";

    /**
     * Key used to sign and verify tokens, derived from the configured secret.
     */
    private final SecretKey key;

    /**
     * How long an issued token remains valid.
     */
    private final Duration expiration;

    /**
     * Identifier for the client application embedded in issued tokens.
     */
    private final String clientId;

    /**
     * Creates a new JWT service from configuration.
     *
     * <p>{@code app.jwt.secret} should be set via the {@code APP_JWT_SECRET}
     * environment variable in any real environment; the default here is
     * dev-only and is not secure for production use.</p>
     *
     * @param secret the HMAC signing secret, at least 32 bytes long
     * @param expirationMinutes how many minutes an issued token remains valid
     * @param clientId identifier for the client application embedded in issued tokens
     */
    public JwtServiceImpl(
            @Value("${app.jwt.secret:dev-only-insecure-secret-change-me-before-deploying}") String secret,
            @Value("${app.jwt.expiration-minutes:60}") long expirationMinutes,
            @Value("${app.jwt.client-id:nexttrade-web}") String clientId
    ) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expiration = Duration.ofMinutes(expirationMinutes);
        this.clientId = clientId;
    }

    /**
     * Issues a new signed session token for the given user.
     *
     * @param userId the authenticated user's unique identifier
     * @param email the authenticated user's email address
     * @return a signed, compact JWT string
     */
    @Override
    public String issueToken(UUID userId, String email) {
        Instant now = Instant.now();

        return Jwts.builder()
                .subject(userId.toString())
                .claim(EMAIL_CLAIM, email)
                .claim(CLIENT_ID_CLAIM, clientId)
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(expiration)))
                .signWith(key)
                .compact();
    }

    /**
     * Validates a bearer token and extracts the caller's identity.
     *
     * <p>Returns an empty {@link Optional} for any invalid token: a bad
     * signature, malformed structure, or an expired token.</p>
     *
     * @param token the raw JWT string, without the {@code "Bearer "} prefix
     * @return the extracted principal if the token is valid, otherwise empty
     */
    @Override
    public Optional<JwtPrincipal> validate(String token) {
        try {
            Claims claims = Jwts.parser()
                    .verifyWith(key)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();

            UUID userId = UUID.fromString(claims.getSubject());
            String email = claims.get(EMAIL_CLAIM, String.class);

            return Optional.of(new JwtPrincipal(userId, email));
        } catch (JwtException | IllegalArgumentException e) {
            return Optional.empty();
        }
    }
}

