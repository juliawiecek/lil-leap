package com.neueda.leap.user.dto;

import com.neueda.leap.user.entity.User;
import io.swagger.v3.oas.annotations.media.Schema;

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
@Schema(
        name = "UserResponse",
        description = "User profile information returned by authentication endpoints"
)
public record UserResponse(
        @Schema(
                description = "Unique user identifier (UUID)",
                example = "550e8400-e29b-41d4-a716-446655440000"
        )
        UUID id,

        @Schema(
                description = "User's first name (null on auth user entity)",
                example = "John",
                nullable = true
        )
        String firstName,

        @Schema(
                description = "User's last name (null on auth user entity)",
                example = "Doe",
                nullable = true
        )
        String lastName,

        @Schema(
                description = "User's registered email address",
                example = "investor@example.com"
        )
        String email,

        @Schema(
                description = "User's phone number (null on auth user entity)",
                example = "+1-555-123-4567",
                nullable = true
        )
        String phone,

        @Schema(
                description = "Email verification status",
                example = "false"
        )
        boolean emailVerified,

        @Schema(
                description = "User account creation timestamp (ISO 8601)",
                example = "2024-01-15T10:30:00Z"
        )
        Instant createdAt,

        @Schema(
                description = "User account last update timestamp (ISO 8601)",
                example = "2024-01-15T10:30:00Z"
        )
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

