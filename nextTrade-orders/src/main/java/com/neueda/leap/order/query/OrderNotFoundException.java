package com.neueda.leap.order.query;

/**
 * Thrown when an order does not exist or belongs to another user; the two cases are
 * deliberately indistinguishable to the caller.
 */
public class OrderNotFoundException extends RuntimeException {
    /** Creates the exception with a fixed message that contains no request data. */
    public OrderNotFoundException() {
        super("Order not found");
    }
}
