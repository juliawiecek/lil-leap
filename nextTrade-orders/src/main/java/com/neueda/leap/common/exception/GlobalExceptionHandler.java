package com.neueda.leap.common.exception;

import com.neueda.leap.order.service.OrderSufficiencyException;
import com.neueda.leap.order.rules.OrderRuleException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.ErrorResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Map;

/**
 * Global exception handler for REST controllers.
 *
 * <p>This class centralizes exception handling logic and converts
 * application-specific exceptions into appropriate HTTP responses.</p>
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    /** Creates the application-wide REST exception handler. */
    public GlobalExceptionHandler() {
    }
    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /**
     * Reports a pre-submission trading-rule rejection without exposing request data.
     * @param exception account or instrument rule rejection
     * @return HTTP 422 with the stable reason and fixed message
     */
    @ExceptionHandler(OrderRuleException.class)
    public ResponseEntity<Map<String, String>> handleOrderRule(OrderRuleException exception) {
        return ResponseEntity.unprocessableEntity().body(Map.of(
                "error", exception.reason().name(), "message", exception.reason().message()));
    }

    /**
     * Rejects an order with a fixed rule code without exposing financial data.
     * @param exception sufficiency rule rejection
     * @return HTTP 422 with a safe reason code and message
     */
    @ExceptionHandler(OrderSufficiencyException.class)
    public ResponseEntity<Map<String, String>> handleOrderSufficiency(OrderSufficiencyException exception) {
        return ResponseEntity.unprocessableEntity().body(Map.of(
                "error", exception.reason().name(), "message", exception.getMessage()));
    }

    /**
     * Preserves an explicit HTTP failure status while hiding exception details.
     * @param exception status-bearing failure from the application
     * @return the original status with a fixed REQUEST_FAILED response
     */
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> handleStatusException(ResponseStatusException exception) {
        return ResponseEntity.status(exception.getStatusCode()).body(Map.of(
                "error", "REQUEST_FAILED", "message", "The request could not be completed."));
    }

    /**
     * Converts unhandled failures into safe responses without exposing exception messages.
     * Framework HTTP statuses and headers are retained; other failures log only
     * the exception type and return HTTP 500.
     * @param exception unhandled framework or application failure
     * @return a fixed error body with the framework status or HTTP 500
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handleUnexpectedException(Exception exception) {
        // Preserve framework statuses such as 404/405/415 without their request-derived messages.
        if (exception instanceof ErrorResponse error) {
            return ResponseEntity.status(error.getStatusCode()).headers(error.getHeaders()).body(Map.of(
                    "error", "REQUEST_FAILED", "message", "The request could not be completed."));
        }
        // Exception messages/causes can contain unlabelled secrets, so do not pass the throwable.
        log.error("Request failed exceptionType={}", exception.getClass().getSimpleName());
        return ResponseEntity.internalServerError().body(Map.of(
                "error", "INTERNAL_ERROR", "message", "The request could not be completed."));
    }

    /**
     * Rejects invalid payloads without rendering or logging rejected values.
     * @param exception validation or parsing failure that may contain credentials
     * @return HTTP 400 with a fixed INVALID_REQUEST response
     */
    @ExceptionHandler({MethodArgumentNotValidException.class, HttpMessageNotReadableException.class})
    public ResponseEntity<Map<String, String>> handleInvalidRequest(Exception exception) {
        return ResponseEntity.badRequest().body(Map.of(
                "error", "INVALID_REQUEST", "message", "The request contains invalid or missing fields."));
    }

}
