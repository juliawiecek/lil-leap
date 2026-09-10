package com.neueda.leap.user.dto;

import com.neueda.leap.user.entity.User;

import java.time.Instant;
import java.util.UUID;

/**
 * Authentication-focused user payload returned by auth and /me endpoints.
 *
 * @param id unique user identifier
 * @param firstName optional first name (not stored on auth user entity)
 * @param lastName optional last name (not stored on auth user entity)
 * @param email user email
 * @param phone optional phone number (not stored on auth user entity)
 * @param emailVerified email verification flag
 * @param createdAt creation timestamp
 * @param updatedAt last update timestamp
 */
public record UserResponse(
        UUID id,
        String firstName,
        String lastName,
        String email,
        String phone,
        boolean emailVerified,
        Instant createdAt,
        Instant updatedAt
) {

    /**
     * Builds a response from the authentication user entity.
     *
     * <p>Identity/contact details live in onboarding profile tables and are not
     * available on the auth entity, so those fields are returned as {@code null}.
     * Email verification is not yet modeled on the auth entity and defaults to false.</p>
     *
     * @param user persisted auth user
     * @return response payload for auth endpoints
     */
    public static UserResponse from(User user) {
        return new UserResponse(
                user.getUserId(),
                null,
                null,
                user.getEmail(),
                null,
                false,
                user.getCreatedAt(),
                user.getUpdatedAt()
        );
    }
}

