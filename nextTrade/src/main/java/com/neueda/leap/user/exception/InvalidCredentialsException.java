package com.neueda.leap.user.exception;

/**
 * Exception thrown when a login attempt fails because the supplied
 * email address and password do not match an existing user's credentials.
 */
public class InvalidCredentialsException extends RuntimeException {

    /**
     * Creates a new exception with the provided error message.
     *
     * @param message the detail message explaining why the exception was thrown
     */
    public InvalidCredentialsException(String message) {
        super(message);
    }
}
