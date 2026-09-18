package com.neueda.leap.onboarding.dto;

import com.neueda.leap.onboarding.entity.Account;
import com.neueda.leap.onboarding.entity.CustomerProfile;
import com.neueda.leap.user.entity.User;
import com.neueda.leap.onboarding.enums.AccountType;
import com.neueda.leap.onboarding.enums.TraderLevel;
import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * Response DTO representing the public user data returned by the API.
 *
 * @param id the unique identifier of the user
 * @param firstName the user's first name
 * @param lastName the user's last name
 * @param dateOfBirth the user's date of birth
 * @param email the user's email address
 * @param phone the user's phone number
 * @param accountType the selected account type
 * @param traderLevel the selected trader level
 * @param emailVerified whether the user's email address has been verified
 * @param createdAt the timestamp when the user was created
 * @param updatedAt the timestamp when the user was last updated
 */
@Schema(
        name = "UserResponse",
        description = "Complete user profile information returned by registration endpoints"
)
public record UserResponse(
        @Schema(
                description = "Unique user identifier (UUID)",
                example = "550e8400-e29b-41d4-a716-446655440000"
        )
        UUID id,

        @Schema(
                description = "User's first name",
                example = "John"
        )
        String firstName,

        @Schema(
                description = "User's last name",
                example = "Doe"
        )
        String lastName,

        @Schema(
                description = "User's date of birth (ISO 8601 format)",
                example = "1990-01-15"
        )
        LocalDate dateOfBirth,

        @Schema(
                description = "User's registered email address",
                example = "investor@example.com"
        )
        String email,

        @Schema(
                description = "User's phone number",
                example = "+1-555-123-4567"
        )
        String phone,

        @Schema(
                description = "Selected account type",
                example = "INDIVIDUAL"
        )
        AccountType accountType,

        @Schema(
                description = "Selected trader level",
                example = "BEGINNER"
        )
        TraderLevel traderLevel,

        @Schema(
                description = "Email verification status",
                example = "false"
        )
        boolean emailVerified,

        @Schema(
                description = "Account creation timestamp (ISO 8601)",
                example = "2024-01-15T10:30:00Z"
        )
        Instant createdAt,

        @Schema(
                description = "Account last update timestamp (ISO 8601)",
                example = "2024-01-15T10:30:00Z"
        )
        Instant updatedAt
) {

    /**
     * Creates a {@link UserResponse} from normalized user, profile, and account entities.
     *
     * @param user user authentication entity
     * @param profile user identity profile entity
     * @param account user account entity
     * @return a response DTO containing the user's public registration data
     */
    public static UserResponse from(User user, CustomerProfile profile, Account account) {
        return new UserResponse(
                user.getUserId(),
                profile.getFirstName(),
                profile.getLastName(),
                profile.getDateOfBirth(),
                user.getEmail(),
                profile.getPhone(),
                account.getAccountType(),
                account.getTraderLevel(),
                false,
                user.getCreatedAt(),
                user.getUpdatedAt()
        );
    }
}