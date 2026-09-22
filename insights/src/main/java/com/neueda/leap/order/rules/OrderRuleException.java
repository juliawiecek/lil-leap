package com.neueda.leap.order.rules;

/** Fixed, client-safe rejection for a pre-acceptance trading rule. */
public class OrderRuleException extends RuntimeException {
    public enum Reason {
        ACCOUNT_NOT_ACTIVE("The account is not active for trading."),
        TRADING_NOT_ENABLED("Trading is not enabled for this account."),
        ACCOUNT_NOT_SUITABLE("The account does not meet its trader-tier requirement."),
        INSTRUMENT_UNSUPPORTED("The requested instrument is not supported."),
        INSTRUMENT_DISABLED("The requested instrument is disabled."),
        INSTRUMENT_NOT_TRADABLE("The requested instrument is halted or restricted.");
        private final String message;
        Reason(String message) { this.message = message; }
        public String message() { return message; }
    }
    private final Reason reason;
    public OrderRuleException(Reason reason) { super(reason.message()); this.reason = reason; }
    public Reason reason() { return reason; }
}
