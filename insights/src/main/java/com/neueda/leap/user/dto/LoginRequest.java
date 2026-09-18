package com.neueda.leap.user.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;

/**
 * Request DTO used to authenticate an existing user.
 *
 * @param email the user's email address
 * @param password the raw password supplied for authentication
 */
@Schema(
        name = "LoginRequest",
        description = "Request payload for user authentication"
)
public record LoginRequest (

        @NotBlank
        @Schema(
                description = "User's registered email address",
                example = "investor@example.com"
        )
        String email,

        @NotBlank
        @Schema(
                description = "User's password (raw, plaintext in request)",
                example = "SecurePass123!"
        )
        String password

) {
    @Override
    public String toString() {
        return "LoginRequest[email=[REDACTED], password=[REDACTED]]";
    }
}
