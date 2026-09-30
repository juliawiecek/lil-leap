package com.neueda.leap.common.exception;

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

    /**
     * Rejects invalid history filters without echoing request values.
     * @param exception invalid status or date range
     * @return a fixed bad-request response
     */
    @ExceptionHandler(com.neueda.leap.portfolio.service.InvalidFilterException.class)
    public ResponseEntity<Map<String, String>> invalidFilter(Exception exception) {
        return ResponseEntity.badRequest().body(Map.of("error", "INVALID_FILTER", "message", "Invalid order history filter"));
    }

    /**
     * Hides whether a requested client exists or belongs to another caller.
     * @param exception missing or unowned client
     * @return a fixed not-found response
     */
    @ExceptionHandler(com.neueda.leap.portfolio.service.ClientNotFoundException.class)
    public ResponseEntity<Map<String, String>> clientNotFound(Exception exception) {
        return ResponseEntity.status(404).body(Map.of("error", "CLIENT_NOT_FOUND", "message", "Client not found"));
    }

    /** Creates the application-wide REST exception handler. */
    public GlobalExceptionHandler() {
    }
    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

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
    @ExceptionHandler({MethodArgumentNotValidException.class, HttpMessageNotReadableException.class, org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class})
    public ResponseEntity<Map<String, String>> handleInvalidRequest(Exception exception) {
        return ResponseEntity.badRequest().body(Map.of(
                "error", "INVALID_REQUEST", "message", "The request contains invalid or missing fields."));
    }

}
