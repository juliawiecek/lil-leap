package com.neueda.leap.passwordreset.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Represents a request to start the password reset process.
 *
 * @param email the email address associated with the account
 */
@Schema(
        name = "PasswordResetRequest",
        description = "Request payload to initiate a password reset"
)
public record PasswordResetRequest(

        @NotBlank
        @Email
        @Size(max = 320)
        @Schema(
                description = "Email address associated with the user account",
                example = "investor@example.com"
        )
        String email

) {
}