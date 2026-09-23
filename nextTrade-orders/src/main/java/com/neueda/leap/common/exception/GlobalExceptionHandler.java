package com.neueda.leap.common.exception;

import com.neueda.leap.user.exception.InvalidCredentialsException;
import com.neueda.leap.onboarding.exception.RegistrationValidationException;
import com.neueda.leap.user.exception.UserAlreadyExistsException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

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
     * Returns a client error for an invalid registration age.
     * @param exception the failed registration rule
     * @return HTTP 400 with a public validation message
     */
    @ExceptionHandler(RegistrationValidationException.class)
    public ResponseEntity<Map<String, String>> handleRegistrationValidation(RegistrationValidationException exception) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of(
                "error", "INVALID_REGISTRATION", "message", exception.getMessage()));
    }
}