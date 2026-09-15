package com.neueda.leap.identity.security;

import com.neueda.leap.identity.security.entity.Session;
import com.neueda.leap.identity.security.repository.SessionRepository;
import com.neueda.leap.identity.user.entity.User;
import com.neueda.leap.identity.user.exception.InvalidRefreshTokenException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Base64;

/**
 * Issues and rotates refresh-token sessions backed by the {@code sessions} table.
 *
 * <p>Refresh tokens are high-entropy random values, never JWTs: unlike access
 * tokens they must be revocable and looked up individually, which a
 * self-contained stateless token can't do. Only the SHA-256 hash of the raw
 * token is ever persisted — the raw value is returned to the caller exactly
 * once, at issuance, and is not recoverable from the stored hash.</p>
 */
@Service
public class RefreshTokenServiceImpl implements RefreshTokenService {

    private static final int TOKEN_BYTES = 32;

    private final SessionRepository sessionRepository;
    private final SecureRandom secureRandom = new SecureRandom();
    private final Duration expiration;

    /**
     * Creates a new refresh token service.
     *
     * @param sessionRepository repository for persisted refresh-token sessions
     * @param expirationDays how many days an issued refresh token remains valid
     */
    public RefreshTokenServiceImpl(
            SessionRepository sessionRepository,
            @Value("${app.refresh.expiration-days:30}") long expirationDays
    ) {
        this.sessionRepository = sessionRepository;
        this.expiration = Duration.ofDays(expirationDays);
    }

    /**
     * {@inheritDoc}
     */
    @Override
    public String issue(User user) {
        String rawToken = generateRawToken();

        Session session = new Session();
        session.setUser(user);
        session.setTokenHash(hash(rawToken));
        session.setExpiresAt(OffsetDateTime.now().plus(expiration));
        sessionRepository.save(session);

        return rawToken;
    }

    /**
     * {@inheritDoc}
     *
     * <p>A token that doesn't match any session, or matches a session that's
     * expired or already revoked, is rejected identically — a reused,
     * already-rotated token is exactly as invalid as one that never existed,
     * and both are treated as a possible compromise rather than distinguished
     * for the caller.</p>
     */
    @Override
    public RotationResult rotate(String rawRefreshToken) {
        Session session = sessionRepository.findByTokenHash(hash(rawRefreshToken))
                .filter(Session::isActive)
                .orElseThrow(() -> new InvalidRefreshTokenException("Invalid or expired refresh token."));

        session.setRevokedAt(OffsetDateTime.now());
        session.setLastActiveAt(OffsetDateTime.now());
        sessionRepository.save(session);

        User user = session.getUser();
        String newRawToken = issue(user);

        return new RotationResult(user, newRawToken);
    }

    private String generateRawToken() {
        byte[] bytes = new byte[TOKEN_BYTES];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String hash(String rawToken) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(rawToken.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(digest);
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is a JDK-guaranteed algorithm; this is unreachable.
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
