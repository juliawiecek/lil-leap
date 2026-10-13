package com.neueda.leap.order.submission.service;

/** A client reference was reused for an order that differs from the one it first created. */
public class IdempotencyConflictException extends RuntimeException {
    /** Fixed client-safe explanation; never includes either order's details. */
    public static final String MESSAGE = "This client reference was already used for a different order.";

    /** Creates the conflict with its fixed client-safe message. */
    public IdempotencyConflictException() {
        super(MESSAGE);
    }
}
