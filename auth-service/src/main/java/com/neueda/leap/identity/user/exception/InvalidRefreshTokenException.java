package com.neueda.leap.identity.user.exception;

/**
 * Exception thrown when a refresh token is missing, expired, revoked, or does
 * not match any known session. No distinction is made between these cases in
 * the response, the same way an invalid login does not reveal which field was wrong.
 */
public class InvalidRefreshTokenException extends RuntimeException {

    /**
     * Creates a new exception with the provided error message.
     *
     * @param message the detail message explaining why the exception was thrown
     */
    public InvalidRefreshTokenException(String message) {
        super(message);
    }
}
