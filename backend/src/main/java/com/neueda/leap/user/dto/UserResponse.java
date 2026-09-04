package com.neueda.leap.user.dto;

import com.neueda.leap.user.User;

import java.time.Instant;
import java.util.UUID;

/**
 * Response DTO representing the public user data returned by the API.
 *
 * @param id the unique identifier of the user
 * @param firstName the user's first name
 * @param lastName the user's last name
 * @param email the user's email address
 * @param phone the user's phone number
 * @param emailVerified whether the user's email address has been verified
 * @param createdAt the timestamp when the user was created
 * @param updatedAt the timestamp when the user was last updated
 */
public record UserResponse (

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
     * Creates a {@link UserResponse} from a {@link User} entity.
     *
     * @param user the user entity to convert
     * @return a response DTO containing the user's public data
     */
    public static UserResponse from(User user) {
        return new UserResponse(
                user.getId(),
                user.getFirstName(),
                user.getLastName(),
                user.getEmail(),
                user.getPhone(),
                user.isEmailVerified(),
                user.getCreatedAt(),
                user.getUpdatedAt()
        );
    }
}