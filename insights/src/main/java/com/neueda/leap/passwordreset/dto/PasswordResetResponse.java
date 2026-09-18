package com.neueda.leap.passwordreset.dto;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Represents a response from a password reset operation.
 *
 * @param message the result message returned to the client
 */
@Schema(
        name = "PasswordResetResponse",
        description = "Response payload from password reset operations"
)
public record PasswordResetResponse(
        @Schema(
                description = "Operation result message",
                example = "Password has been reset successfully."
        )
        String message
) {
}
