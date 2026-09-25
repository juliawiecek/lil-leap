package com.neueda.leap.order.rules;

/** Fixed, client-safe rejection for a pre-acceptance trading rule. */
public class OrderRuleException extends RuntimeException {
    /** Stable reason code describing the rule or quote decision. */
    public enum Reason {
        /** The account is not active for trading. */
        ACCOUNT_NOT_ACTIVE("The account is not active for trading."),
        /** Trading is not enabled for this account. */
        TRADING_NOT_ENABLED("Trading is not enabled for this account."),
        /** The account does not meet its trader-tier requirement. */
        ACCOUNT_NOT_SUITABLE("The account does not meet its trader-tier requirement."),
        /** The requested instrument is not supported. */
        INSTRUMENT_UNSUPPORTED("The requested instrument is not supported."),
        /** The requested instrument is disabled. */
        INSTRUMENT_DISABLED("The requested instrument is disabled."),
        /** The requested instrument is halted or restricted. */
        INSTRUMENT_NOT_TRADABLE("The requested instrument is halted or restricted.");
        private final String message;

        Reason(String message) {
            this.message = message;
        }

        /**
         * Returns the fixed client-safe rule explanation.
         *
         * @return client-safe explanation
         */
        public String message() {
            return message;
        }
    }

    /** Stable reason retained for error response serialization. */
    private final Reason reason;

    /**
     * Creates a {@code OrderRuleException} with the supplied dependencies.
     *
     * @param reason machine-readable decision reason
     */
    public OrderRuleException(Reason reason) {
        super(reason.message());
        this.reason = reason;
    }

    /**
     * Returns the stable rejection reason.
     *
     * @return rejection reason
     */
    public Reason reason() {
        return reason;
    }
}
