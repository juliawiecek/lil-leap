package com.neueda.leap.identity.user.dto;

import com.neueda.leap.identity.user.entity.User;

import java.time.Instant;
import java.util.UUID;

/**
 * Public user payload returned by register, login, and refresh endpoints.
 *
 * <p>Deliberately minimal — identity/contact/financial detail lives in the
 * profile tables the caller already submitted during registration, not
 * something this service echoes back on every auth response.</p>
 *
 * @param id unique user identifier
 * @param email user email
 * @param userRole the user's role, TRADER or ANALYST
 * @param createdAt creation timestamp
 * @param updatedAt last update timestamp
 */
public record UserResponse(
        UUID id,
        String email,
        String userRole,
        Instant createdAt,
        Instant updatedAt
) {

    /**
     * Builds a response from the persisted user entity.
     *
     * @param user persisted user
     * @return response payload for auth endpoints
     */
    public static UserResponse from(User user) {
        return new UserResponse(
                user.getUserId(),
                user.getEmail(),
                user.getUserRole(),
                user.getCreatedAt(),
                user.getUpdatedAt()
        );
    }
}
