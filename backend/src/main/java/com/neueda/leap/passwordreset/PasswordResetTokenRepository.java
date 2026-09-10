package com.neueda.leap.passwordreset;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

/**
 * Provides persistence operations for password reset tokens.
 */
public interface PasswordResetTokenRepository
        extends JpaRepository<PasswordResetToken, UUID> {

    /**
     * Finds a password reset token by its hashed value.
     *
     * @param tokenHash the hashed reset token to search for
     * @return the matching password reset token, or an empty optional if none exists
     */
    Optional<PasswordResetToken> findByTokenHash(String tokenHash);

    /**
     * Deletes password reset tokens associated with a user.
     *
     * @param userId the identifier of the user whose reset tokens should be deleted
     */
    void deleteByUserId(UUID userId);
}