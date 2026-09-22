package com.neueda.leap.order.service;

/** A safe rejection for an order that cannot pass the registered-country restriction check. */
public class OrderJurisdictionException extends RuntimeException {
    /** Fixed public rejection codes, with no registration details or internal rule reasons. */
    public enum Reason {
        /** The profile has no recognized registration country. */
        LOCATION_UNAVAILABLE,
        /** An enabled instrument rule prohibits trading from the registered country. */
        LOCATION_RESTRICTED
    }

    private final Reason reason;

    /**
     * Creates a location rule rejection.
     * @param reason safe rejection code
     */
    public OrderJurisdictionException(Reason reason) {
        super(switch (reason) {
            case LOCATION_UNAVAILABLE -> "A recognized registration country is required to trade.";
            case LOCATION_RESTRICTED -> "This instrument cannot be traded from your registered location.";
        });
        this.reason = reason;
    }

    /** @return the safe rejection code */
    public Reason reason() {
        return reason;
    }
}
