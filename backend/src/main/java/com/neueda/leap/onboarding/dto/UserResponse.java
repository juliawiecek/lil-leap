package com.neueda.leap.onboarding.dto;

import com.neueda.leap.onboarding.entity.Account;
import com.neueda.leap.onboarding.entity.CustomerProfile;
import com.neueda.leap.user.entity.User;
import com.neueda.leap.onboarding.enums.AccountType;
import com.neueda.leap.onboarding.enums.TraderLevel;

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
public record UserResponse(
        UUID id,
        String firstName,
        String lastName,
        LocalDate dateOfBirth,
        String email,
        String phone,
        AccountType accountType,
        TraderLevel traderLevel,
        boolean emailVerified,
        Instant createdAt,
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