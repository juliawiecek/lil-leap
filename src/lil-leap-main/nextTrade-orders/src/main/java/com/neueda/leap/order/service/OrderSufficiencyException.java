package com.neueda.leap.order.service;

/**
 * A stable rejection reason for an order that cannot pass sufficiency checks. The message may
 * describe the caller's own order and account (amounts needed and available), which only the
 * account owner can see; it never names other accounts.
 */
public class OrderSufficiencyException extends RuntimeException {
    /** Supported rejections. */
    public enum Reason {
        /** The account cannot cover the buffered purchase cost. */
        INSUFFICIENT_CASH,
        /** The account does not own enough units of the instrument. */
        INSUFFICIENT_HOLDINGS,
        /** Buying power cannot be calculated without a usable ask price. */
        QUOTE_UNAVAILABLE
    }

    /** Stable rejection code. */
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

    /**
     * Creates a rule rejection that explains the shortfall to the account owner.
     * @param reason safe reason code
     * @param message what the order needs and what the account has
     */
    public OrderSufficiencyException(Reason reason, String message) {
        super(message);
        this.reason = reason;
    }

    /**
     * Returns the fixed sufficiency rejection code.
     * @return the safe rejection code
     */
    public Reason reason() {
        return reason;
    }
}
