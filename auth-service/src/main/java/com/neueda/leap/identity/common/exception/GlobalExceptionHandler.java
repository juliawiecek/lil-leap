package com.neueda.leap.identity.common.exception;

import com.neueda.leap.identity.user.exception.InvalidCredentialsException;
import com.neueda.leap.identity.user.exception.InvalidRefreshTokenException;
import com.neueda.leap.identity.user.exception.UserAlreadyExistsException;
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
    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> handleStatusException(ResponseStatusException exception) {
        return ResponseEntity.status(exception.getStatusCode()).body(Map.of(
                "error", "REQUEST_FAILED", "message", "The request could not be completed."));
    }

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

    // Spring's default validation warning includes rejected values. Never render or log
    // these exceptions: they may contain passwords, SSNs, or whole request fragments.
    @ExceptionHandler({MethodArgumentNotValidException.class, HttpMessageNotReadableException.class})
    public ResponseEntity<Map<String, String>> handleInvalidRequest(Exception exception) {
        return ResponseEntity.badRequest().body(Map.of(
                "error", "INVALID_REQUEST", "message", "The request contains invalid or missing fields."));
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
     * Handles a missing, expired, revoked, or unrecognized refresh token.
     *
     * @param exception the exception describing the failed refresh attempt
     * @return a {@link ResponseEntity} with HTTP 401 Unauthorized status and
     *         a body containing a generic error code and message
     */
    @ExceptionHandler(InvalidRefreshTokenException.class)
    public ResponseEntity<Map<String, String>>
    handleInvalidRefreshTokenException(InvalidRefreshTokenException exception) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of
                ("error", "INVALID_REFRESH_TOKEN", "message", exception.getMessage()));
    }
}
