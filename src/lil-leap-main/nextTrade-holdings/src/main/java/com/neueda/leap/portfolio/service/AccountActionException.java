package com.neueda.leap.portfolio.service;

import org.springframework.http.HttpStatus;

/**
 * A rejected account action with a fixed, user-safe code and message. Accounts that do not
 * exist and accounts owned by someone else are reported the same way (BR-02).
 */
public class AccountActionException extends RuntimeException {

    /** Why the action was rejected, with the HTTP status and message shown to the client. */
    public enum Reason {
        /** An account is missing or belongs to another client. */
        ACCOUNT_ACCESS_DENIED(HttpStatus.FORBIDDEN, "You can only use your own accounts."),
        /** The source account does not have enough settled cash. */
        INSUFFICIENT_FUNDS(HttpStatus.CONFLICT, "The source account does not have enough available cash."),
        /** Source and target are the same account. */
        SAME_ACCOUNT(HttpStatus.BAD_REQUEST, "Choose two different accounts."),
        /** An account is blocked or closed. */
        ACCOUNT_UNAVAILABLE(HttpStatus.CONFLICT, "One of these accounts is not open for transfers."),
        /** The client already has the maximum number of accounts. */
        ACCOUNT_LIMIT_REACHED(HttpStatus.CONFLICT, "You have reached the maximum number of accounts.");

        private final HttpStatus status;
        private final String message;

        Reason(HttpStatus status, String message) {
            this.status = status;
            this.message = message;
        }

        /**
         * HTTP status for this rejection.
         * @return the status code
         */
        public HttpStatus status() {
            return status;
        }

        /**
         * Message safe to show the client.
         * @return the fixed message
         */
        public String message() {
            return message;
        }
    }

    /** Why the action was rejected, kept for the error response. */
    private final Reason reason;

    /**
     * Creates the rejection.
     * @param reason why the action was rejected
     */
    public AccountActionException(Reason reason) {
        super(reason.message());
        this.reason = reason;
    }

    /**
     * Why the action was rejected.
     * @return the reason
     */
    public Reason reason() {
        return reason;
    }
}
