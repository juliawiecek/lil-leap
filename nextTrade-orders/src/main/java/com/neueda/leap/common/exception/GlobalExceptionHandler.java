package com.neueda.leap.common.exception;

import com.neueda.leap.order.exception.ClientNotFoundException;
import com.neueda.leap.order.exception.InvalidFilterException;
import com.neueda.leap.order.exception.InvalidOrderException;
import com.neueda.leap.order.exception.OrderAccountNotFoundException;
import com.neueda.leap.user.exception.InvalidCredentialsException;
import com.neueda.leap.user.exception.UserAlreadyExistsException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.util.Map;

/**
 * Global exception handler for REST controllers.
 *
 * <p>This class centralizes exception handling logic and converts
 * application-specific exceptions into appropriate HTTP responses.</p>
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    /** Creates the REST exception handler. */
    public GlobalExceptionHandler() {
    }

    /**
     * Handles attempts to register a user with an email address
     * that already exists in the system.
     *
     * @param exception the exception describing the duplicate user condition
     * @return a {@link ResponseEntity} with HTTP 409 Conflict status and
     *         a body containing an error code and descriptive message
     */
    @ExceptionHandler(UserAlreadyExistsException.class)
    public ResponseEntity<Map<String, String>>
    handleUserAlreadyExistsException(UserAlreadyExistsException exception) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of
                ("error", "USER_ALREADY_EXISTS", "message", exception.getMessage()));
    }

    /**
     * Handles failed login attempts caused by an unknown email address or an
     * incorrect password.
     *
     * <p>Both cases are reported identically, by design: revealing which one
     * occurred would let a caller enumerate registered email addresses.</p>
     *
     * @param exception the exception describing the failed login attempt
     * @return a {@link ResponseEntity} with HTTP 401 Unauthorized status and
     *         a body containing a generic error code and message
     */
    @ExceptionHandler(InvalidCredentialsException.class)
    public ResponseEntity<Map<String, String>>
    handleInvalidCredentialsException(InvalidCredentialsException exception) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of
                ("error", "INVALID_CREDENTIALS", "message", exception.getMessage()));
    }

    /**
     * Handles request bodies that fail bean validation, such as a bad order
     * side or a non-positive quantity.
     *
     * @param exception the exception describing the failed field constraints
     * @return a {@link ResponseEntity} with HTTP 400 Bad Request status and
     *         a body naming the first invalid field
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, String>>
    handleMethodArgumentNotValidException(MethodArgumentNotValidException exception) {
        FieldError fieldError = exception.getBindingResult().getFieldError();
        String message = fieldError != null ? fieldError.getDefaultMessage() : "Request is invalid";
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of
                ("error", "INVALID_REQUEST", "message", message));
    }

    /**
     * Handles a path or query parameter that cannot be converted to its
     * declared type, such as a non-UUID path segment. Without this handler
     * the failure falls through to Spring Boot's default error body instead
     * of this API's error shape.
     *
     * @param exception the exception describing the failed conversion
     * @return a {@link ResponseEntity} with HTTP 400 Bad Request status and
     *         a body containing an error code and descriptive message
     */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Map<String, String>>
    handleMethodArgumentTypeMismatchException(MethodArgumentTypeMismatchException exception) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of
                ("error", "INVALID_REQUEST", "message", "Request is invalid"));
    }

    /**
     * Handles order submissions that refer to data that cannot be traded.
     *
     * @param exception the exception describing why the order was rejected
     * @return a {@link ResponseEntity} with HTTP 400 Bad Request status and
     *         a body containing an error code and descriptive message
     */
    @ExceptionHandler(InvalidOrderException.class)
    public ResponseEntity<Map<String, String>>
    handleInvalidOrderException(InvalidOrderException exception) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of
                ("error", "INVALID_ORDER", "message", exception.getMessage()));
    }

    /**
     * Handles order submissions against an account that is absent or not the
     * caller's. Both cases return the same 404 so account IDs cannot be probed.
     *
     * @param exception the exception describing the missing account
     * @return a {@link ResponseEntity} with HTTP 404 Not Found status and
     *         a body containing an error code and descriptive message
     */
    @ExceptionHandler(OrderAccountNotFoundException.class)
    public ResponseEntity<Map<String, String>>
    handleOrderAccountNotFoundException(OrderAccountNotFoundException exception) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of
                ("error", "ACCOUNT_NOT_FOUND", "message", exception.getMessage()));
    }

    /**
     * Handles requests that name a client id which does not exist or does not
     * belong to the caller. Both cases return the same 404 so client ids
     * cannot be probed.
     *
     * @param exception the exception describing the missing client
     * @return a {@link ResponseEntity} with HTTP 404 Not Found status and
     *         a body containing an error code and descriptive message
     */
    @ExceptionHandler(ClientNotFoundException.class)
    public ResponseEntity<Map<String, String>>
    handleClientNotFoundException(ClientNotFoundException exception) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of
                ("error", "CLIENT_NOT_FOUND", "message", exception.getMessage()));
    }

    /**
     * Handles query filters that cannot be applied, such as an unknown order
     * status or a date range whose start is after its end.
     *
     * @param exception the exception naming the invalid filter
     * @return a {@link ResponseEntity} with HTTP 400 Bad Request status and
     *         a body containing an error code and descriptive message
     */
    @ExceptionHandler(InvalidFilterException.class)
    public ResponseEntity<Map<String, String>>
    handleInvalidFilterException(InvalidFilterException exception) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of
                ("error", "INVALID_FILTER", "message", exception.getMessage()));
    }
}