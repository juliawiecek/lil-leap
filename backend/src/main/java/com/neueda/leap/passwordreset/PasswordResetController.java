package com.neueda.leap.passwordreset;

import com.neueda.leap.passwordreset.dto.PasswordResetConfirmRequest;
import com.neueda.leap.passwordreset.dto.PasswordResetRequest;
import com.neueda.leap.passwordreset.dto.PasswordResetResponse;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Creates a password reset controller.
 *
 * @param passwordResetService the service that handles password reset operations
 */
/**
 * Completes the password reset process.
 *
 * @param request the password reset confirmation request
 * @return a response indicating that the password was reset
 * @throws InvalidPasswordResetTokenException if the reset token is invalid or expired
 */
@RestController
@RequestMapping("/auth/password-reset")
public class PasswordResetController {

    private static final String RESET_REQUEST_MESSAGE =
            "If an account exists for this email, password reset instructions have been sent.";

    private static final String RESET_SUCCESS_MESSAGE =
            "Password has been reset successfully.";

    private final PasswordResetService passwordResetService;

    public PasswordResetController(
            PasswordResetService passwordResetService
    ) {
        this.passwordResetService = passwordResetService;
    }

    /**
     * Starts the password reset process.
     *
     * @param request the password reset request
     * @return a generic response indicating that the request was received
     */
    @PostMapping("/request")
    public ResponseEntity<PasswordResetResponse> requestPasswordReset(
            @Valid @RequestBody PasswordResetRequest request
    ) {

        passwordResetService.requestPasswordReset(request.email());

        return ResponseEntity.ok(
                new PasswordResetResponse(RESET_REQUEST_MESSAGE)
        );
    }

    /**
     * Completes the password reset process.
     *
     * @param request the password reset confirmation request
     * @return a response indicating that the password was reset
     */
    @PostMapping("/confirm")
    public ResponseEntity<PasswordResetResponse> confirmPasswordReset(
            @Valid @RequestBody PasswordResetConfirmRequest request
    ) {

        passwordResetService.confirmPasswordReset(
                request.token(),
                request.newPassword()
        );

        return ResponseEntity.ok(
                new PasswordResetResponse(RESET_SUCCESS_MESSAGE)
        );
    }
}
