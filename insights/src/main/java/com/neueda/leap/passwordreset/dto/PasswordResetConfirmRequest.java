package com.neueda.leap.passwordreset.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Represents a request to complete the password reset process.
 *
 * @param token the temporary password reset token
 * @param newPassword the new password selected by the user
 */
public record PasswordResetConfirmRequest(

        @NotBlank
        String token,

        @NotBlank
        @Size(min = 12, max = 128)
        @Pattern(
                regexp = "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9\\s]).{12,128}$",
                message = "Password must contain an uppercase letter, lowercase letter, number, and symbol."
        )
        String newPassword

) {
}