package com.neueda.leap.common.exception;


import com.neueda.leap.reporting.model.InvalidReportDateRangeException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
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

    private static final String ERROR_KEY = "error";
    private static final String MESSAGE_KEY = "message";
    private static final String REQUEST_FAILED = "REQUEST_FAILED";
    private static final String INTERNAL_ERROR = "INTERNAL_ERROR";
    private static final String INVALID_REQUEST = "INVALID_REQUEST";
    private static final String ACCESS_DENIED = "ACCESS_DENIED";
    private static final String REQUEST_FAILED_MESSAGE = "The request could not be completed.";
    private static final String INVALID_FIELDS_MESSAGE = "The request contains invalid or missing fields.";
    private static final String INVALID_PARAMS_MESSAGE = "The request contains invalid or missing parameters.";

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /**
     * Preserves an explicit HTTP failure status while hiding exception details.
     * @param exception status-bearing failure from the application
     * @return the original status with a fixed REQUEST_FAILED response
     */
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> handleStatusException(ResponseStatusException exception) {
        return ResponseEntity.status(exception.getStatusCode()).body(Map.of(
                ERROR_KEY, REQUEST_FAILED, MESSAGE_KEY, REQUEST_FAILED_MESSAGE));
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
                    ERROR_KEY, REQUEST_FAILED, MESSAGE_KEY, REQUEST_FAILED_MESSAGE));
        }
        // Exception messages/causes can contain unlabelled secrets, so do not pass the throwable.
        log.error("Request failed exceptionType={}", exception.getClass().getSimpleName());
        return ResponseEntity.internalServerError().body(Map.of(
                ERROR_KEY, INTERNAL_ERROR, MESSAGE_KEY, REQUEST_FAILED_MESSAGE));
    }

    /**
     * Rejects invalid payloads without rendering or logging rejected values.
     * @param exception validation or parsing failure that may contain credentials
     * @return HTTP 400 with a fixed INVALID_REQUEST response
     */
    @ExceptionHandler({MethodArgumentNotValidException.class, HttpMessageNotReadableException.class})
    public ResponseEntity<Map<String, String>> handleInvalidRequest(Exception exception) {
        return ResponseEntity.badRequest().body(Map.of(
                ERROR_KEY, INVALID_REQUEST, MESSAGE_KEY, INVALID_FIELDS_MESSAGE));
    }


    /**
     * Returns 403 when method security (for example {@code @PreAuthorize}) denies
     * an authenticated caller. Without this, the catch-all handler above would
     * intercept the denial before Spring Security and turn it into a 500.
     * @param exception authorization failure raised by method security
     * @return HTTP 403 with the same body as the security filter chain's access-denied handler
     */
    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<Map<String, String>> handleAccessDenied(AccessDeniedException exception) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of(
                ERROR_KEY, ACCESS_DENIED, MESSAGE_KEY, "Access is denied."));
    }

    /**
     * Rejects missing, malformed, or out-of-bounds query parameters without
     * echoing the rejected values.
     * @param exception parameter binding or method validation failure
     * @return HTTP 400 with a fixed INVALID_REQUEST response
     */
    @ExceptionHandler({MissingServletRequestParameterException.class,
            MethodArgumentTypeMismatchException.class, HandlerMethodValidationException.class})
    public ResponseEntity<Map<String, String>> handleInvalidParameter(Exception exception) {
        return ResponseEntity.badRequest().body(Map.of(
                ERROR_KEY, INVALID_REQUEST, MESSAGE_KEY, INVALID_PARAMS_MESSAGE));
    }

    /**
     * Rejects a report request whose date range is inverted or too long.
     * @param exception date range rule violation with a fixed, caller-safe message
     * @return HTTP 400 with INVALID_DATE_RANGE and the rule that was violated
     */
    @ExceptionHandler(InvalidReportDateRangeException.class)
    public ResponseEntity<Map<String, String>> handleInvalidDateRange(InvalidReportDateRangeException exception) {
        return ResponseEntity.badRequest().body(Map.of(
                ERROR_KEY, "INVALID_DATE_RANGE", MESSAGE_KEY, exception.getMessage()));
    }


}
