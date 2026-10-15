package com.neueda.leap.order.cancel;

/** An order that exists and belongs to the caller but can no longer be cancelled; reported as HTTP 409. */
public class OrderCancellationException extends RuntimeException {
    /** Why the cancellation was refused. */
    public enum Reason {
        /** The execution worker holds the order right now. */
        ORDER_EXECUTING("Order is already executing."),
        /** The order already finished: filled, rejected or cancelled. */
        ORDER_NOT_CANCELLABLE("Only an order that is still waiting to execute can be cancelled.");

        private final String message;

        Reason(String message) {
            this.message = message;
        }

        /**
         * Returns the client-facing message.
         *
         * @return the fixed client-facing message for this reason
         */
        public String message() {
            return message;
        }
    }

    /** Why the cancellation was refused, kept for the error response. */
    private final Reason reason;

    /**
     * Creates the exception.
     *
     * @param reason why the order cannot be cancelled
     */
    public OrderCancellationException(Reason reason) {
        super(reason.message());
        this.reason = reason;
    }

    /**
     * Returns why the cancellation was refused.
     *
     * @return why the order cannot be cancelled
     */
    public Reason reason() {
        return reason;
    }
}
