package com.neueda.leap.passwordreset;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * Represents a temporary token that authorizes a password reset.
 */
@Entity
@Table(name = "password_reset_tokens")
public class PasswordResetToken {

    @Id
    @Column(name = "reset_token_id")
    private UUID id;

    @Column(name = "token_hash", nullable = false, unique = true)
    private String tokenHash;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    /**
     * Creates an empty password reset token for JPA.
     */
    protected PasswordResetToken() {
    }

    /**
     * Creates a password reset token.
     *
     * @param id the unique identifier of the reset token
     * @param tokenHash the hashed password reset token
     * @param userId the identifier of the user requesting the reset
     * @param expiresAt the time at which the reset token expires
     */
    public PasswordResetToken(
            UUID id,
            String tokenHash,
            UUID userId,
            Instant expiresAt
    ) {
        this.id = id;
        this.tokenHash = tokenHash;
        this.userId = userId;
        this.expiresAt = expiresAt;
    }

    /**
     * Returns the reset token identifier.
     *
     * @return the reset token identifier
     */
    public UUID getId() {
        return id;
    }

    /**
     * Returns the hashed reset token.
     *
     * @return the hashed reset token
     */
    public String getTokenHash() {
        return tokenHash;
    }

    /**
     * Returns the identifier of the associated user.
     *
     * @return the user identifier
     */
    public UUID getUserId() {
        return userId;
    }

    /**
     * Returns the time at which the reset token expires.
     *
     * @return the reset token expiration time
     */
    public Instant getExpiresAt() {
        return expiresAt;
    }
}