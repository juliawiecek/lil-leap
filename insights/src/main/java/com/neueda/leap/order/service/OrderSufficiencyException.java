package com.neueda.leap.order.service;

/** A fixed, safe rejection reason for an order that cannot pass sufficiency checks. */
public class OrderSufficiencyException extends RuntimeException {
    /** Supported rejections; messages never include account balances or identifiers. */
    public enum Reason {
        /** The account cannot cover the buffered purchase cost. */
        INSUFFICIENT_CASH,
        /** The account does not own enough units of the instrument. */
        INSUFFICIENT_HOLDINGS,
        /** Buying power cannot be calculated without a usable ask price. */
        QUOTE_UNAVAILABLE
    }

    private final Reason reason;

    /**
     * Creates a rule rejection.
     * @param reason safe reason code
     */
    public OrderSufficiencyException(Reason reason) {
        super(switch (reason) {
            case INSUFFICIENT_CASH -> "Insufficient cash for this order.";
            case INSUFFICIENT_HOLDINGS -> "Insufficient holdings for this order.";
            case QUOTE_UNAVAILABLE -> "A valid quote is required to check buying power.";
        });
        this.reason = reason;
    }

    /** @return the safe rejection code */
    public Reason reason() {
        return reason;
    }
}
