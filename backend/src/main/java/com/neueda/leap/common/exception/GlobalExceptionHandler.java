package com.neueda.leap.common.exception;

import com.neueda.leap.passwordreset.InvalidPasswordResetTokenException;
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
     * Handles invalid or expired password reset tokens.
     *
     * @param exception the exception describing the invalid reset token
     * @return a {@link ResponseEntity} with HTTP 400 Bad Request status and
     *         a body containing an error code and descriptive message
     */
    @ExceptionHandler(InvalidPasswordResetTokenException.class)
    public ResponseEntity<Map<String, String>>
    handleInvalidPasswordResetTokenException(
            InvalidPasswordResetTokenException exception
    ) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(
                Map.of(
                        "error", "INVALID_PASSWORD_RESET_TOKEN",
                        "message", exception.getMessage()
                )
        );
    }
}
