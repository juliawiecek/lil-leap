package com.neueda.leap.order.settlement;

import org.springframework.http.HttpStatus;

/** A recover or rollback request that cannot be carried out; the message is safe to return to the caller. */
public class SettlementException extends RuntimeException {
    private final HttpStatus status;
    private final String code;

    /**
     * Creates the failure.
     *
     * @param status HTTP status to return
     * @param code stable machine-readable error code
     * @param message client-safe explanation
     */
    public SettlementException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    /**
     * Creates the failure, keeping the underlying cause for logs only.
     *
     * @param status HTTP status to return
     * @param code stable machine-readable error code
     * @param message client-safe explanation
     * @param cause underlying failure
     */
    public SettlementException(HttpStatus status, String code, String message, Throwable cause) {
        super(message, cause);
        this.status = status;
        this.code = code;
    }

    /** @return HTTP status to return */
    public HttpStatus status() {
        return status;
    }

    /** @return stable machine-readable error code */
    public String code() {
        return code;
    }
}
