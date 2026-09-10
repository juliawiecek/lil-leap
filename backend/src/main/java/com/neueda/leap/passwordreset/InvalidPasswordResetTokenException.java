package com.neueda.leap.passwordreset;

/**
 * Indicates that a password reset token is invalid or has expired.
 */
public class InvalidPasswordResetTokenException extends RuntimeException {

    public InvalidPasswordResetTokenException() {
        super("The password reset token is invalid or has expired.");
    }
}
