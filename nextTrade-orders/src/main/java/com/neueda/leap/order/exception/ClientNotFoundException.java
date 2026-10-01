package com.neueda.leap.order.exception;

/**
 * Exception thrown when a request names a client id that does not exist or
 * does not belong to the caller. Both cases are reported identically so a
 * caller cannot probe for other clients' ids (BR-02).
 */
public class ClientNotFoundException extends RuntimeException {

    /**
     * Creates a new exception with the provided error message.
     *
     * @param message the detail message explaining why the exception was thrown
     */
    public ClientNotFoundException(String message) {
        super(message);
    }
}
