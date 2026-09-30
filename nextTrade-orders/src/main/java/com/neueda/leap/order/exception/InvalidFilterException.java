package com.neueda.leap.order.exception;

/**
 * Exception thrown when a query filter is not usable, such as an unknown order
 * status or a date range whose start is after its end.
 */
public class InvalidFilterException extends RuntimeException {

    /**
     * Creates a new exception with the provided error message.
     *
     * @param message the detail message explaining which filter is invalid
     */
    public InvalidFilterException(String message) {
        super(message);
    }
}
