package com.neueda.leap.user.exception;

/**
 * Exception thrown when a registration attempt is made with an email address
 * that already belongs to an existing user.
 */
public class UserAlreadyExistsException extends RuntimeException {

    /**
     * Creates a new exception with the provided error message.
     *
     * @param message the detail message explaining why the exception was thrown
     */
    public UserAlreadyExistsException(String message) {
        super(message);
    }
}