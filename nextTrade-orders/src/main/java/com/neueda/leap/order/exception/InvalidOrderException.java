package com.neueda.leap.order.exception;

/**
 * Exception thrown when an order request refers to data that cannot be traded,
 * such as an unknown instrument. No order row is written when this is thrown.
 */
public class InvalidOrderException extends RuntimeException {

    /**
     * Creates a new exception with the provided error message.
     *
     * @param message the detail message explaining why the order was rejected
     */
    public InvalidOrderException(String message) {
        super(message);
    }
}
