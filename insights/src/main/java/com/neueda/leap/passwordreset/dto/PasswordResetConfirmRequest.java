package com.neueda.leap.passwordreset.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Represents a request to complete the password reset process.
 *
 * @param token the temporary password reset token
 * @param newPassword the new password selected by the user
 */
@Schema(
        name = "PasswordResetConfirmRequest",
        description = "Request payload to confirm and complete password reset"
)
public record PasswordResetConfirmRequest(

        @NotBlank
        @Schema(
                description = "Temporary password reset token sent via email",
                example = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
        )
        String token,

        @NotBlank
        @Size(min = 12, max = 128)
        @Pattern(
                regexp = "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9\\s]).{12,128}$",
                message = "Password must contain an uppercase letter, lowercase letter, number, and symbol."
        )
        @Schema(
                description = "New password (must be 12-128 characters with uppercase, lowercase, digit, and special character)",
                example = "NewSecurePass123!"
        )
        String newPassword

) {
}