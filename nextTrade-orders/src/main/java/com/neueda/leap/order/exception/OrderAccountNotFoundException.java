package com.neueda.leap.order.exception;

/**
 * Exception thrown when an order names an account that does not exist or does
 * not belong to the caller. Both cases are reported identically so a caller
 * cannot probe for other clients' account IDs (BR-02).
 */
public class OrderAccountNotFoundException extends RuntimeException {

    /**
     * Creates a new exception with the provided error message.
     *
     * @param message the detail message explaining why the exception was thrown
     */
    public OrderAccountNotFoundException(String message) {
        super(message);
    }
}
