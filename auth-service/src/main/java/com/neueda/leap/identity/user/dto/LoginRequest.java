package com.neueda.leap.identity.user.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * Request DTO used to authenticate an existing user.
 *
 * @param email the user's email address
 * @param password the raw password supplied for authentication
 */
public record LoginRequest(

        @NotBlank
        String email,

        @NotBlank
        String password

) {
    @Override
    public String toString() {
        return "LoginRequest[email=[REDACTED], password=[REDACTED]]";
    }
}
