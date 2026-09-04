package com.neueda.leap.user.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Request DTO used to register a new user.
 *
 * @param firstName the user's first name
 * @param lastName the user's last name
 * @param email the user's email address
 * @param phone the user's phone number
 * @param password the raw password provided during registration
 * @param address the optional address information for the user
 */
public record RegisterUserRequest (

        @NotBlank
        @Size(max = 100)
        String firstName,

        @NotBlank
        @Size(max = 100)
        String lastName,

        @NotBlank
        @Email
        @Size(max = 320)
        String email,

        @Size(max = 30)
        String phone,

        @NotBlank
        @Size(min = 8, max = 128)
        String password,

        @Valid
        AddressRequest address

) {}