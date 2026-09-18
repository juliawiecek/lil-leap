package com.neueda.leap.passwordreset;

import com.neueda.leap.passwordreset.dto.PasswordResetConfirmRequest;
import com.neueda.leap.passwordreset.dto.PasswordResetRequest;
import com.neueda.leap.passwordreset.dto.PasswordResetResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Exposes endpoints to request and confirm password resets.
 */
@RestController
@RequestMapping("/auth/password-reset")
@Tag(name = "Password Reset", description = "APIs for requesting and confirming password resets")
public class PasswordResetController {

    private static final String RESET_REQUEST_MESSAGE =
            "If an account exists for this email, password reset instructions have been sent.";

    private static final String RESET_SUCCESS_MESSAGE =
            "Password has been reset successfully.";

    private final PasswordResetService passwordResetService;

    /**
     * Creates a password reset controller.
     *
     * @param passwordResetService the service that handles password reset operations
     */
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
    @Operation(
            summary = "Request a password reset",
            description = "Initiates the password reset process by sending reset instructions to the provided email address. " +
                    "Returns a generic message regardless of whether an account exists for security reasons."
    )
    @ApiResponse(
            responseCode = "200",
            description = "Password reset request processed",
            content = @Content(
                    mediaType = "application/json",
                    schema = @Schema(implementation = PasswordResetResponse.class)
            )
    )
    @ApiResponse(
            responseCode = "400",
            description = "Bad Request - Invalid email format"
    )
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
     * @throws InvalidPasswordResetTokenException if the reset token is invalid or expired
     */
    @PostMapping("/confirm")
    @Operation(
            summary = "Confirm password reset",
            description = "Completes the password reset process using a valid reset token and new password. " +
                    "The new password must meet complexity requirements: 12-128 characters with at least " +
                    "one uppercase letter, one lowercase letter, one digit, and one special character."
    )
    @ApiResponse(
            responseCode = "200",
            description = "Password reset successfully",
            content = @Content(
                    mediaType = "application/json",
                    schema = @Schema(implementation = PasswordResetResponse.class)
            )
    )
    @ApiResponse(
            responseCode = "400",
            description = "Bad Request - Validation failed (invalid token, expired token, or weak password)"
    )
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
