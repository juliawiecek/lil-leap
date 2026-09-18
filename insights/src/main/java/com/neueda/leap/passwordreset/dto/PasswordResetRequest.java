package com.neueda.leap.passwordreset.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Represents a request to start the password reset process.
 *
 * @param email the email address associated with the account
 */
public record PasswordResetRequest(

        @NotBlank
        @Email
        @Size(max = 320)
        String email

) {
}