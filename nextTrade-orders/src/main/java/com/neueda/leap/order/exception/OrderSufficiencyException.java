package com.neueda.leap.order.exception;

/**
 * A fixed, safe rejection reason for an order that cannot pass sufficiency checks.
 * Used for cash, holdings, and quote availability validations.
 */
public class OrderSufficiencyException extends RuntimeException {
    /**
     * Supported rejections; messages never include account balances or identifiers.
     */
    public enum Reason {
        /** The account cannot cover the buffered purchase cost. */
        INSUFFICIENT_CASH("Insufficient cash for this order."),
        /** The account does not own enough units of the instrument. */
        INSUFFICIENT_HOLDINGS("Insufficient holdings for this order."),
        /** Buying power cannot be calculated without a usable ask price. */
        QUOTE_UNAVAILABLE("A valid quote is required to check buying power.");

        private final String message;

        Reason(String message) {
            this.message = message;
        }

        /**
         * Returns the fixed client-safe reason explanation.
         * @return client-safe explanation
         */
        public String message() {
            return message;
        }
    }

    /** Stable rejection code. */
    private final Reason reason;

    /**
     * Creates a rule rejection.
     * @param reason safe reason code
     */
    public OrderSufficiencyException(Reason reason) {
        super(reason.message());
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
