package com.neueda.leap.passwordreset.dto;

/**
 * Represents a response from a password reset operation.
 *
 * @param message the result message returned to the client
 */
public record PasswordResetResponse(
        String message
) {
}
